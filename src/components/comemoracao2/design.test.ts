/**
 * design.test.ts — o contrato do card 2.0.
 *
 * O que se perde se isto quebrar: um JSON estranho no banco derrubando a festa
 * na tela da empresa inteira, um GIF de fora do GIPHY entrando no card, ou o
 * arrasto do estúdio saindo diferente do que aparece para os outros.
 */
import { describe, it, expect } from 'vitest';
import {
  ALTURA_CARD, ESCALA_MAX, LARGURA_CARD, MARGEM_PCT, MODELOS,
  aplicarModelo, animTextoV1, arrastar, designDoJson, designPadrao, designParaJson,
  ESCALA_MIN, efeitoV1, escalaDoCard, escalaPelaAlca, escalar, ladoDaFoto, larguraDoTexto,
  modeloDoDesign, nomesDoCard, urlDeGifConfiavel,
} from './design';
import { PAPEIS_DE_PAREDE, TEMAS, papelDeParede, papeisDoTema, PAPEL_PADRAO } from './papeisDeParede';

const GIF = {
  id: 'abc', titulo: 'festa',
  url: 'https://media2.giphy.com/media/abc/giphy.gif',
  previa: 'https://media2.giphy.com/media/abc/200w.webp',
  largura: 200, altura: 150,
};

describe('urlDeGifConfiavel', () => {
  it('aceita o CDN do GIPHY em https', () => {
    expect(urlDeGifConfiavel('https://media.giphy.com/x.gif')).toBe(true);
    expect(urlDeGifConfiavel('https://i.giphy.com/x.webp')).toBe(true);
  });

  it('recusa qualquer outro endereço — o card aparece para a empresa inteira', () => {
    expect(urlDeGifConfiavel('http://media.giphy.com/x.gif')).toBe(false);
    expect(urlDeGifConfiavel('https://giphy.com.malicioso.net/x.gif')).toBe(false);
    expect(urlDeGifConfiavel('https://evilgiphy.com/x.gif')).toBe(false);
    expect(urlDeGifConfiavel('javascript:alert(1)')).toBe(false);
    expect(urlDeGifConfiavel(42)).toBe(false);
  });
});

describe('designDoJson', () => {
  it('sem design (comemoração da 1.0) devolve null', () => {
    expect(designDoJson(null)).toBeNull();
    expect(designDoJson({})).toBeNull();
    expect(designDoJson([])).toBeNull();
    expect(designDoJson({ versao: 1 })).toBeNull();
  });

  it('ida e volta pelo banco preserva o design', () => {
    const d = { ...designPadrao(), papel: 'neon', fonte: 'elegante' as const, selo: 'META DE OUTUBRO', gif: GIF };
    expect(designDoJson(JSON.parse(JSON.stringify(designParaJson(d))))).toEqual(d);
  });

  it('valor desconhecido cai no padrão em vez de quebrar a festa', () => {
    const d = designDoJson({ versao: 2, papel: 'nao-existe', fonte: 'comic', entrada: 'x', efeito: 'y' });
    const p = designPadrao();
    expect(d).not.toBeNull();
    expect(d?.papel).toBe(PAPEL_PADRAO);
    expect(d?.fonte).toBe(p.fonte);
    expect(d?.entrada).toBe(p.entrada);
    expect(d?.efeito).toBe(p.efeito);
    expect(d?.posicoes).toEqual(p.posicoes);
  });

  it('GIF de fora do GIPHY é descartado', () => {
    const d = designDoJson({ versao: 2, gif: { ...GIF, url: 'https://rastreador.exemplo/pixel.gif' } });
    expect(d?.gif).toBeNull();
  });

  it('posição fora do card volta para dentro, escala vai para o teto', () => {
    const d = designDoJson({ versao: 2, posicoes: { titulo: { x: -40, y: 300, escala: 9 } } });
    expect(d?.posicoes.titulo).toEqual({ x: MARGEM_PCT, y: 100 - MARGEM_PCT, escala: ESCALA_MAX });
  });

  it('selo comprido é cortado', () => {
    expect(designDoJson({ versao: 2, selo: 'x'.repeat(200) })?.selo).toHaveLength(32);
  });
});

