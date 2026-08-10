/**
 * pixMetaPorSetor.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A meta da comissão dobrada deixou de ser 18 fixo no código e passou a ser
 * config por setor (`pix_automatico_config.meta_acordos_dobra`, migration
 * 20260810c).
 *
 * O que estes testes travam não é o número: é que a meta seja resolvida POR
 * LINHA, pelo setor em que o acordo foi registrado. O ranking mistura
 * operadores de setores diferentes quando quem olha é admin — uma meta única
 * para a tela marcaria "cumpriu" para quem está no setor mais exigente.
 */
import { describe, it, expect } from 'vitest';
import {
  metaDobraDoSetor, metasDobraPorSetor,
  PIX_META_ACORDOS_DOBRA, type PixAutoAcordo, type PixAutoConfig,
} from '@/services/pix_automatico.service';
import { calcularDobraComissao, rankingPixSetor } from './pixAutomaticoView';

// ── Helpers ─────────────────────────────────────────────────────────────────

function acordo(over: Partial<PixAutoAcordo> = {}): PixAutoAcordo {
  return {
    id: crypto.randomUUID(),
    empresa_id: 'emp-1',
    operador_id: 'op-1',
    operador_nome: 'Operador',
    setor_id: 'setor-a',
    nr_cliente: 'nr-1',
    valor: 1000,
    status: 'aprovado',
    pct_comissao: 0.25,
    avaliado_por: null,
    avaliado_por_nome: null,
    avaliado_em: null,
    pago: false,
    pago_em: null,
    pago_por: null,
    pago_por_nome: null,
    criado_em: '2026-08-05T12:00:00.000Z',
    atualizado_em: '2026-08-05T12:00:00.000Z',
    ...over,
  } as PixAutoAcordo;
}

function config(over: Partial<PixAutoConfig> = {}): PixAutoConfig {
  return {
    id: 'cfg-1',
    empresa_id: 'emp-1',
    setor_id: 'setor-a',
    pct: 0.25,
    meta_acordos_dobra: 18,
    permite_registro_operador: true,
    atualizado_por: null,
    atualizado_por_nome: null,
    atualizado_em: '2026-08-01T00:00:00.000Z',
    ...over,
  } as PixAutoConfig;
}

const MES = '2026-08';

// ── metasDobraPorSetor / metaDobraDoSetor ───────────────────────────────────

describe('metasDobraPorSetor — o mapa que as telas consomem', () => {
  it('monta setor → meta', () => {
    const mapa = metasDobraPorSetor([
      config({ setor_id: 'setor-a', meta_acordos_dobra: 25 }),
      config({ setor_id: 'setor-b', meta_acordos_dobra: 10 }),
    ]);
    expect(mapa).toEqual({ 'setor-a': 25, 'setor-b': 10 });
  });

  it('ignora meta ausente, zero ou negativa — cai no padrão depois', () => {
    // Ambiente sem a migration devolve a coluna como undefined; zero viria de
    // alguém tentando "desligar" o requisito, o que dividiria por zero no
    // cálculo de percentual.
    const mapa = metasDobraPorSetor([
      config({ setor_id: 'setor-a', meta_acordos_dobra: undefined }),
      config({ setor_id: 'setor-b', meta_acordos_dobra: 0 }),
      config({ setor_id: 'setor-c', meta_acordos_dobra: -5 }),
    ]);
    expect(mapa).toEqual({});
  });
});

describe('metaDobraDoSetor', () => {
  it('usa a meta do setor quando existe', () => {
    expect(metaDobraDoSetor('setor-a', { 'setor-a': 25 })).toBe(25);
  });

  it('setor sem config cai no padrão de 18', () => {
    expect(metaDobraDoSetor('setor-z', { 'setor-a': 25 })).toBe(PIX_META_ACORDOS_DOBRA);
  });

  it('acordo sem setor cai no padrão', () => {
    expect(metaDobraDoSetor(null, { 'setor-a': 25 })).toBe(PIX_META_ACORDOS_DOBRA);
  });
});

// ── calcularDobraComissao ───────────────────────────────────────────────────

