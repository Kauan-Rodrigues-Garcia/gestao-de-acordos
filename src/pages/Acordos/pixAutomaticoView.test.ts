/**
 * pixAutomaticoView.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * As contas da tela do Pix Automático.
 *
 * Duas delas decidem quanto o operador recebe: o total de comissão por status
 * e o card de bônus por meta. Moravam em `useMemo` dentro de um componente de
 * 1.014 linhas com 31 `useState`, e por isso nunca tiveram teste.
 *
 * A regra que mais importa: comissão de linha APROVADA usa o percentual
 * travado no momento da aprovação. Mudar o percentual do setor hoje não pode
 * reescrever o que já foi aprovado ontem.
 */
import { describe, it, expect } from 'vitest';
import type { MetasConfigMes } from '@/lib/supabase';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import {
  mapaOperadorEquipe, mapaOperadorSetor, apenasOperadores, sugerirOperadores,
  filtrarItensPix, totaisPorStatus, totalPagoPix, calcularBonusMeta,
  calcularDobraComissao, rankingPixSetor, calcularMetaPix, calcularMetaPixPorEquipe,
  prazoExpurgoDesaprovado, textoPrazoExpurgo, dataLocalDaLinha,
  MAX_SUGESTOES_VINCULO, type OperadorInfo,
} from './pixAutomaticoView';

const OPERADORES: OperadorInfo[] = [
  { id: 'maria', nome: 'Maria Silva',  equipe_id: 'eq-1', setor_id: 'setor-A', perfil: 'operador' },
  { id: 'joao',  nome: 'João Souza',   equipe_id: 'eq-2', setor_id: 'setor-B', perfil: 'operador' },
  { id: 'chefe', nome: 'Marina Lima',  equipe_id: 'eq-1', setor_id: 'setor-A', perfil: 'lider' },
  // Operador que também lidera: o recebimento dele conta como o de qualquer um.
  { id: 'elite', nome: 'Kauan Teixeira', equipe_id: 'eq-1', setor_id: 'setor-A', perfil: 'elite' },
];

let seq = 0;
function item(over: Partial<PixAutoAcordo> = {}): PixAutoAcordo {
  seq += 1;
  return {
    id: `p-${seq}`, empresa_id: 'emp-1',
    operador_id: 'maria', operador_nome: 'Maria Silva',
    nr_cliente: `NR${seq}`, valor: 1000, status: 'pendente',
    pct_comissao: null, setor_id: 'setor-A',
    criado_em: '2026-07-10T10:00:00Z',
    ...over,
  } as PixAutoAcordo;
}

// ── Mapas e sugestões ───────────────────────────────────────────────────────

describe('mapas de operador', () => {
  it('indexa equipe e setor por id', () => {
    // Os mapas indexam TODO MUNDO, inclusive quem não conta no recebimento: são
    // para resolver nome, equipe e setor de qualquer id que apareça numa linha.
    expect(mapaOperadorEquipe(OPERADORES))
      .toEqual({ maria: 'eq-1', joao: 'eq-2', chefe: 'eq-1', elite: 'eq-1' });
    expect(mapaOperadorSetor(OPERADORES))
      .toEqual({ maria: 'setor-A', joao: 'setor-B', chefe: 'setor-A', elite: 'setor-A' });
  });

  it('lista vazia dá mapa vazio', () => {
    expect(mapaOperadorEquipe([])).toEqual({});
  });
});

describe('apenasOperadores', () => {
  it('líder fica de fora do filtro e do vínculo', () => {
    expect(apenasOperadores(OPERADORES).map(o => o.id)).not.toContain('chefe');
  });

  /**
   * O defeito relatado em 17/08/2026: `kauan_teixeira` é `elite`, aparecia no
   * ranking e nos quartis, e sumia do filtro de operadores do Pix. Ele conta no
   * recebimento como qualquer operador — ver
   * `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`.
   */
  it('elite ENTRA — é operador que também lidera, e conta no recebimento', () => {
    expect(apenasOperadores(OPERADORES).map(o => o.id)).toEqual(['maria', 'joao', 'elite']);
  });

  it('gerência e diretoria seguem fora: supervisionam, não recebem', () => {
    const supervisores: OperadorInfo[] = ['gerencia', 'diretoria', 'administrador', 'super_admin']
      .map(perfil => ({ ...OPERADORES[0], id: perfil, perfil }));
    expect(apenasOperadores(supervisores)).toHaveLength(0);
  });

  it('cargo em maiúscula ou com espaço ainda é reconhecido', () => {
    // `contaNoRecebimento` normaliza caixa E espaços: o cargo vem de coluna de
    // texto, e um espaço no fim não deveria apagar a pessoa do filtro.
    expect(apenasOperadores([{ ...OPERADORES[0], perfil: 'OPERADOR' }])).toHaveLength(1);
    expect(apenasOperadores([{ ...OPERADORES[0], perfil: ' ELITE ' }])).toHaveLength(1);
    expect(apenasOperadores([{ ...OPERADORES[0], perfil: '' }])).toHaveLength(0);
  });
});

