/**
 * chefao.test.ts — o chefão da caça: a vida de todos, o ranking, o ensaio, a
 * dança e o tiro que desfaz a inclinação.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import {
  CURA_CHEGA_MS, CURA_MS, __resetChefaoParaTestes, chefaoNaTela, curando, danoDoLote, enviarLote,
  ensaioCurarChefao, ensaioFugir, ensaioRobos, ensaioSoltarChefao, estadoChefao, faltaDaCura, formatarRelogio,
  juntarChefao, lerSuspeitos, normalizarChefao, ordenarRanking, situacaoNaTela,
  type RodadaChefao,
} from './chefao';
import {
  BANQUETE, CHEFAO, CORRIDA, NUMERO_DA_PARTE_VITIMA, PASSOS, PASSO_POR_ID, VITIMA_LINHAS, VITIMA_POSES, cssDaTransforma,
  estagioDaVida, girarImagem, imagemDaVitima, pontoNaArte, proximoPasso, soAParte, zumbiDaPose,
  type Bracos, type Pernas,
} from './chefaoArte';
import {
  ACHATA_MS, ACENDE_MS, CORRE_ATE_MS, FURIA_MS, MORDIDA_MS, comecarCura, comecarFuga, comecarFuria, criarMovimento,
  desviar, emCura, limites, mover, naFuria, quadroAtual, type EventoMovimento,
} from './chefaoMovimento';
import { MOTIVO, avaliarFicha } from './autoclick';
import { ALTURA, LARGURA, NUMERO_DA_PARTE, centroDaParte, montarQuadro, parteNoPonto } from './zumbis';

afterEach(() => __resetChefaoParaTestes());

const base = (p: Partial<RodadaChefao> = {}): RodadaChefao => ({
  id: 5, solta_em: '2026-10-09T15:00:00Z', expira_em: '2026-10-09T15:05:00Z',
  vida_max: 500, vida: 500, vida_por_pessoa: 0, situacao: 'ativo', derrotado_em: null,
  golpe_final_por: null, golpe_final_nome: null, golpe_final_foto: null,
  cura_em: null, cura_ate: null, cura_vida: 0, cura_semente: 0,
  versao: 1, participantes: 0, ranking: [], ...p,
});

describe('o estado do chefão', () => {
  it('normaliza a linha do banco e ordena o ranking pelo dano', () => {
    const r = normalizarChefao({
      id: '7', solta_em: 'a', expira_em: 'b', vida_max: 300, vida: 999, situacao: 'qualquer', versao: 3,
      participantes: 1,
      ranking: [
        { usuario: 'u1', nome: 'Ana', dano: 10, acertos: 10, headshots: 0 },
        { usuario: 'u2', nome: 'Bia', dano: 30, acertos: 6, headshots: 8 },
        { nome: 'sem usuário', dano: 99 },
      ],
    });
    expect(r?.id).toBe(7);
    expect(r?.vida).toBe(300);            // vida nunca passa da máxima
    expect(r?.situacao).toBe('ativo');
    expect(r?.ranking.map(g => g.usuario)).toEqual(['u2', 'u1']);
    expect(r?.participantes).toBe(2);     // nunca menos do que quem está no ranking
    expect(normalizarChefao({ id: 1 })).toBeNull();
  });

  it('aviso atrasado não desfaz o que já se sabe', () => {
    const atual = base({ vida: 300, versao: 9 });
    expect(juntarChefao(atual, base({ vida: 400, versao: 4 }))).toBe(atual);
    expect(juntarChefao(atual, base({ vida: 280, versao: 10 }))?.vida).toBe(280);
    // Rodada mais velha: ignorada; mais nova: entra.
    expect(juntarChefao(atual, base({ id: 4, versao: 99 }))).toBe(atual);
    expect(juntarChefao(atual, base({ id: 6 }))?.id).toBe(6);
  });

  it('chefão caído não volta a dançar', () => {
    const caido = base({ situacao: 'derrotado', vida: 0, versao: 20 });
    expect(juntarChefao(caido, base({ vida: 10, versao: 30 }))).toBe(caido);
  });

  it('o prazo vencido sem aviso vira fuga na tela', () => {
    const r = base();
    expect(chefaoNaTela(r, Date.parse('2026-10-09T15:04:00Z'))).toBe(true);
    expect(situacaoNaTela(r, Date.parse('2026-10-09T15:06:00Z'))).toBe('fugiu');
  });

  it('cabeça vale o triplo; o relógio mostra min:seg', () => {
    expect(danoDoLote(4, 2)).toBe(10);
    expect(formatarRelogio(187_000)).toBe('3:07');
    expect(formatarRelogio(-5)).toBe('0:00');
  });

  it('empate no dano: quem tem mais headshots fica na frente', () => {
    const r = ordenarRanking([
      { usuario: 'a', nome: 'A', foto: null, dano: 9, acertos: 9, headshots: 0 },
      { usuario: 'b', nome: 'B', foto: null, dano: 9, acertos: 0, headshots: 3 },
    ]);
    expect(r[0].usuario).toBe('b');
  });
});

describe('o prazo', () => {
  it('ele fica 2 minutos depois de chegar, e a vida foi refeita para isso', async () => {
    const { PRAZO_MIN, DIFICULDADES } = await import('./chefao');
    expect(PRAZO_MIN).toBe(2);
    ensaioSoltarChefao(100);
    const r = estadoChefao()!;
    expect(Date.parse(r.expira_em) - Date.parse(r.solta_em)).toBe(2 * 60_000);
    // ~1,8 de dano/s × ~95 s úteis ≈ 170 por pessoa no Médio (a conta em `chefao.ts`).
    expect(DIFICULDADES.find(d => d.nome === 'Médio')!.porPessoa).toBe(170);
  });
});

describe('o ensaio (localhost)', () => {
  it('o lote tira vida, entra no ranking e quem tira a última gota dá o golpe final', async () => {
    ensaioSoltarChefao(10, 3);
    const id = estadoChefao()!.id;
    expect(id).toBeLessThan(0);
    const r1 = await enviarLote(id, 3, 1);
    expect(r1.rodada?.vida).toBe(4);
    expect(r1.eu).toMatchObject({ dano: 6, posicao: 1 });
    const r2 = await enviarLote(id, 12, 0);
    expect(r2.rodada?.vida).toBe(0);
    expect(r2.rodada?.situacao).toBe('derrotado');
    expect(r2.rodada?.golpe_final_por).toBe('voce');
    // O dano não passa do que sobrava.
    expect(r2.eu?.dano).toBe(10);
  });

  it('fugiu: tiro depois não conta', async () => {
    ensaioSoltarChefao(50, 3);
    const id = estadoChefao()!.id;
    ensaioFugir();
    const r = await enviarLote(id, 5, 0);
    expect(r.rodada?.situacao).toBe('fugiu');
    expect(r.rodada?.vida).toBe(50);
  });
});

describe('o lote no banco', () => {
  it('o freio do banco volta marcado: os tiros não entraram e o app manda de novo', async () => {
    const { supabase } = await import('@/lib/supabase');
    const rpc = vi.mocked(supabase.rpc as unknown as (...a: unknown[]) => Promise<unknown>);
    rpc.mockResolvedValueOnce({ data: { ...base({ vida: 480, versao: 9 }), freio: true, eu: { dano: 20, posicao: 2 } }, error: null });
    const r = await enviarLote(5, 4, 0);
    expect(r.freio).toBe(true);
    expect(r.rodada?.vida).toBe(480);

    rpc.mockResolvedValueOnce({ data: { ...base({ vida: 470, versao: 10 }), eu: { dano: 30, posicao: 2 } }, error: null });
    expect((await enviarLote(5, 4, 0)).freio).toBe(false);

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'canceling statement due to lock timeout' } });
    const falhou = await enviarLote(5, 4, 0);
    expect(falhou).toMatchObject({ freio: false, erro: 'canceling statement due to lock timeout' });
  });
});

describe('a dança', () => {
  it('o giro sempre termina na ponta do pé, e nenhum passo se repete em seguida', () => {
    expect(proximoPasso('giro', 0.5).id).toBe('ponta');
    for (const p of PASSOS) {
      for (const sorte of [0, 0.3, 0.6, 0.99]) {
        const prox = proximoPasso(p.id, sorte);
        if (p.id !== 'giro') expect(prox.id).not.toBe(p.id);
        expect(prox.id).not.toBe(p.id === 'giro' ? 'giro' : 'ponta');
      }
    }
  });

  it('todo quadro de todo passo tem cabeça e corpo para acertar', () => {
    for (const p of PASSOS) {
      for (const qd of p.quadros) {
        const img = montarQuadro(zumbiDaPose(qd), qd.quadro);
        expect(img.partes.includes(NUMERO_DA_PARTE.cabeca), `${p.id} cabeça`).toBe(true);
        expect(img.partes.includes(NUMERO_DA_PARTE.tronco), `${p.id} tronco`).toBe(true);
      }
    }
  });

  it('as grades das poses cabem no sprite', () => {
    const bracos: Bracos[] = ['estendido', 'garra', 'baixo', 'chapeu'];
    const pernas: Pernas[] = ['normal', 'chute', 'pontaFrente', 'pontaTras'];
    for (const z of bracos.flatMap(b => pernas.map(p => zumbiDaPose({ bracos: b, pernas: p })))) {
      for (const g of Object.values(z.trocas ?? {})) {
        if (!g || g.linhas.length === 0) continue;
        expect(g.y + g.linhas.length, z.id).toBeLessThanOrEqual(ALTURA);
        expect(g.x + Math.max(...g.linhas.map(l => l.length)), z.id).toBeLessThanOrEqual(LARGURA);
      }
    }
    expect(CHEFAO.nome).toMatch(/Rei do Pop/);
  });
});

describe('o tiro no chefão inclinado e espelhado', () => {
  /** Leva um pixel da arte até a tela pela mesma conta do CSS (`cssDaTransforma`). */
  function paraTela(ax: number, ay: number, t: { vira: 1 | -1; gira: number; sobe: number }, lado: 1 | -1, e: number) {
    let x = (ax + 0.5 - LARGURA / 2) * e;
    let y = (ay + 0.5 - ALTURA) * e;
    const g = (t.gira * Math.PI) / 180;
    [x, y] = [x * Math.cos(g) - y * Math.sin(g), x * Math.sin(g) + y * Math.cos(g)];
    x *= lado * t.vira;
    y -= t.sobe * e;
    return { x: x + (LARGURA * e) / 2, y: y + ALTURA * e };
  }

  it('a cabeça continua sendo a cabeça, em qualquer passo e para qualquer lado', () => {
    for (const p of [PASSO_POR_ID.inclina, PASSO_POR_ID.giro, PASSO_POR_ID.ponta, PASSO_POR_ID.garras]) {
      for (const qd of p.quadros) {
        for (const lado of [1, -1] as const) {
          const img = montarQuadro(zumbiDaPose(qd), qd.quadro);
          const c = centroDaParte(img, NUMERO_DA_PARTE.cabeca);
          const tela = paraTela(c.x, c.y, qd.transforma, lado, 3);
          const volta = pontoNaArte(tela.x, tela.y, qd.transforma, lado, 3, LARGURA, ALTURA);
          expect(volta, `${p.id} lado ${lado}`).toEqual(c);
          expect(parteNoPonto(img, volta.x, volta.y)).toBe(NUMERO_DA_PARTE.cabeca);
        }
      }
    }
  });

  it('o CSS gira, espelha e sobe na ordem que o tiro desfaz', () => {
    expect(cssDaTransforma({ vira: -1, gira: 30, sobe: 2 }, 1, 3)).toBe('translateY(-6px) scaleX(-1) rotate(30deg)');
  });
});

