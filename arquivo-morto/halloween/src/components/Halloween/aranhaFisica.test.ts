import { describe, expect, it } from 'vitest';
import {
  FISICA, alvoNoFio, anguloNoFio, arremesso, caminhoDoFio, comprimentoAoSoltar, criarFio, distancia, estourou,
  fioQueSolta, normalizarAngulo, passoDoFio, passoLivre, passoNaMao, passoNoFio, saiuDaTela, tremerFio, velocidadeDaMao,
  type CorpoLivre,
} from './aranhaFisica';

const ANCORA = { x: 500, y: 40 };

describe('aranha no fio', () => {
  it('solta de lado, balança e para pendurada embaixo da âncora', () => {
    const c = { x: ANCORA.x + 150, y: ANCORA.y + 40, vx: 0, vy: 0 };
    let cruzou = 0, ladoAntes = Math.sign(c.x - ANCORA.x);
    for (let i = 0; i < 60 * 30; i++) {
      passoNoFio(c, ANCORA, 100, 0.5);
      const lado = Math.sign(c.x - ANCORA.x);
      if (lado && lado !== ladoAntes) { cruzou++; ladoAntes = lado; }
    }
    expect(cruzou).toBeGreaterThan(3); // balançou de um lado para o outro
    // Saiu de 150 px de lado; em 15 s sobra um resto de balanço de poucos px.
    expect(Math.abs(c.x - ANCORA.x)).toBeLessThan(5);
    // Parada: o peso estica o fio só um pouco além do comprimento.
    const esticado = c.y - ANCORA.y - 100;
    expect(esticado).toBeGreaterThan(0);
    expect(esticado).toBeLessThan(6);
  });

  it('fio frouxo não empurra: perto da âncora, ela só cai', () => {
    const c = { x: ANCORA.x, y: ANCORA.y + 10, vx: 0, vy: 0 };
    passoNoFio(c, ANCORA, 100, 1);
    expect(c.vy).toBeGreaterThan(0);
  });

  it('solto esticado, o fio cede: quica um pouco e balança, sem estilingue', () => {
    const c = { x: ANCORA.x - 150, y: ANCORA.y + 200, vx: 0, vy: 0 }; // 250 px, fio de 100
    const L = comprimentoAoSoltar(c, ANCORA, 100);
    expect(L).toBeCloseTo(250 - FISICA.folga);
    let maisAlto = c.y;
    for (let i = 0; i < 240; i++) { passoNoFio(c, ANCORA, L, 0.5); maisAlto = Math.min(maisAlto, c.y); }
    expect(maisAlto).toBeGreaterThan(ANCORA.y); // não passa por cima da âncora
  });

  it('solto frouxo, o fio não muda', () => {
    expect(comprimentoAoSoltar({ x: ANCORA.x, y: ANCORA.y + 60 }, ANCORA, 100)).toBe(100);
  });

  it('estoura só depois do limite', () => {
    const perto = { x: ANCORA.x, y: ANCORA.y + 100 + FISICA.limite - 1 };
    const longe = { x: ANCORA.x, y: ANCORA.y + 100 + FISICA.limite + 1 };
    expect(estourou(perto, ANCORA, 100)).toBe(false);
    expect(estourou(longe, ANCORA, 100)).toBe(true);
  });

  it('a cabeça aponta para a âncora', () => {
    expect(anguloNoFio({ x: ANCORA.x, y: ANCORA.y + 100 }, ANCORA)).toBeCloseTo(0);
    // À direita da âncora, inclina no sentido anti-horário (negativo no CSS).
    expect(anguloNoFio({ x: ANCORA.x + 100, y: ANCORA.y + 100 }, ANCORA)).toBeCloseTo(-45);
    expect(anguloNoFio({ x: ANCORA.x - 100, y: ANCORA.y + 100 }, ANCORA)).toBeCloseTo(45);
  });
});

describe('aranha solta', () => {
  const corpo = (o: Partial<CorpoLivre> = {}): CorpoLivre => ({ x: 300, y: 300, vx: 0, vy: 0, rot: 0, vr: 0, ...o });

  it('jogada para cima, sobe, para e volta a cair', () => {
    const c = corpo({ vy: -20 });
    let maisAlto = c.y;
    for (let i = 0; i < 120; i++) { passoLivre(c, 1000, 1); maisAlto = Math.min(maisAlto, c.y); }
    expect(maisAlto).toBeLessThan(300 - 200);
    expect(c.vy).toBeGreaterThan(0);
  });

  it('bate na lateral e volta, mais devagar', () => {
    const c = corpo({ x: 990, vx: 20, vr: 10 });
    passoLivre(c, 1000, 1);
    expect(c.x).toBeLessThanOrEqual(1000 - FISICA.raio);
    expect(c.vx).toBeLessThan(0);
    expect(Math.abs(c.vx)).toBeLessThan(20);
    expect(c.vr).toBeLessThan(0);
  });

  it('gira enquanto cai', () => {
    const c = corpo({ vr: 8 });
    passoLivre(c, 1000, 1);
    expect(c.rot).toBeGreaterThan(7);
  });

  it('perdeu só quando passou da borda de baixo', () => {
    expect(saiuDaTela({ x: 0, y: 820 }, 800)).toBe(false);
    expect(saiuDaTela({ x: 0, y: 841 }, 800)).toBe(true);
  });
});

