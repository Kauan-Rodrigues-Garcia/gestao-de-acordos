/**
 * Modo TV, 30/10/2026: telas sob demanda, opções de ranking e a cena de quitação.
 */
import { describe, expect, it } from 'vitest';
import { AGUARDANDO_ATUALIZACAO, montarVisao, nomeDoItem, quitacaoDaTela, rankingDaTela } from './numeros';
import { MAX_TELAS, noRodizio, novaTela, telasValidas } from './templates';
import { telaNoInstante } from './relogio';
import { numerosDemo } from './demo';
import { cenaValida } from './livre/cena';
import type { NumerosTv, TelaDoPainel } from './tipos';

const tela = (template: TelaDoPainel['template'], opcoes: Record<string, unknown> = {}) => ({ template, opcoes });
const visao = (parcial: Partial<NumerosTv> = {}) => montarVisao({ ...numerosDemo(), ...parcial }, 'bruto');

describe('telas sob demanda', () => {
  const telas = [
    { segundos: 10 },
    { segundos: 30, sob_demanda: true },
    { segundos: 20 },
  ];

  it('o relógio pula a sob demanda e devolve o índice da lista inteira', () => {
    expect(telaNoInstante(telas, 20, 0, 0)).toEqual({ indice: 0, restanteMs: 10_000 });
    expect(telaNoInstante(telas, 20, 0, 12_000)).toEqual({ indice: 2, restanteMs: 18_000 });
    // A volta tem 30 s (10 + 20), não 60.
    expect(telaNoInstante(telas, 20, 0, 31_000).indice).toBe(0);
  });

  it('sem nenhuma no rodízio, -1', () => {
    expect(telaNoInstante([{ segundos: 10, sob_demanda: true }], 20, 0, 5_000).indice).toBe(-1);
  });

  it('o jsonb guarda só o true, e o painel antigo continua igual', () => {
    const lidas = telasValidas([
      { id: 'a', template: 'recado', opcoes: {}, sob_demanda: true },
      { id: 'b', template: 'recado', opcoes: {}, sob_demanda: 'sim' },
      { id: 'c', template: 'recado', opcoes: {} },
    ]);
    expect(lidas[0].sob_demanda).toBe(true);
    expect('sob_demanda' in lidas[1]).toBe(false);
    expect('sob_demanda' in lidas[2]).toBe(false);
    expect(lidas.map(noRodizio)).toEqual([false, true, true]);
  });

  it('o teto subiu para 20 telas', () => {
    expect(MAX_TELAS).toBe(20);
  });

  it('cena livre nasce com um modelo, e passa pelo saneamento', () => {
    const t = novaTela('livre');
    const cena = cenaValida(t.opcoes.cena);
    expect(cena.elementos.length).toBeGreaterThan(0);
  });
});