describe('os ferimentos', () => {
  const tem = (estagio: 0 | 1 | 2 | 3, parte: keyof typeof NUMERO_DA_PARTE) =>
    montarQuadro(zumbiDaPose({ bracos: 'garra', pernas: 'normal' }, estagio), { desloca: {} }).partes.includes(NUMERO_DA_PARTE[parte]);

  it('a vida decide o estágio: 70%, 45%, 20%', () => {
    expect(estagioDaVida(500, 500)).toBe(0);
    expect(estagioDaVida(350, 500)).toBe(1);
    expect(estagioDaVida(225, 500)).toBe(2);
    expect(estagioDaVida(100, 500)).toBe(3);
    expect(estagioDaVida(0, 500)).toBe(3);
  });

  it('perde o braço de trás no 2 e o da frente no 3 — e braço que caiu não leva tiro', () => {
    expect(tem(1, 'bracoTras')).toBe(true);
    expect(tem(2, 'bracoTras')).toBe(false);
    expect(tem(2, 'bracoFrente')).toBe(true);
    expect(tem(3, 'bracoFrente')).toBe(false);
    expect(tem(3, 'cabeca')).toBe(true);
  });

  it('o chapéu está na cabeça e voa quando ele cai', () => {
    const chapeu = CHEFAO.enfeites.find(e => e.solta === 'cai');
    expect(chapeu?.parte).toBe('cabeca');
    expect(chapeu?.linhas.join('')).toContain('z');
  });

  it('cada combinação é montada uma vez só', () => {
    expect(zumbiDaPose({ bracos: 'baixo', pernas: 'pontaTras' }, 2)).toBe(zumbiDaPose({ bracos: 'baixo', pernas: 'pontaTras' }, 2));
  });
});

