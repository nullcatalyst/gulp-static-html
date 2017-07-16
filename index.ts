import * as fs      from "fs";
import * as path    from "path";
import * as stream  from "stream";
import * as through from "through2";
import * as htmlmin from "html-minifier";
import * as gutil   from "gulp-util";

interface DelimiterOptions {
    // The open delimiter. Defaults to "<%"
    open?: string;

    // The close delimiter. Defaults to "%>"
    close?: string;

    // The unescape output delimiter. Defaults to "="
    escape?: string;

    // The unescape output delimiter. Defaults to "-"
    unescape?: string;

    // The import template delimiter. Defaults to "+"
    import?: string;

    // The comment delimiter. Defaults to "!"
    // Note that comments require this delimiter at both the beginning and the end (this makes it easy to wrap other tags)
    comment?: string;
}

interface TemplateOptions {
    // The base path to include templates from
    base: string;

    // The extension to append to the included template file names
    ext: string;

    // The set of delimiters
    delimiters: Partial<DelimiterOptions>;

    // A function to use to escape the xml characters (or replace any other parts of the string)
    escape: (any) => string;

    // A custom function to load files
    // Takes in the name (as found in the template) and the `dst` as passed in through the options
    loadFile: (name: string, options: TemplateOptions) => Promise<string>;

    // An object to use to cache the outputs of included templates to speed up successive compilations
    cache?: any;

    // Denotes whether to minify the output or not
    // If an object is passed, then that object will be used as the options for the `html-minifier` library
    minify?: boolean | htmlmin.Options;
}

const PLUGIN_NAME = "gulp-static-html";

const DEFAULT_DELIMITERS: DelimiterOptions = {
    open:       "<%",
    close:      "%>",
    escape:     "=",
    unescape:   "-",
    comment:    "!",
};

const DEFAULT_MINIFY: htmlmin.Options = {
    collapseBooleanAttributes:      true,
    collapseInlineTagWhitespace:    true,
    collapseWhitespace:             true,
    minifyCSS:                      true,
    minifyJS:                       true,
    removeComments:                 true,
    removeRedundantAttributes:      true,
    removeScriptTypeAttributes:     true,
    removeStyleLinkTypeAttributes:  true,
    useShortDoctype:                true,
};

const DEFAULT_OPTIONS: TemplateOptions = {
    base:       process.cwd(),
    ext:        "html",
    delimiters: DEFAULT_DELIMITERS,
    escape:     escape,
    loadFile:   loadFile,
    cache:      null,
    minify:     false,
};

type TemplatePipe = stream.Transform;
type LocalsTemplatePipe = (locals: any) => TemplatePipe;

function htmlext(options: Partial<TemplateOptions> & { locals: any }): TemplatePipe;
function htmlext(options?: Partial<TemplateOptions>): LocalsTemplatePipe;
function htmlext(options?: Partial<TemplateOptions> & { locals?: any }): TemplatePipe | LocalsTemplatePipe {
    if (!options) options = Object.assign({}, DEFAULT_OPTIONS);

    if (options.delimiters) options.delimiters = Object.assign({}, DEFAULT_DELIMITERS, options.delimiters);
    let locals: any = options.locals;
    delete options.locals;

    if (options.minify && typeof options.minify !== "object") {
        options.minify = DEFAULT_MINIFY;
    }

    options = Object.assign({}, DEFAULT_OPTIONS, options);
    options = Object.seal(options);

    return locals ? impl(locals) : impl;

    function impl(locals: any) {
        return through.obj(function (this: stream.Transform, file: any, encoding: string, callback: (error?: Error, data?: any) => void): void {
            let contents: string = "";

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

            function renderToBuffer(): void {
                try {
                    compileTemplate(contents, options as TemplateOptions)
                        .then((templateFn) => {
                            let result = templateFn(locals);

                            if (options.minify) {
                                result = htmlmin.minify(result, options.minify as htmlmin.Options);
                            }

                            file.contents = new Buffer(result);
                            callback(null, file);
                        })
                        .catch((error: Error) => {
                            callback(new gutil.PluginError(PLUGIN_NAME, error.message));
                        });
                } catch (error) {
                    this.emit("error", new gutil.PluginError(PLUGIN_NAME, error.message));
                }
            }
        });
    }
}
module.exports = htmlext;
exports.default = htmlext;

function escape(unsafe: any): string {
    if (unsafe == null) return "";

    return String(unsafe).replace(/[<>&'"]/g, function (c: string) {
        switch (c) {
            case "<":  return "&lt;";
            case ">":  return "&gt;";
            case "&":  return "&amp;";
            case "\'": return "&apos;";
            case "\"": return "&quot;";
            default:   return c;
        }
    });
}

async function parseTemplate(template: string, options: TemplateOptions): Promise<string> {
    const OPEN  = options.delimiters.open;
    const CLOSE = options.delimiters.close;

    let buffer: string;
    let i = 0;
    let length = template.length;

    buffer = "var $buffer=[];with($locals||{}){$buffer.push(`";
    await parseTemplate();
    buffer += "`);}return $buffer.join(``);";

    function tagContents(endTag = CLOSE): string {
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
        for ( ; i < length; ++i) {
            let tmp = template[i];

            if (template.slice(i, i + OPEN.length) === OPEN) {
                i += OPEN.length;

                let prefix: string;
                let postfix: string;
                switch (template[i]) {
                    case "!": // Comments -- output nothing
                        tagContents("!" + CLOSE);
                        break;

                    case "=": // Output escaped value
                        ++i;
                        buffer += "`,$xml(";
                        buffer += tagContents();
                        buffer += "),`";
                        break;

                    case "-": // Output unescaped value
                        ++i;
                        buffer += "`,(";
                        buffer += tagContents();
                        buffer += "),`";
                        break;

                    case "+": // Include another file
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
            } else if (tmp === "\\") {
                // Backslashes need to be escaped
                buffer += "\\\\";
            } else if (tmp === "`") {
                // Backticks need to be escaped as that the character that we are using to surround our string literals
                // We chose them as backtick string literals are  containing raw newline characters
                buffer += "\\`";
            } else if (tmp === "$") {
                // Since backtick string literals in javascript support interpolation, we need to escape the dollar sign
                buffer += "\\$";
            } else {
                buffer += tmp;
            }
        }
    }

    return buffer;
}

async function compileTemplate(template: string, options: TemplateOptions): Promise<(locals?: any) => string> {
    const fnBody = await parseTemplate(template, options);
    return new Function("$xml", "$locals", fnBody).bind(null, escape) as ($locals?: any) => string;
}

async function loadTemplate(fileName: string, options: TemplateOptions, locals: any): Promise<(locals?: any) => string> {
    let contents = await options.loadFile(fileName, options);
    let fn = await compileTemplate(contents, options);
    return fn;
}

async function loadFile(fileName: string, options: TemplateOptions): Promise<string> {
    if (options.cache && fileName in options.cache) {
        return options.cache[fileName];
    }

    return new Promise(function (resolve: (string) => void, reject: (Error) => void) {
        let filePath = path.resolve(options.base, fileName + (options.ext ?  "." + options.ext : ""));
        fs.readFile(filePath, "utf8", function (error: Error, fileContents: string) {
            if (error) {
                reject(error);
            } else {
                if (options.cache && fileName in options.cache) {
                    options.cache[fileName] = fileContents;
                }

                resolve(fileContents);
            }
        });
    });
}
