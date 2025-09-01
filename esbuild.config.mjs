import esbuild from "esbuild";
import process from "process";
import { readFileSync, writeFileSync } from "fs";
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
                    `    ${location.file}:${location.line}:${location.column}:`
                );
            });
            console.log("[watch] build finished");
        });
    },
};

/**
 * Copy `manifest.json` to outdir, updating its version to match what's in `package.json`.
 * @type {import('esbuild').Plugin}
 */
const updateManifestPlugin = {
    name: "update-manifest",

    setup(build) {
        build.onEnd(() => {
            const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
            manifest.version = pkg.version;
            writeFileSync(
                outdir + "/manifest.json",
                JSON.stringify(manifest, null, 2)
            );
            console.log("✅ manifest.json updated");
        });
    },
};

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
    banner: {
        js: banner,
    },
    entryPoints: ["src/main.ts"],
    // external: ["obsidian", "electron"],
    format: "cjs",
    target: "es2020",
    platform: "node",
    logLevel: "info",
    bundle: true,
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outdir: outdir,
    minify: production,
    plugins: [
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