describe('a física do movimento', () => {
  const CAIXA = { largura: 72, altura: 102 };
  let semente = 1;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };

  it('o pulo sobe em arco, cai no lugar marcado e amassa ao pousar', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 500; m.y = 300;
    const alvo = desviar(m, 'pulo', 1, 0, 1200, 700, CAIXA, rnd);
    let maisAlto = 0;
    let pousou = false;
    for (let t = 16; t <= 600; t += 16) {
      for (const ev of mover(m, 16, t, 1200, 700, CAIXA, 0, rnd)) if (ev.tipo === 'pousou') pousou = true;
      maisAlto = Math.max(maisAlto, m.ar);
      if (pousou) {
        expect(quadroAtual(m, t).achata).toBeGreaterThan(0.9);
        expect(quadroAtual(m, t + ACHATA_MS).achata).toBe(0);
        break;
      }
    }
    expect(pousou).toBe(true);
    expect(maisAlto).toBeGreaterThan(60);
    expect(m.ar).toBe(0);
    expect(Math.round(m.x)).toBe(Math.round(alvo.x));
  });

  it('o desvio nunca joga ele para fora da tela', () => {
    const m = criarMovimento(400, 500, CAIXA, 0, 0, rnd);
    const b = limites(400, 500, CAIXA);
    for (let i = 0; i < 40; i++) {
      const onde = desviar(m, i % 2 ? 'pulo' : 'deslize', i % 3 ? 1 : -1, 0, 400, 500, CAIXA, rnd);
      expect(onde.x).toBeGreaterThanOrEqual(b.x0);
      expect(onde.x).toBeLessThanOrEqual(b.x1);
      m.x = onde.x; m.y = onde.y; m.acao = null;
    }
  });

  it('no moonwalk ele olha para um lado e desliza para o outro, liso', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.passo = PASSO_POR_ID.moonwalk; m.volta = 0;
    m.x = 600; m.y = 300; m.alvo = { x: 100, y: 300 };
    let antes = m.x;
    for (let t = 16; t < 1500; t += 16) {
      mover(m, 16, t, 1200, 700, CAIXA, 0, rnd);
      if (m.passo.id !== 'moonwalk') break;
      expect(m.x).toBeLessThanOrEqual(antes + 0.001);
      antes = m.x;
    }
    expect(m.lado).toBe(1);
    expect(m.x).toBeLessThan(600);
  });

  it('a Fúria acende os olhos parado e depois dança até acabar sozinha', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    comecarFuria(m, 1000);
    expect(naFuria(m, 1000)).toBe(true);
    const x = m.x;
    mover(m, 16, 1000 + ACENDE_MS / 2, 1200, 700, CAIXA, 0, rnd);
    expect(m.x).toBe(x);
    let acabou = false;
    for (let t = 1000 + ACENDE_MS; t <= 1000 + FURIA_MS + 100; t += 16) {
      for (const ev of mover(m, 16, t, 1200, 700, CAIXA, 0, rnd)) if (ev.tipo === 'furiaAcabou') acabou = true;
    }
    expect(acabou).toBe(true);
    expect(naFuria(m, 1000 + FURIA_MS + 200)).toBe(false);
  });
});

