/**
 * O Dashboard – ADM — as garantias da migration 20260911160000, conferidas no SQL.
 *
 * O contrato chave a chave com o TypeScript é de `permissoes-catalogo.sql.test.ts`,
 * que lê a definição mais recente do catálogo. Aqui fica o que aquele teste não
 * vê: que a versão velha de `ver_dashboard` sai antes da nova, e que as linhas
 * que já existem mudam sem atropelar configuração feita à mão.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

/** O SQL sem os comentários — para não confundir explicação com regra. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const CODIGO = semComentarios(migration('_dashboard_adm.sql'));

function linhaDoCatalogo(chave: string): string {
  const linha = CODIGO.split('\n').find(l => l.includes(`('${chave}',`));
  expect(linha, `${chave} fora do catálogo`).toBeTruthy();
  return (linha as string).trim();
}

describe('a chave da aba', () => {
  it('nasce só no Assistente ADM, e só na BookPlay', () => {
    expect(linhaDoCatalogo('ver_dashboard_adm')).toMatch(
      /ARRAY\['bookplay'\]::TEXT\[\],\s*ARRAY\['assistente_adm'\]::TEXT\[\],\s*false\)$/);
  });

  it('acesso total nasce com ela, e a semeadura não sobrescreve o que já foi configurado', () => {
    expect(CODIGO).toContain("cp.cargo IN ('assistente_adm', 'administrador', 'super_admin')");
    expect(CODIGO).toContain("NOT (cp.permissoes ? 'ver_dashboard_adm')");
  });
});

describe('o Assistente ADM sai do Dashboard da cobrança', () => {
  it('a versão anterior de ver_dashboard sai antes de a nova entrar', () => {
    expect(CODIGO).toMatch(/WHERE c\.chave NOT IN \('ver_dashboard'\)\s*UNION ALL/);
  });

  it('o padrão novo mantém os cargos da cobrança e o RH, sem o Assistente ADM', () => {
    const linha = linhaDoCatalogo('ver_dashboard');
    for (const c of ['operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria', 'rh']) {
      expect(linha, c).toContain(`'${c}'`);
    }
    expect(linha).not.toContain('assistente_adm');
  });

  it('as linhas do Assistente ADM que já existem são desligadas', () => {
    expect(CODIGO).toMatch(
      /jsonb_build_object\('ver_dashboard', false\)[\s\S]*?WHERE cp\.cargo = 'assistente_adm'/);
  });
});
