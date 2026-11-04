/**
 * AdminUsuarios — «Minimizar todos» fecha todos os grupos da tela.
 * ─────────────────────────────────────────────────────────────────────────
 * ## O caso (27/10/2026)
 *
 * «Ao clicar em minimizar todos, o Núcleo e o Sem setor não minimizam.» O
 * botão montava o conjunto de recolhidos a partir de `setoresParaFiltro` — as
 * opções do SELETOR de setor, que deixa de fora setor de sistema e inativo
 * (`setorEntraNosFiltros`). O Núcleo é de sistema; o «Sem setor» da tela é o
 * grupo de quem está num setor que o seletor não oferece. Os dois ficavam
 * abertos.
 *
 * A regra: recolher o que está NA TELA (`setoresOrdenados`), o mesmo id que
 * `ListaPessoas` consulta em `recolhidos.has(grupo.id)`.
 *
 * Inspeção estática, como em `AdminUsuarios.setor-vazio.test.ts`: renderizar a
 * página inteira exigiria supabase, auth e as abas de Setores.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../AdminUsuarios.tsx'), 'utf-8');
const LISTA = readFileSync(resolve(__dirname, '../../components/admin/ListaPessoas.tsx'), 'utf-8');

/** O trecho do botão, do comentário até o rótulo. */
const BOTAO = (() => {
  const fim = src.indexOf("'Minimizar todos'");
  expect(fim, 'botão «Minimizar todos» não encontrado').toBeGreaterThan(-1);
  return src.slice(src.lastIndexOf('<Button', fim), fim);
})();

describe('AdminUsuarios — Minimizar todos', () => {
  it('recolhe os grupos da tela, não as opções do seletor', () => {
    expect(BOTAO).toContain('new Set(setoresOrdenados.map(g => g.id))');
    expect(BOTAO).not.toContain('setoresParaFiltro');
  });

  it('a lista fecha o grupo pelo mesmo id', () => {
    expect(LISTA).toContain('recolhidos.has(grupo.id)');
  });
});
