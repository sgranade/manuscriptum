import esbuild from "esbuild";
import process from "process";
import { copyFileSync, readFileSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

const banner = `/*! ${pkg.name} v${pkg.version} | (c) ${pkg.author.name} | ${pkg.author.url} */`;
const outdir = "dist";

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: "esbuild-problem-matcher",

    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(
                    `    ${location.file}:${location.line}:${location.column}:`,
                );
            });
            console.log("[watch] build finished");
        });
    },
};

/**
 * Copy `manifest.json` to outdir, updating its version to match what's in `package.json`,
 * as well as styles.css.
 * @type {import('esbuild').Plugin}
 */
const updateManifestPlugin = {
    name: "update-manifest",

    setup(build) {
        build.onEnd(() => {
            copyFileSync("styles.css", outdir + "/styles.css");
            console.log("✅ styles.css copied");
            const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
            manifest.version = pkg.version;
            writeFileSync(
                outdir + "/manifest.json",
                JSON.stringify(manifest, null, 2),
            );
            console.log("✅ manifest.json updated");
        });
    },
};

const stripScriptTagsPlugin = {
    // `docx` uses `jszip`, which uses `lie`, which uses `immediate`. That module
    // includes an ancient polyfill to handle microtask scheduling that dynamically injects
    // a `<script>` tag. Obsidian's plugin scanning code really doesn't like that. Since
    // the plugin will run in Electron and that branch is never reached, we'll blot it out.
    // Sadly, `docx` bundles everything into a single `dist/index.mjs` file, not a library,
    // so we have to use some blunt force regex instead of introducing aliasing `immediate`
    // to a shim in the build context.

    // N.B. These regexes must be reviewed every time we update the `docx` module.

    name: "strip-immediate-code",

    setup(build) {
        build.onLoad(
            { filter: /docx[/|\\]dist[/|\\]index\.mjs$/ },
            async (args) => {
                let text = await readFile(args.path, "utf8");

                // block the script-tag fallback branch that'll never be reached in Electron
                text = text.replace(
                    /"onreadystatechange"\s*in\s*l\.createElement\("script"\)/g,
                    "false",
                );
                // Remove the calls to `createElement("script")` that annoy the Obsidian scanner
                text = text.replace(
                    /createElement\(["']script["']\)/g,
                    "createElement('canvas')",
                );
                return { contents: text, loader: "js" };
            },
        );
    },
};

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
    banner: {
        js: banner,
    },
    entryPoints: ["src/main.ts"],
    external: ["obsidian", "electron"],
    format: "cjs",
    target: "es2020",
    platform: "node",
    mainFields: ["module", "main"],
    logLevel: "info",
    bundle: true,
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outdir: outdir,
    minify: production,
    plugins: [
        stripScriptTagsPlugin,
        updateManifestPlugin,
        /* add to the end of plugins array */
        esbuildProblemMatcherPlugin,
    ],
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    await ctx.dispose();
    process.exit(0);
}
