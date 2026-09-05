import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

export default tseslint.config(
  // `arquivo-morto/` é backup legível, não código vivo: não compila, não roda e
  // não é lintado. Ele referencia módulos que já saíram do `src/`, então lintá-lo
  // só produziria erro sobre código que ninguém executa. Ver arquivo-morto/README.md.
  { ignores: ["dist", "arquivo-morto", "src/lib/database.types.ts"] },
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
      "import-x": importX,
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
      // Impede declarações não-import entre blocos de import (ex: queryClient no meio dos imports)
      "import-x/first": "error",
    },
  },
  // Arquivos de teste usam o padrão vitest de declarar mocks (`vi.mock` +
  // consts) ANTES do import do SUT — o import no corpo do módulo é
  // intencional e necessário (mover para o topo quebraria os mocks por TDZ).
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "src/test/**"],
    rules: {
      "import-x/first": "off",
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
