# gulp-static-html

This is a gulp plugin designed to take HTML template files (using a familiar EJS syntax) and output static HTML files

## Basic Syntax

#### Javascript `<% javascript_fragment %>`

The `<% ... %>` tag supports running arbitrary javascript when compiling the template. This is very useful for conditional rendering (eg: `<% if (true) { %> Hello World <% } %>`) or looping to output something multiple times (eg: `<% for (let i = 0; i < 10; ++i) { %> again <% } %>`).

#### Output `<%= javascript_expression %>`

The `<%= ... %>` tag supports outputting a value from javascript. The value is escaped, for everyone's safety.

#### Output (unescaped) `<%- javascript_expression %>`

The `<%- ... %>` tag supports outputting an unescaped value from javascript. Sometimes it might be easier to generate the full HTML output using javascript. This will allow you to do that, but do so carefully.

#### Import `<%+ template_name %>` or `<%+ template_name | locals_expression %>`

The `<%+ template_name %>` tag allows importing another template file into this one. By default this template acts as if it were typed directly inline with the rest of the code. This means that it shares the variables and can arbitrarily manipulate them.

If, instead, a locals expression is passed (separated by a pipe `|`), that object will be used to house the local variables in the imported template. This allows scoping and renaming the variables.

#### Comment `<%! comment !%>`

The `<%! template_name !%>` tag allows adding comments to the template that will _not_ be output. NOTE: These tags have the `!` delimiter at both the beginning and the end. This makes it easy to arbitrarily comment out any other template tag without manual intervention.

## Usage

## Options

### base: string
**Optional:** defaults to `""`.
The base path to include templates from.

### ext: string
**Optional:** defaults to `""` (no extension).
The extension to append to the included template file names.
This is really just a convenience feature.

### delimiters: any
**Optional.**
The set of delimiters.

### delimiters.open: string
**Optional:** defaults to `"<%"`.
The open delimiter.

### delimiters.close: string
**Optional:** defaults to `"%>"`.
The close delimiter. 

### delimiters.escape: string
**Optional:** defaults to `"="`.
The unescape output delimiter.

### delimiters.unescape: string
**Optional:** defaults to `"-"`.
The unescape output delimiter.

### delimiters.import: string
**Optional:** defaults to `"+"`.
The import template delimiter.

### delimiters.comment: string
**Optional:** defaults to `"!"`.
The comment delimiter.
Note that comments require this delimiter at both the beginning and the end (this makes it easy to wrap other tags).

### escape: (s: any) => string
**Optional: use this at your own risk.**
A function to use to escape the xml characters (or replace any other parts of the string).

### loadFile: (name: string, options: Options) => Promise<string>
**Optional: use this at your own risk.**
A custom function to load files.
Takes in the name (as found in the template) and the `dst` as passed in through the options.

### cache: any
**Optional.**
An object to use to cache the outputs of included templates to speed up successive compilations.

### minify: boolean | htmlMinifier.Options
**Optional:** defaults to `false`.
Denotes whether to minify the output or not.
If an object is passed, then that object will be used as the options for the [html-minifier](https://www.npmjs.com/package/html-minifier) library.
