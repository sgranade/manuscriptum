import { LineRuleType, WidthType } from "docx";
import * as DOCX from "docx";
import { IPlugin } from "mdast2docx";

/**
 * mdast2docx plugin to convert Markdown thematic breaks (`***`) to Shunn-manuscript scene breaks (centered `#`).
 *
 * By default mdast2docx turns thematic breaks into a full horizontal rule.
 */
export const shunnThematicBreakPlugin: (doubleSpace: boolean) => IPlugin = (
    doubleSpace
) => {
    // Code based on https://github.com/md2docx/table/
    const spacing = doubleSpace
        ? { before: 0, line: 480, lineRule: LineRuleType.AUTO }
        : { before: 0 };
    return {
        block: (docx, node) => {
            if (node.type !== "thematicBreak") return [];

            // @ts-expect-error - Setting type to empty string to avoid mdast2docx also processing the node.
            node.type = "";
            return [
                new docx.Paragraph({
                    text: "#",
                    alignment: "center",
                    spacing: spacing,
                }),
            ];
        },
    };
};

/**
 * mdast2docx plugin to add a first line indent and double-space paragraphs.
 */
export const doubleSpaceAndIndentParas: () => IPlugin = () => {
    return {
        block(docx, node, paraProps) {
            if (node.type === "paragraph") {
                paraProps.indent = {
                    firstLine: 720,
                };
                paraProps.spacing = {
                    before: 0,
                    line: 480, // Double spaced: AUTO line rule sets this to be units of 1/240th of the font size
                    lineRule: LineRuleType.AUTO,
                };
            }

            return [];
        },
    };
};

/**
 * mdast2docx plugin to add Shunn-style front matter to the manuscript.
 *
 * @param title Title of the story.
 * @param wordCountDesc Description of the number of words, such as "About 2,700 words" or "871 words"
 * @param author Name of the author. Leave blank to anonymize the story.
 * @param contactInfo Contact information. For multiple lines, separate by `\n`.
 * Leave blank to anonymize the story.
 */
export const addFrontMatterPlugin: (
    title: string,
    wordCountDesc: string,
    author?: string,
    contactInfo?: string,
    docx?: typeof DOCX
) => IPlugin = (title, wordCountDesc, author, contactInfo, docx) => {
    if (docx === undefined) {
        docx = DOCX;
    }
    const singleSpaced = {
        before: 0,
        after: 0,
        line: 240, // Single spaced: AUTO line rule sets this to be units of 1/240th of the font size
        lineRule: LineRuleType.AUTO,
    };
    const doubleSpaced = {
        before: 0,
        after: 0,
        line: 480, // Single spaced: AUTO line rule sets this to be units of 1/240th of the font size
        lineRule: LineRuleType.AUTO,
    };
    const blankPara = new docx.Paragraph({
        text: "",
        spacing: singleSpaced,
    });

    return {
        postprocess: (sections) => {
            if (sections.length === 0) return;

            // This guard against double-adding is necessary because
            // mdast2docx can call postprocess() multiple times on
            // the same list of sections, which can add the front
            // matter more than once. We'll guard by looking for our
            // exact blank paragraph object in the second child.
            if (sections[0].children[1] === blankPara) {
                return;
            }

            const contactInfoElems =
                contactInfo !== undefined
                    ? contactInfo
                          .split("\n")
                          .map((t, ndx) =>
                              ndx === 0
                                  ? new docx.TextRun(t)
                                  : new docx.TextRun({ text: t, break: 1 })
                          )
                    : undefined;
            const titleAndAuthor = [
                new docx.Paragraph({
                    text: title,
                    alignment: "center",
                    spacing: doubleSpaced,
                }),
            ];
            if (author !== undefined) {
                titleAndAuthor.push(
                    new docx.Paragraph({
                        text: `by ${author}`,
                        alignment: "center",
                        spacing: doubleSpaced,
                    })
                );
            }

            sections[0].children = [
                // Heading table with contact info and word count
                new docx.Table({
                    rows: [
                        new docx.TableRow({
                            children: [
                                new docx.TableCell({
                                    children: [
                                        new docx.Paragraph({
                                            children: contactInfoElems,
                                            alignment: "left",
                                            spacing: singleSpaced,
                                        }),
                                    ],
                                    width: {
                                        size: 50,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                                new docx.TableCell({
                                    children: [
                                        new docx.Paragraph({
                                            text: wordCountDesc,
                                            alignment: "right",
                                            spacing: singleSpaced,
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: "none" },
                        right: { style: "none" },
                        bottom: { style: "none" },
                        left: { style: "none" },
                        insideHorizontal: { style: "none" },
                        insideVertical: { style: "none" },
                    },
                }),
                // Blanks before title and author
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                blankPara,
                ...titleAndAuthor,
                new docx.Paragraph({
                    text: "",
                    spacing: doubleSpaced,
                }),
                // The rest of the document
                ...sections[0].children,
            ];
        },
    };
};
