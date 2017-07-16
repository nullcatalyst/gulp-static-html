const assert = require("assert");
const { compileTemplate } = require("../lib");

// Helper file to "load" templates.
// That way we don't actually need to load any files from the disk.
async function loadFile(templateName, options) {
    const TEMPLATES = {
        "world": "World",
    };

    return TEMPLATES[templateName];
}

const OPTIONS = {
    loadFile: loadFile,
};

describe("compileTemplate()", function () {
    it("should simply pass templates back unchanged if they do not contain any functional tags", async function () {
        const T1 = "Hello World";

        let template = await compileTemplate(T1, OPTIONS);
        assert.equal(template(), T1);
    });

    it("should be able to handle importing additional templates", async function () {
        const T1 = "Hello <%+ world %>";

        let template = await compileTemplate(T1, OPTIONS);
        assert.equal(template(), "Hello World");
    });
});
