import { afterEach, describe, expect, it } from 'vitest';
import { isPaguePlay } from '@/lib/index';
import { getTenantCapabilities } from '@/lib/tenant-config';
import { limparVariantes, registrarVariantes, varianteDoSlug } from '@/lib/variante';

afterEach(() => limparVariantes());

describe('variante da empresa', () => {
  it('sem linha lida, cai no atalho por slug', () => {
    expect(varianteDoSlug('pagueplay')).toBe('pagueplay');
    expect(varianteDoSlug('bookplay')).toBe('bookplay');
    expect(varianteDoSlug('PaguePlay')).toBeNull();
    expect(varianteDoSlug('comercial')).toBeNull();
    expect(isPaguePlay('pagueplay')).toBe(true);
    expect(isPaguePlay('bookplay')).toBe(false);
  });

  it('a coluna manda sobre o slug', () => {
    registrarVariantes([{ slug: 'cobranca2', variante: 'pagueplay' }, { slug: 'pagueplay', variante: null }]);
    expect(isPaguePlay('cobranca2')).toBe(true);
    expect(isPaguePlay('pagueplay')).toBe(false);
    expect(getTenantCapabilities('cobranca2').isPaguePlay).toBe(true);
  });

  it('linha sem a coluna não apaga o atalho', () => {
    registrarVariantes([{ slug: 'pagueplay' }, null]);
    expect(isPaguePlay('pagueplay')).toBe(true);
  });
});
