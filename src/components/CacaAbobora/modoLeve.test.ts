/**
 * modoLeve.test.ts — a Caça aos Zumbis funciona igual no Modo leve.
 *
 * É gincana da empresa inteira (Cleber, 08/10/2026): quem está com o sistema
 * mais leve também vê o zumbi, o recado e a faixa. O Modo leve encurta TODA
 * animação para 1 ms (`index.css`), e as do zumbi terminam invisíveis — sem a
 * exceção das classes `zb-*`, o recado e o HEADSHOT! sumiam na hora e a faixa
 * parava. Um ajuste distraído no seletor apagaria isso sem quebrar build.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');

describe('Modo leve e a Caça aos Zumbis', () => {
  it('a regra que encurta as animações deixa as classes zb-* de fora', () => {
    const regra = CSS.slice(CSS.indexOf('html[data-leve] *'), CSS.indexOf('animation-duration: 1ms'));
    expect(regra).toContain('html[data-leve] *:not([class^="zb-"], [class*=" zb-"]),');
    expect(regra).toContain('html[data-leve] *:not([class^="zb-"], [class*=" zb-"])::before,');
    expect(regra).toContain('html[data-leve] *:not([class^="zb-"], [class*=" zb-"])::after {');
  });
});
