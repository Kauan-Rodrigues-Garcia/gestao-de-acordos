/**
 * autoclick.test.ts — as pistas de autoclick: gente de verdade passa limpa,
 * máquina acende.
 */
import { describe, expect, it } from 'vitest';
import {
  MOTIVO, analisarCliques, avaliarFicha, criarDetector, normalizarFichas, ordenarFichas,
  type Clique, type FichaDeCliques,
} from './autoclick';

/** Um gerador de sorteio fixo: o teste não pisca. */
function sorteio(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31; };
}

/** `n` cliques a partir de `intervalo(i)`, com o resto vindo de `extra`. */
function cliques(n: number, intervalo: (i: number) => number, extra: (i: number) => Partial<Clique> = () => ({})): Clique[] {
  let t = 1_000;
  return Array.from({ length: n }, (_, i) => {
    if (i > 0) t += intervalo(i);
    return { t, x: 300 + i, y: 200, confiavel: true, segurou: 80 + (i % 5) * 9, ...extra(i) };
  });
}

describe('analisarCliques', () => {
  it('gente clicando rápido, com a mão tremendo e mexendo o mouse: nada', () => {
    const rnd = sorteio(7);
    const humano = cliques(30, () => 110 + (rnd() - 0.5) * 70, i => ({ x: 300 + Math.round(rnd() * 40), segurou: 60 + rnd() * 50 + i % 3 }));
    expect(analisarCliques(humano)).toBe(0);
  });

  it('o autoclick de relógio: ritmo de máquina', () => {
    const rnd = sorteio(3);
    const maquina = cliques(20, () => 100 + (rnd() - 0.5) * 2);
    expect(analisarCliques(maquina) & MOTIVO.ritmo).toBe(MOTIVO.ritmo);
  });

  it('rajada curta demais não basta para julgar o ritmo', () => {
    expect(analisarCliques(cliques(10, () => 100)) & MOTIVO.ritmo).toBe(0);
  });

  it('o ritmo é da rajada de agora: uma pausa recomeça a conta', () => {
    const rnd = sorteio(11);
    // Rajada humana, pausa, e depois só 8 cliques regulares: pouco para julgar.
    const xs = [...cliques(20, () => 110 + (rnd() - 0.5) * 80), ...cliques(8, () => 100).map(c => ({ ...c, t: c.t + 10_000 }))];
    expect(analisarCliques(xs) & MOTIVO.ritmo).toBe(0);
  });

  it('mais de 20 por segundo, sustentado: rápido demais', () => {
    const rnd = sorteio(5);
    expect(analisarCliques(cliques(40, () => 45 + rnd() * 10)) & MOTIVO.rapido).toBe(MOTIVO.rapido);
    expect(analisarCliques(cliques(40, () => 80 + rnd() * 40)) & MOTIVO.rapido).toBe(0);
  });

  it('clique de script', () => {
    expect(analisarCliques(cliques(3, () => 300, i => ({ confiavel: i !== 1 })))).toBe(MOTIVO.sintetico);
  });

  it('o botão volta sempre no mesmo tempo (pista fraca)', () => {
    const rnd = sorteio(9);
    const xs = cliques(14, () => 150 + rnd() * 120, () => ({ segurou: 5 }));
    expect(analisarCliques(xs)).toBe(MOTIVO.seguro);
  });

  it('o mouse parado no mesmo pixel por muitos cliques (pista fraca)', () => {
    const rnd = sorteio(13);
    const xs = cliques(16, () => 150 + rnd() * 120, () => ({ x: 500, y: 300 }));
    expect(analisarCliques(xs)).toBe(MOTIVO.parado);
  });
});

const ficha = (p: Partial<FichaDeCliques> = {}): FichaDeCliques => ({
  usuario: 'u', nome: 'Ana', dano: 100, acertos: 80, headshots: 5, cliques: 300, lotes: 60, lotes_no_teto: 0,
  suspeitas: 0, motivos: 0, segundos: 90, ...p,
});

