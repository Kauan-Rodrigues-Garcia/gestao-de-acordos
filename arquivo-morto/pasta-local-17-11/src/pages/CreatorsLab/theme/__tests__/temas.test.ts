/**
 * Os três temas precisam ser três SISTEMAS, não três paletas.
 * ─────────────────────────────────────────────────────────────────────────────
 * A primeira versão do Lab errou exatamente nisso: Cyberpunk era ciano e
 * magenta sobre quase-preto, Arcade era amarelo e vermelho sobre roxo, e os
 * dois tinham a mesma grade, a mesma varredura e o mesmo brilho difuso. Trocar
 * de realidade mudava o texto e quase mais nada.
 *
 * Os testes aqui trancam a regra que ficou, agora para três: cada tema tem uma
 * cor DOMINANTE que nenhum outro usa, e a diferença não é só de cor — é de
 * fundo, de forma, de tempo e de vocabulário.
 *
 * Tudo é conferido PAR A PAR, sobre `LISTA_TEMAS`. Um quarto tema entra na
 * mesma régua sem que ninguém precise lembrar de escrever o teste dele.
 */
import { describe, it, expect } from 'vitest';
import {
  LISTA_TEMAS, TEMAS, TEMA_PADRAO, atributosDoTema, proximoTema, temaValido,
  variaveisCss, type TokensTema,
} from '../themes';