describe('modelos', () => {
  it('cada modelo põe os 5 elementos dentro do card', () => {
    for (const m of MODELOS) {
      for (const p of Object.values(m.posicoes)) {
        expect(p.x).toBeGreaterThanOrEqual(MARGEM_PCT);
        expect(p.x).toBeLessThanOrEqual(100 - MARGEM_PCT);
        expect(p.y).toBeGreaterThanOrEqual(MARGEM_PCT);
        expect(p.y).toBeLessThanOrEqual(100 - MARGEM_PCT);
      }
    }
  });

  it('aplicar um modelo é reconhecido; arrastar vira personalizado', () => {
    const d = aplicarModelo(designPadrao(), 'lado');
    expect(modeloDoDesign(d)).toBe('lado');
    const mexido = arrastar(d, 'titulo', d.posicoes.titulo, 30, 0, 640, 400);
    expect(modeloDoDesign(mexido)).toBeNull();
  });

  it('o "Só texto" esconde a imagem', () => {
    expect(aplicarModelo(designPadrao(), 'so-texto').comMidia).toBe(false);
    expect(aplicarModelo(designPadrao(), 'classico').comMidia).toBe(true);
  });

  it('aplicar modelo não mexe no design original', () => {
    const d = designPadrao();
    const copia = JSON.parse(JSON.stringify(d));
    aplicarModelo(d, 'palco').posicoes.titulo.x = 1;
    expect(d).toEqual(copia);
  });
});

describe('arrastar e escalar', () => {
  it('converte pixels de tela em % do card, em qualquer zoom', () => {
    const d = designPadrao();
    const inicio = { x: 50, y: 50, escala: 1 };
    // Card de 320 px de largura: 32 px = 10%.
    expect(arrastar(d, 'midia', inicio, 32, 20, 320, 200).posicoes.midia).toEqual({ x: 60, y: 60, escala: 1 });
    // Mesmo gesto proporcional num card de 640: mesmo resultado.
    expect(arrastar(d, 'midia', inicio, 64, 40, 640, 400).posicoes.midia).toEqual({ x: 60, y: 60, escala: 1 });
  });

  it('não deixa arrastar para fora', () => {
    const d = designPadrao();
    const p = arrastar(d, 'selo', d.posicoes.selo, -5000, -5000, 640, 400).posicoes.selo;
    expect(p.x).toBe(MARGEM_PCT);
    expect(p.y).toBe(MARGEM_PCT);
  });

  it('card sem medida não move nada (sem Infinity)', () => {
    const d = designPadrao();
    expect(arrastar(d, 'titulo', d.posicoes.titulo, 10, 10, 0, 0)).toBe(d);
  });

  it('escala respeita o teto', () => {
    expect(escalar(designPadrao(), 'titulo', 50).posicoes.titulo.escala).toBe(ESCALA_MAX);
  });
});

describe('geometria', () => {
  it('a escala do card é largura ÷ 640', () => {
    expect(escalaDoCard(LARGURA_CARD / 2)).toBe(0.5);
    expect(escalaDoCard(0)).toBe(1);
    expect(escalaDoCard(Number.NaN)).toBe(1);
    expect(LARGURA_CARD / ALTURA_CARD).toBe(1.6);
  });

  it('texto puxado para o lado só usa o espaço até a borda', () => {
    expect(larguraDoTexto(50)).toBe(88);
    expect(larguraDoTexto(68)).toBe(56);
    expect(larguraDoTexto(95)).toBe(28);
  });
});

