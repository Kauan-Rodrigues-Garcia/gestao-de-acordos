/**
 * O roteiro da inicialização, nas quatro combinações.
 * ─────────────────────────────────────────────────────────────────────────────
 * Primeira visita ou repetida, movimento completo ou reduzido. O defeito
 * típico daqui é uma das quatro ficar esquecida: a escolha de aparência que
 * some com movimento reduzido, ou a versão "curta" que cresce a cada ajuste.
 */
import { describe, it, expect } from 'vitest';
import {
  PASSO_LINHA_MS, TETO_VISITA_REPETIDA_MS,
  aoPular, duracaoAutomaticaMs, pedeAparencia, proximoPasso, roteiroDaIntro,
  type OpcoesIntro,
} from '../intro';
import { LISTA_TEMAS } from '../../theme/themes';

const base: OpcoesIntro = { primeiraVisita: false, movimentoReduzido: false, linhasAutoteste: 6 };
const etapas = (o: Partial<OpcoesIntro>) => roteiroDaIntro({ ...base, ...o }).map(p => p.etapa);

const COMBINACOES: OpcoesIntro[] = [true, false].flatMap(primeiraVisita =>
  [true, false].map(movimentoReduzido => ({ ...base, primeiraVisita, movimentoReduzido })));

describe('primeira visita', () => {
  const roteiro = roteiroDaIntro({ ...base, primeiraVisita: true });

  /** O escurecimento do Gestão termina em preto: a emenda depende disto. */
  it('começa em preto', () => {
    expect(roteiro[0].etapa).toBe('preto');
  });

  it('é completa: autoteste, escolha, marca e tela de entrada, nesta ordem', () => {
    expect(roteiro.map(p => p.etapa))
      .toEqual(['preto', 'autoteste', 'aparencia', 'marca', 'entrada']);
  });

  it('a escolha de aparência espera a pessoa', () => {
    expect(roteiro.find(p => p.etapa === 'aparencia')!.duracaoMs).toBeNull();
  });

  /** A marca vem DEPOIS da escolha: ela já aparece com a cara do sistema escolhido. */
  it('a marca só aparece depois de a aparência estar escolhida', () => {
    const ordem = roteiro.map(p => p.etapa);
    expect(ordem.indexOf('marca')).toBeGreaterThan(ordem.indexOf('aparencia'));
  });

  it('o autoteste dura o bastante para todas as linhas serem lidas', () => {
    for (const t of LISTA_TEMAS) {
      const linhas = t.intro.autoteste.length;
      const passo = roteiroDaIntro({ ...base, primeiraVisita: true, linhasAutoteste: linhas })
        .find(p => p.etapa === 'autoteste')!;
      expect(passo.duracaoMs!, t.id).toBeGreaterThanOrEqual(linhas * PASSO_LINHA_MS);
    }
  });
});

describe('visita repetida', () => {
  const roteiro = roteiroDaIntro(base);

  it('começa em preto', () => {
    expect(roteiro[0].etapa).toBe('preto');
  });

  /** Quem já escolheu não cai de volta na tela de escolha. */
  it('não pede a aparência de novo', () => {
    expect(pedeAparencia(roteiro)).toBe(false);
  });

  it('não repete o autoteste', () => {
    expect(roteiro.map(p => p.etapa)).not.toContain('autoteste');
  });

  it('dura poucos segundos, e roda sozinha do começo ao fim', () => {
    expect(roteiro.every(p => p.duracaoMs !== null)).toBe(true);
    expect(duracaoAutomaticaMs(roteiro)).toBeLessThanOrEqual(TETO_VISITA_REPETIDA_MS);
    expect(duracaoAutomaticaMs(roteiro)).toBeGreaterThan(1500);
  });

  it('é mais curta que a da primeira visita', () => {
    const completa = roteiroDaIntro({ ...base, primeiraVisita: true });
    expect(duracaoAutomaticaMs(roteiro)).toBeLessThan(duracaoAutomaticaMs(completa) / 2);
  });

  it('pular encerra na hora, de qualquer passo', () => {
    for (let i = 0; i < roteiro.length; i++) expect(aoPular(roteiro, i)).toBeNull();
  });

  it('ainda mostra a tela de entrada, com o nome de quem está logado', () => {
    expect(roteiro.map(p => p.etapa)).toContain('entrada');
  });
});

