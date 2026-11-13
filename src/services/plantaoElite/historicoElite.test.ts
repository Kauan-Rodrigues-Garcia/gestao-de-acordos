import { describe, expect, it } from 'vitest';
import {
  acumuladoPorDia, barrasDoMes, compararMedia, diasNoMes, mesAnterior, montarHistoricoElite,
  pessoasDoMes, rotuloMesCurto,
  type DiaHistoricoBruto, type RespostaHistoricoElite,
} from './historicoElite';

const TIAGO = 't', AGATHA = 'a', MATHEUS = 'm', GABRIEL = 'g';

const dia = (data: string, ids: string[], valores: number[], setor: number): DiaHistoricoBruto => ({
  data,
  plantao: Number(data.slice(8, 10)) % 2 === 1 ? 'impar' : 'par',
  membros: ids.map((id, i) => ({ id, valor: valores[i], qtd: valores[i] > 0 ? 1 : 0 })),
  setor_total: setor,
  setor_qtd: setor > 0 ? 10 : 0,
});

const resposta = (dias: DiaHistoricoBruto[], hoje = '2026-11-03'): RespostaHistoricoElite => ({
  inicio: '2026-09-19', de: '2026-09-19', ate: hoje, hoje, sou_da_dupla: false,
  setor: { id: 'rec', nome: 'Receptivo' },
  pessoas: [
    { id: TIAGO, nome: 'Tiago Almada', usuario: null },
    { id: AGATHA, nome: 'Agatha Rocha', usuario: null },
    { id: MATHEUS, nome: 'Matheus Souza', usuario: null },
    { id: GABRIEL, nome: 'Gabriel Oliveira', usuario: null },
  ],
  dias,
});

const TA = [TIAGO, AGATHA], MG = [MATHEUS, GABRIEL];

describe('montarHistoricoElite', () => {
  const h = montarHistoricoElite(resposta([
    dia('2026-10-01', TA, [100, 50], 1000),
    dia('2026-10-02', MG, [30, 20], 500),
    dia('2026-10-03', TA, [0, 0], 0),        // domingo: sem movimento
    dia('2026-11-01', TA, [10, 10], 200),    // 01/11 ímpar: ainda Tiago + Agatha
    dia('2026-11-02', MG, [60, 0], 300),
    dia('2026-11-03', TA, [5, 0], 100),
  ]));

  it('a dupla é das pessoas, não do dia', () => {
    expect(h.duplas.map(d => d.nome)).toEqual(['Tiago & Agatha', 'Matheus & Gabriel']);
    const out = h.meses[0];
    expect(out.dias[0]?.dupla).toBe(out.dias[2]?.dupla);
    expect(out.dias[1]?.dupla).not.toBe(out.dias[0]?.dupla);
  });

  it('cada mês tem a grade inteira, com os dias que já passaram preenchidos', () => {
    const [out, nov] = h.meses;
    expect(out.mes).toBe('2026-10');
    expect(out.dias).toHaveLength(31);
    expect(out.dias[3]).toBeNull();          // 04/10 não veio na resposta
    expect(nov.dias).toHaveLength(30);
    expect(nov.emAndamento).toBe(true);
    expect(out.emAndamento).toBe(false);
  });

  it('total, média por dia com movimento, acumulado e participação', () => {
    const out = h.meses[0];
    expect(out.total).toBe(200);
    expect(out.diasComMovimento).toBe(2);
    expect(out.media).toBe(100);
    expect(out.dias[1]?.acumuladoMes).toBe(200);
    expect(out.dias[0]?.participacao).toBeCloseTo(0.15);
    expect(out.participacao).toBeCloseTo(200 / 1500);
    expect(out.melhor?.data).toBe('2026-10-01');
  });

  it('cada dupla com o próprio total e média no mês', () => {
    const out = h.meses[0];
    expect(out.porDupla.map(d => [d.total, d.dias, d.media])).toEqual([[150, 1, 150], [50, 1, 50]]);
  });

  it('por pessoa, desde o início', () => {
    expect(h.porPessoa[0]).toMatchObject({ id: TIAGO, total: 115, dias: 3 });
    expect(h.total).toBe(285);
    expect(h.melhor?.data).toBe('2026-10-01');
  });

  it('ritmo: do dia 1 até hoje, contra o mesmo trecho do mês anterior', () => {
    expect(h.ritmo).toEqual({
      ateODia: 3, mes: '2026-11', atual: 85, mesAnterior: '2026-10', anterior: 200,
      variacao: (85 - 200) / 200,
    });
  });

  it('sem mês anterior, sem ritmo', () => {
    const s = montarHistoricoElite(resposta([dia('2026-09-19', TA, [1, 1], 10)], '2026-09-19'));
    expect(s.ritmo).toBeNull();
  });
});

