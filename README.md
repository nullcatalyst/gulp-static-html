# gulp-static-html

This is a gulp plugin designed to take HTML template files (using a modified EJS syntax) and output static HTML files

# Delimiters

## Javascript `<% javascript_fragment %>`

The `<% ... %>` tag supports running arbitrary javascript when compiling the template. This is very useful for conditional rendering (eg: `<% if (true) { %>Hello World<% } %>`) or looping to output something multiple times (eg: `<% for (let i = 0; i < 10; ++i) { %>again <% } %>`).

## Output `<%= javascript_expression %>`

The `<%= ... %>` tag supports outputting a value from javascript. The value is escaped, for everyone's safety.

## Output (unescaped) `<%- javascript_expression %>`

The `<%- ... %>` tag supports outputting an unescaped value from javascript. Sometimes it might be easier to generate the full HTML output using javascript. This will allow you to do that, but do so carefully.

## Import `<%+ template_name %>`

The `<%+ template_name %>` tag allows importing another template file into this one. By default this template acts as if it were typed directly inline with the rest of the code. This means that it shares the variables and can arbitrarily manipulate them.
