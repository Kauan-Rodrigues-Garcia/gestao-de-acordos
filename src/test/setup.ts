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
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