describe('avaliarFicha', () => {
  it('sem pista: ok, e mede os cliques por segundo', () => {
    expect(avaliarFicha(ficha())).toEqual({ nivel: 'limpo', motivos: [], cps: 300 / 90 });
  });

  it('uma ou duas suspeitas, ou só pista fraca: atenção', () => {
    expect(avaliarFicha(ficha({ suspeitas: 2, motivos: MOTIVO.ritmo })).nivel).toBe('atencao');
    expect(avaliarFicha(ficha({ motivos: MOTIVO.parado })).nivel).toBe('atencao');
  });

  it('três lotes com pista forte, script, ou metade dos lotes no teto: suspeito', () => {
    expect(avaliarFicha(ficha({ suspeitas: 3, motivos: MOTIVO.ritmo })).nivel).toBe('suspeito');
    expect(avaliarFicha(ficha({ suspeitas: 1, motivos: MOTIVO.sintetico })).nivel).toBe('suspeito');
    const teto = avaliarFicha(ficha({ lotes: 20, lotes_no_teto: 12 }));
    expect(teto.nivel).toBe('suspeito');
    expect(teto.motivos).toContain('12 de 20 lotes no teto');
  });

  it('teto em poucos lotes ainda não condena (pode ser um lote que juntou com a rede lenta)', () => {
    expect(avaliarFicha(ficha({ lotes: 4, lotes_no_teto: 3 })).nivel).toBe('atencao');
  });

  it('os motivos em palavras', () => {
    expect(avaliarFicha(ficha({ motivos: MOTIVO.ritmo | MOTIVO.parado })).motivos).toEqual(['ritmo de máquina', 'mouse parado']);
  });
});

describe('a lista', () => {
  it('normaliza o que vem do banco e descarta lixo', () => {
    expect(normalizarFichas([{ usuario: 'a', nome: ' ', cliques: '12', segundos: 0 }, null, { nome: 'sem usuário' }])).toEqual([
      { usuario: 'a', nome: 'Alguém', dano: 0, acertos: 0, headshots: 0, cliques: 12, lotes: 0, lotes_no_teto: 0, suspeitas: 0, motivos: 0, segundos: 1 },
    ]);
    expect(normalizarFichas('x')).toEqual([]);
  });

  it('suspeitos primeiro, depois pista, depois o resto; cada grupo pelo dano', () => {
    const ordem = ordenarFichas([
      ficha({ usuario: 'limpo-grande', dano: 900 }),
      ficha({ usuario: 'pista', dano: 10, motivos: MOTIVO.parado }),
      ficha({ usuario: 'suspeito', dano: 5, suspeitas: 4, motivos: MOTIVO.ritmo }),
      ficha({ usuario: 'limpo-pequeno', dano: 1 }),
    ]).map(l => l.ficha.usuario);
    expect(ordem).toEqual(['suspeito', 'pista', 'limpo-grande', 'limpo-pequeno']);
  });
});

describe('o detector na tela', () => {
  /** Um `window` de mentira: guarda os ouvintes para o teste disparar. */
  function alvoFalso() {
    const ouvintes = new Map<string, (e: Event) => void>();
    return {
      ouvintes,
      addEventListener: (tipo: string, f: (e: Event) => void) => { ouvintes.set(tipo, f); },
      removeEventListener: (tipo: string) => { ouvintes.delete(tipo); },
    };
  }
  const evento = (p: Partial<PointerEvent>) => ({ button: 0, pointerId: 1, isTrusted: true, clientX: 10, clientY: 10, ...p }) as unknown as Event;

  it('conta os cliques, mede o botão e colhe com o lote', () => {
    const a = alvoFalso();
    const d = criarDetector(a as unknown as Window);
    for (let i = 0; i < 20; i++) {
      a.ouvintes.get('pointerdown')!(evento({ timeStamp: 1000 + i * 100 }));
      a.ouvintes.get('pointerup')!(evento({ timeStamp: 1000 + i * 100 + 4 }));
    }
    // Clique do botão direito não conta.
    a.ouvintes.get('pointerdown')!(evento({ timeStamp: 5000, button: 2 }));
    const c = d.colher();
    expect(c.cliques).toBe(20);
    expect(c.suspeita & MOTIVO.ritmo).toBe(MOTIVO.ritmo);
    expect(c.suspeita & MOTIVO.seguro).toBe(MOTIVO.seguro);
    expect(c.suspeita & MOTIVO.parado).toBe(MOTIVO.parado);
    expect(d.colher().cliques).toBe(0);
  });

  it('o lote freado devolve o que colheu, e o próximo leva junto', () => {
    const a = alvoFalso();
    const d = criarDetector(a as unknown as Window);
    a.ouvintes.get('pointerdown')!(evento({ timeStamp: 1, isTrusted: false }));
    const c = d.colher();
    expect(c).toEqual({ cliques: 1, suspeita: MOTIVO.sintetico });
    d.devolver(c);
    a.ouvintes.get('pointerdown')!(evento({ timeStamp: 50_000 }));
    expect(d.colher()).toEqual({ cliques: 2, suspeita: MOTIVO.sintetico });
  });

  it('parar tira os ouvintes', () => {
    const a = alvoFalso();
    criarDetector(a as unknown as Window).parar();
    expect(a.ouvintes.size).toBe(0);
  });
});
