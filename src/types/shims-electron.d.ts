// Since Obsidian has access to Electron
declare module "electron" {
    export const shell: {
        openPath(path: string): Promise<string>;
    };
}
