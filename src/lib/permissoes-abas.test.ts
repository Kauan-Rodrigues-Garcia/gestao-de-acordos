import { describe, expect, it } from 'vitest';
import { catalogoDoTenant, gruposDoTenant, PERMISSOES_POR_CHAVE } from './permissoes-catalogo';
import { MODULOS_PERMISSAO, montarPorAba } from './permissoes-abas';

describe('painel de permissões por módulo', () => {
  for (const tenant of ['bookplay', 'pagueplay'] as const) {
    it(`${tenant}: nenhuma permissão fica fora de um card real`, () => {
      const leitura = montarPorAba(catalogoDoTenant(tenant), gruposDoTenant(tenant), tenant);
      expect(leitura.avulsos).toEqual([]);
      expect(leitura.blocos.every(b => b.interruptor)).toBe(true);
    });
  }

  it('não expõe os agrupamentos históricos como se fossem abas', () => {
    const rotulos = MODULOS_PERMISSAO.map(m => m.rotulo);
    expect(rotulos).not.toContain('Abas e telas');
    expect(rotulos).not.toContain('Gestão de pessoas');
    expect(rotulos).toContain('Pessoas');
  });

  it('Pessoas (antigo Usuários) organiza todas as telas internas no mesmo card', () => {
    const leitura = montarPorAba(catalogoDoTenant('bookplay'), gruposDoTenant('bookplay'), 'bookplay');
    const usuarios = leitura.blocos.find(b => b.aba === 'usuarios');
    expect(usuarios?.secoes.map(s => s.rotulo)).toEqual(expect.arrayContaining([
      'Aba interna Usuários',
      'Aba interna Estrutura › Setores',
      'Aba interna Estrutura › Equipes',
      'Aba interna Metas e comissão',
      'Aba interna Comemorações',
    ]));
  });

  it('Ranking é uma permissão independente do alcance dos analíticos', () => {
    expect(PERMISSOES_POR_CHAVE.analitico_sub_ranking.depende).toBeUndefined();
  });

  it('PaguePlay exibe as ações de acordo no Início (a chave da lista), não no Analítico', () => {
    const leitura = montarPorAba(
      catalogoDoTenant('pagueplay'), gruposDoTenant('pagueplay'), 'pagueplay',
    );
    const dashboard = leitura.blocos.find(b => b.aba === 'dashboard');
    const analitico = leitura.blocos.find(b => b.aba === 'analitico');
    const chavesDeAcordo = [
      'criar_acordos', 'editar_acordos', 'excluir_acordos', 'excluir_em_lote',
      'acordos_autorizar_tabulacao', 'acordos_capturar_erp',
    ];

    expect(dashboard?.acoes.map(p => p.key)).toEqual(expect.arrayContaining(chavesDeAcordo));
    expect(analitico?.acoes.map(p => p.key)).not.toEqual(expect.arrayContaining(chavesDeAcordo));
    expect(dashboard?.secoes.find(s => s.rotulo === 'Acordos')?.permissoes.map(p => p.key))
      .toEqual(expect.arrayContaining(chavesDeAcordo));
  });

  it('BookPlay mantém as ações no card separado Acordos', () => {
    const leitura = montarPorAba(
      catalogoDoTenant('bookplay'), gruposDoTenant('bookplay'), 'bookplay',
    );
    const dashboard = leitura.blocos.find(b => b.aba === 'dashboard');
    const acordos = leitura.blocos.find(b => b.aba === 'acordos');

    expect(acordos?.acoes.map(p => p.key)).toContain('criar_acordos');
    expect(dashboard?.acoes.map(p => p.key)).not.toContain('criar_acordos');
  });
});

/**
 * Mapa de Abas (29/09/2026): as chaves não mudaram, e o painel diz onde cada
 * uma abre agora. Quem configura procura pelo nome da tela que vê no menu.
 */
describe('o painel acompanha o Mapa de Abas', () => {
  const leitura = montarPorAba(catalogoDoTenant('bookplay'), gruposDoTenant('bookplay'), 'bookplay');
  const bloco = (id: string) => leitura.blocos.find(b => b.aba === id);
  const secaoDe = (id: string, chave: string) =>
    bloco(id)?.secoes.find(s => s.permissoes.some(p => p.key === chave))?.rotulo;

  it('cada aba antiga do Painel Líder aponta para o endereço novo', () => {
    expect(bloco('painel_lider')?.rotulo).toBe('Desempenho (liderança)');
    expect(secaoDe('painel_lider', 'painel_lider_sub_quartis')).toBe('Desempenho › Pessoas (Quartis)');
    expect(secaoDe('painel_lider', 'painel_lider_sub_ajuste_recebimento')).toBe('Analítico › Ajustes');
  });

  it('Ranking, Formas e Destaques dizem que abrem em Início e Desempenho', () => {
    expect(secaoDe('analitico', 'analitico_sub_ranking')).toBe('Desempenho › Pessoas (Ranking)');
    expect(secaoDe('analitico', 'analitico_sub_formas_pagamento')).toBe('Início › Formas');
    expect(secaoDe('analitico', 'analitico_sub_desafios')).toBe('Desempenho › Desafios');
  });

  it('logs e banco apontam para Administração', () => {
    expect(secaoDe('configuracoes', 'ver_logs')).toBe('Administração › Auditoria');
    expect(secaoDe('configuracoes', 'ver_banco_dados')).toBe('Administração › Dados e importações');
  });

  it('a ordem dos cards segue o menu novo', () => {
    const ids = MODULOS_PERMISSAO.map(m => m.id);
    expect(ids.indexOf('dashboard')).toBeLessThan(ids.indexOf('acordos'));
    expect(ids.indexOf('acordos')).toBeLessThan(ids.indexOf('lixeira'));
    expect(ids.indexOf('painel_lider')).toBeLessThan(ids.indexOf('usuarios'));
    expect(ids.indexOf('dashboard_adm')).toBeLessThan(ids.indexOf('configuracoes'));
  });
});