describe('a mão', () => {
  it('mede a velocidade dos últimos ~60 ms em px por quadro', () => {
    const quadro = 1000 / 60;
    const amostras = [0, 1, 2, 3, 4, 5].map(i => ({ x: i * 10, y: -i * 5, t: i * quadro }));
    const v = velocidadeDaMao(amostras, 5 * quadro);
    expect(v.vx).toBeCloseTo(10);
    expect(v.vy).toBeCloseTo(-5);
  });

  it('mão parada antes de largar = largou parada', () => {
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 50, y: 0, t: 16 }];
    expect(velocidadeDaMao(amostras, 400)).toEqual({ vx: 0, vy: 0 });
  });

  it('arremesso tem teto', () => {
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 2000, y: 0, t: 70 }];
    const v = velocidadeDaMao(amostras, 70);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(FISICA.velocidadeMaxima);
  });

  it('ângulo volta para (-180, 180]', () => {
    expect(normalizarAngulo(720 + 30)).toBe(30);
    expect(normalizarAngulo(-200)).toBe(160);
    expect(normalizarAngulo(180)).toBe(180);
  });
});

describe('puxando o fio', () => {
  it('até o comprimento, ela vai para onde a mão está', () => {
    const mao = { x: ANCORA.x + 30, y: ANCORA.y + 60 };
    expect(alvoNoFio(ANCORA, mao, 100)).toEqual(mao);
  });

  it('além dele, o fio segura: estica menos do que a mão puxou, na mesma direção', () => {
    const mao = { x: ANCORA.x, y: ANCORA.y + 100 + 300 };
    const alvo = alvoNoFio(ANCORA, mao, 100);
    expect(alvo.x).toBeCloseTo(ANCORA.x);
    const estica = alvo.y - ANCORA.y - 100;
    expect(estica).toBeGreaterThan(150);
    expect(estica).toBeLessThan(300);
  });

  it('estoura só com a mão bem além do limite — o fio estica bastante antes', () => {
    // Mão no limite: ainda não estourou.
    const noLimite = alvoNoFio(ANCORA, { x: ANCORA.x, y: ANCORA.y + 100 + FISICA.limite }, 100);
    expect(estourou(noLimite, ANCORA, 100)).toBe(false);
    // Bem além: estoura.
    const longe = alvoNoFio(ANCORA, { x: ANCORA.x, y: ANCORA.y + 100 + FISICA.limite * 2 }, 100);
    expect(estourou(longe, ANCORA, 100)).toBe(true);
  });
});

describe('ela solta fio enquanto é puxada', () => {
  it('puxando devagar, o fio cresce junto e quase não estica', () => {
    let L = 100;
    let y = ANCORA.y + 100;
    for (let i = 0; i < 60; i++) { y += 2; L = fioQueSolta(ANCORA, { x: ANCORA.x, y }, L, 1); }
    const estica = y - ANCORA.y - L;
    expect(L).toBeGreaterThan(200);
    expect(estica).toBeLessThan(25);
  });

  it('o fio solto não volta: trazer a aranha para perto da teia deixa ele comprido', () => {
    let L = 100;
    for (let i = 0; i < 120; i++) L = fioQueSolta(ANCORA, { x: ANCORA.x, y: ANCORA.y + 260 }, L, 1);
    const longe = L;
    expect(longe).toBeGreaterThan(240);
    L = fioQueSolta(ANCORA, { x: ANCORA.x, y: ANCORA.y + 30 }, L, 1);
    expect(L).toBe(longe);
  });

  it('num tranco, solta no máximo um tanto por quadro — o resto estica', () => {
    const L = fioQueSolta(ANCORA, { x: ANCORA.x, y: ANCORA.y + 100 + 600 }, 100, 1);
    expect(L).toBe(100 + FISICA.soltaMaxima);
  });

  it('acabou o fio: daí em diante só estica', () => {
    let L = 100;
    for (let i = 0; i < 600; i++) L = fioQueSolta(ANCORA, { x: ANCORA.x, y: ANCORA.y + 900 }, L, 1);
    expect(L).toBe(FISICA.comprimentoMaximo);
  });
});

