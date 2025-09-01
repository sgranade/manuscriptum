import { expect } from "chai";
import "mocha";

import * as docx from "docx";
import { Paragraph, ThematicBreak } from "mdast";
import { MutableParaOptions } from "mdast2docx/utils";
import { createDocxModuleMock } from "./mockDocx";

import * as uut from "../docxPlugins";

describe("Plugins", () => {
    describe("Thematic Break", () => {
        it("should convert thematic breaks to centered hash marks", () => {
            const { docxMock } = createDocxModuleMock({
                TextRun: docx.TextRun,
                Paragraph: docx.Paragraph,
                Table: docx.Table,
                TableRow: docx.TableRow,
                TableCell: docx.TableCell,
            });
            const node: ThematicBreak = { type: "thematicBreak" };
            const plugin = uut.shunnThematicBreakPlugin();
            if (plugin.block === undefined)
                throw new Error("Missing block() method");

            const l = plugin.block(
                docxMock as typeof docx,
                node,
                {},
                (node, paraProps) => [],
                (node) => []
            );
            const result = l[0];

            expect(l.length).to.equal(1);
            expect((l[0] as any).__ctorArgs[0]).to.eql({
                text: "#",
                alignment: "center",
                spacing: { before: 0 },
            });
        });
    });

    describe("Double Space and Indent Paras", () => {
        it('should add a 0.5" first line indent to a paragraph', () => {
            const node: Paragraph = {
                type: "paragraph",
                children: [],
            };
            const plugin = uut.doubleSpaceAndIndentParas();
            if (plugin.block === undefined)
                throw new Error("Missing block() method");

            const result: MutableParaOptions = {};
            plugin.block(
                docx,
                // @ts-expect-error
                node,
                result,
                (node, paraProps) => [],
                (node) => []
            );

            expect(result.indent).to.eql({ firstLine: 720 });
        });

        it("should double space a paragraph", () => {
            const node: Paragraph = {
                type: "paragraph",
                children: [],
            };
            const plugin = uut.doubleSpaceAndIndentParas();
            if (plugin.block === undefined)
                throw new Error("Missing block() method");

            const result: MutableParaOptions = {};
            plugin.block(
                docx,
                // @ts-expect-error
                node,
                result,
                (node, paraProps) => [],
                (node) => []
            );

            expect(result.spacing).to.eql({
                line: 480,
                lineRule: docx.LineRuleType.AUTO,
            });
        });
    });
});

