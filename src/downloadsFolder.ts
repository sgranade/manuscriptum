import * as os from "os";
import { execSync } from "child_process";
import { statSync, existsSync } from "fs";

/**
 * Get the user's downloads folder.
 * @returns Path to the downloads folder, or empty string if it wasn't found.
 */
export function downloadsFolder(): string {
    const platform = os.platform();

    if (platform === "win32") {
        return windows();
    } else if (platform === "darwin") {
        return darwin();
    } else if (
        platform === "freebsd" ||
        platform === "linux" ||
        platform === "sunos"
    ) {
        return unix();
    }

    return "";
}

function darwin() {
    return `${process.env.HOME}/Downloads`;
}

function unix() {
    let dir;
    try {
        dir = execSync("xdg-user-dir DOWNLOAD", { encoding: "utf8" }).trim();
    } catch {
        // Ignore
    }
    if (dir && dir !== process.env.HOME) return dir;

    let stat;
    const homeDownloads = `${process.env.HOME}/Downloads`;
    try {
        stat = statSync(homeDownloads);
    } catch {
        // Ignore
    }
    if (stat) return homeDownloads;

    return "/tmp/";
}

function windows() {
    const folder = `${process.env.USERPROFILE}\\Downloads`;
    return existsSync(folder) ? folder : "";
}
