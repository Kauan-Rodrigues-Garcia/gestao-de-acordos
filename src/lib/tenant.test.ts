/**
 * tenant.test.ts — o nome do sistema segue o PRODUTO da empresa.
 *
 * Pedido de 21/09/2026: no Comercial, o menu lateral mostrava «Gestão de
 * Acordos» em cima da aba Vendas. O vendedor entra pelo domínio da BookPlay,
 * então o slug do build não serve para decidir — a empresa dele serve.
 */
import { describe, it, expect } from 'vitest';
import type { Empresa } from '@/lib/supabase';
import { getTenantBranding, siteAceitaEmpresa } from './tenant';

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

describe('siteAceitaEmpresa — a cobrança é um produto só (06/10/2026)', () => {
  it('BookPlay e PaguePlay entram uma pelo site da outra', () => {
    expect(siteAceitaEmpresa('pagueplay', empresa('bookplay', 'cobranca', 'BookPlay'))).toBe(true);
    expect(siteAceitaEmpresa('bookplay', empresa('pagueplay', 'cobranca', 'PaguePlay'))).toBe(true);
  });

  it('sem a coluna produto, o slug conhecido decide', () => {
    expect(siteAceitaEmpresa('bookplay', empresa('pagueplay', null, 'PaguePlay'))).toBe(true);
  });

  it('Comercial e RH continuam fora da cobrança, e a cobrança fora deles', () => {
    expect(siteAceitaEmpresa('bookplay', empresa('comercial', 'comercial', 'COMERCIAL'))).toBe(false);
    expect(siteAceitaEmpresa('pagueplay', empresa('rh', 'rh', 'RH'))).toBe(false);
    expect(siteAceitaEmpresa('comercial', empresa('bookplay', 'cobranca', 'BookPlay'))).toBe(false);
  });

  it('empresa desconhecida não entra; site sem slug aceita todos', () => {
    expect(siteAceitaEmpresa('pagueplay', empresa('outra', null, 'Outra'))).toBe(false);
    expect(siteAceitaEmpresa('', empresa('outra', null, 'Outra'))).toBe(true);
  });
});