describe("Front Matter", () => {
    it("should add a table with author information to the story", () => {
        const { docxMock } = createDocxModuleMock({
            TextRun: docx.TextRun,
            Paragraph: docx.Paragraph,
            Table: docx.Table,
            TableRow: docx.TableRow,
            TableCell: docx.TableCell,
        });

        const sections = [{ children: [] }];
        const plugin = uut.addFrontMatterPlugin(
            "Story Title",
            "About 700 words",
            "Author",
            "Author\nemail@gmail.com",
            docxMock as unknown as typeof docx
        );
        if (plugin.postprocess === undefined)
            throw new Error("Missing postprocess() method");

        plugin.postprocess(sections);
        const row = (sections[0].children[0] as any).__ctorArgs[0].rows[0];
        const leftCell = row.__ctorArgs[0].children[0];
        const leftCellContents = leftCell.__ctorArgs[0].children[0];
        const result = leftCellContents.__ctorArgs[0].children; // Collection of TextRuns

        expect(result.length).to.equal(2);
        expect(result[0].__ctorArgs[0]).to.eql("Author");
        expect(result[1].__ctorArgs[0]).to.eql({
            text: "email@gmail.com",
            break: 1,
        });
    });

    it("should add a table with skipped author information to the story when there is no info passed to the plugin", () => {
        const { docxMock } = createDocxModuleMock({
            TextRun: docx.TextRun,
            Paragraph: docx.Paragraph,
            Table: docx.Table,
            TableRow: docx.TableRow,
            TableCell: docx.TableCell,
        });

        const sections = [{ children: [] }];
        const plugin = uut.addFrontMatterPlugin(
            "Story Title",
            "About 700 words",
            "Author",
            undefined,
            docxMock as unknown as typeof docx
        );
        if (plugin.postprocess === undefined)
            throw new Error("Missing postprocess() method");

        plugin.postprocess(sections);
        const row = (sections[0].children[0] as any).__ctorArgs[0].rows[0];
        const leftCell = row.__ctorArgs[0].children[0];
        const leftCellContents = leftCell.__ctorArgs[0].children[0];
        const result = leftCellContents.__ctorArgs[0].children;

        expect(result).to.be.undefined;
    });

    it("should add a table with word count information to the story", () => {
        const { docxMock } = createDocxModuleMock({
            TextRun: docx.TextRun,
            Paragraph: docx.Paragraph,
            Table: docx.Table,
            TableRow: docx.TableRow,
            TableCell: docx.TableCell,
        });

        const sections = [{ children: [] }];
        const plugin = uut.addFrontMatterPlugin(
            "Story Title",
            "About 700 words",
            "Author",
            "Author\nemail@gmail.com",
            docxMock as unknown as typeof docx
        );
        if (plugin.postprocess === undefined)
            throw new Error("Missing postprocess() method");

        plugin.postprocess(sections);
        const row = (sections[0].children[0] as any).__ctorArgs[0].rows[0];
        const rightCell = row.__ctorArgs[0].children[1];
        const result = rightCell.__ctorArgs[0].children;

        expect(result.length).to.equal(1);
        expect(result[0].__ctorArgs[0].text).to.eql("About 700 words");
    });

    it("should add title and author to the end of the section", () => {
        const { docxMock } = createDocxModuleMock({
            TextRun: docx.TextRun,
            Paragraph: docx.Paragraph,
            Table: docx.Table,
            TableRow: docx.TableRow,
            TableCell: docx.TableCell,
        });

        const sections = [{ children: [] }];
        const plugin = uut.addFrontMatterPlugin(
            "Story Title",
            "About 700 words",
            "Authorr",
            "Author\nemail@gmail.com",
            docxMock as unknown as typeof docx
        );
        if (plugin.postprocess === undefined)
            throw new Error("Missing postprocess() method");

        plugin.postprocess(sections);
        const result = sections[0].children as any[];

        expect(result.length).to.equal(13);
        expect(result[11].__ctorArgs[0].text).to.equal("Story Title");
        expect(result[12].__ctorArgs[0].text).to.equal("by Authorr");
    });

    it("should center title and author at the end of the section", () => {
        const { docxMock } = createDocxModuleMock({
            TextRun: docx.TextRun,
            Paragraph: docx.Paragraph,
            Table: docx.Table,
            TableRow: docx.TableRow,
            TableCell: docx.TableCell,
        });

        const sections = [{ children: [] }];
        const plugin = uut.addFrontMatterPlugin(
            "Story Title",
            "About 700 words",
            "Authorr",
            "Author\nemail@gmail.com",
            docxMock as unknown as typeof docx
        );
        if (plugin.postprocess === undefined)
            throw new Error("Missing postprocess() method");

        plugin.postprocess(sections);
        const result = sections[0].children as any[];

        expect(result.length).to.equal(13);
        expect(result[11].__ctorArgs[0].alignment).to.equal("center");
        expect(result[12].__ctorArgs[0].alignment).to.equal("center");
    });

    it("should double-space title and author at the end of the section", () => {
        const { docxMock } = createDocxModuleMock({
            TextRun: docx.TextRun,
            Paragraph: docx.Paragraph,
            Table: docx.Table,
            TableRow: docx.TableRow,
            TableCell: docx.TableCell,
        });

        const sections = [{ children: [] }];
        const plugin = uut.addFrontMatterPlugin(
            "Story Title",
            "About 700 words",
            "Authorr",
            "Author\nemail@gmail.com",
            docxMock as unknown as typeof docx
        );
        if (plugin.postprocess === undefined)
            throw new Error("Missing postprocess() method");

        plugin.postprocess(sections);
        const result = sections[0].children as any[];

        expect(result.length).to.equal(13);
        expect(result[11].__ctorArgs[0].spacing).to.eql({
            before: 0,
            after: 0,
            line: 480,
            lineRule: docx.LineRuleType.AUTO,
        });
        expect(result[12].__ctorArgs[0].spacing).to.eql({
            before: 0,
            after: 0,
            line: 480,
            lineRule: docx.LineRuleType.AUTO,
        });
    });
});
