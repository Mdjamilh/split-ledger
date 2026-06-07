import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules", "**/dist", "coverage", ".vercel", "playwright-report", "test-results", "**/*.tmp.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // noUncheckedIndexedAccess is on, so `!` marks indexes we have just bounds-checked.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/test/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["apps/api/**/*.{ts,mjs}", "packages/**/*.ts", "scripts/**/*.mjs", "e2e/**/*.ts", "*.{js,ts}", "apps/*/*.ts"],
    languageOptions: { globals: globals.node },
  },
);