describe('sugerirOperadores', () => {
  it('busca vazia não sugere nada — a lista só abre quando se digita', () => {
    expect(sugerirOperadores(OPERADORES, '')).toEqual([]);
    expect(sugerirOperadores(OPERADORES, '   ')).toEqual([]);
  });

  it('acha por pedaço do nome, sem diferenciar maiúscula', () => {
    expect(sugerirOperadores(OPERADORES, 'mar').map(o => o.id)).toEqual(['maria', 'chefe']);
    expect(sugerirOperadores(OPERADORES, 'SOUZA').map(o => o.id)).toEqual(['joao']);
  });

  it('corta em oito para a lista não cobrir a tela', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({
      ...OPERADORES[0], id: `op-${i}`, nome: `Operador ${i}`,
    }));
    expect(sugerirOperadores(muitos, 'operador')).toHaveLength(MAX_SUGESTOES_VINCULO);
  });
});

// ── Filtro ──────────────────────────────────────────────────────────────────

describe('filtrarItensPix', () => {
  const mapas = {
    porEquipe: mapaOperadorEquipe(OPERADORES),
    porSetor:  mapaOperadorSetor(OPERADORES),
  };
  const itens = [
    item({ operador_id: 'maria', status: 'pendente', nr_cliente: '111', setor_id: 'setor-A' }),
    item({ operador_id: 'joao',  status: 'aprovado', nr_cliente: '222', setor_id: 'setor-B',
           operador_nome: 'João Souza' }),
    item({ operador_id: 'maria', status: 'desaprovado', nr_cliente: '333', setor_id: 'setor-A' }),
  ];

  it('sem filtro, devolve tudo', () => {
    expect(filtrarItensPix(itens, {}, mapas)).toHaveLength(3);
    expect(filtrarItensPix(itens, { status: 'todos' }, mapas)).toHaveLength(3);
  });

  it('por status', () => {
    expect(filtrarItensPix(itens, { status: 'aprovado' }, mapas).map(i => i.nr_cliente))
      .toEqual(['222']);
  });

  it('por operador, equipe e setor', () => {
    expect(filtrarItensPix(itens, { operadorId: 'maria' }, mapas)).toHaveLength(2);
    expect(filtrarItensPix(itens, { equipeId: 'eq-2' }, mapas).map(i => i.nr_cliente)).toEqual(['222']);
    expect(filtrarItensPix(itens, { setorId: 'setor-B' }, mapas).map(i => i.nr_cliente)).toEqual(['222']);
  });

  it('o setor da LINHA manda; o do operador é só reserva', () => {
    // Um operador que mudou de setor não leva embora o histórico de comissão
    // do setor anterior.
    const mudou = [item({ operador_id: 'maria', setor_id: 'setor-ANTIGO' })];
    expect(filtrarItensPix(mudou, { setorId: 'setor-ANTIGO' }, mapas)).toHaveLength(1);
    expect(filtrarItensPix(mudou, { setorId: 'setor-A' }, mapas)).toHaveLength(0);

    const semCarimbo = [item({ operador_id: 'maria', setor_id: null })];
    expect(filtrarItensPix(semCarimbo, { setorId: 'setor-A' }, mapas)).toHaveLength(1);
  });

  it('busca casa NR ou nome do operador, sem diferenciar maiúscula', () => {
    expect(filtrarItensPix(itens, { busca: '22' }, mapas).map(i => i.nr_cliente)).toEqual(['222']);
    expect(filtrarItensPix(itens, { busca: 'joão' }, mapas).map(i => i.nr_cliente)).toEqual(['222']);
    expect(filtrarItensPix(itens, { busca: '   ' }, mapas)).toHaveLength(3);
  });

  it('filtros se acumulam', () => {
    const r = filtrarItensPix(itens, { operadorId: 'maria', status: 'pendente' }, mapas);
    expect(r.map(i => i.nr_cliente)).toEqual(['111']);
  });
});

// ── Totais ──────────────────────────────────────────────────────────────────

