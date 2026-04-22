/**
 * AdminConfiguracoes.banco-dados-gate.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do item #8:
 *   O card "Banco de Dados / Migrations" dentro de /admin/configuracoes
 *   (aba Geral) deve ser visível APENAS para perfis `administrador` e
 *   `super_admin`. Qualquer perfil abaixo (lider, elite, gerencia,
 *   diretoria, operador) NÃO deve ver o card, mesmo que consiga acessar
 *   a rota por algum motivo — defesa em profundidade além do
 *   ProtectedRoute do App.
 *
 * O teste usa inspeção estática do fonte (AST-like via regex) porque
 * renderizar AdminConfiguracoes completo exige supabase/auth/motion +
 * sub-páginas AdminIA/AdminCargos/AdminLogs/AdminDiretoExtra lazy-loaded.
 * A checagem estática garante que:
 *   1. `useAuth` é importado e usado.
 *   2. `isPerfilAdmin` é importado de `@/lib/index`.
 *   3. Existe a variável `podeVerBancoDados` derivada de isPerfilAdmin(perfil.perfil).
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
  it('importa useAuth do hook local', () => {
    expect(src).toMatch(/import\s*\{\s*useAuth\s*\}\s*from\s*['"]@\/hooks\/useAuth['"]/);
  });

  it('importa isPerfilAdmin de @/lib/index', () => {
    expect(src).toMatch(/import\s*\{\s*isPerfilAdmin\s*\}\s*from\s*['"]@\/lib\/index['"]/);
  });

  it('declara podeVerBancoDados derivado de isPerfilAdmin(perfil.perfil)', () => {
    // Aceita `perfil?.perfil ?? ''` ou `perfil?.perfil || ''`
    expect(src).toMatch(
      /const\s+podeVerBancoDados\s*=\s*isPerfilAdmin\(\s*perfil\?\.perfil\s*(\?\?|\|\|)\s*['"]{2}\s*\)/,
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

  it('a proteção no Layout aponta para apenas administrador no menu', () => {
    // Regressão cruzada: confirma que o item de menu segue com roles=['administrador']
    // (super_admin passa pelo bypass). Se alguém relaxar isso no Layout no futuro,
    // o card no AdminConfiguracoes continua protegido pelo gate local.
    const layoutSrc = readFileSync(
      resolve(__dirname, '../../components/Layout.tsx'),
      'utf-8',
    );
    expect(layoutSrc).toMatch(
      /label:\s*['"]Configurações['"][\s\S]{0,120}roles:\s*\[\s*['"]administrador['"]\s*\]/,
    );
  });
});
