/**
 * banco.test.ts — a chefona do lado do app: o que chega do banco, a vida que a
 * barra mostra, a regra do lote (a mesma da migration) e os números que o app,
 * o palco e a migration precisam ter iguais.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ABSORCAO_FRACAO, BEBER_MS, CURA_FRACAO, DIFICULDADES_CHEFONA, MAX_ACERTOS_POR_LOTE, MAX_DANO_POR_ACERTO, PRAZO_MIN, REGEN_FRACAO,
  duracaoEstimadaS,
  REGEN_MS, __resetChefonaParaTestes, aceitarChefona, ajustarRelogio, naHoraDaqui, aplicarLote, chefonaNaTela, ensaioLimparChefona, ensaioSoltarChefona,
  enviarLoteChefona, estadoChefona, motivoDoErroDaChefona, normalizarChefona, normalizarPlacarChefona, situacaoDaChefona,
  vidaNaTela, vidaPorAparecer, type RodadaChefona,
} from './banco';
import {
  ABSORCAO_FRACAO as ABSORCAO_DO_PALCO, BEBER_S, CURA_FRACAO as CURA_DO_PALCO, DANO, REGEN_FRACAO as REGEN_DO_PALCO, REGEN_S,
} from './palcoChefona';

const SQL = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20261015230000_chefona_bruxa_do_pantano.sql'), 'utf8',
);

const AGORA = Date.parse('2026-10-17T15:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function rodada(extra: Partial<RodadaChefona> = {}): RodadaChefona {
  return {
    id: 7, solta_em: iso(AGORA - 10_000), expira_em: iso(AGORA + 110_000),
    vida_max: 100, vida: 100, vida_por_pessoa: 0, situacao: 'ativo', derrotado_em: null,
    golpe_final_por: null, golpe_final_nome: null, golpe_final_foto: null,
    cura_em: null, cura_ate: null, cura_vida: 0, cura_semente: 0,
    versao: 1, participantes: 0, ranking: [],
    absorcao: 0, protegida: false, protegida_em: null, totem_em: null, totem_vida: 0, totens: 0, curas: 0,
    lobby_total: 0, lobby: [],
    ...extra,
  };
}

afterEach(() => __resetChefonaParaTestes());

describe('o que chega do banco', () => {
  it('lê a linha com os campos da chefona, e o crítico vira o «headshot» do placar', () => {
    const r = normalizarChefona({
      id: 3, solta_em: iso(AGORA), expira_em: iso(AGORA + 120_000), vida_max: 900, vida: 400, situacao: 'ativo',
      versao: 5, absorcao: 12, protegida: true, protegida_em: iso(AGORA), totem_em: null, totem_vida: 0, totens: 1, curas: 2,
      participantes: 2,
      ranking: [
        { usuario: 'b', nome: 'Bruno', dano: 50, acertos: 10, criticos: 2 },
        { usuario: 'a', nome: 'Ana', dano: 80, acertos: 12, criticos: 5 },
      ],
    })!;
    expect(r).toMatchObject({ absorcao: 12, protegida: true, totens: 1, curas: 2, cura_ate: null });
    expect(r.ranking.map(g => [g.usuario, g.headshots])).toEqual([['a', 5], ['b', 2]]);
  });

  it('lixo não entra', () => {
    expect(normalizarChefona(null)).toBeNull();
    expect(normalizarChefona({ id: 'x' })).toBeNull();
  });

  it('o placar de quem atirou traz os críticos', () => {
    expect(normalizarPlacarChefona({ dano: 30, acertos: 8, criticos: 3, posicao: 2 })).toEqual({ dano: 30, acertos: 8, headshots: 3, posicao: 2 });
  });

  it('aviso atrasado não desfaz o que já se sabe, e acabada não volta a ativa', () => {
    aceitarChefona({ ...rodada({ versao: 5, vida: 60 }) });
    aceitarChefona({ ...rodada({ versao: 4, vida: 80 }) });
    expect(estadoChefona()?.vida).toBe(60);
    aceitarChefona({ ...rodada({ versao: 6, vida: 0, situacao: 'derrotado', derrotado_em: iso(AGORA), golpe_final_por: 'a' }) });
    aceitarChefona({ ...rodada({ versao: 7, vida: 10 }) });
    expect(estadoChefona()?.situacao).toBe('derrotado');
  });

  it('prazo vencido sem aviso: fugiu, daqui', () => {
    const r = rodada({ expira_em: iso(AGORA - 10_000) });
    expect(chefonaNaTela(r, AGORA)).toBe(false);
    expect(situacaoDaChefona(r, AGORA)).toBe('fugiu');
  });
});

describe('a vida que a barra mostra', () => {
  it('desconta os meus tiros a caminho', () => {
    expect(vidaNaTela(rodada({ vida: 80 }), AGORA, 12)).toBe(68);
  });

  it('a cura só aparece no último gole', () => {
    const r = rodada({ vida: 90, cura_em: iso(AGORA), cura_vida: 22 });
    expect(vidaNaTela(r, AGORA + 500, 0)).toBe(68);
    expect(vidaNaTela(r, AGORA + BEBER_MS + 1, 0)).toBe(90);
  });

  it('a Regeneração do totem sobe aos poucos', () => {
    const r = rodada({ vida: 16, totem_em: iso(AGORA), totem_vida: 15 });
    expect(vidaNaTela(r, AGORA, 0)).toBe(1);
    expect(vidaNaTela(r, AGORA + REGEN_MS / 2, 0)).toBe(9);
    expect(vidaNaTela(r, AGORA + REGEN_MS + 1, 0)).toBe(16);
  });

  it('relógio muito atrasado mostra tudo de uma vez, em vez de esconder a cura para sempre', () => {
    const r = rodada({ vida: 90, cura_em: iso(AGORA + 60_000), cura_vida: 22 });
    expect(vidaPorAparecer(r, AGORA)).toBe(0);
  });
});

describe('o lote, pela regra da migration', () => {
  const ana = { usuario: 'ana', nome: 'Ana' };

  it('caçadora nova soma vida antes do tiro', () => {
    const r = aplicarLote(rodada({ vida_por_pessoa: 40 }), ana, 3, 1, 15, AGORA, false);
    expect(r).toMatchObject({ vida_max: 140, vida: 125, participantes: 1 });
    expect(r.ranking[0]).toMatchObject({ dano: 15, acertos: 3, headshots: 1 });
  });

  it('não confia: 12 acertos e 12 de dano por acerto', () => {
    const r = aplicarLote(rodada({ vida_max: 5000, vida: 5000 }), ana, 50, 50, 99_999, AGORA, false);
    expect(r.vida).toBe(5000 - MAX_ACERTOS_POR_LOTE * MAX_DANO_POR_ACERTO);
    expect(r.ranking[0].headshots).toBe(12);
  });

  it('na contagem ou depois do prazo, nada', () => {
    const chegando = rodada({ solta_em: iso(AGORA + 5_000) });
    expect(aplicarLote(chegando, ana, 3, 0, 9, AGORA, false)).toBe(chegando);
    const vencida = rodada({ expira_em: iso(AGORA - 1) });
    expect(aplicarLote(vencida, ana, 3, 0, 9, AGORA, false)).toBe(vencida);
  });

  it('o totem: 1 de vida + Regeneração, Absorção, e o dano conta só até sobrar 1', () => {
    const r = aplicarLote(rodada({ protegida: true }), ana, 12, 0, 140, AGORA, false);
    expect(r).toMatchObject({ situacao: 'ativo', protegida: false, vida: 16, absorcao: 10, totem_vida: 15, totens: 1 });
    expect(r.ranking[0].dano).toBe(99);
    // A Absorção paga primeiro; sem totem, o próximo golpe fatal derruba.
    const depois = aplicarLote(r, ana, 2, 0, 14, AGORA, false);
    expect(depois).toMatchObject({ absorcao: 0, vida: 12 });
    const fim = aplicarLote(depois, ana, 12, 0, 140, AGORA, false);
    expect(fim).toMatchObject({ situacao: 'derrotado', vida: 0, golpe_final_por: 'ana' });
  });
});

describe('os números que o app, o palco e a migration dividem', () => {
  it('a cura, o totem e o tempo de beber são os mesmos do palco', () => {
    expect(CURA_FRACAO).toBe(CURA_DO_PALCO);
    expect(REGEN_FRACAO).toBe(REGEN_DO_PALCO);
    expect(ABSORCAO_FRACAO).toBe(ABSORCAO_DO_PALCO);
    expect(BEBER_MS).toBe(BEBER_S * 1000);
    expect(REGEN_MS).toBe(REGEN_S * 1000);
  });

  it('o teto de dano por acerto cobre o maior tiro do palco (cabeça, com ela tonta)', () => {
    expect(MAX_DANO_POR_ACERTO).toBeGreaterThanOrEqual(Math.max(...Object.values(DANO)) * 2);
  });

  it('a migration usa os mesmos números', () => {
    expect(SQL).toContain(`p_fracao numeric DEFAULT ${CURA_FRACAO}`);
    expect(SQL).toContain(`round(v_max * ${REGEN_FRACAO})`);
    expect(SQL).toContain(`round(v_max * ${ABSORCAO_FRACAO.toFixed(2)})`);
    expect(SQL).toContain(`least(greatest(coalesce(p_acertos, 0), 0), ${MAX_ACERTOS_POR_LOTE})`);
    expect(SQL).toContain(`v_a * ${MAX_DANO_POR_ACERTO})`);
    expect(SQL).toContain("realtime.send(p_estado, 'chefona', 'abobora:'");
  });

  it('a luta cabe nos 2 minutos de 10 a 40 pessoas, com folga para a cura e o totem', () => {
    const [facil, medio, dificil] = DIFICULDADES_CHEFONA;
    for (const n of [10, 20, 30, 40]) {
      // Médio: ~75 s a 5 de dano por segundo; nem demora (≤ 100 s a 4) nem acaba num piscar (≥ 50 s a 7).
      expect(duracaoEstimadaS(medio, n, 5)).toBeGreaterThan(70);
      expect(duracaoEstimadaS(medio, n, 5)).toBeLessThan(80);
      expect(duracaoEstimadaS(medio, n, 4)).toBeLessThan(100);
      expect(duracaoEstimadaS(medio, n, 7)).toBeGreaterThan(50);
      // Com uma Poção de Cura (+22% da vida) ainda cabe no prazo a 5.
      expect(duracaoEstimadaS(medio, n, 5) * 1.22).toBeLessThan(PRAZO_MIN * 60 - 15);
      // Fácil é mais rápido e o Difícil, mais longo — mas o Difícil ainda cai a 5.
      expect(duracaoEstimadaS(facil, n, 5)).toBeLessThan(duracaoEstimadaS(medio, n, 5));
      expect(duracaoEstimadaS(dificil, n, 5)).toBeGreaterThan(duracaoEstimadaS(medio, n, 5));
      expect(duracaoEstimadaS(dificil, n, 5)).toBeLessThan(PRAZO_MIN * 60 - 15);
    }
    // Com 10 ou com 40, quase o mesmo tempo (a parte de cada pessoa manda).
    expect(Math.abs(duracaoEstimadaS(medio, 10, 5) - duracaoEstimadaS(medio, 40, 5))).toBeLessThan(10);
  });

  it('a vida das dificuldades cabe no banco', () => {
    for (const d of DIFICULDADES_CHEFONA) {
      expect(d.base).toBeGreaterThanOrEqual(10);
      expect(d.porPessoa).toBeLessThanOrEqual(10_000);
    }
  });
});

describe('o ensaio do laboratório (sem banco)', () => {
  it('o tiro na chefona de mentira se resolve aqui, com ranking', async () => {
    // 1.000 de vida: um lote pequeno no começo fica na linha do ritmo (com 100, 15% de
    // uma vez no segundo zero já é «time forte demais» e ela bebe — ver ritmo.ts).
    ensaioSoltarChefona(1000, 2, 0, 0);
    const r = estadoChefona()!;
    expect(r.id).toBeLessThan(0);
    const res = await enviarLoteChefona(r.id, 3, 1, 15);
    expect(res.rodada?.vida).toBe(985);
    expect(res.eu).toMatchObject({ dano: 15, headshots: 1, posicao: 1 });
    ensaioLimparChefona();
    expect(estadoChefona()).toBeNull();
  });
});

describe('os erros em palavras', () => {
  it('cada recusa do banco vira uma frase', () => {
    expect(motivoDoErroDaChefona('CHEFAO_NA_TELA: x')).toMatch(/Rei do Pop/);
    expect(motivoDoErroDaChefona('JA_PROTEGIDA')).toMatch(/totem/);
    expect(motivoDoErroDaChefona('Could not find the function public.fn_chefona_soltar')).toMatch(/20261015230000/);
  });
});

describe('a hora do banco (20261016170000)', () => {
  it('relógio desta tela atrasado 20 s: os horários da chefona vêm para a hora daqui', () => {
    ajustarRelogio(iso(AGORA + 20_000), AGORA);
    const r = naHoraDaqui(rodada());
    expect(Date.parse(r.solta_em)).toBe(AGORA - 30_000);
    expect(Date.parse(r.expira_em)).toBe(AGORA + 90_000);
  });

  it('a rede só diminui a medida: vale a maior; o relógio que pula mais de 5 s recomeça', () => {
    ajustarRelogio(iso(AGORA + 20_000), AGORA);
    ajustarRelogio(iso(AGORA + 19_600), AGORA); // a mesma diferença, com 400 ms de rede
    expect(Date.parse(naHoraDaqui(rodada()).solta_em)).toBe(AGORA - 30_000);
    ajustarRelogio(iso(AGORA + 2_000), AGORA); // acertaram o relógio daqui
    expect(Date.parse(naHoraDaqui(rodada()).solta_em)).toBe(AGORA - 12_000);
  });

  it('diferença pequena (da rede) não mexe em nada', () => {
    ajustarRelogio(iso(AGORA + 150), AGORA);
    const r = rodada();
    expect(naHoraDaqui(r)).toBe(r);
  });

  it('o estado que chega com «agora» já entra na hora daqui', () => {
    const agora = Date.now();
    aceitarChefona({ ...rodada({ solta_em: iso(agora + 60_000), expira_em: iso(agora + 180_000) }), agora: iso(agora + 30_000) });
    expect(Date.parse(estadoChefona()!.solta_em)).toBeCloseTo(agora + 30_000, -2);
  });
});

describe('o diretor de ritmo no ensaio (o mesmo do banco, 20261016200000)', () => {
  const ana = { usuario: 'ana', nome: 'Ana' };
  const aos = (s: number, extra: Partial<RodadaChefona> = {}) =>
    rodada({ vida_max: 1000, vida: 1000, solta_em: iso(AGORA - s * 1000), expira_em: iso(AGORA + 60_000), ...extra });

  it('atrás da linha o dano vale mais; o ranking soma o dano de verdade', () => {
    const r = aplicarLote(aos(30), ana, 3, 0, 9, AGORA);
    expect(r.vida).toBe(1000 - 45);
    expect(r.ranking[0].dano).toBe(9);
    expect(r.ritmo).toBeGreaterThan(1);
  });

  it('time forte demais: ela bebe sozinha', () => {
    const r = aplicarLote(aos(30, { vida: 300 }), ana, 3, 0, 9, AGORA);
    expect(r.cura_em).not.toBeNull();
    expect(r.vida).toBeGreaterThan(500);
  });

  it('antes dos 60 s ela não cai; dos 115 s em diante, qualquer tiro a derruba', () => {
    expect(aplicarLote(aos(59, { vida: 60, cura_em: iso(AGORA) }), ana, 12, 0, 144, AGORA).situacao).toBe('ativo');
    expect(aplicarLote(aos(116, { vida: 900 }), ana, 1, 0, 3, AGORA).situacao).toBe('derrotado');
  });

  it('no ensaio, lote com pista forte de autoclick não conta (nem no ritmo)', async () => {
    ensaioSoltarChefona(1000, 2, 0, 0);
    const id = estadoChefona()!.id;
    const res = await enviarLoteChefona(id, 5, 0, 15, { cliques: 30, suspeita: 1 });
    expect(res.descartados).toBe(5);
    expect(estadoChefona()!.vida).toBe(1000);
  });
});
