import * as fs from "node:fs";
import * as path from "node:path";
import * as docx from "docx";
import { shell } from "electron";
import { Root } from "mdast";
import { IDocxProps, ISectionProps, toDocx } from "mdast2docx";
import {
    App,
    MarkdownView,
    Notice,
    normalizePath,
    Plugin,
    PluginSettingTab,
    Setting,
    TextComponent,
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
import { sortChildrenInFileExplorerOrder } from "./obsidianUtilities";
import { folderNameToDocxOutfileName } from "./utilities";

interface ManuscriptumSettings {
    authorName: string;
    authorSurname: string;
    authorContactInformation: string;
    outputDir: string;
}

const DEFAULT_SETTINGS: Partial<ManuscriptumSettings> = {
    outputDir: downloadsFolder(),
};

/**
 * Titles that correspond to ManuscriptumSettings.
 */
const SettingTitles = {
    AuthorName: "Author name",
    AuthorSurname: "Author surname",
    AuthorContactInformation: "Author contact information",
    OutputDir: "Output directory",
} as const;

/**
 * Create a selector ID for a setting.
 * @param plugin Plugin.
 * @param settingTitle Title of the setting (such as "Author Name").
 * @returns The selector ID for the setting.
 */
function createSettingId(plugin: Plugin, settingTitle: string): string {
    return `${plugin.manifest.id}-${settingTitle.toLocaleLowerCase().replace(/ /g, "-")}-input`;
}

export default class ManuscriptumPlugin extends Plugin {
    settings: ManuscriptumSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new ManuscriptumSettingTab(this.app, this));

        this.addManuscriptumContextMenuItems();

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
     * Add items to the file pane context menu for notes and folders.
     */
    addManuscriptumContextMenuItems() {
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

    /**
     * Open the plugin's settings tab in the settings pane.
     */
    openSettingsTab() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setting = (this.app as any).setting;
        setting.open();
        setting.openTabById(this.manifest.id);
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

        const notes = sortChildrenInFileExplorerOrder(
            this.app.workspace,
            folder.children
        ).filter((f) => f instanceof TFile && f.extension === "md") as TFile[];
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

        // Now that metadata is fully filled in, normalize the outdir
        metadata.outdir = normalizePath(metadata.outdir);

        // Check whether we need blank settings filled in.
        // Note that blank metadata can only come from settings, as blank
        // metadata in note frontmatter is skipped by `obsidianNotesToAST()`.
        const missingSettings: string[] = [];
        if (!anonymize) {
            if (metadata.author === "")
                missingSettings.push(SettingTitles.AuthorName);
            if (metadata.surname === "")
                missingSettings.push(SettingTitles.AuthorSurname);
            if (metadata.contact === "")
                missingSettings.push(SettingTitles.AuthorContactInformation);
        }
        // A non-existent directory can only come from settings,
        // as `obsidianNotesToAST()` rejects non-existent output
        // directories that are defined in notes' frontmatter.
        if (!fs.existsSync(metadata.outdir)) {
            missingSettings.push(SettingTitles.OutputDir);
        }
        if (missingSettings.length > 0) {
            new Notice(
                `Please configure Manuscriptum settings: ${missingSettings.join(", ")}.`
            );
            this.openSettingsTab();
            // Wait for a paint cycle
            requestAnimationFrame(() => {
                for (const settingName of missingSettings) {
                    const settingEl = document.querySelector(
                        `#${createSettingId(this, settingName)}`
                    ) as HTMLElement;
                    if (settingEl) {
                        settingEl.style.border = "2px solid red";
                    }
                }
            });
            return;
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
            const notice = new Notice("");
            const messageEl = createFragment((f) => {
                f.createSpan({
                    text: `Manuscript saved as "${path.basename(outPath)}"`,
                });
                f.createEl("br");
                const italEl = f.createEl("em");
                italEl.createSpan({ text: "(Open " });
                const fileLinkEl = italEl.createEl("a", {
                    text: "file",
                    attr: {
                        href: "#",
                    },
                });
                fileLinkEl.onclick = async (evt) => {
                    evt.preventDefault();
                    await shell.openPath(outPath);
                };
                italEl.createSpan({ text: " | " });
                const folderLinkEl = italEl.createEl("a", {
                    text: "folder",
                    attr: { href: "#" },
                });
                folderLinkEl.onclick = async (evt) => {
                    evt.preventDefault();
                    await shell.openPath(path.dirname(outPath));
                };
                italEl.createSpan({ text: " )" });
            });
            notice.messageEl.appendChild(messageEl);
        } catch (e) {
            new Notice(`Failed to write manuscript: ${e}`);
        }
    }
}

