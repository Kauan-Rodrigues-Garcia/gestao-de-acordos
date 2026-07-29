/**
 * src/test/setup.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Setup global do Vitest: matchers do jest-dom e polyfills mínimos.
 *
 * NÃO fazemos mock global do Supabase aqui. Cada arquivo de teste que
 * precisa de mock deve declará-lo com `vi.mock('@/lib/supabase', ...)`.
 * Isso mantém explícita a intenção de cada teste e evita surpresas.
 */
/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// ── tesseract.js: stub global ────────────────────────────────────────────────
// Exceção consciente à regra acima. O OCR já é carregado por `import()`
// dinâmico no código de produção, mas o pré-aquecimento (`preaquecerOcr`) roda
// no mount do botão de captura e o worker do tesseract NÃO carrega no ambiente
// de teste: o caminho deste projeto tem acento ("gestão"), o Node recebe a
// versão percent-encoded ("gest%C3%A3o") e a resolução do worker falha com
// MODULE_NOT_FOUND. Isso poluía a saída com 6 erros não tratados e, pior,
// derrubava arquivos inteiros de forma intermitente — foi o que mascarou a
// contagem real de falhas durante a limpeza da suíte.
//
// Não esconde intenção de teste nenhuma: nenhum teste exercita OCR. Se algum dia
// existir, ele deve mockar `@/services/pagueplay/printOcr` no próprio arquivo.
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({
    recognize: vi.fn(async () => ({ data: { text: '' } })),
    setParameters: vi.fn(async () => {}),
    terminate: vi.fn(async () => {}),
  })),
  PSM: { AUTO: '3', SINGLE_BLOCK: '6' },
}));

// Limpeza automática do DOM entre testes (evita vazamento de renderizações).
afterEach(() => {
  cleanup();
});

// Polyfill de window.matchMedia — alguns componentes do Radix/Tailwind consultam
// media-query no mount e happy-dom não implementa por padrão.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
