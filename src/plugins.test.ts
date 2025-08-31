import { expect } from "chai";
import "mocha";
import sinon from "sinon";

import * as docx from "docx";
import { Paragraph, ThematicBreak } from "mdast";
import { MutableParaOptions } from "mdast2docx/utils";

import * as uut from "./plugins";

describe("Plugins", () => {
    describe("Thematic Break", () => {
        it("should convert thematic breaks to centered hash marks", () => {
            const mockParagraph = sinon.stub().returns({ fake: "fake" });
            const mockDocx: Partial<typeof docx> = {
                Paragraph: mockParagraph as any,
            };
            const node: ThematicBreak = { type: "thematicBreak" };
            const plugin = uut.shunnThematicBreakPlugin();
            if (plugin.block === undefined)
                throw new Error("Missing block() method");

            const l = plugin.block(
                mockDocx as typeof docx,
                node,
                {},
                (node, paraProps) => [],
                (node) => []
            );
            const result = l[0];

            expect(l.length).to.equal(1);
            expect(
                mockParagraph.calledOnceWithExactly({
                    text: "#",
                    alignment: "center",
                })
            );
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
