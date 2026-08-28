import { describe, expect, it } from 'vitest';
import { catalogoDoTenant, gruposDoTenant, PERMISSOES_POR_CHAVE } from './permissoes-catalogo';
import { MODULOS_PERMISSAO, montarPorAba } from './permissoes-abas';

describe('painel de permissões por módulo', () => {
  for (const tenant of ['bookplay', 'pagueplay'] as const) {
    it(`${tenant}: nenhuma permissão fica fora de um card real`, () => {
      const leitura = montarPorAba(catalogoDoTenant(tenant), gruposDoTenant(tenant));
      expect(leitura.avulsos).toEqual([]);
      expect(leitura.blocos.every(b => b.interruptor)).toBe(true);
    });
  }

  it('não expõe os agrupamentos históricos como se fossem abas', () => {
    const rotulos = MODULOS_PERMISSAO.map(m => m.rotulo);
    expect(rotulos).not.toContain('Abas e telas');
    expect(rotulos).not.toContain('Gestão de pessoas');
    expect(rotulos).toContain('Usuários');
  });

  it('Usuários organiza todas as telas internas no mesmo card', () => {
    const leitura = montarPorAba(catalogoDoTenant('bookplay'), gruposDoTenant('bookplay'));
    const usuarios = leitura.blocos.find(b => b.aba === 'usuarios');
    expect(usuarios?.secoes.map(s => s.rotulo)).toEqual(expect.arrayContaining([
      'Aba interna Usuários',
      'Aba interna Setores',
      'Aba interna Equipes',
      'Aba interna Metas',
      'Aba interna Comemorações',
    ]));
  });

  it('Ranking é uma permissão independente do alcance dos analíticos', () => {
    expect(PERMISSOES_POR_CHAVE.analitico_sub_ranking.depende).toBeUndefined();
  });
});
