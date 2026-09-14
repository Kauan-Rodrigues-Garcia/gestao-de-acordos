/**
 * As equipes no Painel Diretoria — pedido de 14/09/2026.
 *
 *   1. As equipes que aparecem são as do SISTEMA (Gestão), e os números são os
 *      do Painel Líder: acumulado do analítico, meta da aba Metas, faixa e
 *      quartil pelas mesmas contas de `detalharEquipe`.
 *   2. Equipe do 59 sem vínculo com equipe do sistema fica numa lista separada.
 */
import { describe, it, expect } from 'vitest';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { EquipeDoSetor } from './diretoriaSetores.service';
import {
  montarEquipesDoSetor, serieDiariaDaEquipe, separarEquipesDo59,
} from './equipesDiretoria';

const DIAS = { totalUteis: 22, decorridos: 22, treino: false };

const base = {
  setorId: 'receptivo',
  equipes: [
    { id: 'eq-matheus', nome: 'Equipe Matheus', setor_id: 'receptivo' },
    { id: 'eq-luciana', nome: 'Equipe Luciana', setor_id: 'receptivo' },
    { id: 'eq-outro',   nome: 'Equipe de outro setor', setor_id: 'play-1' },
  ],
  operadorEquipeMap: {
    ana:   { equipe_id: 'eq-matheus', equipe_nome: 'Equipe Matheus', setor_id: 'receptivo' },
    bruno: { equipe_id: 'eq-matheus', equipe_nome: 'Equipe Matheus', setor_id: 'receptivo' },
    carla: { equipe_id: 'eq-luciana', equipe_nome: 'Equipe Luciana', setor_id: 'receptivo' },
    dani:  { equipe_id: 'eq-outro',   equipe_nome: 'Equipe de outro setor', setor_id: 'play-1' },
  },
  // Dani é clone na equipe da Luciana: conta nas duas, como no Painel Líder.
  equipesExtrasPorOperador: { dani: ['eq-luciana'] },
  resumos: [
    { operador_id: 'ana',   total_recebido: 120_000 },
    { operador_id: 'bruno', total_recebido: 40_000 },
    { operador_id: 'carla', total_recebido: 30_000 },
    { operador_id: 'dani',  total_recebido: 10_000 },
  ],
  metas: [
    { tipo: 'equipe',   referencia_id: 'eq-matheus', meta_valor: 150_000 },
    { tipo: 'operador', referencia_id: 'ana',   meta_valor: 100_000 },
    { tipo: 'operador', referencia_id: 'bruno', meta_valor: 100_000 },
    { tipo: 'operador', referencia_id: 'carla', meta_valor: '60000' },
  ],
  identidade: {
    ana:   { nome: 'Ana',   fotoUrl: null },
    bruno: { nome: 'Bruno', fotoUrl: null },
    carla: { nome: 'Carla', fotoUrl: null },
    dani:  { nome: 'Dani',  fotoUrl: null },
  },
  quartis: QUARTIS_PADRAO,
  diasDaEquipe: () => DIAS,
};

describe('montarEquipesDoSetor', () => {
  it('só as equipes do setor, maior acumulado primeiro', () => {
    const r = montarEquipesDoSetor(base);
    expect(r.map(e => e.nome)).toEqual(['Equipe Matheus', 'Equipe Luciana']);
  });

  it('acumulado e meta como no Painel Líder, clone contando na equipe que o tomou', () => {
    const [matheus, luciana] = montarEquipesDoSetor(base);
    expect(matheus.acumulado).toBe(160_000);
    expect(matheus.meta).toBe(150_000);
    expect(luciana.acumulado).toBe(40_000);
    expect(luciana.meta).toBeNull();
    expect(luciana.operadores.map(o => o.nome)).toEqual(['Carla', 'Dani']);
  });

  it('faixa da equipe, quartil de cada operador, pessoas por quartil e destaque', () => {
    const [matheus] = montarEquipesDoSetor(base);
    expect(matheus.detalhe.faixaAtual?.quartil).toBe(1);
    expect(matheus.operadores.map(o => [o.nome, o.quartil])).toEqual([['Ana', 1], ['Bruno', 4]]);
    expect(matheus.detalhe.porQuartil.find(q => q.quartil === 1)?.qtd).toBe(1);
    expect(matheus.detalhe.porQuartil.find(q => q.quartil === 4)?.qtd).toBe(1);
    expect(matheus.detalhe.destaque?.nome).toBe('Ana');
  });

  it('operador sem meta fica sem quartil', () => {
    const [, luciana] = montarEquipesDoSetor(base);
    const dani = luciana.operadores.find(o => o.nome === 'Dani')!;
    expect(dani.quartil).toBeNull();
    expect(dani.projecaoPct).toBeNull();
  });

  it('usa os dias úteis da equipe (treinamento) para ela e para os operadores', () => {
    const r = montarEquipesDoSetor({
      ...base,
      diasDaEquipe: id => (id === 'eq-luciana' ? { totalUteis: 11, decorridos: 5, treino: true } : DIAS),
    });
    const luciana = r.find(e => e.equipeId === 'eq-luciana')!;
    expect(luciana.treino).toBe(true);
    expect(luciana.totalUteis).toBe(11);
    // Carla: 30k de 60k. No mês cheio (22 de 22) seria 50% → 3º quartil; com 5
    // dos 11 dias do treino, o esperado é ~27,3k e ela está acima → 1º.
    expect(montarEquipesDoSetor(base)[1].operadores.find(o => o.nome === 'Carla')?.quartil).toBe(3);
    expect(luciana.operadores.find(o => o.nome === 'Carla')?.quartil).toBe(1);
  });

  it('equipe do setor sem ninguém ainda aparece, zerada', () => {
    const r = montarEquipesDoSetor({
      ...base,
      equipes: [...base.equipes, { id: 'eq-nova', nome: 'Equipe Nova', setor_id: 'receptivo' }],
    });
    const nova = r.find(e => e.equipeId === 'eq-nova')!;
    expect(nova.acumulado).toBe(0);
    expect(nova.operadores).toEqual([]);
  });
});

