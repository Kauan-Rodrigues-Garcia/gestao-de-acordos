/**
 * fotografar.ts — o retrato do que está na tela (o html2canvas do «copiar
 * imagem», com as cores do tema trocadas: `lib/copiarImagem.ts`) em pixel
 * grande: cada pixel do retrato vale `BLOCO` × `BLOCO` na tela, a mesma
 * pixel art do resto do portal, e são menos pixels para desmanchar
 * (`TelaQueDesmancha.tsx`).
 *
 * Quem não deve sair no retrato (o painel de teste, os balões, a própria
 * abertura) leva o atributo `data-portal-fora`.
 */
import { desenharComHtml2canvas } from '@/lib/copiarImagem';
import type { Pixels } from './desmanche';

export const BLOCO = 4;
/** O retrato demora no máximo isso; passou, a tela desmancha lisa. */
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

/** Sem retrato (deu erro ou demorou): a cor do fundo, com um granulado. */
function telaLisa(w: number, h: number, cor: string): Pixels {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = cor;
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < (w * h) / 9; i++) c.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
  return c.getImageData(0, 0, w, h);
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
        ignoreElements: el => el instanceof HTMLElement && el.dataset.portalFora != null,
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
    if (!retrato) return telaLisa(w, h, fundo);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.fillStyle = fundo;
    c.fillRect(0, 0, w, h);
    c.drawImage(retrato, 0, 0, w, h);
    return c.getImageData(0, 0, w, h);
  } catch {
    return telaLisa(w, h, fundo);
  }
}