const CYBER      = TEMAS.cyberpunk;
const ARCADE     = TEMAS.arcade;
const ESCRITORIO = TEMAS.escritorio;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Matiz de um `#rrggbb`, em graus. */
function matiz(hex: string): number {
  const [r, g, b] = rgb(hex);
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
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Luminosidade (HSL), de 0 a 1. */
function luminosidade(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/** Distância entre matizes, indo pelo caminho mais curto do círculo. */
function distanciaMatiz(a: string, b: string): number {
  const d = Math.abs(matiz(a) - matiz(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** As cores em `#rrggbb` de um tema, com o nome do token. */
function coresHex(t: TokensTema): [string, string][] {
  return Object.entries(t.cores).filter(([, cor]) => cor.startsWith('#'));
}

/** Todo par de temas diferentes, nas duas direções. */
const PARES = LISTA_TEMAS.flatMap(a =>
  LISTA_TEMAS.filter(b => b.id !== a.id).map(b => [a, b] as const));

/** Meia-largura da faixa de matiz que pertence à dominante de um tema. */
const FAIXA_DA_DOMINANTE = 25;
/** Abaixo disto a cor é cinza com um tom, e não disputa matiz com ninguém. */
const SATURACAO_QUE_CONTA = 0.5;

/** Amarelo de sinalização: a faixa de matiz reservada ao Cyberpunk. */
const ehAmarelo = (hex: string) =>
  matiz(hex) >= 40 && matiz(hex) <= 70 && saturacao(hex) > SATURACAO_QUE_CONTA;

describe('os três sistemas não se confundem', () => {
  it('são três', () => {
    expect(LISTA_TEMAS).toHaveLength(3);
    expect(new Set(LISTA_TEMAS.map(t => t.id)).size).toBe(3);
    expect(Object.keys(TEMAS).sort()).toEqual(LISTA_TEMAS.map(t => t.id).sort());
  });

  it('as cores dominantes ficam longe umas das outras', () => {
    for (const [a, b] of PARES) {
      expect(
        distanciaMatiz(a.cores.primaria, b.cores.primaria),
        `${a.id} × ${b.id}`,
      ).toBeGreaterThan(90);
    }
  });

  it('toda dominante é uma cor de verdade, não um cinza', () => {
    for (const t of LISTA_TEMAS) {
      expect(saturacao(t.cores.primaria), t.id).toBeGreaterThan(SATURACAO_QUE_CONTA);
    }
  });

  /**
   * A generalização do "amarelo é exclusivo do Cyberpunk".
   *
   * A dominante é a assinatura do tema. Se outro tema usar uma cor saturada
   * de matiz parecido, os dois voltam a se parecer — foi o que aconteceu na
   * primeira versão, em que o Arcade era amarelo, e é o que aconteceria com o
   * ciano dos dois temas antigos ao lado do verde-água do terceiro.
   */
  it('nenhum tema usa uma cor saturada na faixa da dominante de outro', () => {
    for (const [dono, outro] of PARES) {
      for (const [nome, cor] of coresHex(outro)) {
        if (saturacao(cor) <= SATURACAO_QUE_CONTA) continue;
        expect(
          distanciaMatiz(cor, dono.cores.primaria),
          `${outro.id}.cores.${nome} (${cor}) invade a dominante de ${dono.id}`,
        ).toBeGreaterThan(FAIXA_DA_DOMINANTE);
      }
    }
  });

  /** O caso que deu origem à regra, mantido com o nome que ele sempre teve. */
  it('amarelo é exclusivo do Cyberpunk', () => {
    expect(ehAmarelo(CYBER.cores.primaria)).toBe(true);
    for (const t of [ARCADE, ESCRITORIO]) {
      for (const [nome, cor] of coresHex(t)) {
        expect(ehAmarelo(cor), `${nome} do ${t.id} está amarelo: ${cor}`).toBe(false);
      }
    }
  });

  it('os fundos são mundos diferentes, não o mesmo escuro', () => {
    // O Cyberpunk é preto de verdade.
    expect(CYBER.cores.fundo).toBe('#000000');
    // O Arcade é roxo profundo: escuro, mas com cor.
    expect(saturacao(ARCADE.cores.fundo)).toBeGreaterThan(0.3);
    expect(luminosidade(ARCADE.cores.fundo)).toBeLessThan(0.15);
    // O Escritório é o único claro, na janela E no papel de parede.
    expect(luminosidade(ESCRITORIO.cores.fundo)).toBeGreaterThan(0.75);
    expect(luminosidade(ESCRITORIO.cores.papel)).toBeGreaterThan(0.25);
    for (const t of [CYBER, ARCADE]) {
      expect(luminosidade(t.cores.fundo), t.id).toBeLessThan(0.15);
      expect(luminosidade(t.cores.papel), t.id).toBeLessThan(0.15);
    }
  });

  it('o papel de parede de cada um é da família da própria dominante ou neutro', () => {
    // O do Escritório É a dominante: verde-água chapado.
    expect(distanciaMatiz(ESCRITORIO.cores.papel, ESCRITORIO.cores.primaria)).toBeLessThan(10);
  });

  it('nenhuma cor é usada, igual, por dois temas', () => {
    for (const [a, b] of PARES) {
      const deA = new Set(coresHex(a).map(([, cor]) => cor.toUpperCase()));
      for (const [nome, cor] of coresHex(b)) {
        expect(deA.has(cor.toUpperCase()), `${cor} (${b.id}.${nome}) também está em ${a.id}`)
          .toBe(false);
      }
    }
  });

  /** Cor é metade. Se a forma e o tempo fossem iguais, seria só um filtro. */
  it('a diferença também é de forma e de tempo', () => {
    const distintos = (ler: (t: TokensTema) => unknown, oQue: string) => {
      const valores = LISTA_TEMAS.map(ler);
      expect(new Set(valores).size, `${oQue} repetido: ${valores.join(' | ')}`)
        .toBe(LISTA_TEMAS.length);
    };

    distintos(t => t.forma,           'forma');
    distintos(t => t.bordaLargura,    'espessura de borda');
    distintos(t => t.sombra,          'sombra');
    distintos(t => t.barra.estilo,    'estilo da barra de tarefas');
    distintos(t => t.barra.altura,    'altura da barra de tarefas');
    distintos(t => t.papel.tipo,      'papel de parede');
    distintos(t => t.icones,          'desenho dos ícones');
    distintos(t => t.cursor,          'cursor');
    distintos(t => t.fontes.display,  'fonte de título');
    distintos(t => t.intro.estilo,    'estilo da inicialização');
    distintos(t => t.intro.marca,     'marca da inicialização');
    distintos(t => t.duracao,         'duração');
    distintos(t => t.easing.join(),   'curva');
    distintos(t => Object.values(t.janela.simbolos).join(), 'botões de janela');

    // O Cyberpunk desliza, o Arcade estala, o Escritório troca seco.
    expect(ARCADE.duracao).toBeLessThan(CYBER.duracao);
    expect(ESCRITORIO.duracao).toBeLessThan(ARCADE.duracao);
  });

  it('a barra de tarefas não fica igual em dois deles', () => {
    // Um no topo, dois embaixo — e os dois de baixo são de estilos diferentes.
    expect(CYBER.barra.posicao).toBe('topo');
    expect(ARCADE.barra.posicao).toBe('base');
    expect(ESCRITORIO.barra.posicao).toBe('base');
    expect(ARCADE.barra.estilo).not.toBe(ESCRITORIO.barra.estilo);
  });

  it('o vocabulário nunca coincide', () => {
    /** Achata o vocabulário: `programas.terminal`, `heroTitulo.0`, ... */
    const achatar = (v: unknown, prefixo = ''): [string, string][] => {
      if (typeof v === 'string') return [[prefixo, v]];
      if (typeof v === 'function') return [[prefixo, String(v(1))]];
      if (v && typeof v === 'object') {
        return Object.entries(v).flatMap(([k, x]) =>
          achatar(x, prefixo ? `${prefixo}.${k}` : k));
      }
      return [];
    };

    for (const [a, b] of PARES) {
      const deB = new Map(achatar(b.vocab));
      for (const [chave, valor] of achatar(a.vocab)) {
        expect(valor, `"${chave}" igual em ${a.id} e ${b.id}`).not.toBe(deB.get(chave));
      }
    }
  });
});

describe('quem já tinha um tema continua nele', () => {
  /**
   * Os ids antigos são os ids de hoje. Quem tinha `cyberpunk` ou `arcade`
   * guardado no navegador abre direto no sistema equivalente, sem passar de
   * novo pela escolha de aparência.
   */
  it('os dois ids antigos continuam válidos', () => {
    expect(temaValido('cyberpunk')).toBe(true);
    expect(temaValido('arcade')).toBe(true);
    expect(TEMAS.cyberpunk.id).toBe('cyberpunk');
    expect(TEMAS.arcade.id).toBe('arcade');
  });

  it('o que não é tema não passa — nem chave herdada do objeto', () => {
    for (const lixo of ['', 'neon', 'CYBERPUNK', 'toString', 'constructor', null, undefined, 3, {}]) {
      expect(temaValido(lixo), String(lixo)).toBe(false);
    }
  });

  it('o padrão é um tema que existe', () => {
    expect(temaValido(TEMA_PADRAO)).toBe(true);
  });

  it('a roda de temas passa pelos três e volta ao começo', () => {
    let t = TEMA_PADRAO;
    const vistos = [t];
    for (let i = 0; i < LISTA_TEMAS.length - 1; i++) { t = proximoTema(t); vistos.push(t); }
    expect(new Set(vistos).size).toBe(LISTA_TEMAS.length);
    expect(proximoTema(t)).toBe(TEMA_PADRAO);
  });
});

describe('integridade dos tokens', () => {
  it('todo tema tem o vocabulário completo, inclusive os programas', () => {
    const programas = Object.keys(CYBER.vocab.programas).sort();
    for (const t of LISTA_TEMAS) {
      expect(t.vocab.fliperama, `${t.id} sem rótulo de fliperama`).toBeTruthy();
      for (const [chave, valor] of Object.entries(t.vocab)) {
        expect(valor, `${t.id}.vocab.${chave} vazio`).toBeTruthy();
      }
      expect(Object.keys(t.vocab.programas).sort()).toEqual(programas);
      for (const [id, nome] of Object.entries(t.vocab.programas)) {
        expect(nome, `${t.id}: programa ${id} sem nome`).toBeTruthy();
      }
      expect(t.vocab.heroTitulo).toHaveLength(2);
      expect(t.vocab.sujeito(1)).toContain('1');
      expect(t.vocab.rotuloSecao('abc')).toContain('abc');
    }
  });

  it('toda inicialização tem autoteste, marca e tela de entrada', () => {
    for (const t of LISTA_TEMAS) {
      expect(t.intro.autoteste.length, t.id).toBeGreaterThanOrEqual(3);
      expect(t.intro.marca).toBeTruthy();
      expect(t.intro.entrar).toBeTruthy();
      expect(t.intro.boasVindas).toBeTruthy();
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

  it('os três produzem exatamente as mesmas variáveis e os mesmos atributos', () => {
    const chaves = (o: object) => Object.keys(o).sort();
    for (const t of LISTA_TEMAS) {
      expect(chaves(variaveisCss(t))).toEqual(chaves(variaveisCss(CYBER)));
      expect(chaves(atributosDoTema(t))).toEqual(chaves(atributosDoTema(CYBER)));
      for (const [nome, valor] of Object.entries(atributosDoTema(t))) {
        expect(nome.startsWith('data-')).toBe(true);
        expect(valor, `${t.id}: ${nome} vazio`).toBeTruthy();
      }
    }
  });

  /**
   * A altura da barra entra na conta da área útil das janelas. Uma barra sem
   * altura deixaria janela nascer embaixo dela.
   */
  it('a barra de tarefas tem altura que dá para tocar', () => {
    for (const t of LISTA_TEMAS) {
      expect(t.barra.altura, t.id).toBeGreaterThanOrEqual(32);
      expect(variaveisCss(t)['--creator-bar-h']).toBe(`${t.barra.altura}px`);
    }
  });
});