describe('meses', () => {
  it('dias, anterior e rótulo', () => {
    expect(diasNoMes('2026-09')).toBe(30);
    expect(diasNoMes('2026-02')).toBe(28);
    expect(mesAnterior('2027-01')).toBe('2026-12');
    expect(rotuloMesCurto('2026-09')).toBe('set/26');
  });
});

describe('para os gráficos', () => {
  const h = montarHistoricoElite(resposta([
    dia('2026-10-01', TA, [100, 50], 1000),
    dia('2026-10-02', MG, [30, 20], 500),
    dia('2026-11-01', TA, [10, 10], 200),
    dia('2026-11-02', MG, [60, 0], 300),
  ], '2026-11-02'));

  it('média contra o mês anterior', () => {
    expect(compararMedia(h.meses, '2026-11')).toEqual({
      mesAnterior: '2026-10', media: 40, mediaAnterior: 100, variacao: -0.6,
    });
    expect(compararMedia(h.meses, '2026-10')).toBeNull();
  });

  it('barras: um item por dia do mês, vazio no que não veio', () => {
    const b = barrasDoMes(h.meses[1]);
    expect(b).toHaveLength(30);
    expect(b[0]).toMatchObject({ dia: 1, total: 20 });
    expect(b[5]).toMatchObject({ dia: 6, total: null, info: null });
  });

  it('acumulado por dia: uma coluna por mês, parando onde o mês para', () => {
    const a = acumuladoPorDia(h.meses);
    expect(a).toHaveLength(31);
    expect(a[1]).toEqual({ dia: 2, '2026-10': 200, '2026-11': 80 });
    expect(a[2]).toEqual({ dia: 3, '2026-10': null, '2026-11': null });
  });

  it('pessoas do mês, com a dupla', () => {
    const p = pessoasDoMes(h.meses[1], h.duplas);
    expect(p.map(x => [x.id, x.total, x.dupla?.nome])).toEqual([
      [MATHEUS, 60, 'Matheus & Gabriel'], [TIAGO, 10, 'Tiago & Agatha'], [AGATHA, 10, 'Tiago & Agatha'], [GABRIEL, 0, 'Matheus & Gabriel'],
    ]);
  });

  it('com as metas, o total é o fechado do mês inteiro (o mesmo das metas individuais)', () => {
    const r = resposta([
      dia('2026-11-01', TA, [10, 10], 200),
      dia('2026-11-02', MG, [60, 0], 300),
    ]);
    r.metas = [
      { mes: '2026-11', id: TIAGO, meta: 1000, extras: [], fechado: 50 },
      { mes: '2026-11', id: AGATHA, meta: 1000, extras: [], fechado: 15 },
      { mes: '2026-11', id: MATHEUS, meta: 1000, extras: [], fechado: 90 },
      { mes: '2026-11', id: GABRIEL, meta: 1000, extras: [], fechado: 120 },
    ];
    const nov = montarHistoricoElite(r).meses[0];
    const p = pessoasDoMes(nov, montarHistoricoElite(r).duplas);
    expect(p.map(x => [x.id, x.total, x.noPlantao])).toEqual([
      [GABRIEL, 120, 0], [MATHEUS, 90, 60], [TIAGO, 50, 10], [AGATHA, 15, 10],
    ]);
    // Cada um com o mesmo valor do cartão da meta.
    for (const x of p) expect(x.total).toBe(nov.metas!.find(mm => mm.id === x.id)!.fechado);
  });

  it('com as metas, quem não tem fechado (colega de quem é da dupla) fica de fora', () => {
    const r = resposta([dia('2026-11-02', MG, [60, 40], 300)]);
    r.sou_da_dupla = true;
    r.metas = [{ mes: '2026-11', id: GABRIEL, meta: 1000, extras: [], fechado: 500 }];
    const h2 = montarHistoricoElite(r);
    expect(pessoasDoMes(h2.meses[0], h2.duplas).map(x => [x.id, x.total])).toEqual([[GABRIEL, 500]]);
  });
});