describe('calcularDobraComissao — meta por setor', () => {
  const pct = { 'setor-a': 0.25, 'setor-b': 0.25 };

  it('sem mapa de meta, mantém 18 — chamador antigo e ambiente sem migration', () => {
    const itens = Array.from({ length: 18 }, () => acordo());
    const d = calcularDobraComissao(itens, 'op-1', pct, MES);
    expect(d.meta).toBe(18);
    expect(d.acordosOk).toBe(true);
  });

  it('setor com meta 25: 18 acordos deixam de cumprir o requisito', () => {
    const itens = Array.from({ length: 18 }, () => acordo());
    const d = calcularDobraComissao(itens, 'op-1', pct, MES, undefined, { 'setor-a': 25 });

    expect(d.meta).toBe(25);
    expect(d.feitos).toBe(18);
    expect(d.faltam).toBe(7);
    expect(d.acordosOk).toBe(false);
    expect(d.pctAcordos).toBe(72); // 18/25
  });

  it('setor com meta 10: 12 acordos cumprem', () => {
    const itens = Array.from({ length: 12 }, () => acordo({ setor_id: 'setor-b' }));
    const d = calcularDobraComissao(itens, 'op-1', pct, MES, undefined, { 'setor-b': 10 });

    expect(d.meta).toBe(10);
    expect(d.acordosOk).toBe(true);
    expect(d.faltam).toBe(0);
    expect(d.pctAcordos).toBe(100); // teto, não 120
  });

  it('operador que mudou de setor no mês responde pela MAIOR meta', () => {
    // Exigir a menor prometeria a dobra antes de ele cumprir o que o outro
    // setor pede — dinheiro anunciado cedo demais.
    const itens = [
      ...Array.from({ length: 10 }, () => acordo({ setor_id: 'setor-a' })),
      ...Array.from({ length: 10 }, () => acordo({ setor_id: 'setor-b' })),
    ];
    const d = calcularDobraComissao(itens, 'op-1', pct, MES, undefined, {
      'setor-a': 30, 'setor-b': 10,
    });

    expect(d.meta).toBe(30);
    expect(d.feitos).toBe(20);
    expect(d.acordosOk).toBe(false);
  });

  it('sem acordos no mês, a meta não quebra o percentual', () => {
    const d = calcularDobraComissao([], 'op-1', pct, MES, undefined, { 'setor-a': 25 });
    expect(d.feitos).toBe(0);
    expect(d.meta).toBe(PIX_META_ACORDOS_DOBRA);
    expect(Number.isFinite(d.pctAcordos)).toBe(true);
    expect(d.pctAcordos).toBe(0);
  });
});

// ── rankingPixSetor ─────────────────────────────────────────────────────────

describe('rankingPixSetor — requisito por setor de cada operador', () => {
  const pct = { 'setor-a': 0.25, 'setor-b': 0.25 };

  it('dois operadores, setores com metas diferentes, mesmo número de acordos', () => {
    // O ponto do teste: 12 acordos cumprem no setor B (meta 10) e não cumprem
    // no setor A (meta 25). Com uma meta única para a lista, os dois sairiam
    // iguais — e um deles estaria errado.
    const itens = [
      ...Array.from({ length: 12 }, () => acordo({ operador_id: 'op-a', setor_id: 'setor-a' })),
      ...Array.from({ length: 12 }, () => acordo({ operador_id: 'op-b', setor_id: 'setor-b' })),
    ];

    const linhas = rankingPixSetor(itens, pct, MES, {}, { 'setor-a': 25, 'setor-b': 10 });

    const a = linhas.find(l => l.operadorId === 'op-a')!;
    const b = linhas.find(l => l.operadorId === 'op-b')!;
    expect(a.acordos).toBe(12);
    expect(b.acordos).toBe(12);
    expect(a.requisitoAcordosOk).toBe(false);
    expect(b.requisitoAcordosOk).toBe(true);
  });

  it('sem mapa de meta, todo mundo responde por 18', () => {
    const itens = Array.from({ length: 18 }, () => acordo({ operador_id: 'op-a' }));
    const linhas = rankingPixSetor(itens, pct, MES);
    expect(linhas[0].requisitoAcordosOk).toBe(true);
  });

  it('desaprovado não conta para o requisito', () => {
    const itens = [
      ...Array.from({ length: 9 }, () => acordo({ operador_id: 'op-a' })),
      ...Array.from({ length: 9 }, () => acordo({ operador_id: 'op-a', status: 'desaprovado' })),
    ];
    const linhas = rankingPixSetor(itens, pct, MES, {}, { 'setor-a': 10 });
    expect(linhas[0].acordos).toBe(9);
    expect(linhas[0].requisitoAcordosOk).toBe(false);
  });
});
