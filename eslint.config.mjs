import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const dataPipelineModules = [
  "**/lib/zerion",
  "**/lib/zerion.ts",
  "**/lib/codex",
  "**/lib/codex.ts",
  "**/lib/cache",
  "**/lib/cache.ts",
  "**/lib/analyze",
  "**/lib/analyze.ts",
  "**/lib/ens",
  "**/lib/ens.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Domain boundary rules — see ARCHITECTURE.md
  {
    // simulation.ts must not import from data-pipeline or UI
    files: ["lib/simulation.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          ...dataPipelineModules,
          "**/components/**",
          "**/app/**",
        ],
      }],
    },
  },
  {
    // types.ts must not import from anywhere in the project
    files: ["lib/types.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: ["**/lib/**", "**/components/**", "**/app/**"],
      }],
    },
  },
  {
    // UI components and pages must not import from data-pipeline
    files: ["components/**/*.tsx", "components/**/*.ts", "app/**/*.tsx", "app/**/*.ts"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: dataPipelineModules,
      }],
    },
  },
]);

export default eslintConfig;
