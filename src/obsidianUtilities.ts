import { TAbstractFile, TFile, TFolder, Workspace } from "obsidian";

// As of Obsidian 1.9.14, sort orders live on the "file-explorer" `leaf.view`
// property in that object's `sortOrder` property. Possible values:
//   alphabetical: A-Z
//   alphabeticalReverse: Z-A
//   byModifiedTime: new to old
//   byModifiedTimeReverse: old to new
//   byCreatedTime: new to old
//   byCreatedTimeReverse: old to new
// Folders are always at the top as far as I can tell

const SortOrder = {
    alphabetical: "alphabetical",
    modifiedTime: "byModifiedTime",
    createdTime: "byCreatedTime",
} as const;

type SortOrderType = (typeof SortOrder)[keyof typeof SortOrder];

/**
 * Order in which the files and folders are to be sorted.
 */
interface SortInfo {
    order: SortOrderType;
    /**
     * Whether to order small to large (A-Z; earlier time to later time) or large to small
     */
    smallToLarge: boolean;
    /**
     * Any error encountered while trying to determine the sort order.
     */
    errorMessage: string | undefined;
}

/**
 * Get how the user is sorting notes.
 *
 * TODO: Nota _very_ bene: This depends on a lot of non-public details, which will
 * likely break in later versions of Obsidian.
 *
 * @param workspace Obsidian app instance's workspace.
 * @returns Sort settings for the file explorer.
 */
function getFileExplorerSortSettings(workspace: Workspace): SortInfo {
    const sortInfo: SortInfo = {
        order: SortOrder.alphabetical,
        smallToLarge: true,
        errorMessage: undefined,
    };
    const leaf = workspace.getLeavesOfType("file-explorer")?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- There's no public type for the file-explorer type, so we cast to any as a stop-gap
    const view = leaf?.view as any;
    if (!view) {
        sortInfo.errorMessage =
            "Couldn't determine notes' sort order: File Explorer View not found";
    } else if (!view.sortOrder) {
        sortInfo.errorMessage =
            "Couldn't determine notes' sort order: that information isn't in the File Explorer View as expected";
    } else {
        let order = view.sortOrder as string;
        const reverse = order.endsWith("Reverse");
        if (reverse) {
            order = order.slice(0, -7);
        }
        if (order === "alphabetical") {
            sortInfo.order = SortOrder.alphabetical;
            sortInfo.smallToLarge = !reverse; // Default is small to large (a-Z)
        } else if (order === "byModifiedTime") {
            sortInfo.order = SortOrder.modifiedTime;
            sortInfo.smallToLarge = reverse; // Default is large number to small (newer to older)
        } else if (order === "byCreatedTime") {
            sortInfo.order = SortOrder.createdTime;
            sortInfo.smallToLarge = reverse; // Default is large number to small (newer to older)
        } else {
            sortInfo.errorMessage = `Couldn't determine notes' sort order: unexpected value of ${order}`;
            sortInfo.order = SortOrder.alphabetical;
            sortInfo.smallToLarge = true;
        }
        return sortInfo;
    }

    return sortInfo;
}

/**
 * Sort a folder's children in the same order they're displayed in the File Explorer.
 * @param workspace Obsidian app instance's workspace.
 * @param children Folder's children to be sorted.
 * @returns Children in the same sort order as in the file explorer.
 */
export function sortChildrenInFileExplorerOrder(
    workspace: Workspace,
    children: TAbstractFile[]
): TAbstractFile[] {
    const { order, smallToLarge } = getFileExplorerSortSettings(workspace);

    const contents = children.slice().sort((a, b) => {
        // Folder-first logic
        if (a instanceof TFolder && b instanceof TFile) return -1;
        if (a instanceof TFile && b instanceof TFolder) return 1;

        // Choose sort key
        const getKey = (f: TAbstractFile) => {
            if (order === SortOrder.modifiedTime && f instanceof TFile)
                return f.stat.mtime;
            if (order === SortOrder.createdTime && f instanceof TFile)
                return f.stat.ctime;
            // This catches "alphabetical" order plus is a default in case
            // Obsidian decides to fiddle with this interface
            return f.name.toLowerCase();
        };

        const keyA = getKey(a);
        const keyB = getKey(b);
        const result =
            typeof keyA === "string"
                ? keyA.localeCompare(String(keyB))
                : keyA - (typeof keyB === "string" ? parseFloat(keyB) : keyB);

        return smallToLarge ? result : -result;
    });

    return contents;
}
