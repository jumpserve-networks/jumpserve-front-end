import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.tsx"],
    ignores: ["app/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name=/^(button|select|textarea|table)$/]",
          message: "Use the shared shadcn/Base UI component from app/components/ui.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'] > Literal[value='file']))",
          message: "Use Input or Checkbox from app/components/ui. Native file pickers are allowed.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".test-artifacts/**",
  ]),
]);

export default eslintConfig;
