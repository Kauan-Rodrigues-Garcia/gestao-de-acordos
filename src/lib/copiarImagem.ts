/**
 * copiarImagem.ts — fotografa um elemento da tela e põe a imagem na área de
 * transferência, para colar direto no WhatsApp.
 *
 * O mesmo caminho do «copiar imagem» do relatório PaguePlay (html2canvas +
 * `ClipboardItem`), fora do iframe. Onde o navegador não deixa gravar imagem na
 * área de transferência (Firefox antigo, página em http), baixa o PNG — o
 * clique nunca termina sem entregar nada.
 *
 * A promessa do PNG vai DENTRO do `ClipboardItem`, criado ainda no clique: o
 * Safari só aceita a gravação enquanto o gesto do usuário está vivo, e gerar a
 * imagem antes (carregar o html2canvas, desenhar) o faria recusar.
 *
 * ## As cores do tema
 *
 * O tema do app (Tailwind 4) escreve as cores em `oklch`, e o html2canvas 1.4
 * só lê rgb, hsl, hex e nome: qualquer outra função de cor derruba a captura
 * com «Attempting to parse an unsupported color function "oklch"». Não basta
 * pintar o elemento fotografado com hex — o html2canvas lê também o fundo do
 * `<html>` e do `<body>`, que são do tema. Por isso, na CÓPIA do documento que
 * ele monta (`onclone`), toda cor que ele não lê é trocada pela mesma cor em
 * rgb. A página de verdade não é tocada.
 */

export type ResultadoCopiaImagem = 'copiado' | 'baixado';

/** Funções de cor que o html2canvas 1.4 NÃO lê. rgb, hsl, hex e nomes passam. */
const COR_ILEGIVEL = /\b(?:oklch|oklab|lab|lch|hwb|color|color-mix)\(/i;

/** Propriedades de cor que o html2canvas lê: estas são convertidas para rgb. */
const PROPRIEDADES_DE_COR = [
  'color', 'background-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'text-decoration-color', '-webkit-text-stroke-color',
] as const;

/** Enfeites que ele também lê e que não dá para converter por partes: saem. */
const PROPRIEDADES_DE_ENFEITE = ['box-shadow', 'text-shadow', 'background-image'] as const;

type ElementoComEstilo = Element & ElementCSSInlineStyle;

/**
 * Troca, na cópia, toda cor que o html2canvas não lê pela mesma cor em rgb.
 *
 * Percorre `<html>`, `<body>` e o alvo com os descendentes, nessa ordem: o pai
 * vem antes do filho, então a cor que o filho herda já chega convertida.
 *
 * @param paraRgb converte uma cor CSS qualquer em `rgba(...)`.
 * @returns quantas propriedades foram trocadas (diagnóstico e teste).
 */
export function trocarCoresIlegiveis(
  doc: Document,
  alvo: Element,
  paraRgb: (cor: string) => string,
): number {
  const janela = doc.defaultView;
  if (!janela) return 0;
  const elementos = new Set<ElementoComEstilo>(
    [doc.documentElement, doc.body, alvo, ...alvo.querySelectorAll('*')]
      .filter((e): e is ElementoComEstilo => !!e && 'style' in e),
  );

  let trocas = 0;
  for (const el of elementos) {
    const estilo = janela.getComputedStyle(el);
    for (const prop of PROPRIEDADES_DE_COR) {
      const valor = estilo.getPropertyValue(prop);
      if (!valor || !COR_ILEGIVEL.test(valor)) continue;
      el.style.setProperty(prop, paraRgb(valor), 'important');
      trocas += 1;
    }
    for (const prop of PROPRIEDADES_DE_ENFEITE) {
      const valor = estilo.getPropertyValue(prop);
      if (!valor || !COR_ILEGIVEL.test(valor)) continue;
      el.style.setProperty(prop, 'none', 'important');
      trocas += 1;
    }
  }
  return trocas;
}

/**
 * Qualquer cor que o navegador entenda → `rgba(...)`, pintando um pixel.
 *
 * O pixel é a única conversão que não depende de como cada navegador escreve
 * a cor de volta: o que sai de `getImageData` é sempre sRGB, 0-255.
 */
function criarConversorRgb(): (cor: string) => string {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const feitas = new Map<string, string>();
  return (cor) => {
    const pronta = feitas.get(cor);
    if (pronta) return pronta;
    let rgb = 'rgba(0, 0, 0, 0)';
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      rgb = `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
    }
    feitas.set(cor, rgb);
    return rgb;
  };
}

/*
 * O canvas desenha o texto só com família, peso e tamanho. Na tela o tema liga
 * variantes do Inter (`font-feature-settings`) e os números tabulares; a cópia
 * posiciona cada pedaço de texto com essas larguras e o canvas o desenha com
 * as larguras normais — sobrava espaço («10 :00»). Na cópia, tudo normal.
 */
const CSS_DA_COPIA = `*, *::before, *::after {
  font-variant-numeric: normal !important;
  font-feature-settings: normal !important;
}`;

/*
 * A linha de base do texto o html2canvas mede num <img> 1×1 que ele põe no
 * documento DE VERDADE (não na cópia), esperando que a imagem fique na mesma
 * linha do texto. O Tailwind põe `display: block` em todo `img`: a imagem cai
 * para a linha de baixo, a medida sai uma linha maior e todo texto da captura
 * desce — número abaixo da barra, nome cortado no cartão. O seletor pega só a
 * imagem de medição dele (o GIF 1×1 que é constante da biblioteca).
 */
const CSS_DA_MEDICAO = `img[src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"] {
  display: inline !important;
}`;

async function gerarPng(el: HTMLElement, fundo: string): Promise<Blob> {
  // Sob demanda: o html2canvas pesa ~200 KB e só este botão o usa.
  const { default: html2canvas } = await import('html2canvas');
  const paraRgb = criarConversorRgb();
  const medicao = document.createElement('style');
  medicao.textContent = CSS_DA_MEDICAO;
  document.head.appendChild(medicao);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: fundo,
      logging: false,
      useCORS: true,
      onclone: (doc, alvo) => {
        const estilo = doc.createElement('style');
        estilo.textContent = CSS_DA_COPIA;
        doc.head.appendChild(estilo);
        trocarCoresIlegiveis(doc, alvo, paraRgb);
      },
    });
  } finally {
    medicao.remove();
  }
  return new Promise<Blob>((ok, falha) => {
    canvas.toBlob(b => (b ? ok(b) : falha(new Error('O navegador não gerou a imagem.'))), 'image/png');
  });
}

function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * @param el          o que fotografar — pode estar fora da área visível.
 * @param nomeArquivo o nome do PNG, se precisar baixar.
 * @param fundo       cor por trás de cantos arredondados e transparências.
 */
export async function copiarImagemDoElemento(
  el: HTMLElement,
  nomeArquivo: string,
  fundo = '#FCFCFC',
): Promise<ResultadoCopiaImagem> {
  const png = gerarPng(el, fundo);
  // O download de reserva ainda precisa do PNG: sem este `catch` uma falha
  // na cópia deixaria a promessa rejeitada sem ninguém ouvindo.
  png.catch((): void => undefined);

  const podeCopiar = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
  if (podeCopiar) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return 'copiado';
    } catch {
      // Navegador que não aceita promessa no ClipboardItem: tenta com o PNG pronto.
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png })]);
        return 'copiado';
      } catch {
        /* cai no download */
      }
    }
  }
  baixar(await png, nomeArquivo);
  return 'baixado';
}