describe('o banquete: o movimento', () => {
  const CAIXA = { largura: 72, altura: 102 };
  let semente = 3;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };

  /** Roda o laço de `de` a `ate`, de 16 em 16 ms, guardando os eventos com a hora. */
  function rodar(m: ReturnType<typeof criarMovimento>, de: number, ate: number) {
    const eventos: { t: number; ev: EventoMovimento }[] = [];
    for (let t = de; t <= ate; t += 16) for (const ev of mover(m, 16, t, 1200, 700, CAIXA, 0, rnd)) eventos.push({ t, ev });
    return eventos;
  }

  it('corre até ela, dá o bote, come parado e volta a dançar no fim', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 100; m.y = 300;
    comecarCura(m, 1000, 1000 + CURA_MS, 600, 320, 1);
    const ev = rodar(m, 1000, 1000 + CURA_MS + 100);
    const tipos = ev.map(e => e.ev.tipo);
    const bote = tipos.indexOf('bote');
    const chegou = tipos.indexOf('chegouNaVitima');
    expect(bote).toBeGreaterThan(-1);
    expect(chegou).toBeGreaterThan(bote);
    expect(tipos.lastIndexOf('curaAcabou')).toBeGreaterThan(chegou);
    // Mordeu do começo ao fim, uma a cada `MORDIDA_MS`.
    const comeu = 1000 + CURA_MS - ev[chegou].t;
    expect(tipos.filter(t => t === 'mordida').length).toBeGreaterThanOrEqual(Math.floor(comeu / MORDIDA_MS) - 1);
    expect(m.cura).toBeNull();
    expect(m.passo).not.toBe(BANQUETE);
  });

  it('chega no lugar marcado, olhando para ela, e não sai dali comendo', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 900; m.y = 200;
    comecarCura(m, 0, CURA_MS, 400, 300, -1);
    const ev = rodar(m, 0, 4_000);
    expect(ev.some(e => e.ev.tipo === 'chegouNaVitima')).toBe(true);
    expect(Math.round(m.x)).toBe(400);
    expect(Math.round(m.y)).toBe(300);
    expect(m.lado).toBe(-1);
    rodar(m, 4_016, 7_000);
    expect(Math.round(m.x)).toBe(400);
    expect(m.passo).toBe(BANQUETE);
  });

  it('longe demais: corre o que dá e pula no fim do tempo de correr', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 8; m.y = 300;
    comecarCura(m, 0, CURA_MS, 1100, 300, 1);
    const ev = rodar(m, 0, 5_000);
    const bote = ev.find(e => e.ev.tipo === 'bote')!;
    expect(bote.t).toBeLessThanOrEqual(CORRE_ATE_MS + 16);
    expect(ev.find(e => e.ev.tipo === 'chegouNaVitima')!.t).toBeLessThan(CURA_CHEGA_MS);
  });

  it('quem chega no meio do banquete dá o bote na hora', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 100; m.y = 300;
    comecarCura(m, 0, CURA_MS, 900, 300, 1);
    const ev = rodar(m, 5_000, 5_032);
    expect(ev.slice(0, 2).map(e => e.ev.tipo)).toEqual(['viu', 'bote']);
  });

  it('o roteiro: dança distraído até ver, encara parado, e só então corre', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 100; m.y = 300;
    // Imune desde 0; vê em 1900; corre em 2600.
    comecarCura(m, 0, CURA_MS, 900, 300, 1, 1_900, 2_600);
    const antes = rodar(m, 0, 1_880);
    expect(antes.some(e => e.ev.tipo === 'viu')).toBe(false);
    expect(emCura(m, 1_000)).toBe(true);
    const viu = rodar(m, 1_900, 2_580);
    expect(viu[0].ev.tipo).toBe('viu');
    const parado = m.x;
    expect(m.passo.id).toBe('garras');
    expect(m.lado).toBe(1);
    rodar(m, 2_600, 2_700);
    expect(m.passo).toBe(CORRIDA);
    expect(m.x).toBeGreaterThan(parado);
  });

  it('a cena pode mudar o alvo quando ele vê (ele andou dançando)', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 100; m.y = 300;
    comecarCura(m, 0, CURA_MS, 900, 300, 1, 100, 100);
    for (let t = 100; t < 6_000; t += 16) {
      for (const ev of mover(m, 16, t, 1200, 700, CAIXA, 0, rnd)) if (ev.tipo === 'viu') Object.assign(m.cura!, { x: 300, y: 320 });
      if (m.cura?.chegou) break;
    }
    expect(Math.round(m.x)).toBe(300);
    expect(Math.round(m.y)).toBe(320);
  });

  it('é imune do começo ao fim, e o banquete apaga a Fúria', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    comecarFuria(m, 0);
    comecarCura(m, 100, 100 + CURA_MS, 500, 300, 1);
    expect(naFuria(m, 200)).toBe(false);
    expect(emCura(m, 99)).toBe(false);
    expect(emCura(m, 100)).toBe(true);
    expect(emCura(m, 100 + CURA_MS - 1)).toBe(true);
    expect(emCura(m, 100 + CURA_MS)).toBe(false);
  });

  it('no bote, as garras (não o giro)', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    m.x = 100; m.y = 300;
    comecarCura(m, 0, CURA_MS, 160, 300, 1);
    rodar(m, 0, 32);
    expect(m.acao?.tipo).toBe('pulo');
    expect(quadroAtual(m, 40).qd.bracos).toBe('garra');
  });

  it('fugir larga o banquete', () => {
    const m = criarMovimento(1200, 700, CAIXA, 0, 0, rnd);
    comecarCura(m, 0, CURA_MS, 500, 300, 1);
    comecarFuga(m, 1200, CAIXA);
    expect(m.cura).toBeNull();
  });
});