describe('rankingDaTela', () => {
  it('padrão: as pessoas do painel, pelo recebido', () => {
    const r = rankingDaTela(visao(), tela('lista'));
    expect(r.deEquipes).toBe(false);
    expect(r.itens[0].nome).toBe('Ana Beatriz Lima');
    expect(r.itens[0].valor).toBe(41_220.1);
  });

  // 06/11/2026: a projeção é sobre a meta de cada um, como na aba Quartis. A
  // ordem antiga (a do recebido, com o valor × fator) era o defeito relatado.
  it('projeção: valor × dias úteis ÷ decorridos, ordem pelo % da meta de cada um', () => {
    const v = visao({ dias_uteis: 20, dias_decorridos: 10 });
    const r = rankingDaTela(v, tela('lista', { valor: 'projecao' }));
    expect(r.projecao).toBe(true);
    expect(r.itens.map(i => i.nome)).toEqual([
      'Marcos Vinícius Teixeira', 'Carlos Eduardo Rocha', 'Luana Martins Costa', 'Fernanda Ribeiro',
      'Rafael Souza', 'Juliana Prado', 'Ana Beatriz Lima', 'Patrícia Gomes', 'Diego Almeida',
      // Sem meta: no fim.
      'Bruno Carvalho',
    ]);
    const marcos = r.itens[0];
    expect(marcos).toMatchObject({ valor: 59_754.8, meta: 25_000 });
    expect(r.itens[9].meta).toBeNull();
  });

  it('projeção antes do 1º dia útil é o próprio recebido', () => {
    const r = rankingDaTela(visao({ dias_decorridos: 0 }), tela('lista', { valor: 'projecao' }));
    expect(r.itens.find(i => i.nome === 'Ana Beatriz Lima')?.valor).toBe(41_220.1);
  });

  it('pelo recebido, a ordem e o valor de sempre, sem a meta ao lado', () => {
    const r = rankingDaTela(visao(), tela('lista'));
    expect(r.itens.map(i => i.valor)).toEqual([...r.itens.map(i => i.valor)].sort((a, b) => b - a));
    expect(r.itens.every(i => i.meta === null)).toBe(true);
  });

  it('projeção sem a meta das pessoas no pacote (antes de 20261106120000): avisa', () => {
    const n = numerosDemo();
    const semMeta = n.ranking.map(({ meta: _meta, ...p }) => p);
    const r = rankingDaTela(visao({ ranking: semMeta }), tela('lista', { valor: 'projecao' }));
    expect(r.motivo).toBe(AGUARDANDO_ATUALIZACAO);
    // Pelo recebido continua funcionando com o pacote antigo.
    expect(rankingDaTela(visao({ ranking: semMeta }), tela('lista')).itens.length).toBe(10);
  });

  it('projeção no Cofen em H.O.: a meta da pessoa convertida pelo percentual', () => {
    const v = montarVisao({
      ...numerosDemo(), regra: 'cofen', ho_percentual: 0.25, dias_uteis: 20, dias_decorridos: 10,
      ranking: [{ id: 'a', nome: 'Ana', foto: null, valor: 1000, valor_ho: 250, meta: 4000 }],
    }, 'ho');
    const r = rankingDaTela(v, tela('lista', { valor: 'projecao' }));
    expect(r.itens[0]).toMatchObject({ valor: 500, meta: 1000 });
  });

  it('equipes na projeção: pelo % da meta projetado, sem meta no fim', () => {
    const v = visao({
      dias_uteis: 20, dias_decorridos: 10,
      equipes_ranking: [
        { id: 'a', nome: 'Rosa', valor: 300, valor_ho: 0, meta: 1000 },
        { id: 'b', nome: 'Azul', valor: 200, valor_ho: 0, meta: 400 },
        { id: 'c', nome: 'Verde', valor: 900, valor_ho: 0, meta: 0 },
      ],
    });
    expect(rankingDaTela(v, tela('lista', { fonte: 'equipes', valor: 'projecao' })).itens.map(i => i.id)).toEqual(['b', 'a', 'c']);
    // Pelo recebido, a de sempre.
    expect(rankingDaTela(v, tela('lista', { fonte: 'equipes' })).itens.map(i => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('equipes: soma de cada uma, com a meta; equipe sem nada some', () => {
    const v = visao({
      equipes_ranking: [
        { id: 'a', nome: 'Rosa', valor: 100, valor_ho: 22, meta: 200 },
        { id: 'b', nome: 'Equipe Azul', valor: 300, valor_ho: 66, meta: 0 },
        { id: 'c', nome: 'Verde', valor: 0, valor_ho: 0, meta: 0 },
      ],
    });
    const r = rankingDaTela(v, tela('podio', { fonte: 'equipes' }));
    expect(r.deEquipes).toBe(true);
    expect(r.itens.map(i => i.id)).toEqual(['b', 'a']);
    expect(r.itens[0].meta).toBeNull();
    expect(r.itens[1].meta).toBe(200);
    expect(nomeDoItem(r.itens[0], true)).toBe('Equipe Azul');
    expect(nomeDoItem(r.itens[1], true)).toBe('Equipe Rosa');
  });

  it('equipes em H.O. no Cofen: meta convertida pelo percentual', () => {
    const v = montarVisao({
      ...numerosDemo(), regra: 'cofen', ho_percentual: 0.25,
      equipes_ranking: [{ id: 'a', nome: 'Rosa', valor: 1000, valor_ho: 250, meta: 4000 }],
    }, 'ho');
    const r = rankingDaTela(v, tela('lista', { fonte: 'equipes' }));
    expect(r.itens[0]).toMatchObject({ valor: 250, meta: 1000 });
  });

  it('uma equipe: o top dela; sem escolher, avisa', () => {
    const v = visao();
    const id = numerosDemo().ranking_por_equipe![0].equipe_id;
    const r = rankingDaTela(v, tela('lista', { fonte: 'equipe', equipe_id: id }));
    expect(r.itens.map(i => i.nome)).toContain('Juliana Prado');
    expect(r.itens.length).toBe(4);
    expect(rankingDaTela(v, tela('lista', { fonte: 'equipe' })).motivo).toMatch(/Escolha a equipe/);
  });

  it('painel da própria equipe: usa o ranking do painel mesmo sem o pacote novo', () => {
    const eq = '00000000-0000-4000-8000-0000000000aa';
    const v = visao({ equipe_id: eq, ranking_por_equipe: undefined });
    const r = rankingDaTela(v, tela('lista', { fonte: 'equipe' }));
    expect(r.itens.length).toBe(v.ranking.length);
  });

  it('pacote antigo: avisa em vez de mostrar errado', () => {
    const v = visao({ equipes_ranking: undefined, ranking_por_equipe: undefined });
    expect(rankingDaTela(v, tela('lista', { fonte: 'equipes' })).motivo).toBe(AGUARDANDO_ATUALIZACAO);
    expect(rankingDaTela(v, tela('lista', { fonte: 'equipe', equipe_id: '00000000-0000-4000-8000-000000000009' })).motivo)
      .toBe(AGUARDANDO_ATUALIZACAO);
  });
});

describe('quitacaoDaTela', () => {
  it('pódio, premiados até o 6º e «falta para passar» do 7º ao 10º', () => {
    const q = quitacaoDaTela(visao());
    expect(q.motivo).toBe('');
    expect(q.podio.map(p => p.posicao)).toEqual([1, 2, 3]);
    expect(q.podio[0].premio).toBe(500);
    expect(q.premiados.map(p => [p.posicao, p.premio])).toEqual([[4, 150], [5, 100], [6, 50]]);
    expect(q.perseguindo.map(p => p.posicao)).toEqual([7, 8, 9, 10]);
    // 7º (49.870) atrás do 6º (51.330): passa com 1 centavo a mais.
    expect(q.perseguindo[0].premio).toBeNull();
    expect(q.perseguindo[0].falta).toBe(1_460.01);
    expect(q.participantes).toBe(23);
  });

  it('setor sem o ranking avisa onde ligar', () => {
    const q = quitacaoDaTela(visao({ quitacao: { habilitado: false } }));
    expect(q.motivo).toMatch(/não tem o Ranking de quitação.*Configurações → Geral/);
  });

  it('mês sem importação avisa o mês', () => {
    const q = quitacaoDaTela(visao({
      mes: '2026-10',
      quitacao: { habilitado: true, premios: [], participantes: 0, importado_em: null, posicoes: [] },
    }));
    expect(q.motivo).toBe('O Ranking de quitação de outubro ainda não foi importado.');
  });

  it('prêmio zerado não vira selo', () => {
    const q = quitacaoDaTela(visao({
      quitacao: {
        habilitado: true, premios: [100, 0], participantes: 2, importado_em: null,
        posicoes: [
          { posicao: 1, id: 'a', nome: 'A', foto: null, quitacoes: 2, valor: 10 },
          { posicao: 2, id: 'b', nome: 'B', foto: null, quitacoes: 1, valor: 5 },
        ],
      },
    }));
    expect(q.podio.map(p => p.premio)).toEqual([100, null]);
  });

  it('pacote antigo avisa', () => {
    expect(quitacaoDaTela(visao({ quitacao: undefined })).motivo).toBe(AGUARDANDO_ATUALIZACAO);
  });
});
