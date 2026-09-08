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
  // `coverage` entrou junto com `dist`: os dois são gerados e ignorados pelo
  // git, e o relatório do v8 traz JS de terceiros (prettify, sorter) que o
  // lint reclamava — seis avisos sobre arquivos que nem estão no repositório.
  // `examples/` entra pelo mesmo motivo de `arquivo-morto`: é material de
  // referência, não código vivo. O README dele diz, com todas as letras,
  // «refer to the relevant logic rather than using directly» — não está em
  // tsconfig nenhum, ninguém o importa, e não vai para o bundle. Lintar ali
  // rendia 13 avisos sobre código de exemplo da Stripe.
  { ignores: ["dist", "coverage", "arquivo-morto", "examples", "src/lib/database.types.ts"] },
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
      // `_` na frente = «existe por obrigação de assinatura, não vou usar».
      // O código já seguia a convenção em ~25 lugares (`_req`, `_perfis`,
      // `_modo`), mas a regra estava sem os padrões e reclamava deles do mesmo
      // jeito — o que ensina a ignorar o aviso, que é o oposto do que ele
      // serve. Sem `_`, continua sendo aviso.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
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
  // `logger.ts` é a ÚNICA porta sancionada para o console — é ele que decide o
  // que sai em dev e o que sai sempre. A regra global proíbe `console.debug`
  // justamente para que ninguém o chame direto; aqui dentro ele é a
  // implementação, não um resto de depuração esquecido.
  {
    files: ["src/lib/logger.ts"],
    rules: { "no-console": "off" },
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
