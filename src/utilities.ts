/**
 * Turn a folder name into a docx filename.
 *
 * Illegal Windows filename characters will be stripped regardless of platform
 * for simplicity.
 *
 * @param name Name of the folder.
 * @returns Docx filename.
 */
export function folderNameToDocxOutfileName(name: string): string {
    // Get a filename that's 32 characters or fewer, splitting on spaces.
    const outFilenamePieces = name
        .toLocaleLowerCase()
        .replace(/[<>:"/\\|?*]/g, "")
        .split(/\s+/);
    let accumulation = 0;
    let endIndex = 0;
    for (; endIndex < outFilenamePieces.length; ++endIndex) {
        accumulation += outFilenamePieces[endIndex].length;
        if (accumulation > 32) {
            break;
        }
        ++accumulation; // Account for dash separators
    }
    if (endIndex == 0) endIndex = 1; // Make sure we have at least one piece!
    return outFilenamePieces.slice(0, endIndex).join("-") + ".docx";
}