describe('movimento reduzido', () => {
  it('visita repetida vira uma passagem só', () => {
    expect(etapas({ movimentoReduzido: true })).toEqual(['passagem']);
  });

  it('primeira visita mantém a escolha de aparência, e depois a passagem', () => {
    expect(etapas({ movimentoReduzido: true, primeiraVisita: true }))
      .toEqual(['aparencia', 'passagem']);
  });

  /** Nada que pisque, trema ou varra a tela. É a única coisa que a pessoa pediu. */
  it('nenhum passo é agitado', () => {
    for (const primeiraVisita of [true, false]) {
      const roteiro = roteiroDaIntro({ ...base, movimentoReduzido: true, primeiraVisita });
      expect(roteiro.some(p => p.agitado)).toBe(false);
      expect(roteiro.map(p => p.etapa)).not.toContain('autoteste');
      expect(roteiro.map(p => p.etapa)).not.toContain('marca');
    }
  });

  /** Encurtar a sequência normal seria piscar mais rápido — o contrário do pedido. */
  it('não é a sequência normal acelerada', () => {
    const normal = etapas({});
    const reduzida = etapas({ movimentoReduzido: true });
    expect(reduzida.some(e => normal.includes(e))).toBe(false);
  });
});

describe('pular', () => {
  const completa = roteiroDaIntro({ ...base, primeiraVisita: true });
  const iAparencia = completa.findIndex(p => p.etapa === 'aparencia');

  /** A escolha não tem resposta padrão: pular leva ATÉ ela, nunca através. */
  it('na primeira visita, pular o começo leva à escolha de aparência', () => {
    expect(aoPular(completa, 0)).toBe(iAparencia);
    expect(aoPular(completa, 1)).toBe(iAparencia);
  });

  it('quem está na escolha não pula: fica nela', () => {
    expect(aoPular(completa, iAparencia)).toBe(iAparencia);
  });

  it('depois da escolha, pular encerra', () => {
    for (let i = iAparencia + 1; i < completa.length; i++) {
      expect(aoPular(completa, i)).toBeNull();
    }
  });

  it('com movimento reduzido a passagem também pode ser pulada', () => {
    const roteiro = roteiroDaIntro({ ...base, movimentoReduzido: true });
    expect(aoPular(roteiro, 0)).toBeNull();
  });
});

describe('em qualquer combinação', () => {
  it('o roteiro nunca é vazio e todo passo automático tem duração positiva', () => {
    for (const o of COMBINACOES) {
      const roteiro = roteiroDaIntro(o);
      expect(roteiro.length).toBeGreaterThan(0);
      for (const p of roteiro) {
        if (p.duracaoMs !== null) expect(p.duracaoMs).toBeGreaterThan(0);
      }
    }
  });

  it('a aparência é pedida na primeira visita, e só nela', () => {
    for (const o of COMBINACOES) {
      expect(pedeAparencia(roteiroDaIntro(o))).toBe(o.primeiraVisita);
    }
  });

  /** Um roteiro que acabasse esperando a pessoa deixaria a tela presa. */
  it('o último passo sempre roda sozinho', () => {
    for (const o of COMBINACOES) {
      const roteiro = roteiroDaIntro(o);
      expect(roteiro[roteiro.length - 1].duracaoMs).not.toBeNull();
    }
  });

  it('andar passo a passo chega ao fim', () => {
    for (const o of COMBINACOES) {
      const roteiro = roteiroDaIntro(o);
      let i: number | null = 0;
      let voltas = 0;
      while (i !== null && voltas < 50) { i = proximoPasso(roteiro, i); voltas++; }
      expect(i).toBeNull();
      expect(voltas).toBe(roteiro.length);
    }
  });

  it('índice fora do roteiro vira "acabou", não erro', () => {
    const roteiro = roteiroDaIntro(base);
    expect(proximoPasso(roteiro, 99)).toBeNull();
    expect(proximoPasso(roteiro, -5)).toBeNull();
    expect(aoPular(roteiro, 99)).toBeNull();
  });

  it('quantidade de linhas estragada não gera duração negativa nem NaN', () => {
    for (const linhas of [NaN, -3, Infinity, 0]) {
      const passo = roteiroDaIntro({ ...base, primeiraVisita: true, linhasAutoteste: linhas })
        .find(p => p.etapa === 'autoteste')!;
      expect(Number.isFinite(passo.duracaoMs)).toBe(true);
      expect(passo.duracaoMs!).toBeGreaterThan(0);
    }
  });
});
