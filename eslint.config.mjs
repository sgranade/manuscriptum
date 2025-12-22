// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
// import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig(
    // obsidianmd.configs.recommended, TODO 0.1.9 is broken for flat config
    {
        extends: [eslint.configs.recommended, tseslint.configs.recommended],
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn"],
        },
        files: ["**/*.ts"],
        ignores: ["**/node/modules/", "src/**/**.test.ts"],
    }
);
