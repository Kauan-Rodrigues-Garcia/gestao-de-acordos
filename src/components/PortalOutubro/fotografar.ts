/**
 * fotografar.ts — o retrato do que está na tela (o html2canvas do «copiar
 * imagem», com as cores do tema trocadas: `lib/copiarImagem.ts`) em pixel
 * grande: cada pixel do retrato vale `BLOCO` × `BLOCO` na tela, a mesma
 * pixel art do resto do portal, e são menos pixels para desmanchar
 * (`TelaQueDesmancha.tsx`).
 *
 * Quem não deve sair no retrato (o painel de teste, os balões, a própria
 * abertura) leva o atributo `data-portal-fora`. Os iframes ficam sempre de
 * fora: o html2canvas copia a página num iframe dele, e o player do YouTube
 * do som ambiente, copiado, carregava e tocava menos de um segundo da música
 * até o retrato acabar (29/10/2026: «do nada tocou um pedaço da música do
 * Veigh»). No retrato ele nem aparecia — o html2canvas não pinta iframe.
 */
import { desenharComHtml2canvas } from '@/lib/copiarImagem';
import type { Pixels } from './desmanche';

export const BLOCO = 4;
/** O retrato demora no máximo isso; passou, desmancha a cortina escura. */
const ESPERA_MAX_MS = 5000;

/** A cor que o html2canvas lê (rgb): o tema escreve em `oklch`, e o pixel converte. */
function emRgb(cor: string): string {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return '#0d100f';
  c.fillStyle = cor;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function corDoFundo(el: HTMLElement): string {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const cor = getComputedStyle(e).backgroundColor;
    if (cor && cor !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(cor)) return emRgb(cor);
  }
  return '#0d100f';
}

/**
 * Sem retrato (deu erro, demorou ou veio vazio): uma cortina escura,
 * granulada, que desmancha do mesmo jeito. Até 30/10/2026 era a cor do fundo
 * da página — no tema claro, a tela inteira ficava branca no estouro dos
 * balões («ao explodir os balões tá ficando toda branca a tela»).
 */
export function cortina(w = Math.ceil(window.innerWidth / BLOCO), h = Math.ceil(window.innerHeight / BLOCO)): Pixels {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#0d0809';
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(120, 12, 20, 0.35)';
  for (let i = 0; i < (w * h) / 7; i++) c.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
  return c.getImageData(0, 0, w, h);
}

/**
 * O retrato saiu, mas vazio? (o html2canvas às vezes falha calado e devolve
 * tudo de uma cor só): pela variação do brilho de uma amostra dos pixels.
 */
export function retratoVazio(px: Pixels): boolean {
  const d = px.data;
  let n = 0, soma = 0, soma2 = 0;
  for (let i = 0; i < d.length; i += 4 * 7) {
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    n++; soma += l; soma2 += l * l;
  }
  if (!n) return true;
  const media = soma / n;
  return Math.sqrt(Math.max(0, soma2 / n - media * media)) < 4;
}

/** O retrato da tela (ou de `alvo`, do tamanho da tela), em pixel grande. */
export async function fotografar(alvo: HTMLElement = document.body): Promise<Pixels> {
  const w = Math.ceil(window.innerWidth / BLOCO), h = Math.ceil(window.innerHeight / BLOCO);
  const fundo = corDoFundo(alvo);
  try {
    const corpo = alvo === document.body;
    const retrato = await Promise.race([
      desenharComHtml2canvas(alvo, {
        scale: 1 / BLOCO,
        backgroundColor: fundo,
        logging: false,
        useCORS: true,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        ...(corpo ? { x: window.scrollX, y: window.scrollY } : {}),
        ignoreElements: el => el.tagName === 'IFRAME' || el.tagName === 'AUDIO' || el.tagName === 'VIDEO'
          || (el instanceof HTMLElement && (el.dataset.portalFora != null || el.hasAttribute('data-som-ambiente-palco'))),
        // O html2canvas pinta sombra interna como bloco cheio: a moldura escura
        // da parede virava faixa preta e o fundo das fotos, a cor da fita.
        onclone: doc => {
          const estilo = doc.createElement('style');
          estilo.textContent = '.mural, .mural-foto-quadro { box-shadow: none !important; }';
          doc.head.appendChild(estilo);
        },
      }).catch((): null => null),
      new Promise<null>(ok => window.setTimeout(() => ok(null), ESPERA_MAX_MS)),
    ]);
    if (!retrato) {
      console.warn('[mural] o retrato da tela não saiu a tempo: a cortina escura no lugar');
      return cortina(w, h);
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.fillStyle = fundo;
    c.fillRect(0, 0, w, h);
    c.drawImage(retrato, 0, 0, w, h);
    const pixels = c.getImageData(0, 0, w, h);
    if (retratoVazio(pixels)) {
      console.warn('[mural] o retrato da tela veio vazio: a cortina escura no lugar');
      return cortina(w, h);
    }
    return pixels;
  } catch (e) {
    console.warn('[mural] o retrato da tela falhou: a cortina escura no lugar', e);
    return cortina(w, h);
  }
}
