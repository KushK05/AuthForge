import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    ignores: ["dist/", "coverage/", "node_modules/"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
);