describe('filtrarItensPix — pagamento e período', () => {
  const mapas = {
    porEquipe: mapaOperadorEquipe(OPERADORES),
    porSetor:  mapaOperadorSetor(OPERADORES),
  };
  const itens = [
    item({ nr_cliente: 'PAGO',   status: 'aprovado',    pago: true }),
    item({ nr_cliente: 'APAGAR', status: 'aprovado',    pago: false }),
    item({ nr_cliente: 'PEND',   status: 'pendente',    pago: false }),
    item({ nr_cliente: 'DESAP',  status: 'desaprovado', pago: false }),
  ];

  it('"pago" traz só o que já saiu', () => {
    expect(filtrarItensPix(itens, { pagamento: 'pago' }, mapas).map(i => i.nr_cliente))
      .toEqual(['PAGO']);
  });

  it('"a pagar" é aprovado e ainda não pago — pendente não é dívida', () => {
    expect(filtrarItensPix(itens, { pagamento: 'a_pagar' }, mapas).map(i => i.nr_cliente))
      .toEqual(['APAGAR']);
  });

  it('"todos" não recorta nada', () => {
    expect(filtrarItensPix(itens, { pagamento: 'todos' }, mapas)).toHaveLength(4);
  });

  it('período recorta pelo dia de registro, inclusive nas pontas', () => {
    const porData = [
      item({ nr_cliente: 'A', criado_em: '2026-07-01T12:00:00Z' }),
      item({ nr_cliente: 'B', criado_em: '2026-07-15T12:00:00Z' }),
      item({ nr_cliente: 'C', criado_em: '2026-07-31T12:00:00Z' }),
    ];
    expect(filtrarItensPix(porData, { de: '2026-07-15' }, mapas).map(i => i.nr_cliente))
      .toEqual(['B', 'C']);
    expect(filtrarItensPix(porData, { ate: '2026-07-15' }, mapas).map(i => i.nr_cliente))
      .toEqual(['A', 'B']);
    expect(filtrarItensPix(porData, { de: '2026-07-15', ate: '2026-07-15' }, mapas)
      .map(i => i.nr_cliente)).toEqual(['B']);
  });

  it('o dia é o de São Paulo, não o do UTC', () => {
    // 01/07 02h UTC ainda é 30/06 23h em São Paulo — e é 30/06 que a tabela mostra.
    expect(dataLocalDaLinha('2026-07-01T02:00:00Z')).toBe('2026-06-30');
    const virada = [item({ nr_cliente: 'VIRADA', criado_em: '2026-07-01T02:00:00Z' })];
    expect(filtrarItensPix(virada, { de: '2026-07-01' }, mapas)).toHaveLength(0);
    expect(filtrarItensPix(virada, { ate: '2026-06-30' }, mapas)).toHaveLength(1);
  });
});

describe('totalPagoPix', () => {
  it('separa o que já saiu do que ainda falta sair', () => {
    const itens = [
      item({ status: 'aprovado', pago: true,  valor: 10000, pct_comissao: 0.25 }),
      item({ status: 'aprovado', pago: false, valor: 20000, pct_comissao: 0.25 }),
      item({ status: 'pendente', pago: false, valor: 30000 }),
    ];
    const r = totalPagoPix(itens, { 'setor-A': 0.25 });
    expect(r.pago.qtd).toBe(1);
    expect(r.pago.comissao).toBeCloseTo(25, 2);
    expect(r.aPagar.qtd).toBe(1);
    expect(r.aPagar.comissao).toBeCloseTo(50, 2);
  });

  it('sem nada pago, os dois lados ficam zerados', () => {
    const r = totalPagoPix([], { 'setor-A': 0.25 });
    expect(r.pago).toEqual({ qtd: 0, valor: 0, comissao: 0 });
    expect(r.aPagar).toEqual({ qtd: 0, valor: 0, comissao: 0 });
  });
});

