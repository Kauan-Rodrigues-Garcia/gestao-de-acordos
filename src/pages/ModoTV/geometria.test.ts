/**
 * O que estes testes protegem é UMA promessa: "o que eu vejo na prévia é o que
 * vai aparecer na TV".
 *
 * Ela não se sustenta em cuidado ao escrever CSS — se sustenta em a redução ser
 * uniforme e as coordenadas serem percentuais. Se alguém trocar o `Math.min`
 * por `Math.max` em `escalaDoPalco`, ou fizer `estiloDaFonte` devolver pixel,
 * a promessa quebra silenciosamente e só aparece na parede, na frente de todo
 * mundo. Daí estes testes.
 */
import { describe, it, expect } from 'vitest';
import {
  PALCO_LARGURA,
  PALCO_ALTURA,
  escalaDoPalco,
  encaixar,
  limitarAoPalco,
  estiloDaFonte,
  ordenarPorCamada,
  percentualDaMeta,
  primeiroNome,
  texto,
  numero,
  ligado,
  type Fonte,
} from './geometria';

function fonte(over: Partial<Fonte> = {}): Fonte {
  return {
    id: 'f1', tipo: 'texto', config: {}, x: 50, y: 50,
    largura: 40, escala: 1, camada: 0, dados: null, ...over,
  };
}

describe('escalaDoPalco', () => {
  it('numa caixa do tamanho exato do palco, não reduz nada', () => {
    expect(escalaDoPalco(PALCO_LARGURA, PALCO_ALTURA)).toBe(1);
  });

  it('a prévia da mesa e a TV usam a MESMA proporção — só muda o tamanho', () => {
    // É isto que faz a promessa valer: a prévia é o palco inteiro reduzido,
    // não um recorte dele nem um layout parecido.
    const naTv = escalaDoPalco(1920, 1080);
    const naMesa = escalaDoPalco(576, 324);
    expect(naTv / naMesa).toBeCloseTo(1920 / 576, 6);
  });

  it('cabe inteiro em caixa mais larga que 16:9 — sobra faixa, não corta', () => {
    // Caixa 2000×1080: se usasse a razão da largura (1.04) o palco passaria da
    // altura e o rodapé sumiria. Quem manda é a menor razão.
    expect(escalaDoPalco(2000, 1080)).toBe(1);
  });

  it('cabe inteiro em caixa mais alta que 16:9', () => {
    expect(escalaDoPalco(1920, 2000)).toBe(1);
  });

  it('caixa ainda não medida devolve 0 em vez de Infinity', () => {
    // O ResizeObserver dispara depois da primeira pintura. Sem esta guarda,
    // `0/0` viraria NaN e o palco apareceria em tamanho natural por um quadro —
    // um flash gigante na parede a cada carregamento.
    expect(escalaDoPalco(0, 0)).toBe(0);
    expect(escalaDoPalco(-10, 500)).toBe(0);
  });

  it('altura zero com largura boa deduz da proporção, não apaga a tela', () => {
    /*
     * Regressão de 01/09/2026: o contêiner da prévia tirava a altura de
     * `aspect-ratio` e o `height: 100%` do filho não resolvia contra isso. A
     * caixa media 1920×0, a escala dava 0 e o palco ficava escondido — a
     * prévia era preta e nada do que se adicionasse aparecia.
     *
     * O layout foi corrigido. Este teste garante que, se acontecer de novo por
     * outro caminho, a prévia saia levemente errada em vez de sumir.
     */
    expect(escalaDoPalco(1920, 0)).toBe(1);
    expect(escalaDoPalco(960, 0)).toBe(0.5);
  });
});

describe('estiloDaFonte', () => {
  it('posiciona pelo CENTRO, não pelo canto', () => {
    const e = estiloDaFonte(fonte({ x: 25, y: 80 }));
    expect(e.left).toBe('25%');
    expect(e.top).toBe('80%');
    expect(e.transform).toContain('translate(-50%, -50%)');
  });

  it('nunca devolve pixel — só percentual', () => {
    // Pixel aqui seria o fim da promessa: a prévia de 576px e a TV de 1920px
    // interpretariam o mesmo número de formas diferentes.
    const e = estiloDaFonte(fonte({ x: 10, y: 20, largura: 33 }));
    expect(e.left).toMatch(/%$/);
    expect(e.top).toMatch(/%$/);
    expect(e.width).toMatch(/%$/);
  });

  it('a escala da fonte entra no transform, junto do centro', () => {
    expect(estiloDaFonte(fonte({ escala: 1.5 })).transform)
      .toBe('translate(-50%, -50%) scale(1.5)');
  });

  it('a camada vira z-index', () => {
    expect(estiloDaFonte(fonte({ camada: 7 })).zIndex).toBe(7);
  });
});

