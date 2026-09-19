/**
 * copiarImagem.test.ts — a troca de cores que o html2canvas não lê.
 *
 * A captura em si só roda em navegador de verdade (canvas, área de
 * transferência). Aqui fica a regra que decide o que muda na cópia do
 * documento: o defeito de 19/09/2026 foi o `oklch` do fundo do <body>
 * derrubando o «Copiar imagem» do Plantão Elite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { trocarCoresIlegiveis } from './copiarImagem';

/** Documento com estilos computados escolhidos a dedo, por elemento. */
function montar(estilos: Map<Element, Record<string, string>>) {
  const html = document.createElement('html');
  const body = document.createElement('body');
  const alvo = document.createElement('div');
  const filho = document.createElement('span');
  alvo.appendChild(filho);
  body.appendChild(alvo);
  html.appendChild(body);
  const doc = {
    documentElement: html,
    body,
    defaultView: {
      getComputedStyle: (el: Element) => ({
        getPropertyValue: (p: string) => estilos.get(el)?.[p] ?? '',
      }),
    },
  } as unknown as Document;
  return { doc, html, body, alvo, filho };
}

/** Guarda o que pediram para converter e devolve um rgb válido qualquer. */
const convertidas: string[] = [];
const paraRgb = (cor: string) => { convertidas.push(cor); return 'rgb(1, 2, 3)'; };

beforeEach(() => { convertidas.length = 0; });

describe('trocarCoresIlegiveis', () => {
  it('converte o fundo do <html> e do <body>, que o html2canvas lê fora do alvo', () => {
    const estilos = new Map<Element, Record<string, string>>();
    const { doc, html, body, alvo } = montar(estilos);
    estilos.set(html, { 'background-color': 'oklch(0.99 0 0)' });
    estilos.set(body, { 'background-color': 'oklch(0.15 0.01 220)', color: 'oklch(0.9 0 0)' });

    expect(trocarCoresIlegiveis(doc, alvo, paraRgb)).toBe(3);
    expect(html.style.getPropertyValue('background-color')).toBe('rgb(1, 2, 3)');
    expect(body.style.getPropertyValue('color')).toBe('rgb(1, 2, 3)');
    expect(convertidas).toEqual(['oklch(0.99 0 0)', 'oklch(0.9 0 0)', 'oklch(0.15 0.01 220)']);
  });

  it('converte as bordas e o texto do alvo e dos filhos; rgb, hex e transparente ficam', () => {
    const estilos = new Map<Element, Record<string, string>>();
    const { doc, alvo, filho } = montar(estilos);
    estilos.set(alvo, {
      color: 'rgb(7, 12, 14)',
      'background-color': 'rgba(0, 0, 0, 0)',
      'border-top-color': 'oklch(0.88 0.01 220)',
    });
    estilos.set(filho, {
      'border-left-color': 'color-mix(in oklab, oklch(0.45 0.15 220) 50%, transparent)',
      'text-decoration-color': 'lab(50% 10 10)',
      color: '#070C0E',
    });

    expect(trocarCoresIlegiveis(doc, alvo, paraRgb)).toBe(3);
    expect(alvo.style.getPropertyValue('border-top-color')).toBe('rgb(1, 2, 3)');
    expect(alvo.style.getPropertyValue('color')).toBe('');
    expect(alvo.style.getPropertyValue('background-color')).toBe('');
    expect(filho.style.getPropertyValue('border-left-color')).toBe('rgb(1, 2, 3)');
    expect(filho.style.getPropertyValue('color')).toBe('');
    expect(convertidas).toEqual([
      'oklch(0.88 0.01 220)',
      'color-mix(in oklab, oklch(0.45 0.15 220) 50%, transparent)',
      'lab(50% 10 10)',
    ]);
  });

  it('sombra e gradiente com cor ilegível saem; sem cor ilegível, ficam', () => {
    const estilos = new Map<Element, Record<string, string>>();
    const { doc, alvo, filho } = montar(estilos);
    estilos.set(alvo, { 'box-shadow': '0 1px 2px oklch(0 0 0 / 0.1)' });
    estilos.set(filho, { 'box-shadow': '0 1px 2px rgba(0, 0, 0, 0.1)', 'background-image': 'none' });

    expect(trocarCoresIlegiveis(doc, alvo, paraRgb)).toBe(1);
    expect(alvo.style.getPropertyValue('box-shadow')).toBe('none');
    expect(filho.style.getPropertyValue('box-shadow')).toBe('');
  });

  it('a troca vence a regra da folha: vai com !important', () => {
    const estilos = new Map<Element, Record<string, string>>();
    const { doc, alvo } = montar(estilos);
    estilos.set(alvo, { 'border-bottom-color': 'oklch(0.5 0 0)' });
    trocarCoresIlegiveis(doc, alvo, paraRgb);
    expect(alvo.style.getPropertyPriority('border-bottom-color')).toBe('important');
  });
});