describe('totaisPorStatus', () => {
  const pctPorSetor = { 'setor-A': 0.25, 'setor-B': 0.5 };

  it('conta, soma valor e soma comissão por status', () => {
    const itens = [
      item({ status: 'pendente', valor: 1000, setor_id: 'setor-A' }),
      item({ status: 'pendente', valor: 2000, setor_id: 'setor-A' }),
      item({ status: 'aprovado', valor: 1000, setor_id: 'setor-A', pct_comissao: 0.25 }),
    ];
    const t = totaisPorStatus(itens, pctPorSetor);
    expect(t.pendente.qtd).toBe(2);
    expect(t.pendente.valor).toBe(3000);
    // 1000 × 0,25 ÷ 100 = 2,50 ; 2000 × 0,25 ÷ 100 = 5,00
    expect(t.pendente.comissao).toBeCloseTo(7.5, 2);
    expect(t.aprovado.qtd).toBe(1);
    expect(t.desaprovado.qtd).toBe(0);
  });

  it('linha APROVADA usa o percentual travado, não o atual do setor', () => {
    // O caso que a regra existe para cobrir: o setor mudou de 0,25% para 1%
    // depois da aprovação. O aprovado tem que continuar valendo 0,25%.
    const aprovado = [item({ status: 'aprovado', valor: 1000, setor_id: 'setor-A', pct_comissao: 0.25 })];
    const t = totaisPorStatus(aprovado, { 'setor-A': 1 });
    expect(t.aprovado.comissao).toBeCloseTo(2.5, 2);
  });

  it('pendente acompanha o percentual ATUAL do setor', () => {
    const pendente = [item({ status: 'pendente', valor: 1000, setor_id: 'setor-A' })];
    expect(totaisPorStatus(pendente, { 'setor-A': 1 }).pendente.comissao).toBeCloseTo(10, 2);
  });

  it('lista vazia devolve os três status zerados, não um objeto pela metade', () => {
    const t = totaisPorStatus([], pctPorSetor);
    for (const status of ['pendente', 'aprovado', 'desaprovado'] as const) {
      expect(t[status]).toEqual({ qtd: 0, valor: 0, comissao: 0 });
    }
  });
});

// ── Bônus por meta ──────────────────────────────────────────────────────────

const CONFIG_MES: MetasConfigMes = {
  feriados: [],
  contar_dia_atual: true,
  quartis: [
    { quartil: 1, min_pct: 100, premio: 0 },
    { quartil: 2, min_pct: 75,  premio: 0 },
    { quartil: 3, min_pct: 50,  premio: 0 },
    { quartil: 4, min_pct: 0,   premio: 0 },
  ],
} as unknown as MetasConfigMes;

const BASE_BONUS = {
  operadorId: 'maria',
  itens: [item({ operador_id: 'maria', status: 'aprovado', valor: 10000,
                 pct_comissao: 0.25, criado_em: '2026-07-10T10:00:00Z' })],
  pctPorSetor: { 'setor-A': 0.25 },
  metaValor: 100_000,
  recebidoMes: 50_000,
  configMes: CONFIG_MES,
  mes: '2026-07',
  hojeISO: '2026-07-15',
};

describe('calcularBonusMeta — quanto está em jogo', () => {
  it('soma a comissão APROVADA do mês', () => {
    // 10.000 × 0,25 ÷ 100 = 25,00
    expect(calcularBonusMeta(BASE_BONUS)!.acumulado).toBeCloseTo(25, 2);
  });

  it('ignora pendente, desaprovado e o que é de outro operador ou de outro mês', () => {
    const bonus = calcularBonusMeta({
      ...BASE_BONUS,
      itens: [
        item({ operador_id: 'maria', status: 'aprovado',    valor: 10000, pct_comissao: 0.25, criado_em: '2026-07-10T10:00:00Z' }),
        item({ operador_id: 'maria', status: 'pendente',    valor: 90000, criado_em: '2026-07-11T10:00:00Z' }),
        item({ operador_id: 'maria', status: 'desaprovado', valor: 90000, criado_em: '2026-07-12T10:00:00Z' }),
        item({ operador_id: 'joao',  status: 'aprovado',    valor: 90000, pct_comissao: 0.25, criado_em: '2026-07-13T10:00:00Z' }),
        item({ operador_id: 'maria', status: 'aprovado',    valor: 90000, pct_comissao: 0.25, criado_em: '2026-06-20T10:00:00Z' }),
      ],
    })!;
    expect(bonus.acumulado).toBeCloseTo(25, 2);
  });

  it('marca meta batida quando o recebido alcança a meta', () => {
    expect(calcularBonusMeta({ ...BASE_BONUS, recebidoMes: 100_000 })!.metaBatida).toBe(true);
    expect(calcularBonusMeta({ ...BASE_BONUS, recebidoMes: 99_999 })!.metaBatida).toBe(false);
  });

  it('projeção compara o recebido com o esperado até hoje, e classifica o quartil', () => {
    // Julho/2026 tem 23 dias úteis; até 15/07 decorreram 11.
    // Esperado = 100.000 / 23 × 11 ≈ 47.826 ; recebido 50.000 → ~105%.
    const bonus = calcularBonusMeta(BASE_BONUS)!;
    expect(bonus.projecao).toBeGreaterThan(100);
    expect(bonus.quartil).toBe(1);
  });

  it('quem está bem atrás cai no último quartil', () => {
    const bonus = calcularBonusMeta({ ...BASE_BONUS, recebidoMes: 1000 })!;
    expect(bonus.projecao).toBeLessThan(50);
    expect(bonus.quartil).toBe(4);
  });

  it('projeção tem teto de 999 — o card não exibe número absurdo', () => {
    const bonus = calcularBonusMeta({ ...BASE_BONUS, recebidoMes: 100_000_000 })!;
    expect(bonus.projecao).toBe(999);
  });

  it('no primeiro dia do mês não divide por zero', () => {
    const bonus = calcularBonusMeta({ ...BASE_BONUS, hojeISO: '2026-07-01' })!;
    expect(Number.isFinite(bonus.projecao)).toBe(true);
  });

  it.each([
    ['sem operador',        { operadorId: null }],
    ['sem meta',            { metaValor: null }],
    ['meta zero',           { metaValor: 0 }],
    ['sem config do mês',   { configMes: null }],
    ['sem recebido do mês', { recebidoMes: null }],
    ['sem nada aprovado',   { itens: [] }],
  ])('devolve null quando a pergunta ainda não faz sentido: %s', (_rotulo, patch) => {
    // `null` e zero são coisas diferentes aqui: zero afirmaria que ele não tem
    // bônus a receber; null diz que ainda não dá para responder.
    expect(calcularBonusMeta({ ...BASE_BONUS, ...patch })).toBeNull();
  });

  it('mês vem por parâmetro, não do relógio da máquina', () => {
    // Antes, o cálculo lia `new Date().getMonth()`, que é o fuso de quem abre
    // a tela. Num navegador fora do Brasil, na virada do mês, o card somava a
    // comissão do mês errado.
    const junho = calcularBonusMeta({ ...BASE_BONUS, mes: '2026-06', hojeISO: '2026-06-15' });
    expect(junho).toBeNull();   // a linha aprovada é de julho
  });
});