describe('o peso na mão', () => {
  it('a mão anda de uma vez; ela vem atrás, chega e para pendendo um pouco abaixo', () => {
    const c = { x: 0, y: 0, vx: 0, vy: 0 };
    const mao = { x: 200, y: 0 };
    passoNaMao(c, mao, 1);
    expect(c.x).toBeLessThan(60); // não pula para a mão
    for (let i = 0; i < 240; i++) passoNaMao(c, mao, 0.5);
    expect(c.x).toBeCloseTo(200, 0);
    expect(c.y).toBeGreaterThan(1);
    expect(c.y).toBeLessThan(6);
  });

  it('o arremesso é uma parte da velocidade dela, com teto', () => {
    expect(arremesso({ x: 0, y: 0, vx: 0, vy: -10 }).vy).toBeCloseTo(-10 * FISICA.lancamento);
    const forte = arremesso({ x: 0, y: 0, vx: 0, vy: -200 });
    expect(Math.hypot(forte.vx, forte.vy)).toBeCloseTo(FISICA.lancamentoMaximo);
  });

  it('jogar para cima devagar sobe pouco', () => {
    // Mão subindo devagar (~6 px/quadro): ela sobe menos de 40 px depois de largada.
    const v = arremesso({ x: 0, y: 0, vx: 0, vy: -6 });
    const c: CorpoLivre = { x: 300, y: 300, vx: v.vx, vy: v.vy, rot: 0, vr: 0 };
    let maisAlto = c.y;
    for (let i = 0; i < 120; i++) { passoLivre(c, 1000, 1); maisAlto = Math.min(maisAlto, c.y); }
    expect(300 - maisAlto).toBeLessThan(40);
  });
});

describe('o fio desenhado', () => {
  const B = { x: ANCORA.x, y: ANCORA.y + 100 };

  it('frouxo, faz barriga abaixo da reta entre as pontas', () => {
    const perto = { x: ANCORA.x + 60, y: ANCORA.y };
    const f = criarFio(ANCORA, perto, 140);
    for (let i = 0; i < 400; i++) passoDoFio(f, ANCORA, perto, 0.5);
    const meio = f.nos[Math.floor(f.nos.length / 2)];
    expect(meio.y).toBeGreaterThan(ANCORA.y + 20);
    // As pontas ficam presas.
    expect(f.nos[0]).toMatchObject(ANCORA);
    expect(f.nos[f.nos.length - 1]).toMatchObject(perto);
  });

  it('esticado além do repouso, fica reto', () => {
    const longe = { x: ANCORA.x + 150, y: ANCORA.y + 150 };
    const f = criarFio(ANCORA, longe, 100);
    for (let i = 0; i < 200; i++) passoDoFio(f, ANCORA, longe, 0.5);
    for (const n of f.nos) {
      // Distância de cada nó à reta y = x (deslocada para a âncora).
      const desvio = Math.abs((n.x - ANCORA.x) - (n.y - ANCORA.y)) / Math.SQRT2;
      expect(desvio).toBeLessThan(2);
    }
  });

  it('com a ponta solta, pende embaixo da âncora sem passar do comprimento', () => {
    const f = criarFio(ANCORA, { x: ANCORA.x + 80, y: ANCORA.y }, 80);
    for (let i = 0; i < 1200; i++) passoDoFio(f, ANCORA, null, 0.5);
    const ponta = f.nos[f.nos.length - 1];
    expect(Math.abs(ponta.x - ANCORA.x)).toBeLessThan(6);
    expect(distancia(ponta, ANCORA)).toBeLessThan(80 * 1.08);
    expect(ponta.y).toBeGreaterThan(ANCORA.y + 60);
  });

  it('treme só perto de estourar', () => {
    const f = criarFio(ANCORA, B, 100);
    const antes = f.nos.map(n => ({ ...n }));
    tremerFio(f, 0.5, 100);
    expect(f.nos).toEqual(antes);
    tremerFio(f, 0.95, 100);
    expect(f.nos.some((n, i) => Math.abs(n.x - antes[i].x) > 0.01)).toBe(true);
  });

  it('vira um caminho SVG que começa na âncora e termina na ponta', () => {
    const f = criarFio(ANCORA, B, 100, 5);
    const d = caminhoDoFio(f.nos);
    expect(d.startsWith(`M${ANCORA.x}.0 ${ANCORA.y}.0`)).toBe(true);
    expect(d.endsWith(`L${B.x}.0 ${B.y}.0`)).toBe(true);
  });
});
