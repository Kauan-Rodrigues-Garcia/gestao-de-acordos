import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const arquivos = [
  'index.tsx',
  'components.tsx',
  'ExtrasSection.tsx',
  'MetaSection.tsx',
  'ReceitaDistribuicaoPP.tsx',
];

const codigo = arquivos
  .map(arquivo => fs.readFileSync(path.resolve(__dirname, arquivo), 'utf8'))
  .join('\n');

describe('Painel Diretoria — orçamento de renderização', () => {
  it('não mantém desfoque caro nas superfícies persistentes', () => {
    // Os três usos restantes pertencem a tooltips pequenos e temporários.
    expect(codigo.match(/backdrop-blur/g) ?? []).toHaveLength(3);
    expect(codigo).not.toMatch(/blur-(?:2xl|3xl)/);
  });

  it('desliga a animação SVG dos quatro elementos de gráficos', () => {
    expect(codigo.match(/isAnimationActive=\{false\}/g) ?? []).toHaveLength(4);
  });

  it('limita animações escalonadas em listas longas', () => {
    expect(codigo).toContain('initial={index < 4 ?');
    expect(codigo).toContain('initial={i < 6 ?');
    expect(codigo).toContain('[content-visibility:auto]');
  });
});
