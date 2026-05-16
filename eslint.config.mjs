// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
// import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig(
    // obsidianmd.configs.recommended, // As of 0.3.0 this doesn't blend with type-checked eslint rules
    eslint.configs.recommended,
    {
        extends: [...tseslint.configs.recommendedTypeChecked],
        files: ["**/*.ts"],
        ignores: ["**/node_modules/**", "**/*.test.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                allowDefaultProject: ["mockDocx.ts"],
            },
        },
        rules: {
            "no-redeclare": "off", // Caught by ts-eslint; eslint rules gives false positives
            "no-undef": "off", // Ditto
            "no-unused-vars": "off", // Ditto ditto
            "@typescript-eslint/no-unused-vars": ["warn"],
        },
    },
);
