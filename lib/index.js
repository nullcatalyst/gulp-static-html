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
    import: "+",
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
    base: "",
    ext: "",
    delimiters: DEFAULT_DELIMITERS,
    escape: escape,
    loadFile: loadFile,
    cache: null,
    minify: false,
};
// Make it work on node.js
module.exports = Template;
module.exports.default = Template;
module.exports.compileTemplate = compileTemplate;
module.exports.loadAndCompileTemplate = loadAndCompileTemplate;
function Template(options) {
    let locals;
    if (options && options.locals) {
        locals = options.locals;
        delete options.locals;
    }
    options = handleOptions(options);
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
                file.on("readable", function (stream) {
                    contents += stream.read().toString();
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
exports.default = Template;
function handleOptions(options) {
    if (!options)
        options = Object.assign({}, DEFAULT_OPTIONS);
    if (options.delimiters)
        options.delimiters = Object.assign({}, DEFAULT_DELIMITERS, options.delimiters);
    if (options.minify && typeof options.minify !== "object") {
        options.minify = DEFAULT_MINIFY;
    }
    return Object.seal(Object.assign({}, DEFAULT_OPTIONS, options));
}
/**
 * Parse a template and return the unwrapped output.
 * If a cache is present, this function should only be called when a template file is updated.
 *
 * @param unparsed The unparsed contents of a template file
 * @param options The options used to handle all templates
 */
async function parseTemplate(unparsed, options) {
    const OPEN = options.delimiters.open;
    const CLOSE = options.delimiters.close;
    const COMMENT = options.delimiters.comment;
    const ESCAPE = options.delimiters.escape;
    const UNESCAPE = options.delimiters.unescape;
    const IMPORT = options.delimiters.import;
    let parsed;
    let i = 0;
    let length = unparsed.length;
    parsed = "with($locals||{}){$buffer.push(`";
    for (; i < length; ++i) {
        let c = unparsed[i];
        if (unparsed.slice(i, i + OPEN.length) === OPEN) {
            i += OPEN.length;
            switch (unparsed[i]) {
                case COMMENT:// Comments -- output nothing
                    tagContents(COMMENT + CLOSE);
                    break;
                case ESCAPE:// Output escaped value
                    ++i;
                    parsed += "`,$xml(";
                    parsed += tagContents();
                    parsed += "),`";
                    break;
                case UNESCAPE:// Output unescaped value
                    ++i;
                    parsed += "`,(";
                    parsed += tagContents();
                    parsed += "),`";
                    break;
                case IMPORT:// Include another file
                    ++i;
                    parsed += "`,`";
                    // Cache the previous values
                    const importContents = tagContents().split("|");
                    const templateName = importContents[0].trim();
                    const locals = importContents[1] && importContents[1].trim() || "$locals";
                    // Read the next template using the new values
                    const unparsedImport = await getTemplate(templateName, options);
                    parsed += "`);(function($buffer,$locals){" + unparsedImport + "})($buffer,$locals);$buffer.push(`";
                    break;
                default:
                    parsed += "`);";
                    parsed += tagContents();
                    parsed += ";$buffer.push(`";
                    break;
            }
        }
        else if (c === "\\") {
            // Backslashes need to be escaped
            parsed += "\\\\";
        }
        else if (c === "`") {
            // Backticks need to be escaped as that the character that we are using to surround our string literals
            // We chose them as backtick string literals are  containing raw newline characters
            parsed += "\\`";
        }
        else if (c === "$") {
            // Since backtick string literals in javascript support interpolation, we need to escape the dollar sign
            parsed += "\\$";
        }
        else {
            parsed += c;
        }
    }
    parsed += "`);}";
    return parsed;
    function tagContents(endTag = CLOSE) {
        let end = unparsed.indexOf(endTag, i);
        if (end < 0) {
            throw new Error("Could not find matching close tag '" + endTag + "'.");
        }
        let result = unparsed.substring(i, end);
        // Move the cursor to the end of the tag
        i = end + endTag.length - 1;
        return result;
    }
}
/**
 * Gets the parsed template, either from the cache, or by loading and parsing the template from the disk.
 * @param templateName The name of the template to load and compile
 * @param options The options used to handle all templates
 */
async function getTemplate(templateName, options) {
    if (options.cache) {
        throw new Error("The template cache is unimplemented");
    }
    else {
        const unparsed = await options.loadFile(templateName, options);
        const parsed = await parseTemplate(unparsed, options);
        return parsed;
    }
}
/**
 * Compiles a template into a callable function which takes in a single parameter `locals` to use as the local variables when rendering the template.
 * @param unparsed The unparsed contents of the template to parse
 * @param options The options used to handle all templates
 */
async function compileTemplate(unparsed, options) {
    options = handleOptions(options);
    const parsed = await parseTemplate(unparsed, options);
    const wrapped = "var $buffer=[];(function($buffer,$locals){" + parsed + "})($buffer,$locals);return $buffer.join(``);";
    // console.log(wrapped);
    return new Function("$xml", "$locals", wrapped).bind(null, escape);
}
exports.compileTemplate = compileTemplate;
/**
 * Loads a template from the disk, then compiles that template into a callable function which takes in a single parameter `locals` to use as the local variables when rendering the template.
 * @param templateName The name of the template to compile
 * @param options The options used to handle all templates
 */
async function loadAndCompileTemplate(templateName, options) {
    options = handleOptions(options);
    const parsed = await getTemplate(templateName, options);
    const wrapped = "var $buffer=[];(function($buffer,$locals){" + parsed + "})($buffer,$locals);return $buffer.join(``);";
    return new Function("$xml", "$locals", wrapped).bind(null, escape);
}
exports.loadAndCompileTemplate = loadAndCompileTemplate;
////////////////////////////////
///     Helper Functions     ///
////////////////////////////////
/**
 * Escapes a string for safe output in HTML.
 * @param unsafe The value to escape
 */
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
/**
 * Loads a template file from the disk.
 * @param templateName The name of the template to load
 * @param options The options used to handle all templates
 */
async function loadFile(templateName, options) {
    return new Promise(function (resolve, reject) {
        let filePath = path.resolve(options.base, templateName + (options.ext ? "." + options.ext : ""));
        fs.readFile(filePath, "utf8", function (error, fileContents) {
            if (error) {
                reject(error);
            }
            else {
                if (options.cache && templateName in options.cache) {
                    options.cache[templateName] = fileContents;
                }
                resolve(fileContents);
            }
        });
    });
}
