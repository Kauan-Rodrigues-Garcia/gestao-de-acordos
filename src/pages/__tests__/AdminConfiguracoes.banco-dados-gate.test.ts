/**
 * AdminConfiguracoes.banco-dados-gate.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do item #8:
 *   O card "Banco de Dados / Migrations" dentro de /admin/configuracoes
 *   (aba Geral) deve seguir a mesma matriz configurável da aba e da rota.
 *
 * O teste usa inspeção estática do fonte (AST-like via regex) porque
 * renderizar AdminConfiguracoes completo exige supabase/auth/motion +
 * sub-páginas AdminCargos/AdminLogs/AdminDiretoExtra lazy-loaded.
 * A checagem estática garante que:
 *   1. `useCargoPermissoes` é importado e usado.
 *   2. Existe a variável `podeVerBancoDados` derivada da permissão da aba Geral.
 *   4. O Card que contém o título "Banco de Dados / Migrations" está
 *      renderizado dentro de `{podeVerBancoDados && (...)}`.
 *   5. O useEffect que probe `acordos.instituicao` também respeita o gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(__dirname, '../AdminConfiguracoes.tsx');
const src = readFileSync(FILE, 'utf-8');

describe('AdminConfiguracoes — gate do card "Banco de Dados / Migrations" (#8)', () => {
  it('importa useCargoPermissoes do hook local', () => {
    expect(src).toMatch(/import\s*\{\s*useCargoPermissoes\s*\}\s*from\s*['"]@\/hooks\/useCargoPermissoes['"]/);
  });

  it('declara podeVerBancoDados pela permissão da aba Geral', () => {
    expect(src).toMatch(
      /const\s+podeVerBancoDados\s*=\s*temPermissao\(\s*['"]ver_configuracoes_geral['"]\s*\)/,
    );
  });

  it('Card com título "Banco de Dados / Migrations" está envolto em {podeVerBancoDados && (...)}', () => {
    // Localiza o índice do título renderizado (não o comentário acima do hook).
    // Marcador único: "<Database" (ícone do CardTitle) seguido do texto do título.
    const idxTitulo = src.search(/<Database\b[\s\S]{0,120}Banco de Dados \/ Migrations/);
    expect(idxTitulo).toBeGreaterThan(-1);
    // A abertura do gate deve existir no fonte, e deve ocorrer entre a declaração
    // e a renderização do título.
    const idxDecl = src.indexOf('const podeVerBancoDados');
    expect(idxDecl).toBeGreaterThan(-1);
    const regexGate = /\{\s*podeVerBancoDados\s*&&\s*\(/g;
    let algumaNoIntervalo = false;
    for (const m of src.matchAll(regexGate)) {
      const pos = m.index ?? -1;
      if (pos > idxDecl && pos < idxTitulo) { algumaNoIntervalo = true; break; }
    }
    expect(algumaNoIntervalo).toBe(true);
  });

  it('fechamento ")}" do gate ocorre APÓS o fechamento </Card> do bloco Banco de Dados', () => {
    const idxTitulo = src.search(/<Database\b[\s\S]{0,120}Banco de Dados \/ Migrations/);
    expect(idxTitulo).toBeGreaterThan(-1);
    const idxFechaCard = src.indexOf('</Card>', idxTitulo);
    expect(idxFechaCard).toBeGreaterThan(idxTitulo);
    const idxFechaGate = src.indexOf(')}', idxFechaCard);
    expect(idxFechaGate).toBeGreaterThan(idxFechaCard);
  });

  it('useEffect do schemaStatus respeita podeVerBancoDados (guarda inicial + dependência)', () => {
    // Recorta o bloco do useEffect
    const regexEffect =
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?setSchemaStatus[\s\S]*?\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/;
    const match = src.match(regexEffect);
    expect(match).not.toBeNull();
    const [bodyFull, deps] = match!;
    expect(bodyFull).toMatch(/if\s*\(\s*!podeVerBancoDados\s*\)\s*return\s*;?/);
    expect(deps.trim()).toBe('podeVerBancoDados');
  });

  it('a proteção no Layout usa a permissão da aba Configurações', () => {
    const layoutSrc = readFileSync(
      resolve(__dirname, '../../components/Layout.tsx'),
      'utf-8',
    );
    expect(layoutSrc).toMatch(
      /label:\s*['"]Configurações['"][\s\S]{0,160}permissaoKey:\s*['"]ver_configuracoes['"]/,
    );
  });
});
