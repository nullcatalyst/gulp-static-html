"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const through = require("through2");
const htmlmin = require("html-minifier");
const gutil = require("gulp-util");
const PLUGIN_NAME = "gulp-static-html";
const DEFAULT_DELIMITERS = {
    open: "<%",
    close: "%>",
    escape: "=",
    unescape: "-",
    comment: "!",
};
const DEFAULT_MINIFY = {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
};
const DEFAULT_OPTIONS = {
    base: process.cwd(),
    ext: "html",
    delimiters: DEFAULT_DELIMITERS,
    escape: escape,
    loadFile: loadFile,
    cache: null,
    minify: false,
};
function htmlext(options) {
    if (!options)
        options = Object.assign({}, DEFAULT_OPTIONS);
    if (options.delimiters)
        options.delimiters = Object.assign({}, DEFAULT_DELIMITERS, options.delimiters);
    let locals = options.locals;
    delete options.locals;
    if (options.minify && typeof options.minify !== "object") {
        options.minify = DEFAULT_MINIFY;
    }
    options = Object.assign({}, DEFAULT_OPTIONS, options);
    options = Object.seal(options);
    return locals ? impl(locals) : impl;
    function impl(locals) {
        return through.obj(function (file, encoding, callback) {
            let contents = "";
            // Empty
            if (file.isNull()) {
                callback(null, file);
            }
            // Buffer
            if (file.isBuffer()) {
                contents = file.contents.toString(encoding);
                renderToBuffer();
            }
            // Stream
            if (file.isStream()) {
                file.on("readable", function (buffer) {
                    contents += buffer.read().toString();
                }).on("end", () => {
                    renderToBuffer();
                });
            }
            function renderToBuffer() {
                try {
                    compileTemplate(contents, options)
                        .then((templateFn) => {
                        let result = templateFn(locals);
                        if (options.minify) {
                            result = htmlmin.minify(result, options.minify);
                        }
                        file.contents = new Buffer(result);
                        callback(null, file);
                    })
                        .catch((error) => {
                        callback(new gutil.PluginError(PLUGIN_NAME, error.message));
                    });
                }
                catch (error) {
                    this.emit("error", new gutil.PluginError(PLUGIN_NAME, error.message));
                }
            }
        });
    }
}
module.exports = htmlext;
exports.default = htmlext;
function escape(unsafe) {
    if (unsafe == null)
        return "";
    return String(unsafe).replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "\'": return "&apos;";
            case "\"": return "&quot;";
            default: return c;
        }
    });
}
async function parseTemplate(template, options) {
    const OPEN = options.delimiters.open;
    const CLOSE = options.delimiters.close;
    let buffer;
    let i = 0;
    let length = template.length;
    buffer = "var $buffer=[];with($locals||{}){$buffer.push(`";
    await parseTemplate();
    buffer += "`);}return $buffer.join(``);";
    function tagContents(endTag = CLOSE) {
        let end = template.indexOf(endTag, i);
        if (end < 0) {
            throw new Error("Could not find matching close tag '" + endTag + "'.");
        }
        let result = template.substring(i, end);
        // Move the cursor to the end of the tag
        i = end + endTag.length - 1;
        return result;
    }
    async function parseTemplate() {
        for (; i < length; ++i) {
            let tmp = template[i];
            if (template.slice(i, i + OPEN.length) === OPEN) {
                i += OPEN.length;
                let prefix;
                let postfix;
                switch (template[i]) {
                    case "!":// Comments -- output nothing
                        tagContents("!" + CLOSE);
                        break;
                    case "=":// Output escaped value
                        ++i;
                        buffer += "`,$xml(";
                        buffer += tagContents();
                        buffer += "),`";
                        break;
                    case "-":// Output unescaped value
                        ++i;
                        buffer += "`,(";
                        buffer += tagContents();
                        buffer += "),`";
                        break;
                    case "+":// Include another file
                        ++i;
                        buffer += "`,`";
                        // Cache the previous values
                        let templateName = tagContents().trim();
                        let prevI = i;
                        let prevTemplate = template;
                        let prevLength = length;
                        // Read the next template using the new values
                        i = 0;
                        template = await options.loadFile(templateName, options);
                        length = template.length;
                        parseTemplate();
                        // Reset the values
                        i = prevI;
                        template = prevTemplate;
                        length = prevLength;
                        buffer += "`,`";
                        break;
                    default:
                        buffer += "`);";
                        buffer += tagContents();
                        buffer += ";$buffer.push(`";
                        break;
                }
            }
            else if (tmp === "\\") {
                // Backslashes need to be escaped
                buffer += "\\\\";
            }
            else if (tmp === "`") {
                // Backticks need to be escaped as that the character that we are using to surround our string literals
                // We chose them as backtick string literals are  containing raw newline characters
                buffer += "\\`";
            }
            else if (tmp === "$") {
                // Since backtick string literals in javascript support interpolation, we need to escape the dollar sign
                buffer += "\\$";
            }
            else {
                buffer += tmp;
            }
        }
    }
    return buffer;
}
async function compileTemplate(template, options) {
    const fnBody = await parseTemplate(template, options);
    return new Function("$xml", "$locals", fnBody).bind(null, escape);
}
async function loadTemplate(fileName, options, locals) {
    let contents = await options.loadFile(fileName, options);
    let fn = await compileTemplate(contents, options);
    return fn;
}
async function loadFile(fileName, options) {
    if (options.cache && fileName in options.cache) {
        return options.cache[fileName];
    }
    return new Promise(function (resolve, reject) {
        let filePath = path.resolve(options.base, fileName + (options.ext ? "." + options.ext : ""));
        fs.readFile(filePath, "utf8", function (error, fileContents) {
            if (error) {
                reject(error);
            }
            else {
                if (options.cache && fileName in options.cache) {
                    options.cache[fileName] = fileContents;
                }
                resolve(fileContents);
            }
        });
    });
}