describe('o banquete: a arte', () => {
  it('cada pose tem cor e parte nos mesmos pixels, e o mesmo tamanho', () => {
    for (const [pose, { cores, partes }] of Object.entries(VITIMA_POSES)) {
      expect(cores, pose).toHaveLength(18);
      expect(partes, pose).toHaveLength(18);
      cores.forEach((linha, j) => {
        expect(linha.length, `${pose} ${j}`).toBe(12);
        expect(partes[j].length, `${pose} ${j}`).toBe(12);
        [...linha].forEach((ch, i) => expect(ch === '.', `${pose} ${i},${j}`).toBe(partes[j][i] === '.'));
      });
    }
  });

  it('sem uma parte, os pixels dela somem — e só os dela', () => {
    const inteira = imagemDaVitima(77, 'susto');
    const semBraco = imagemDaVitima(77, 'susto', new Set(['bracoA'] as const));
    const doBraco = inteira.partes.filter(p => p === NUMERO_DA_PARTE_VITIMA.bracoA).length;
    expect(doBraco).toBeGreaterThan(5);
    expect(inteira.cores.filter(Boolean).length - semBraco.cores.filter(Boolean).length).toBe(doBraco);
    expect(soAParte(inteira, 'cabeca').cores.filter(Boolean).length)
      .toBe(inteira.partes.filter(p => p === NUMERO_DA_PARTE_VITIMA.cabeca).length);
  });

  it('deitada: gira 90°, cabeça para o lado pedido, sem perder pixel', () => {
    const emPe = imagemDaVitima(5, 'susto');
    const direita = girarImagem(emPe, 1);
    const esquerda = girarImagem(emPe, -1);
    expect([direita.largura, direita.altura]).toEqual([emPe.altura, emPe.largura]);
    expect(direita.cores.filter(Boolean).length).toBe(emPe.cores.filter(Boolean).length);
    const ladoDaCabeca = (img: typeof emPe) => {
      const xs = [...img.partes.keys()].filter(i => img.partes[i] === NUMERO_DA_PARTE_VITIMA.cabeca).map(i => i % img.largura);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(ladoDaCabeca(direita)).toBeGreaterThan(direita.largura / 2);
    expect(ladoDaCabeca(esquerda)).toBeLessThan(esquerda.largura / 2);
  });

  it('a vítima é uma grade certinha, e cada semente veste a pessoa de um jeito', () => {
    expect(new Set(VITIMA_LINHAS.map(l => l.length)).size).toBe(1);
    const a = imagemDaVitima(12345);
    expect(a.cores).toHaveLength(a.largura * a.altura);
    expect(a.cores.filter(Boolean).length).toBeGreaterThan(100);
    expect(imagemDaVitima(12345).cores).toEqual(a.cores);
    const roupas = new Set(Array.from({ length: 12 }, (_, i) => imagemDaVitima(i * 7919).cores.join()));
    expect(roupas.size).toBeGreaterThan(4);
  });

  it('correr e comer nunca saem no sorteio da dança', () => {
    expect(PASSOS).not.toContain(BANQUETE);
    expect(PASSOS).not.toContain(CORRIDA);
    for (let i = 0; i < 200; i++) {
      const p = proximoPasso(i % 2 ? 'giro' : 'moonwalk', i / 200);
      expect(['banquete', 'corrida']).not.toContain(p.id);
    }
  });
});

describe('o banquete: a vida', () => {
  it('a barra sobe aos poucos: nada enquanto ele corre, tudo no fim', () => {
    const em = Date.parse('2026-10-09T15:01:00Z');
    const r = base({
      vida: 400, cura_vida: 100,
      cura_em: new Date(em).toISOString(), cura_ate: new Date(em + CURA_MS).toISOString(),
    });
    expect(curando(r, em - 1)).toBe(false);
    expect(curando(r, em)).toBe(true);
    expect(faltaDaCura(r, em + 1_000)).toBe(100);
    const meio = em + CURA_CHEGA_MS + (CURA_MS - CURA_CHEGA_MS) / 2;
    expect(faltaDaCura(r, meio)).toBe(50);
    expect(faltaDaCura(r, em + CURA_MS)).toBe(0);
  });

  it('no ensaio: recupera 25% (no máximo o que falta), fica imune e estica o prazo', async () => {
    ensaioSoltarChefao(100, 3);
    const id = estadoChefao()!.id;
    expect(ensaioCurarChefao()).toBe('VIDA_CHEIA');
    await enviarLote(id, 12, 0);
    await enviarLote(id, 0, 4);
    const antes = estadoChefao()!;
    expect(antes.vida).toBe(76);
    expect(ensaioCurarChefao()).toBeNull();
    const r = estadoChefao()!;
    expect(r).toMatchObject({ vida: 100, cura_vida: 24 });
    expect(Date.parse(r.expira_em) - Date.parse(antes.expira_em)).toBe(CURA_MS);
    expect(ensaioCurarChefao()).toBe('JA_COMENDO');
    // Imune: o tiro não tira nada.
    expect((await enviarLote(id, 12, 0)).rodada?.vida).toBe(100);
  });

  it('o lote leva o que o detector mediu, e a lista do super_admin mostra', async () => {
    ensaioSoltarChefao(1000, 3);
    const id = estadoChefao()!.id;
    for (let i = 0; i < 3; i++) await enviarLote(id, 2, 0, { cliques: 12, suspeita: MOTIVO.ritmo });
    const { fichas } = await lerSuspeitos(id);
    const eu = fichas.find(f => f.usuario === 'voce')!;
    expect(eu).toMatchObject({ cliques: 36, lotes: 3, suspeitas: 3, motivos: MOTIVO.ritmo });
    expect(avaliarFicha(eu).nivel).toBe('suspeito');
  });

  it('com os robôs, o do autoclick acende na lista e os outros não', async () => {
    vi.useFakeTimers();
    try {
      ensaioSoltarChefao(100_000, 3);
      const id = estadoChefao()!.id;
      ensaioRobos(true);
      vi.advanceTimersByTime(700 * 30);
      ensaioRobos(false);
      const { fichas } = await lerSuspeitos(id);
      const niveis = new Map(fichas.map(f => [f.nome, avaliarFicha(f).nivel]));
      expect(niveis.get('Leandro Duarte')).toBe('suspeito');
      expect([...niveis].filter(([nome, n]) => nome !== 'Leandro Duarte' && n !== 'limpo')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('migration do chefão', () => {
  const SQL = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/migrations/20261009120000_chefao_rei_do_pop.sql'),
    'utf8',
  ).toLowerCase().replace(/\s+/g, ' ');

  function corpo(funcao: string): string {
    const inicio = SQL.indexOf(`create or replace function public.${funcao}(`);
    expect(inicio, funcao).toBeGreaterThan(-1);
    return SQL.slice(inicio, SQL.indexOf('$function$;', inicio));
  }

  it('o tiro trava a linha: só um tira a última gota', () => {
    const acertar = corpo('fn_chefao_acertar');
    expect(acertar).toContain('for update');
    expect(acertar).toContain('least(v_vida, v_a + v_h * 3)');
    expect(acertar).toContain("interval '600 milliseconds'");
    expect(acertar).toContain('least(greatest(coalesce(p_acertos, 0), 0), 12)');
  });

  it('nunca dois chefões na tela, e soltar é do super_admin', () => {
    expect(SQL).toMatch(/create unique index if not exists chefao_rodadas_um_ativo .* where situacao = 'ativo'/);
    expect(corpo('fn_chefao_soltar')).toContain('fn_user_is_super_admin()');
  });

  it('avisa no tópico da caça, com freio', () => {
    expect(corpo('fn_chefao_enviar')).toContain("realtime.send(p_estado, 'chefao', 'abobora:'");
    expect(corpo('fn_chefao_avisar')).toContain('fn_chefao_enviar(v_estado)');
    expect(corpo('fn_chefao_acertar')).toContain("interval '2 seconds'");
  });

  // Revisão de lançamento (09/10/2026): todo tiro passa pela mesma linha.
  describe('sob carga', () => {
    const acertar = () => corpo('fn_chefao_acertar');

    it('não espera na fila mais que 2 s (o lote falha, a conexão do app fica livre)', () => {
      expect(acertar()).toContain("set lock_timeout to '2s'");
    });

    it('decide o prazo, a contagem e o freio ANTES de pegar a trava', () => {
      const a = acertar();
      const trava = a.indexOf('for update');
      expect(trava).toBeGreaterThan(-1);
      expect(a.indexOf('v_agora < v_r.solta_em')).toBeLessThan(trava);
      expect(a.indexOf("interval '600 milliseconds'")).toBeLessThan(trava);
      expect(a.indexOf('from public.perfis')).toBeLessThan(trava);
      // E o freio de novo dentro da fila: dois lotes paralelos não passam juntos.
      expect(a.indexOf("interval '600 milliseconds'", trava)).toBeGreaterThan(trava);
    });

    it('o tiro escreve a linha disputada uma vez só e lê o estado uma vez', () => {
      const a = acertar().slice(acertar().indexOf('for update'));
      expect(a.match(/update public.chefao_rodadas/g)).toHaveLength(1);
      expect(a).toContain('avisado_em = case when v_avisar');
      expect(a).not.toContain('fn_chefao_avisar(');
      expect(a).toContain('fn_chefao_enviar(v_estado)');
    });

    it('o freio responde que os tiros não entraram', () => {
      expect(acertar()).toContain("'freio', true");
    });

    it('a fuga só avisa uma vez, mesmo com muitos chegando juntos', () => {
      expect(acertar()).toContain("where id = v_r.id and situacao = 'ativo'; if found then perform public.fn_chefao_avisar");
    });
  });

  it('as peças internas ficam fechadas ao app', () => {
    for (const f of ['fn_chefao_estado(bigint)', 'fn_chefao_placar(bigint, uuid)', 'fn_chefao_avisar(bigint)', 'fn_chefao_enviar(jsonb)']) {
      expect(SQL).toContain(`revoke all on function public.${f} from public, anon, authenticated`);
    }
  });
});

describe('as vozes em arquivo', () => {
  it('corta cada grito do silêncio em volta e iguala o volume', async () => {
    const { recortarTrechos } = await import('./sons');
    const taxa = 8000;
    const sinal = new Float32Array(taxa * 2);
    // Um grito alto de 0,3 s em 0,2 s e um baixinho de 0,2 s em 1,2 s.
    for (let i = 0; i < taxa * 0.3; i++) sinal[taxa * 0.2 + i] = Math.sin(i / 3) * 0.8;
    for (let i = 0; i < taxa * 0.2; i++) sinal[taxa * 1.2 + i] = Math.sin(i / 3) * 0.2;
    const trechos = recortarTrechos(sinal, taxa);
    expect(trechos).toHaveLength(2);
    expect(trechos[0].ini).toBeCloseTo(0.16, 1);
    expect(trechos[1].ini).toBeCloseTo(1.16, 1);
    // O baixinho sobe mais: os dois chegam ao mesmo pico.
    expect(trechos[1].ganho).toBeGreaterThan(trechos[0].ganho * 3);
  });

  it('a pasta do áudio baixado fica fora do repositório (só no localhost)', () => {
    const ignorados = fs.readFileSync(path.resolve(__dirname, '../../../.gitignore'), 'utf8');
    expect(ignorados).toMatch(/^public\/sons\/chefao\/$/m);
  });
});

describe('a contagem antes de ele chegar', () => {
  it('solto com espera: está chegando até a hora, e tiro na contagem não vale', async () => {
    const { chefaoChegando, ensaioPularContagem } = await import('./chefao');
    ensaioSoltarChefao(50, 3, 60);
    const r = estadoChefao()!;
    expect(chefaoChegando(r, Date.now())).toBe(true);
    expect(chefaoNaTela(r, Date.now())).toBe(true);
    // O prazo conta da chegada, não do clique.
    expect(Date.parse(r.expira_em) - Date.parse(r.solta_em)).toBe(3 * 60_000);
    const tiro = await enviarLote(r.id, 5, 0);
    expect(tiro.rodada?.vida).toBe(50);
    ensaioPularContagem();
    expect(chefaoChegando(estadoChefao(), Date.now())).toBe(false);
    expect((await enviarLote(r.id, 5, 0)).rodada?.vida).toBe(45);
  });

  it('o banco solta com 1 min de espera e recusa tiro antes da chegada', () => {
    const SQL = fs.readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/20261009120000_chefao_rei_do_pop.sql'), 'utf8',
    ).toLowerCase().replace(/\s+/g, ' ');
    expect(SQL).toContain('p_espera_s integer default 60');
    expect(SQL).toContain('v_agora < v_r.solta_em');
    expect(SQL).toContain('drop function if exists public.fn_chefao_soltar(integer, integer);');
  });
});

describe('o volume do chefão', () => {
  it('o operador ouve a 12%, e o hee-hee e o grito têm pausa longa', async () => {
    const { VOLUME_DO_OPERADOR, PAUSA_HEE_HEE_MS, PAUSA_GRITO_MS, INICIO_DA_TRILHA_S } = await import('./sons');
    expect(VOLUME_DO_OPERADOR).toBe(0.12);
    expect(PAUSA_HEE_HEE_MS).toBeGreaterThanOrEqual(3_000);
    expect(PAUSA_GRITO_MS).toBeGreaterThanOrEqual(5_000);
    expect(INICIO_DA_TRILHA_S).toBeGreaterThan(20);
  });
});

describe('todo som da caça vai a 12% com o chefão na tela (operador)', () => {
  /** Um AudioContext de mentira que guarda o volume de cada envelope. */
  class Param {
    value = 0;
    valores: number[] = [];
    setValueAtTime(v: number) { this.valores.push(v); }
    exponentialRampToValueAtTime(v: number) { this.valores.push(v); }
    linearRampToValueAtTime(v: number) { this.valores.push(v); }
  }
  const ganhos: Param[] = [];
  const no = () => ({ connect() {}, start() {}, stop() {} });
  class ContextoFalso {
    currentTime = 0; sampleRate = 8000; state = 'running'; destination = {};
    createGain() { const g = { ...no(), gain: new Param() }; ganhos.push(g.gain); return g; }
    createOscillator() { return { ...no(), type: '', frequency: new Param() }; }
    createBiquadFilter() { return { ...no(), type: '', Q: new Param(), frequency: new Param() }; }
    createBufferSource() { return { ...no(), buffer: null as unknown, playbackRate: new Param() }; }
    createBuffer(_c: number, n: number, sr: number) { return { sampleRate: sr, getChannelData: () => new Float32Array(n) }; }
    resume() { return Promise.resolve(); }
  }

  it('o tiro, o ricochete, o hee-hee, a chegada e os sons da morte, todos a 12%; super_admin a 100%; e volta ao sair', async () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = ContextoFalso;
    const sons = await import('./sons');
    const pico = (f: () => void) => { ganhos.length = 0; f(); return Math.max(...ganhos.flatMap(g => g.valores)); };
    const tocar: Record<string, () => void> = {
      tiro: sons.somTiro, ricochete: sons.somRicochete, baque: () => sons.somBaque(1), crava: sons.somCrava,
      heeHee: () => sons.somHeeHee(1, true), chegada: sons.somChefaoChega, acerto: () => sons.somAcertoChefao(true),
    };
    const sem = Object.fromEntries(Object.entries(tocar).map(([n, f]) => [n, pico(f)]));
    const desfazer = sons.volumeDoChefao(false);
    for (const [n, f] of Object.entries(tocar)) {
      // Os sons próprios do chefão já tocam a 12% mesmo fora da cena: comparamos com 100% «puro».
      const esperado = n === 'heeHee' || n === 'chegada' || n === 'acerto' ? sem[n] : sem[n] * sons.VOLUME_DO_OPERADOR;
      expect(pico(f), n).toBeCloseTo(esperado, 6);
    }
    expect(pico(sons.somTiro) / sem.tiro).toBeCloseTo(0.12, 6);
    desfazer();
    expect(pico(sons.somTiro)).toBeCloseTo(sem.tiro, 6);
    // Super_admin: inteiro.
    const desfazerAdmin = sons.volumeDoChefao(true);
    expect(pico(sons.somTiro)).toBeCloseTo(sem.tiro, 6);
    expect(pico(() => sons.somHeeHee(1, true)) / sem.heeHee).toBeCloseTo(1 / sons.VOLUME_DO_OPERADOR, 4);
    desfazerAdmin();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });
});

describe('esconder o chefão', () => {
  it('vale por pessoa e some quando ela liga de novo', async () => {
    const { chefaoDesligado, desligarChefao } = await import('./chefao');
    expect(chefaoDesligado('ana')).toBe(false);
    desligarChefao('ana', true);
    expect(chefaoDesligado('ana')).toBe(true);
    expect(chefaoDesligado('bia')).toBe(false);
    desligarChefao('ana', false);
    expect(chefaoDesligado('ana')).toBe(false);
    expect(chefaoDesligado(null)).toBe(false);
  });
});

describe('a vida cresce com quem entra', () => {
  it('cada caçador novo soma vida no primeiro tiro, o mesmo não soma de novo', async () => {
    ensaioSoltarChefao(100, 3, 0, 50);
    const id = estadoChefao()!.id;
    const r1 = await enviarLote(id, 2, 0);
    expect(r1.rodada?.vida_max).toBe(150);
    expect(r1.rodada?.vida).toBe(148);
    const r2 = await enviarLote(id, 2, 0);
    expect(r2.rodada?.vida_max).toBe(150);
    expect(r2.rodada?.vida).toBe(146);
  });

  it('os níveis e a conta por pessoa', async () => {
    const { DIFICULDADES, vidaCom } = await import('./chefao');
    const medio = DIFICULDADES.find(d => d.nome === 'Médio')!;
    expect(vidaCom(medio, 40)).toBe(medio.base + 40 * medio.porPessoa);
    expect(DIFICULDADES.map(d => d.porPessoa)).toEqual([...DIFICULDADES.map(d => d.porPessoa)].sort((a, b) => a - b));
  });

  it('o banco soma a vida do caçador novo e aceita chefão grande', () => {
    const SQL = fs.readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/20261009120000_chefao_rei_do_pop.sql'), 'utf8',
    ).toLowerCase().replace(/\s+/g, ' ');
    expect(SQL).toContain('v_novo := not found');
    expect(SQL).toContain('vida_max = vida_max + v_extra');
    expect(SQL).toContain('check (vida_max between 10 and 200000)');
  });
});
