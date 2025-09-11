import * as fs from "node:fs";
import * as path from "node:path";
import * as docx from "docx";
import { Root } from "mdast";
import { IDocxProps, ISectionProps, toDocx } from "mdast2docx";
import {
    App,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder,
} from "obsidian";

import {
    ManuscriptMetadata,
    NoteInformation,
    obsidianNotesToAST,
} from "./converters";
import {
    addFrontMatterPlugin,
    doubleSpaceAndIndentParas,
    shunnThematicBreakPlugin,
} from "./docxPlugins";
import { downloadsFolder } from "./downloadsFolder";
import { ConfirmModal } from "./obsidianComponents";
import { folderNameToDocxOutfileName } from "./utilities";

interface ManuscriptenSettings {
    authorName: string;
    authorSurname: string;
    authorContactInformation: string;
    outputDir: string;
}

const DEFAULT_SETTINGS: Partial<ManuscriptenSettings> = {
    outputDir: downloadsFolder(),
};

export default class ManuscriptenPlugin extends Plugin {
    settings: ManuscriptenSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new ManuscriptenSettingTab(this.app, this));

        this.addEnmanuscriptContextMenuItems();

        this.addManuscriptumCommands();
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Handle context menu items.
     * @param node Obsidian folder or file that was right-clicked on.
     * @param anonymize Whether or not to anonymize the MS.
     */
    onContextClick(node: TFolder | TFile | null, anonymize: boolean) {
        // If we're run on a file, find the containing folder
        if (node instanceof TFile) {
            node = node.parent;
        }

        if (node instanceof TFolder) {
            this.saveAsManuscript(node, anonymize);
        } else {
            console.error("Unexpected type of folder:", node);
        }
    }

    /**
     * Add enmanuscript items to the file pane context menu for notes and folders.
     */
    addEnmanuscriptContextMenuItems() {
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (
                    (file instanceof TFile && file.extension === "md") ||
                    file instanceof TFolder
                ) {
                    menu.addItem((item) => {
                        item.setTitle("Save as manuscript (Shunn modern)")
                            .setIcon("book-text") // Lucide icon name
                            .onClick(() => this.onContextClick(file, false));
                    });
                    menu.addItem((item) => {
                        item.setTitle(
                            "Save as anonymous manuscript (Shunn modern)"
                        )
                            .setIcon("book-text") // Lucide icon name
                            .onClick(() => this.onContextClick(file, true));
                    });
                }
            })
        );
    }

    /**
     * Callback for whether Manuscriptum commands are allowed, and how to handle them if allowed.
     * @param checking Whether we're checking that a command is valid or executing the command.
     * @param anonymize Whether or not to anonymize the MS.
     * @returns True if the command should be allowed; false or void otherwise.
     */
    commandCheckCallback(
        checking: boolean,
        anonymize: boolean
    ): boolean | void {
        // Only available in a Markdown view
                const markdownView =
                    this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView && markdownView.file !== null) {
                    if (!checking) {
                        if (markdownView.file.parent instanceof TFolder) {
                    this.saveAsManuscript(markdownView.file.parent, anonymize);
                        } else {
                            console.error(
                                "Note didn't have a folder:",
                                markdownView.file
                            );
                        }
                    }

                    return true;
                }
    }

    /**
     * Add commands when a note is open.
     */
    addManuscriptumCommands() {
        this.addCommand({
            id: "save-as-manuscript",
            name: "Save as manuscript (Shunn Modern)",
            checkCallback: (checking: boolean) =>
                this.commandCheckCallback(checking, false),
        });
        this.addCommand({
            id: "save-as-anon-manuscript",
            name: "Save as anonymous manuscript (Shunn Modern)",
            checkCallback: (checking: boolean) =>
                this.commandCheckCallback(checking, true),
        });
    }

    async saveAsManuscript(folder: TFolder, anonymize = false) {
        const metadata: ManuscriptMetadata = {
            title: folder.name,
            filename: folderNameToDocxOutfileName(folder.name),
            outdir: this.settings.outputDir.trim(),
            author: this.settings.authorName.trim(),
            surname: this.settings.authorSurname.trim(),
            contact: this.settings.authorContactInformation.trim(),
        };

        const notes = folder.children.filter(
            (f) => f instanceof TFile && f.extension === "md"
        ) as TFile[];
        // TODO handle too-large number of notes (is the user sure? maybe make that a setting)

        const notesInfo = await Promise.all(
            notes.map(async (n): Promise<NoteInformation> => {
                return {
                    name: n.name,
                    content: await this.app.vault.cachedRead(n),
                    frontmatter:
                        this.app.metadataCache.getFileCache(n)?.frontmatter,
                };
            })
        );

        const [tree, notices] = obsidianNotesToAST(notesInfo, metadata);

        if (tree === undefined) {
            new Notice(
                `Couldn't find Markdown in ${folder.name} to save as a manuscript`
            );
            return;
        }

        if (notices.length) {
            for (const notice of notices) {
                new Notice(notice);
            }
        }

        // If any of our author/contact info is empty, or if we're anonymizing, mark as undefined
        if (metadata.author === "" || anonymize) {
            metadata.author = undefined;
        }
        if (metadata.surname === "" || anonymize) {
            metadata.surname = undefined;
        }
        if (metadata.contact === "" || anonymize) {
            metadata.contact = undefined;
        }

        const docxArrayBuffer = await this.storyMdToDocx(tree, metadata);

        const outFullPath = path.join(metadata.outdir, metadata.filename);
        if (fs.existsSync(outFullPath)) {
            new ConfirmModal(
                this.app,
                `Manuscript file "${metadata.filename}" already exists.`,
                () => {
                    this.writeDocxFile(outFullPath, docxArrayBuffer);
                },
                "Overwrite",
                "Cancel"
            ).open();
        } else {
            this.writeDocxFile(outFullPath, docxArrayBuffer);
        }
    }

    /**
     * Turn a story's Markdown into the contents of a docx file.
     * @param tree Markdown abstract syntax tree for the story.
     * @param metadata Manuscript metadata.
     * @returns Docx content.
     */
    private async storyMdToDocx(tree: Root, metadata: ManuscriptMetadata) {
        // If wordcount < 1,000, give exact wordcount. Otherwise, round to nearest 1,000
        let wordcountDesc = "";
        if (metadata.wordcount) {
            if (metadata.wordcount < 1000) {
                wordcountDesc = `${metadata.wordcount.toLocaleString()} words`;
            } else {
                wordcountDesc = `about ${(Math.round(metadata.wordcount / 100) * 100).toLocaleString()} words`;
            }
        }

        const docProps: IDocxProps = {
            title: metadata.title,
            styles: {
                default: {
                    document: {
                        run: {
                            font: "Times New Roman",
                            size: "12pt",
                        },
                    },
                },
            },
        };
        const sectionProps: ISectionProps = {
            properties: {
                page: {
                    margin: {
                        top: "1in",
                        right: "1in",
                        bottom: "1in",
                        left: "1in",
                    },
                    pageNumbers: {
                        start: 1,
                        formatType: docx.NumberFormat.DECIMAL,
                    },
                },
                titlePage: true, // So we get a page with no header
            },
            headers: {
                default: new docx.Header({
                    children: [
                        new docx.Paragraph({
                            children: [
                                new docx.TextRun({
                                    children: [
                                        metadata.surname !== undefined
                                            ? `${metadata.surname} / `
                                            : "" + `${metadata.title} / `,
                                        docx.PageNumber.CURRENT,
                                    ],
                                }),
                            ],
                            alignment: "right",
                        }),
                    ],
                }),
            },
            plugins: [
                shunnThematicBreakPlugin(),
                doubleSpaceAndIndentParas(),
                addFrontMatterPlugin(
                    metadata.title,
                    wordcountDesc,
                    metadata.author,
                    metadata.contact
                ),
            ],
        };

        const docxArrayBuffer = (await toDocx(
            tree,
            docProps,
            sectionProps,
            "arraybuffer"
        )) as ArrayBuffer;
        return docxArrayBuffer;
    }

    /**
     * Write a docx file, notifying the Obsidian user.
     * @param outPath Path to write the output to.
     * @param content Docx file contents.
     */
    private writeDocxFile(outPath: string, content: ArrayBuffer) {
        try {
            fs.writeFileSync(outPath, Buffer.from(content));
            new Notice(`Manuscript saved as ${path.basename(outPath)}`);
        } catch (e) {
            new Notice(`Failed to write manuscript: ${e}`);
        }
    }
}

