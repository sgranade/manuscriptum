import { expect } from "chai";
import "mocha";
import { Paragraph, Text } from "mdast";

import * as uut from "../converters";

describe("Converters", () => {
    describe("Obsidian Notes to AST", () => {
        it("should convert a single note to Markdown", async () => {
            const metadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                },
            ];

            const [result, _] = uut.obsidianNotesToAST(info, metadata);

            expect(result?.children[0].type).to.equal("paragraph");
            expect(
                (result?.children[0] as Paragraph).children[0].type
            ).to.equal("text");
            expect(
                ((result?.children[0] as Paragraph).children[0] as Text).value
            ).to.equal("This is our story");
        });

        it("should turn multiple notes into a single tree separated by a thematic break", async () => {
            const metadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                },
                {
                    name: "notey 1",
                    content: "The story continues!",
                },
            ];

            const [result, _] = uut.obsidianNotesToAST(info, metadata);

            expect(result?.children[0].type).to.equal("paragraph");
            expect(
                ((result?.children[0] as Paragraph).children[0] as Text).value
            ).to.equal("This is our story");
            expect(result?.children[1].type).to.equal("thematicBreak");
            expect(result?.children[2].type).to.equal("paragraph");
            expect(
                ((result?.children[2] as Paragraph).children[0] as Text).value
            ).to.equal("The story continues!");
        });

        it("should ignore a note's non-relevant properties", async () => {
            const metadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                    frontmatter: { irrelevant: "ignored!" },
                },
            ];

            const [_, result] = uut.obsidianNotesToAST(info, metadata);

            expect(metadata).to.eql({
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
                wordcount: 4,
            });
            expect(result).to.be.empty;
        });

        it("should replace existing metadata from a note's properties", async () => {
            const metadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                    frontmatter: {
                        title: "new title",
                        filename: "new.docx",
                        outdir: "~/temp",
                        author: "author",
                        surname: "surname",
                        contact: "contact",
                    },
                },
            ];

            const [_, result] = uut.obsidianNotesToAST(info, metadata);

            expect(metadata).to.eql({
                title: "new title",
                filename: "new.docx",
                outdir: "~/temp",
                author: "author",
                surname: "surname",
                contact: "contact",
                wordcount: 4,
            });
            expect(result).to.be.empty;
        });

        it("should overwrite metadata from earlier notes with metadata from later notes", async () => {
            const metadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                    frontmatter: {
                        title: "Title 1",
                        author: "authey!",
                        contact: "3-2-1 contact",
                    },
                },
                {
                    name: "notey 1",
                    content: "The story continues!",
                    frontmatter: { title: "Title 2", contact: "new contact" },
                },
            ];

            uut.obsidianNotesToAST(info, metadata);

            expect(metadata).to.eql({
                title: "Title 2",
                filename: "storytitle.docx",
                outdir: "~/stories",
                author: "authey!",
                contact: "new contact",
                wordcount: 7,
            });
        });

        it("should notify the user if multiple notes contain the same metadata property", async () => {
            const metadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                    frontmatter: {
                        title: "Title 1",
                        author: "authey!",
                        contact: "3-2-1 contact",
                    },
                },
                {
                    name: "notey 1",
                    content: "The story continues!",
                    frontmatter: { title: "Title 2", contact: "new contact" },
                },
            ];

            const [_, result] = uut.obsidianNotesToAST(info, metadata);

            expect(result).to.eql([
                "Note notey 1 re-defined the following properties: title, contact",
            ]);
        });

        it("should count the words in the notes", async () => {
            const metadata: uut.ManuscriptMetadata = {
                title: "Story Title",
                filename: "storytitle.docx",
                outdir: "~/stories",
            };
            const info = [
                {
                    name: "notey",
                    content: "This is our story",
                },
                {
                    name: "notey 1",
                    content: "The story continues!",
                },
            ];

            uut.obsidianNotesToAST(info, metadata);

            expect(metadata.wordcount).to.equal(7);
        });
    });
});
