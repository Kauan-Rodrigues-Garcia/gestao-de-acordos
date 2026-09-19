/**
 * Contrato do catálogo de temas com o CSS e o index.html.
 *
 * O Cinza Escuro e o Azul Profundo nasceram só com o bloco de tokens: o
 * `@custom-variant dark` continuou olhando apenas `.dark`, e todo `dark:` do
 * sistema ficou desligado neles. Estes testes quebram se um tema entrar no
 * catálogo sem entrar nos outros lugares.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NOMES_TEMAS, TEMAS, TEMAS_ESCUROS } from './temas';

const CSS = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');
const HTML = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

describe('catálogo de temas', () => {
  it('a variante dark: do Tailwind cobre todo tema escuro', () => {
    const variante = CSS.match(/@custom-variant dark \((.+)\);/)?.[1] ?? '';
    for (const t of TEMAS_ESCUROS) expect(variante).toContain(`.${t} *`);
  });

  it('todo tema escuro declara color-scheme: dark', () => {
    const regra = CSS.match(/([^\n}]+)\{\s*color-scheme:\s*dark;\s*\}/)?.[1] ?? '';
    for (const t of TEMAS_ESCUROS) expect(regra).toContain(`.${t}`);
  });

  it('todo tema além do Claro tem bloco de tokens próprio', () => {
    for (const t of NOMES_TEMAS.filter(n => n !== 'light')) {
      expect(CSS).toMatch(new RegExp(`\\n\\.${t} \\{[^}]*--background:`));
    }
  });

  it('o script anti-piscada do index.html conhece os mesmos temas', () => {
    const lista = HTML.match(/var validos = \[([^\]]+)\]/)?.[1] ?? '';
    const doHtml = lista.split(',').map(s => s.trim().replace(/'/g, ''));
    expect(doHtml).toEqual(NOMES_TEMAS);
  });

  it('rótulos e valores são únicos', () => {
    expect(new Set(TEMAS.map(t => t.valor)).size).toBe(TEMAS.length);
    expect(new Set(TEMAS.map(t => t.rotulo)).size).toBe(TEMAS.length);
  });
});