class ManuscriptenSettingTab extends PluginSettingTab {
    plugin: ManuscriptenPlugin;

    constructor(app: App, plugin: ManuscriptenPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Author Name")
            .setDesc("Appears at the top of the manuscript")
            .addText((text) =>
                text
                    .setPlaceholder("Example: Jae Simons")
                    .setValue(this.plugin.settings.authorName)
                    .onChange(async (value) => {
                        this.plugin.settings.authorName = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Author Surname")
            .setDesc("Appears in manuscript headers")
            .addText((text) =>
                text
                    .setPlaceholder("Example: Simons")
                    .setValue(this.plugin.settings.authorSurname)
                    .onChange(async (value) => {
                        this.plugin.settings.authorSurname = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Author Contact Information")
            .setDesc("Appears in the manuscript front matter")
            .addTextArea((text) =>
                text
                    .setPlaceholder(
                        "Example: Jae Simons\njaesimons@actualemail.com"
                    )
                    .setValue(this.plugin.settings.authorContactInformation)
                    .onChange(async (value) => {
                        this.plugin.settings.authorContactInformation = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Output Directory")
            .setDesc("Where to put the .docx files")
            .addText((text) =>
                text
                    .setPlaceholder("Example: c:/users/jsimons/Documents")
                    .setValue(this.plugin.settings.outputDir)
                    .onChange(async (value) => {
                        this.plugin.settings.outputDir = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