// ── Meta dos 18 acordos (comissão dobrada) ──────────────────────────────────

function feitos(qtd: number, over: Partial<PixAutoAcordo> = {}): PixAutoAcordo[] {
  return Array.from({ length: qtd }, () => item({
    operador_id: 'maria', status: 'aprovado', valor: 10000,
    pct_comissao: 0.25, criado_em: '2026-07-10T10:00:00Z', ...over,
  }));
}

describe('calcularDobraComissao — os dois requisitos', () => {
  /** Meta do mês batida com folga: isola o requisito dos acordos. */
  const META_BATIDA = { metaValor: 50_000, recebidoMes: 60_000 };
  /** Meta definida e ainda não batida. */
  const META_ABERTA = { metaValor: 50_000, recebidoMes: 20_000 };

  it('conta quantos acordos faltam enquanto o requisito não fecha', () => {
    const r = calcularDobraComissao(feitos(5), 'maria', { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.feitos).toBe(5);
    expect(r.faltam).toBe(13);
    expect(r.meta).toBe(18);
    expect(r.acordosOk).toBe(false);
    expect(r.metaOk).toBe(true);
    expect(r.requisitosOk).toBe(1);
    expect(r.atingiu).toBe(false);
  });

  it('dobra a comissão só com os DOIS requisitos cumpridos', () => {
    const r = calcularDobraComissao(feitos(18), 'maria', { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.atingiu).toBe(true);
    expect(r.requisitosOk).toBe(2);
    expect(r.faltam).toBe(0);
    // 18 × (10.000 × 0,25 ÷ 100) = 18 × 25 = 450
    expect(r.comissao).toBeCloseTo(450, 2);
    expect(r.bonus).toBeCloseTo(450, 2);
    expect(r.comissaoFinal).toBeCloseTo(900, 2);
  });

  it('18 acordos sem a meta batida NÃO dobra — era o que a tela prometia errado', () => {
    const r = calcularDobraComissao(feitos(18), 'maria', { 'setor-A': 0.25 }, '2026-07', META_ABERTA);
    expect(r.acordosOk).toBe(true);
    expect(r.metaOk).toBe(false);
    expect(r.atingiu).toBe(false);
    expect(r.bonus).toBe(0);
    expect(r.comissaoFinal).toBeCloseTo(450, 2);
    expect(r.faltaMeta).toBeCloseTo(30_000, 2);
    expect(r.pctMeta).toBe(40);
  });

  it('meta batida sem os 18 acordos também não dobra', () => {
    const r = calcularDobraComissao(feitos(17), 'maria', { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.atingiu).toBe(false);
    expect(r.faltam).toBe(1);
  });

  it('sem meta definida o requisito fica em aberto e a comissão não dobra', () => {
    const r = calcularDobraComissao(feitos(20), 'maria', { 'setor-A': 0.25 }, '2026-07');
    expect(r.acordosOk).toBe(true);
    expect(r.metaDefinida).toBe(false);
    expect(r.metaOk).toBe(false);
    expect(r.atingiu).toBe(false);
    expect(r.pctMeta).toBe(0);
    expect(r.faltaMeta).toBe(0);
  });

  it('passar de 18 não inverte o que falta', () => {
    const r = calcularDobraComissao(feitos(25), 'maria', { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.feitos).toBe(25);
    expect(r.faltam).toBe(0);
    expect(r.pctAcordos).toBe(100);
    expect(r.atingiu).toBe(true);
  });

  it('pendente conta para os 18; desaprovado não', () => {
    const itens = [
      ...feitos(10),
      ...feitos(8, { status: 'pendente', pct_comissao: null }),
      ...feitos(5, { status: 'desaprovado', pct_comissao: null }),
    ];
    const r = calcularDobraComissao(itens, 'maria', { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.feitos).toBe(18);
    expect(r.atingiu).toBe(true);
    // A dobra incide só sobre o APROVADO: 10 × 25 = 250 → 500.
    expect(r.comissao).toBeCloseTo(250, 2);
    expect(r.comissaoFinal).toBeCloseTo(500, 2);
  });

  it('ignora acordo de outro operador e de outro mês', () => {
    const itens = [
      ...feitos(18, { operador_id: 'joao' }),
      ...feitos(18, { criado_em: '2026-06-10T10:00:00Z' }),
      ...feitos(3),
    ];
    const r = calcularDobraComissao(itens, 'maria', { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.feitos).toBe(3);
    expect(r.atingiu).toBe(false);
  });

  it('sem operador devolve zerado, não quebra', () => {
    const r = calcularDobraComissao(feitos(18), null, { 'setor-A': 0.25 }, '2026-07', META_BATIDA);
    expect(r.feitos).toBe(0);
    expect(r.comissaoFinal).toBe(0);
    expect(r.atingiu).toBe(false);
  });
});

// ── Prazo dos desaprovados ──────────────────────────────────────────────────

describe('prazo do desaprovado', () => {
  it('dois dias úteis pulam o fim de semana', () => {
    // Sexta 10h → segunda (1º útil) → terça (2º útil)
    const prazo = prazoExpurgoDesaprovado('2026-08-07T10:00:00Z');
    expect(prazo?.toISOString().slice(0, 10)).toBe('2026-08-11');
  });

  it('no meio da semana são dois dias corridos mesmo', () => {
    // Segunda → terça → quarta
    const prazo = prazoExpurgoDesaprovado('2026-08-03T10:00:00Z');
    expect(prazo?.toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  it('linha sem avaliação não tem prazo', () => {
    expect(prazoExpurgoDesaprovado(null)).toBeNull();
    expect(textoPrazoExpurgo(undefined)).toBeNull();
  });

  it('o texto vira horas perto do fim e dias antes disso', () => {
    const avaliado = '2026-08-03T10:00:00Z';           // prazo: 05/08 10h
    expect(textoPrazoExpurgo(avaliado, new Date('2026-08-04T20:00:00Z'))).toBe('exclusão em 14h');
    expect(textoPrazoExpurgo(avaliado, new Date('2026-08-03T11:00:00Z'))).toBe('exclusão em 2 dias');
    expect(textoPrazoExpurgo(avaliado, new Date('2026-08-06T00:00:00Z')))
      .toBe('exclusão a qualquer momento');
  });
});

// ── Ranking do setor ────────────────────────────────────────────────────────

describe('rankingPixSetor', () => {
  it('ordena por acordos feitos no mês', () => {
    const itens = [
      ...feitos(3, { operador_id: 'maria', operador_nome: 'Maria Silva' }),
      ...feitos(7, { operador_id: 'joao',  operador_nome: 'Joao Souza' }),
      ...feitos(5, { operador_id: 'ana',   operador_nome: 'Ana Dias' }),
    ];
    const r = rankingPixSetor(itens, { 'setor-A': 0.25 }, '2026-07');
    expect(r.map(l => l.operadorId)).toEqual(['joao', 'ana', 'maria']);
    expect(r[0].acordos).toBe(7);
  });

  it('empate em acordos desempata por comissão', () => {
    const itens = [
      ...feitos(2, { operador_id: 'maria', operador_nome: 'Maria Silva', valor: 1000 }),
      ...feitos(2, { operador_id: 'joao',  operador_nome: 'Joao Souza',  valor: 90000 }),
    ];
    const r = rankingPixSetor(itens, { 'setor-A': 0.25 }, '2026-07');
    expect(r[0].operadorId).toBe('joao');
  });

  it('marca quem cumpriu os 18 e soma valor e comissão', () => {
    const itens = [
      ...feitos(18, { operador_id: 'maria', operador_nome: 'Maria Silva' }),
      ...feitos(2,  { operador_id: 'joao',  operador_nome: 'Joao Souza' }),
    ];
    const r = rankingPixSetor(itens, { 'setor-A': 0.25 }, '2026-07');
    // O selo é do REQUISITO de acordos, não da dobra: a dobra depende também da
    // meta de recebimento de cada um, que o ranking do setor não conhece.
    expect(r[0].requisitoAcordosOk).toBe(true);
    expect(r[0].valor).toBeCloseTo(180000, 2);
    expect(r[0].comissao).toBeCloseTo(450, 2);
    expect(r[1].requisitoAcordosOk).toBe(false);
  });

  it('prefere o nome atual do perfil ao carimbado na linha', () => {
    const itens = feitos(1, { operador_id: 'maria', operador_nome: 'Nome Antigo' });
    const r = rankingPixSetor(itens, { 'setor-A': 0.25 }, '2026-07', { maria: 'Maria Silva' });
    expect(r[0].nome).toBe('Maria Silva');
  });

  it('desaprovado e outro mês ficam de fora', () => {
    const itens = [
      ...feitos(4, { operador_id: 'maria' }),
      ...feitos(9, { operador_id: 'maria', status: 'desaprovado' }),
      ...feitos(9, { operador_id: 'maria', criado_em: '2026-06-01T10:00:00Z' }),
    ];
    const r = rankingPixSetor(itens, { 'setor-A': 0.25 }, '2026-07');
    expect(r).toHaveLength(1);
    expect(r[0].acordos).toBe(4);
  });
});

// ── Meta de Pix do setor ────────────────────────────────────────────────────

const BASE_META_PIX = {
  itens: feitos(4, { valor: 10000 }),   // realizado = 40.000
  metaValor: 100_000,
  metaAcordos: 10,
  configMes: CONFIG_MES,
  mes: '2026-07',
  hojeISO: '2026-07-15',
};

describe('calcularMetaPix', () => {
  it('mostra realizado e o que falta em valor e em quantidade', () => {
    const r = calcularMetaPix(BASE_META_PIX)!;
    expect(r.realizado).toBeCloseTo(40000, 2);
    expect(r.acordos).toBe(4);
    expect(r.faltaValor).toBeCloseTo(60000, 2);
    expect(r.faltaAcordos).toBe(6);
    expect(r.pctValor).toBe(40);
    expect(r.metaBatida).toBe(false);
  });

  it('não devolve falta negativa depois de bater', () => {
    const r = calcularMetaPix({
      ...BASE_META_PIX,
      itens: feitos(20, { valor: 10000 }),   // 200.000 e 20 acordos
    })!;
    expect(r.faltaValor).toBe(0);
    expect(r.faltaAcordos).toBe(0);
    expect(r.metaBatida).toBe(true);
  });

  it('só considera batida quando as DUAS metas saem', () => {
    // Valor bate (200.000 ≥ 100.000), quantidade não (2 < 10).
    const r = calcularMetaPix({ ...BASE_META_PIX, itens: feitos(2, { valor: 100000 }) })!;
    expect(r.faltaValor).toBe(0);
    expect(r.faltaAcordos).toBe(8);
    expect(r.metaBatida).toBe(false);
  });

  it('projeta pelo ritmo de dias úteis decorridos', () => {
    // A projeção compara o realizado com o esperado até hoje; 100% é estar
    // exatamente no ritmo de bater a meta.
    const r = calcularMetaPix(BASE_META_PIX)!;
    expect(r.projecao).toBeGreaterThan(0);
    expect(r.projecao).toBeLessThanOrEqual(999);
  });

  it('desaprovado não conta como realizado', () => {
    const r = calcularMetaPix({
      ...BASE_META_PIX,
      itens: [...feitos(2, { valor: 10000 }), ...feitos(8, { valor: 10000, status: 'desaprovado' })],
    })!;
    expect(r.realizado).toBeCloseTo(20000, 2);
    expect(r.acordos).toBe(2);
  });

  it('sem meta nenhuma devolve null em vez de "faltam R$ 0,00"', () => {
    expect(calcularMetaPix({ ...BASE_META_PIX, metaValor: 0, metaAcordos: 0 })).toBeNull();
    expect(calcularMetaPix({ ...BASE_META_PIX, metaValor: null, metaAcordos: null })).toBeNull();
  });

  it('meta só de quantidade funciona sem meta de valor', () => {
    const r = calcularMetaPix({ ...BASE_META_PIX, metaValor: 0 })!;
    expect(r.faltaAcordos).toBe(6);
    expect(r.faltaValor).toBe(0);
    expect(r.pctValor).toBe(0);
    expect(r.projecao).toBe(0);   // projeção é sobre valor
  });

  it('sem config do mês ainda mostra falta, só não projeta', () => {
    const r = calcularMetaPix({ ...BASE_META_PIX, configMes: null })!;
    expect(r.faltaValor).toBeCloseTo(60000, 2);
    expect(r.projecao).toBe(0);
  });
});

// ── Meta de Pix por equipe ──────────────────────────────────────────────────

describe('calcularMetaPixPorEquipe', () => {
  const equipePorOperador = { bryan1: 'eq-bryan', bryan2: 'eq-bryan', luci1: 'eq-luci' };
  const metas = [
    { equipeId: 'eq-bryan', equipeNome: 'Bryan',   metaValor: 100000, metaAcordos: 10 },
    { equipeId: 'eq-luci',  equipeNome: 'Luciana', metaValor:  50000, metaAcordos:  5 },
  ];
  const base = { equipePorOperador, configMes: null, mes: '2026-07', hojeISO: '2026-07-15' };

  it('separa o realizado de cada equipe pelos operadores dela', () => {
    const r = calcularMetaPixPorEquipe({
      ...base,
      metas,
      itens: [
        item({ operador_id: 'bryan1', valor: 30000 }),
        item({ operador_id: 'bryan2', valor: 20000 }),
        item({ operador_id: 'luci1',  valor: 15000 }),
      ],
    });
    const bryan = r.equipes.find(e => e.equipeId === 'eq-bryan')!;
    const luci  = r.equipes.find(e => e.equipeId === 'eq-luci')!;
    expect(bryan.resumo!.realizado).toBe(50000);
    expect(bryan.resumo!.acordos).toBe(2);
    expect(luci.resumo!.realizado).toBe(15000);
  });

  it('a meta do setor é a soma das metas das equipes', () => {
    const r = calcularMetaPixPorEquipe({ ...base, metas, itens: [] });
    expect(r.setor!.metaValor).toBe(150000);    // 100.000 + 50.000
    expect(r.setor!.metaAcordos).toBe(15);      // 10 + 5
  });

  it('o realizado do setor inclui quem está fora de equipe', () => {
    // Sem isto, as equipes não fechariam com o setor e ninguém saberia por quê.
    const r = calcularMetaPixPorEquipe({
      ...base,
      metas,
      itens: [
        item({ operador_id: 'bryan1', valor: 30000 }),
        item({ operador_id: 'avulso', valor:  7000 }),   // sem equipe no mapa
      ],
    });
    expect(r.setor!.realizado).toBe(37000);
    expect(r.equipes.find(e => e.equipeId === 'eq-bryan')!.resumo!.realizado).toBe(30000);
  });

  it('desaprovado não conta, no setor nem na equipe', () => {
    const r = calcularMetaPixPorEquipe({
      ...base,
      metas,
      itens: [
        item({ operador_id: 'bryan1', valor: 30000, status: 'aprovado' }),
        item({ operador_id: 'bryan1', valor: 99000, status: 'desaprovado' }),
      ],
    });
    expect(r.setor!.realizado).toBe(30000);
    expect(r.equipes.find(e => e.equipeId === 'eq-bryan')!.resumo!.realizado).toBe(30000);
  });

  it('equipe sem meta fica de fora da lista', () => {
    const r = calcularMetaPixPorEquipe({
      ...base,
      metas: [{ equipeId: 'eq-bryan', equipeNome: 'Bryan', metaValor: 0, metaAcordos: 0 }],
      itens: [item({ operador_id: 'bryan1', valor: 30000 })],
    });
    expect(r.equipes).toHaveLength(0);
    expect(r.setor).toBeNull();   // sem meta nenhuma, não há o que acompanhar
  });

  it('ordena as equipes da maior meta para a menor', () => {
    const r = calcularMetaPixPorEquipe({ ...base, metas, itens: [] });
    expect(r.equipes.map(e => e.equipeNome)).toEqual(['Bryan', 'Luciana']);
  });

  it('conta só os acordos do mês de referência', () => {
    const r = calcularMetaPixPorEquipe({
      ...base,
      metas,
      itens: [
        item({ operador_id: 'bryan1', valor: 30000, criado_em: '2026-07-10T10:00:00Z' }),
        item({ operador_id: 'bryan1', valor: 80000, criado_em: '2026-06-28T10:00:00Z' }),
      ],
    });
    expect(r.equipes.find(e => e.equipeId === 'eq-bryan')!.resumo!.realizado).toBe(30000);
  });
});