describe('comparativo de quem é de dupla', () => {
  it('o dia da outra dupla repete a soma: a linha não se parte', () => {
    const h = montarHistoricoElite(resposta([
      dia('2026-10-01', TA, [100, 0], 1000),
      dia('2026-10-03', TA, [50, 0], 1000),
    ], '2026-10-03'));
    const a = acumuladoPorDia(h.meses);
    expect([a[0]['2026-10'], a[1]['2026-10'], a[2]['2026-10'], a[3]['2026-10']]).toEqual([100, 100, 150, null]);
  });
});

describe('metas individuais e fotos (20261111170500)', () => {
  const dias = [
    dia('2026-10-01', TA, [100, 50], 1000),
    dia('2026-10-02', MG, [30, 20], 500),
    dia('2026-10-03', TA, [200, 0], 800),
  ];

  it('sem `metas` do banco (migration pendente), nada de painel e nada de foto', () => {
    const h = montarHistoricoElite(resposta(dias));
    expect(h.meses[0].metas).toBeNull();
    expect(h.fotos.size).toBe(0);
  });

  it('conta quantas metas cada um bateu, quanto falta e quanto veio do plantão', () => {
    const r = resposta(dias);
    r.pessoas[0].foto = 'https://x/tiago.jpg';
    r.metas = [
      // Tiago: bateu a 1ª (5.000) e a 2ª (6.000), não a 3ª (8.000). Extras fora de ordem.
      { mes: '2026-10', id: TIAGO, meta: 5000, extras: [8000, 6000], fechado: 6500 },
      // Agatha: não bateu nem a 1ª.
      { mes: '2026-10', id: AGATHA, meta: 4000, extras: [], fechado: 3999.99 },
      // Matheus: sem meta.
      { mes: '2026-10', id: MATHEUS, meta: null, extras: [], fechado: 900 },
      // Gabriel: bateu a única, no centavo.
      { mes: '2026-10', id: GABRIEL, meta: 2000, extras: [], fechado: 2000 },
    ];
    const h = montarHistoricoElite(r);
    const m = h.meses[0].metas!;
    expect(h.fotos.get(TIAGO)).toBe('https://x/tiago.jpg');

    // Ordem: mais metas batidas primeiro; sem meta por último.
    expect(m.map(p => p.id)).toEqual([TIAGO, GABRIEL, AGATHA, MATHEUS]);

    const [t, g, a, mt] = m;
    expect(t).toMatchObject({ foto: 'https://x/tiago.jpg', degraus: [5000, 6000, 8000], batidas: 2, noPlantao: 300 });
    expect(t.proxima).toEqual({ nivel: 3, valor: 8000, falta: 1500 });
    expect(t.alcance).toBeCloseTo(1.3);
    expect(t.dupla?.ids).toEqual(TA);

    expect(g).toMatchObject({ batidas: 1, proxima: null, noPlantao: 20 });
    expect(a).toMatchObject({ batidas: 0, proxima: { nivel: 1, valor: 4000, falta: 0.01 } });
    expect(mt).toMatchObject({ degraus: [], batidas: null, alcance: null, proxima: null });
  });
});
