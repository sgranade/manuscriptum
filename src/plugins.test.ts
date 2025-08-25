import { expect } from "chai";
import "mocha";
import sinon from "sinon";

import * as docx from "docx";
import { ThematicBreak } from "mdast";

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
            if (plugin.block !== undefined) {
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
            }
        });
    });
});
