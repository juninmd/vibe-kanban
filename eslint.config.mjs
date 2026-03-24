import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["dist/", "node_modules/", "coverage/", "playwright-report/", "test-results/"]
  },
  {
    files: ["**/*.ts", "**/*.js", "**/*.mjs"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-explicit-any": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  eslintConfigPrettier
];
