import esbuild from "esbuild";
import process from "process";
import { readFileSync } from "fs";
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

const banner = `/*! ${pkg.name} v${pkg.version} | (c) ${pkg.author.name} | ${pkg.author.url} */`;

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
    outdir: "dist",
    minify: production,
    plugins: [
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