describe('encaixar', () => {
  it('perto do meio vira o meio exato', () => {
    // 49,7% numa TV de 55 polegadas é meio centímetro fora do centro — visível,
    // e impossível de consertar no olho arrastando.
    expect(encaixar(49.7)).toBe(50);
    expect(encaixar(50.9)).toBe(50);
  });

  it('longe de tudo fica onde a pessoa soltou', () => {
    expect(encaixar(38)).toBe(38);
    expect(encaixar(62.4)).toBe(62.4);
  });

  it('encosta nas bordas e nos terços', () => {
    expect(encaixar(0.8)).toBe(0);
    expect(encaixar(99.2)).toBe(100);
    expect(encaixar(24.5)).toBe(25);
    expect(encaixar(75.6)).toBe(75);
  });

  it('escolhe a linha mais próxima quando duas estão ao alcance', () => {
    expect(encaixar(24.9, [24, 25])).toBe(25);
    expect(encaixar(24.1, [24, 25])).toBe(24);
  });
});

describe('limitarAoPalco', () => {
  it('deixa sangrar um pouco na borda, que é recurso legítimo', () => {
    expect(limitarAoPalco(-15)).toBe(-15);
    expect(limitarAoPalco(112)).toBe(112);
  });

  it('não deixa a fonte sair de vez e sumir', () => {
    // Fonte fora do palco some da TV e some da prévia junto — a pessoa fica
    // procurando o que "apagou".
    expect(limitarAoPalco(-500)).toBe(-20);
    expect(limitarAoPalco(999)).toBe(120);
  });

  it('arredonda para uma casa, para o banco não guardar lixo do arrasto', () => {
    expect(limitarAoPalco(33.333333)).toBe(33.3);
  });
});

describe('ordenarPorCamada', () => {
  it('desenha da camada de baixo para a de cima', () => {
    const fora = [fonte({ id: 'c', camada: 2 }), fonte({ id: 'a', camada: 0 }), fonte({ id: 'b', camada: 1 })];
    expect(ordenarPorCamada(fora).map(f => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('não mexe no array recebido', () => {
    const original = [fonte({ id: 'z', camada: 9 }), fonte({ id: 'a', camada: 1 })];
    ordenarPorCamada(original);
    expect(original.map(f => f.id)).toEqual(['z', 'a']);
  });
});

describe('percentualDaMeta', () => {
  it('meia meta é 50% na barra e no número', () => {
    expect(percentualDaMeta({ alvo: 1000, realizado: 500 })).toEqual({ exibido: 50, barra: 50 });
  });

  it('quem passou de 100% VÊ o número real, e a barra fica cheia', () => {
    // Mostrar "100%" para quem fez 128% é apagar a conquista justamente na
    // tela que existe para celebrá-la.
    expect(percentualDaMeta({ alvo: 1000, realizado: 1280 }))
      .toEqual({ exibido: 128, barra: 100 });
  });

  it('meta zerada não estoura em divisão por zero', () => {
    expect(percentualDaMeta({ alvo: 0, realizado: 500 })).toEqual({ exibido: 0, barra: 0 });
  });

  it('sem dado nenhum devolve zero, não NaN na parede', () => {
    expect(percentualDaMeta(null)).toEqual({ exibido: 0, barra: 0 });
    expect(percentualDaMeta(undefined)).toEqual({ exibido: 0, barra: 0 });
  });

  it('valor negativo não puxa a barra para fora da caixa', () => {
    expect(percentualDaMeta({ alvo: 1000, realizado: -200 }).barra).toBe(0);
  });
});

describe('primeiroNome', () => {
  it('corta o nome completo no primeiro', () => {
    expect(primeiroNome('MARIA APARECIDA DE SOUZA SANTOS')).toBe('MARIA');
  });

  it('aguenta espaço sobrando dos dois lados', () => {
    expect(primeiroNome('  João  Pedro ')).toBe('João');
  });

  it('nome vazio não vira linha em branco no ranking', () => {
    expect(primeiroNome('')).toBe('Sem nome');
    expect(primeiroNome('   ')).toBe('Sem nome');
  });
});

describe('leitura do config', () => {
  it('texto cai no padrão quando falta ou vem vazio', () => {
    expect(texto({}, 'titulo', 'Ranking')).toBe('Ranking');
    expect(texto({ titulo: '   ' }, 'titulo', 'Ranking')).toBe('Ranking');
    expect(texto({ titulo: 'Meta' }, 'titulo', 'Ranking')).toBe('Meta');
  });

  it('número aceita string do banco e recusa lixo', () => {
    // `config` é jsonb: um número gravado como texto é caso real, e um
    // `fontSize: NaN` faria a fonte sumir da parede sem erro nenhum.
    expect(numero({ tamanho: '96' }, 'tamanho', 72)).toBe(96);
    expect(numero({ tamanho: 'grande' }, 'tamanho', 72)).toBe(72);
    expect(numero({}, 'tamanho', 72)).toBe(72);
  });

  it('booleano só aceita booleano de verdade', () => {
    expect(ligado({ mostrar_valor: false }, 'mostrar_valor', true)).toBe(false);
    expect(ligado({ mostrar_valor: 'sim' }, 'mostrar_valor', true)).toBe(true);
    expect(ligado({}, 'mostrar_valor', true)).toBe(true);
  });
});