describe('serieDiariaDaEquipe', () => {
  it('um ponto por dia do mês, só dos operadores da equipe', () => {
    const serie = serieDiariaDaEquipe([
      { operador_id: 'ana',   valor_recebido: 100, data_pagamento: '2026-09-01' },
      { operador_id: 'ana',   valor_recebido: 50,  data_pagamento: '2026-09-01' },
      { operador_id: 'bruno', valor_recebido: 30,  data_pagamento: '2026-09-03' },
      { operador_id: 'carla', valor_recebido: 999, data_pagamento: '2026-09-03' },
      { operador_id: null,    valor_recebido: 999, data_pagamento: '2026-09-03' },
      { operador_id: 'ana',   valor_recebido: 999, data_pagamento: '2026-08-31' },
    ], new Set(['ana', 'bruno']), '2026-09');

    expect(serie).toHaveLength(30);
    expect(serie[0]).toEqual({ dia: 1, valor: 150 });
    expect(serie[1]).toEqual({ dia: 2, valor: 0 });
    expect(serie[2]).toEqual({ dia: 3, valor: 30 });
  });
});

function equipe59(over: Partial<EquipeDoSetor>): EquipeDoSetor {
  return {
    nome: 'X', codGrupo: '63', carteira: 'COB RECEPTIVO', valor: 0, linhas: 0, operadores: 0,
    veioDeFora: false, eIntegral: false, eEquipe: true,
    equipeId: null, equipeNome: null, liderId: null, liderNome: null, liderFoto: null,
    ...over,
  };
}

describe('separarEquipesDo59', () => {
  it('junta os subgrupos do 59 ligados à MESMA equipe do sistema', () => {
    const { vinculadas } = separarEquipesDo59([
      equipe59({ nome: 'MATHEUS MANHA', valor: 100, linhas: 3, equipeId: 'eq-matheus', equipeNome: 'Equipe Matheus', liderNome: 'Matheus' }),
      equipe59({ nome: 'MATHEUS TARDE', valor: 50,  linhas: 2, equipeId: 'eq-matheus', equipeNome: 'Equipe Matheus', liderNome: 'Matheus' }),
      equipe59({ nome: 'LUCIANA',       valor: 300, linhas: 9, equipeId: 'eq-luciana', equipeNome: 'Equipe Luciana' }),
    ]);
    expect(vinculadas.map(v => [v.nome, v.valor, v.linhas])).toEqual([
      ['Equipe Luciana', 300, 9],
      ['Equipe Matheus', 150, 5],
    ]);
    expect(vinculadas[1].rotulos59).toEqual(['MATHEUS MANHA', 'MATHEUS TARDE']);
  });

  it('equipe do 59 sem vínculo vai para a lista separada', () => {
    const { vinculadas, semVinculo } = separarEquipesDo59([
      equipe59({ nome: 'RETENCAO NOVA', valor: 80 }),
      equipe59({ nome: 'ATESTADOS|FERIAS', valor: 5, eEquipe: false }),
      equipe59({ nome: 'LUCIANA', valor: 300, equipeId: 'eq-luciana', equipeNome: 'Equipe Luciana' }),
    ]);
    expect(vinculadas).toHaveLength(1);
    expect(semVinculo.map(e => e.nome)).toEqual(['RETENCAO NOVA', 'ATESTADOS|FERIAS']);
  });
});
