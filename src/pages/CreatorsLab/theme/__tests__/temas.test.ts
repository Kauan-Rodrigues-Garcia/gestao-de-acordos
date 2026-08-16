/**
 * Os dois temas precisam ser dois MUNDOS, não duas paletas.
 * ─────────────────────────────────────────────────────────────────────────────
 * A primeira versão do Lab errou exatamente nisso: Cyberpunk era ciano e
 * magenta sobre quase-preto, Arcade era amarelo e vermelho sobre roxo, e os
 * dois tinham a mesma grade, a mesma varredura e o mesmo brilho difuso. Trocar
 * de realidade mudava o texto e quase mais nada.
 *
 * Os testes aqui trancam a regra que ficou: cada tema tem uma cor DOMINANTE
 * que o outro não usa, e a diferença não é só de cor — é de forma, de tempo e
 * de vocabulário.
 */
import { describe, it, expect } from 'vitest';
import { LISTA_TEMAS, TEMAS, variaveisCss, type TokensTema } from '../themes';

const CYBER  = TEMAS.cyberpunk;
const ARCADE = TEMAS.arcade;

/** Matiz de um `#rrggbb`, em graus. */
function matiz(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;

  let h: number;
  if (max === r)      h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;

  return (h * 60 + 360) % 360;
}

/** Saturação (HSL), de 0 a 1. */
function saturacao(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Distância entre matizes, indo pelo caminho mais curto do círculo. */
function distanciaMatiz(a: string, b: string): number {
  const d = Math.abs(matiz(a) - matiz(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** Amarelo de sinalização: a faixa de matiz reservada ao Cyberpunk. */
const ehAmarelo = (hex: string) =>
  matiz(hex) >= 40 && matiz(hex) <= 70 && saturacao(hex) > 0.5;

describe('as duas realidades não se confundem', () => {
  it('as cores dominantes ficam longe uma da outra', () => {
    expect(distanciaMatiz(CYBER.cores.primaria, ARCADE.cores.primaria))
      .toBeGreaterThan(90);
  });

  /**
   * O amarelo é a assinatura do Cyberpunk. Se alguém acrescentar amarelo ao
   * Arcade, os dois voltam a se parecer — e é justamente o que aconteceu na
   * primeira versão, em que o Arcade era amarelo.
   */
  it('amarelo é exclusivo do Cyberpunk', () => {
    expect(ehAmarelo(CYBER.cores.primaria)).toBe(true);
    for (const [nome, cor] of Object.entries(ARCADE.cores)) {
      if (!cor.startsWith('#')) continue;
      expect(ehAmarelo(cor), `${nome} do Arcade está amarelo: ${cor}`).toBe(false);
    }
  });

  it('os fundos são mundos diferentes, não o mesmo escuro', () => {
    expect(CYBER.cores.fundo).not.toBe(ARCADE.cores.fundo);
    // O Cyberpunk é preto de verdade; o Arcade é roxo profundo.
    expect(CYBER.cores.fundo).toBe('#000000');
    expect(saturacao(ARCADE.cores.fundo)).toBeGreaterThan(0.3);
  });

  it('nenhuma cor é usada, igual, pelos dois', () => {
    const doCyber = new Set(Object.values(CYBER.cores).filter(c => c.startsWith('#')));
    for (const cor of Object.values(ARCADE.cores)) {
      if (!cor.startsWith('#')) continue;
      expect(doCyber.has(cor), `cor repetida nos dois temas: ${cor}`).toBe(false);
    }
  });

  /** Cor é metade. Se a forma e o tempo fossem iguais, seria só um filtro. */
  it('a diferença também é de forma e de tempo', () => {
    expect(CYBER.bordaLargura).not.toBe(ARCADE.bordaLargura);
    expect(CYBER.sombra).not.toBe(ARCADE.sombra);
    expect(CYBER.textura).not.toBe(ARCADE.textura);
    expect(CYBER.cursor).not.toBe(ARCADE.cursor);
    expect(CYBER.fontes.display).not.toBe(ARCADE.fontes.display);
    // O Arcade estala, o Cyberpunk desliza.
    expect(ARCADE.duracao).toBeLessThan(CYBER.duracao);
  });

  it('o vocabulário nunca coincide', () => {
    const chaves = Object.keys(CYBER.vocab) as (keyof TokensTema['vocab'])[];
    for (const chave of chaves) {
      const a = CYBER.vocab[chave];
      const b = ARCADE.vocab[chave];
      if (typeof a === 'function' || typeof b === 'function') continue;
      expect(a, `vocábulo repetido em "${chave}"`).not.toBe(b);
    }
  });
});

describe('integridade dos tokens', () => {
  it('todo tema tem o vocabulário completo, inclusive o fliperama', () => {
    for (const t of LISTA_TEMAS) {
      expect(t.vocab.fliperama, `${t.id} sem rótulo de fliperama`).toBeTruthy();
      for (const [chave, valor] of Object.entries(t.vocab)) {
        expect(valor, `${t.id}.vocab.${chave} vazio`).toBeTruthy();
      }
      expect(t.vocab.sujeito(1)).toContain('1');
    }
  });

  /**
   * Uma cor que existe no token e não vira variável CSS é uma cor que o
   * arquivo de estilo nunca vai alcançar — e o sintoma é uma superfície que
   * não muda ao trocar de tema.
   */
  it('toda cor do tema vira variável CSS', () => {
    for (const t of LISTA_TEMAS) {
      const vars = Object.values(variaveisCss(t));
      for (const [nome, cor] of Object.entries(t.cores)) {
        expect(vars, `${t.id}.cores.${nome} não virou variável`).toContain(cor);
      }
    }
  });

  it('nenhuma variável sai indefinida', () => {
    for (const t of LISTA_TEMAS) {
      for (const [nome, valor] of Object.entries(variaveisCss(t))) {
        expect(valor, `${t.id}: ${nome} vazio`).toBeTruthy();
        expect(valor).not.toContain('undefined');
      }
    }
  });

  it('as variáveis são todas do prefixo do Lab, para não vazar', () => {
    for (const t of LISTA_TEMAS) {
      for (const nome of Object.keys(variaveisCss(t))) {
        expect(nome.startsWith('--creator-')).toBe(true);
      }
    }
  });
});
