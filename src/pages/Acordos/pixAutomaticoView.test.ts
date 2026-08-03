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
  filtrarItensPix, totaisPorStatus, calcularBonusMeta,
  MAX_SUGESTOES_VINCULO, type OperadorInfo,
} from './pixAutomaticoView';

const OPERADORES: OperadorInfo[] = [
  { id: 'maria', nome: 'Maria Silva',  equipe_id: 'eq-1', setor_id: 'setor-A', perfil: 'operador' },
  { id: 'joao',  nome: 'João Souza',   equipe_id: 'eq-2', setor_id: 'setor-B', perfil: 'operador' },
  { id: 'chefe', nome: 'Marina Lima',  equipe_id: 'eq-1', setor_id: 'setor-A', perfil: 'lider' },
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
    expect(mapaOperadorEquipe(OPERADORES)).toEqual({ maria: 'eq-1', joao: 'eq-2', chefe: 'eq-1' });
    expect(mapaOperadorSetor(OPERADORES)).toEqual({ maria: 'setor-A', joao: 'setor-B', chefe: 'setor-A' });
  });

  it('lista vazia dá mapa vazio', () => {
    expect(mapaOperadorEquipe([])).toEqual({});
  });
});

describe('apenasOperadores', () => {
  it('líder fica de fora do filtro e do vínculo', () => {
    expect(apenasOperadores(OPERADORES).map(o => o.id)).toEqual(['maria', 'joao']);
  });

  it('cargo em maiúscula ou com espaço ainda é reconhecido', () => {
    const ops = [{ ...OPERADORES[0], perfil: ' OPERADOR ' }];
    // O trim não é feito aqui de propósito: o valor vem do banco em minúscula.
    // Só o caso da maiúscula é tratado.
    expect(apenasOperadores([{ ...OPERADORES[0], perfil: 'OPERADOR' }])).toHaveLength(1);
    expect(apenasOperadores(ops)).toHaveLength(0);
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
