import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      // Permite console.warn/error/info (usados em logging de auth/realtime),
      // mas sinaliza console.log acidental deixado em código de produção.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  // Arquivos core (fronteiras Supabase) — exigência de tipagem estrita, sem `any`.
  // Este override foi adicionado após o sweep de remoção de `any`;
  // novo `any` aqui deve ser rejeitado pelo CI até refatoração explícita.
  {
    files: [
      "src/services/acordos.service.ts",
      "src/services/aiImport.service.ts",
      "src/providers/RealtimeAcordosProvider.tsx",
      "src/components/Layout.tsx",
      "src/pages/MetasConfig.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  }
);
