import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Any alternate build output. `distDir` is set from NEXT_DIST_DIR (see
    // next.config.ts), so throwaway builds land in siblings like `.next-e2e`
    // or `.next-check`. Without this they get linted as source and bury the
    // real findings under thousands of generated-code warnings.
    ".next-*/**",
  ]),
  {
    rules: {
      // Underscore means "required by a signature I don't control" — e.g. the
      // (prevState, formData) shape useActionState imposes on Server Actions.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
