/**
 * useEmpresa.foco.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Bug de 04/09/2026: sair da janela do navegador e voltar levava a pessoa de
 * volta para a primeira aba interna da tela.
 *
 * `SIGNED_IN` não significa «alguém acabou de entrar». O supabase-js REEMITE
 * esse evento quando a aba volta ao foco — ele revalida a sessão guardada e
 * anuncia de novo a mesma pessoa. Este provider filtrava só `TOKEN_REFRESHED`,
 * então a volta ao foco chamava `load()`, que começa com `setLoading(true)`, e
 * o `ProtectedRoute` trocava a página inteira por um esqueleto.
 *
 * Trocar a página DESMONTA tudo o que estava dentro: a aba interna aberta, o
 * filtro escolhido, a rolagem, o formulário pela metade.
 *
 * A regra que estes testes trancam: recarrega quando a PESSOA muda; não
 * recarrega quando é a mesma pessoa voltando para a aba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

type Handler = (evento: string, sessao: unknown) => void;

const { estado } = vi.hoisted(() => ({
  estado: {
    handler: null as Handler | null,
    buscas: 0,
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Handler) => {
        estado.handler = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

vi.mock('@/services/empresas.service', () => ({
  fetchEmpresaBySlug: async () => { estado.buscas++; return { id: 'e1', slug: 'bookplay' }; },
  fetchEmpresaAtual:  async () => { estado.buscas++; return { id: 'e1', slug: 'bookplay' }; },
}));
vi.mock('@/services/impersonacao.service', () => ({ getImpersonacaoAtiva: () => false }));
vi.mock('@/services/empresaAtiva.service', () => ({ resolverEmpresaEscolhida: async () => null }));
vi.mock('@/lib/tenant', () => ({
  getTenantRuntimeConfig: () => ({ slug: 'bookplay', branding: {}, features: {}, siteUrl: null }),
}));

import { EmpresaProvider } from './useEmpresa';

const sessaoDe = (id: string) => ({ user: { id } });

beforeEach(() => {
  estado.handler = null;
  estado.buscas = 0;
});

async function montar() {
  render(<EmpresaProvider><p>ok</p></EmpresaProvider>);
  await waitFor(() => expect(estado.buscas).toBe(1));
  // A montagem já contou como a carga inicial; o resto do teste mede o delta.
  return () => estado.buscas;
}

describe('useEmpresa — a volta ao foco não recarrega a empresa', () => {
  it('SIGNED_IN da MESMA pessoa não busca de novo', async () => {
    const buscas = await montar();
    // Primeiro SIGNED_IN: é o login de verdade, e registra de quem é a sessão.
    estado.handler?.('SIGNED_IN', sessaoDe('u1'));
    await waitFor(() => expect(buscas()).toBe(2));

    // A aba volta ao foco: o supabase-js reemite SIGNED_IN da mesma pessoa.
    estado.handler?.('SIGNED_IN', sessaoDe('u1'));
    estado.handler?.('SIGNED_IN', sessaoDe('u1'));
    await new Promise(r => setTimeout(r, 10));

    // Nenhuma busca a mais — e, portanto, nenhum `setLoading(true)` que
    // desmontaria a página e a aba interna aberta nela.
    expect(buscas()).toBe(2);
  });

  it('SIGNED_IN de OUTRA pessoa recarrega', async () => {
    const buscas = await montar();
    estado.handler?.('SIGNED_IN', sessaoDe('u1'));
    await waitFor(() => expect(buscas()).toBe(2));

    // Impersonação ou troca de conta: a empresa pode ser outra.
    estado.handler?.('SIGNED_IN', sessaoDe('u2'));
    await waitFor(() => expect(buscas()).toBe(3));
  });

  it('SIGNED_OUT recarrega e esquece de quem era a sessão', async () => {
    const buscas = await montar();
    estado.handler?.('SIGNED_IN', sessaoDe('u1'));
    await waitFor(() => expect(buscas()).toBe(2));

    estado.handler?.('SIGNED_OUT', null);
    await waitFor(() => expect(buscas()).toBe(3));

    // A MESMA pessoa entrando de novo depois do logout tem que recarregar:
    // sem esquecer o id, o login seguinte seria confundido com volta ao foco.
    estado.handler?.('SIGNED_IN', sessaoDe('u1'));
    await waitFor(() => expect(buscas()).toBe(4));
  });

  it('TOKEN_REFRESHED nunca recarrega', async () => {
    const buscas = await montar();
    estado.handler?.('TOKEN_REFRESHED', sessaoDe('u1'));
    estado.handler?.('INITIAL_SESSION', sessaoDe('u1'));
    await new Promise(r => setTimeout(r, 10));
    expect(buscas()).toBe(1);
  });
});