describe('nomesDoCard', () => {
  const p = (nome: string) => ({ nome });
  it('junta primeiros nomes como se fala', () => {
    expect(nomesDoCard([])).toBe('');
    expect(nomesDoCard([p('Ana Paula Souza')])).toBe('Ana');
    expect(nomesDoCard([p('Ana'), p('João')])).toBe('Ana e João');
    expect(nomesDoCard([p('Ana'), p('João'), p('Carla')])).toBe('Ana, João e Carla');
    expect(nomesDoCard([p('Ana'), p('João'), p('Carla'), p('Bia'), p('Edu')])).toBe('Ana, João e mais 3');
  });
});

describe('ponte com a 1.0', () => {
  it('quem ainda roda o app antigo recebe efeito e animação parecidos', () => {
    expect(efeitoV1('moedas')).toBe('chuva-moedas');
    expect(efeitoV1('estrelas')).toBe('confete');
    expect(efeitoV1('nenhum')).toBe('nenhum');
    expect(animTextoV1('impacto')).toBe('pop');
    expect(animTextoV1('letreiro')).toBe('brilho');
    expect(animTextoV1('suave')).toBe('subir');
  });
});

describe('papéis de parede', () => {
  it('ids únicos, todo papel num tema que existe, todo tema com papel', () => {
    const ids = PAPEIS_DE_PAREDE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const temas = new Set(TEMAS.map((t) => t.id));
    for (const p of PAPEIS_DE_PAREDE) expect(temas.has(p.tema)).toBe(true);
    for (const t of TEMAS) expect(papeisDoTema(t.id).length).toBeGreaterThan(0);
  });

  it('o padrão existe e id desconhecido cai nele', () => {
    expect(papelDeParede(PAPEL_PADRAO).id).toBe(PAPEL_PADRAO);
    expect(papelDeParede('sumiu').id).toBe(PAPEL_PADRAO);
  });

  it('nenhum fundo puxa arquivo de fora — tudo é gradiente em CSS', () => {
    for (const p of PAPEIS_DE_PAREDE) expect(p.fundo).not.toMatch(/url\(/i);
  });
});

describe('fotos de quem bateu', () => {
  it('card salvo antes das opções de foto sai como sempre saiu', () => {
    const d = designDoJson({ versao: 2 });
    expect(d?.fotos).toEqual({ formato: 'redonda', moldura: 'destaque', tamanho: 'm' });
  });

  it('o que foi escolhido vai e volta do banco', () => {
    const d = { ...designPadrao(), fotos: { formato: 'quadrada' as const, moldura: 'dourada' as const, tamanho: 'gg' as const } };
    expect(designDoJson(designParaJson(d))?.fotos).toEqual(d.fotos);
  });

  it('valor desconhecido cai no padrão, campo a campo', () => {
    const d = designDoJson({ versao: 2, fotos: { formato: 'oval', moldura: 'neon', tamanho: 'xl' } });
    expect(d?.fotos).toEqual({ formato: 'redonda', moldura: 'neon', tamanho: 'm' });
  });

  it('tamanhos crescem na ordem', () => {
    expect(ladoDaFoto('p')).toBeLessThan(ladoDaFoto('m'));
    expect(ladoDaFoto('m')).toBeLessThan(ladoDaFoto('g'));
    expect(ladoDaFoto('g')).toBeLessThan(ladoDaFoto('gg'));
  });
});

describe('escalaPelaAlca', () => {
  it('afastar o canto do centro aumenta na mesma proporção', () => {
    expect(escalaPelaAlca(1, 100, 150)).toBe(1.5);
    expect(escalaPelaAlca(1.2, 100, 50)).toBe(0.6);
  });

  it('respeita os limites', () => {
    expect(escalaPelaAlca(1, 100, 1000)).toBe(ESCALA_MAX);
    expect(escalaPelaAlca(1, 100, 1)).toBe(ESCALA_MIN);
  });

  it('clique em cima do centro não zera nem quebra', () => {
    expect(escalaPelaAlca(1.3, 0, 40)).toBe(1.3);
    expect(escalaPelaAlca(1.3, 50, Number.NaN)).toBe(1.3);
  });
});