class ManuscriptumSettingTab extends PluginSettingTab {
    plugin: ManuscriptumPlugin;

    constructor(app: App, plugin: ManuscriptumPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // Each setting needs an ID so we can later select it
        new Setting(containerEl)
            .setName(SettingTitles.AuthorName)
            .setDesc("Appears at the top of the manuscript")
            .addText((text) => {
                const el = text.inputEl;
                text.setPlaceholder("Example: Jae Simons")
                    .setValue(this.plugin.settings.authorName)
                    .onChange(async (value) => {
                        this.plugin.settings.authorName = value;
                        await this.plugin.saveSettings();
                        // Warn the user if left empty
                        if (value.trim().length > 0) {
                            text.inputEl.style.border = "";
                        } else {
                            text.inputEl.style.border = "2px solid red";
                        }
                    });
                el.setAttribute(
                    "id",
                    createSettingId(this.plugin, SettingTitles.AuthorName)
                );
                el.style.transition = "border-color 0.3s ease-in-out";
            });
        new Setting(containerEl)
            .setName(SettingTitles.AuthorSurname)
            .setDesc("Appears in manuscript headers")
            .addText((text) => {
                const el = text.inputEl;
                text.setPlaceholder("Example: Simons")
                    .setValue(this.plugin.settings.authorSurname)
                    .onChange(async (value) => {
                        this.plugin.settings.authorSurname = value;
                        await this.plugin.saveSettings();
                        // Warn the user if left empty
                        if (value.trim().length > 0) {
                            text.inputEl.style.border = "";
                        } else {
                            text.inputEl.style.border = "2px solid red";
                        }
                    });
                el.setAttribute(
                    "id",
                    createSettingId(this.plugin, SettingTitles.AuthorSurname)
                );
                el.style.transition = "border-color 0.3s ease-in-out";
            });
        new Setting(containerEl)
            .setName(SettingTitles.AuthorContactInformation)
            .setDesc("Appears in the manuscript front matter")
            .addTextArea((text) => {
                const el = text.inputEl;
                text.setPlaceholder(
                    "Example: Jae Simons\njaesimons@actualemail.com"
                )
                    .setValue(this.plugin.settings.authorContactInformation)
                    .onChange(async (value) => {
                        this.plugin.settings.authorContactInformation = value;
                        await this.plugin.saveSettings();
                        // Warn the user if left empty
                        if (value.trim().length > 0) {
                            text.inputEl.style.border = "";
                        } else {
                            text.inputEl.style.border = "2px solid red";
                        }
                    });
                el.setAttribute(
                    "id",
                    createSettingId(
                        this.plugin,
                        SettingTitles.AuthorContactInformation
                    )
                );
                el.style.transition = "border-color 0.3s ease-in-out";
            });
        let outDirTextComponent: TextComponent | null = null;
        // Save the onChange() handler so we can call it programmatically.
        const outDirTextComponentOnChange = async (value: string) => {
            this.plugin.settings.outputDir = value;
            await this.plugin.saveSettings();
            if (outDirTextComponent !== null) {
                if (fs.existsSync(value)) {
                    outDirTextComponent.inputEl.style.border = "";
                } else {
                    outDirTextComponent.inputEl.style.border = "2px solid red";
                }
            }
        };
        const outDirSetting = new Setting(containerEl)
            .setName(SettingTitles.OutputDir)
            .setDesc("Where to put the .docx files")
            .addText((text) => {
                outDirTextComponent = text;
                const el = text.inputEl;
                text.setPlaceholder("Example: c:/users/jsimons/Documents")
                    .setValue(this.plugin.settings.outputDir)
                    .onChange(outDirTextComponentOnChange);
                el.setAttribute(
                    "id",
                    createSettingId(this.plugin, SettingTitles.OutputDir)
                );
                el.style.transition = "border-color 0.3s ease-in-out";
            });
        outDirSetting.addButton((button) => {
            button.setButtonText("Select Directory").onClick(async () => {
                const input = document.createElement("input");
                input.type = "file";
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (input as any).webkitdirectory = true; // So we pick directories only
                input.onchange = async () => {
                    if (input.files && input.files.length > 0) {
                        const file = input.files[0] as File & { path: string };
                        const dir = path.dirname(file.path);
                        if (outDirTextComponent !== null) {
                            outDirTextComponent.setValue(dir);
                            outDirTextComponentOnChange(dir);
                        }
                    }
                };
                input.click();
            });
        });
    }
}
