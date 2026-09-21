/**
 * tenant.test.ts — o nome do sistema segue o PRODUTO da empresa.
 *
 * Pedido de 21/09/2026: no Comercial, o menu lateral mostrava «Gestão de
 * Acordos» em cima da aba Vendas. O vendedor entra pelo domínio da BookPlay,
 * então o slug do build não serve para decidir — a empresa dele serve.
 */
import { describe, it, expect } from 'vitest';
import type { Empresa } from '@/lib/supabase';
import { getTenantBranding } from './tenant';

const empresa = (slug: string, produto: string | null, nome: string) =>
  ({ id: slug, slug, produto, nome }) as unknown as Empresa;

describe('getTenantBranding', () => {
  it('Comercial se chama «Gestão Comercial», mesmo no domínio da BookPlay', () => {
    const b = getTenantBranding('bookplay', empresa('comercial', 'comercial', 'COMERCIAL'));
    expect(b.appName).toBe('Gestão Comercial');
    expect(b.loginTitle).toBe('Gestão Comercial');
  });

  it('a cobrança continua «Gestão de Acordos»', () => {
    expect(getTenantBranding('bookplay', empresa('bookplay', 'cobranca', 'BookPlay')).appName)
      .toBe('Gestão de Acordos');
    expect(getTenantBranding('pagueplay', empresa('pagueplay', 'cobranca', 'PaguePlay')).appName)
      .toBe('Gestão de Acordos');
  });

  it('sem a coluna `produto`, o slug da empresa decide', () => {
    expect(getTenantBranding('bookplay', empresa('comercial', null, 'COMERCIAL')).appName)
      .toBe('Gestão Comercial');
  });
});
