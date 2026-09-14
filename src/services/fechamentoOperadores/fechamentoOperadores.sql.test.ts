/**
 * As garantias da aba Fechamento que vivem no BANCO, conferidas no SQL.
 *
 * Mesmo recurso de `rhSeguranca.sql.test.ts`: não há Postgres nos testes, então
 * o que se prova é que a regra ESTÁ ESCRITA e que nenhuma refatoração a tirou.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20260914170000_fechamento_operadores.sql'),
  'utf8',
);

function corpoDaFuncao(nome: string): string {
  const i = SQL.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = SQL.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return SQL.slice(i, fim);
}

/** O SQL sem comentários — um comentário que cita a regra não é a regra. */
const CODIGO = SQL.replace(/--.*$/gm, '');

describe('a aba entra no registro de escopo do banco', () => {
  it('`fn_abas_escopo` conhece `fechamento`', () => {
    // Sem esta linha, `fn_user_escopo('fechamento')` devolve -1 para todo mundo
    // e a RLS não entrega linha nenhuma.
    expect(corpoDaFuncao('fn_abas_escopo')).toContain("('fechamento',       'ver_fechamento')");
  });

  it('as demais abas continuam registradas', () => {
    const corpo = corpoDaFuncao('fn_abas_escopo');
    for (const aba of ['dashboard', 'acordos', 'lixeira', 'pix', 'painel_lider',
                       'painel_diretoria', 'analitico', 'usuarios', 'rh', 'chips']) {
      expect(corpo, aba).toContain(`('${aba}'`);
    }
  });
});

describe('tabela', () => {
  it('uma linha por operador por mês — um mês não sobrescreve o outro', () => {
    expect(SQL).toContain('UNIQUE (empresa_id, operador_id, ano, mes)');
  });

  it('só leitura pela API: nenhuma policy de escrita', () => {
    expect(CODIGO).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
    expect(CODIGO).toMatch(/CREATE POLICY fechamento_operadores_select[\s\S]*FOR SELECT/);
  });

  it('a leitura exige o alcance da aba, e não só a empresa', () => {
    expect(CODIGO).toContain('USING (public.fn_fechamento_alcanca(empresa_id, operador_id, ano, mes))');
    expect(corpoDaFuncao('fn_fechamento_alcanca')).toContain("fn_user_escopo('fechamento')");
  });
});

describe('gravação', () => {
  const salvar = corpoDaFuncao('fn_fechamento_salvar');

  it('exige a chave de editar e o alcance sobre o operador', () => {
    expect(salvar).toContain("fn_user_tem('fechamento_editar')");
    expect(salvar).toContain('fn_fechamento_alcanca(p_empresa_id, p_operador_id, p_ano, p_mes)');
  });

  it('confere que o operador é da empresa', () => {
    expect(salvar).toMatch(/p\.id = p_operador_id AND p\.empresa_id = p_empresa_id/);
  });
});

describe('a situação do fechamento não é a do perfil', () => {
  it('nada nesta migration escreve em `perfis`', () => {
    expect(CODIGO).not.toMatch(/UPDATE\s+public\.perfis/i);
    expect(CODIGO).not.toMatch(/INSERT\s+INTO\s+public\.perfis/i);
    // Nenhuma leitura da coluna do perfil — os COMMENT ON citam o nome dela só
    // para dizer que não há relação.
    expect(CODIGO).not.toMatch(/\bp\.situacao\b/i);
  });

  it('nenhum cargo nasce com as chaves', () => {
    for (const chave of ['ver_fechamento', 'fechamento_escopo_setor',
                         'fechamento_escopo_todos_setores', 'fechamento_editar']) {
      expect(SQL, chave).toMatch(
        new RegExp(`\\('${chave}',\\s*ARRAY\\['bookplay'\\]::TEXT\\[\\],\\s*ARRAY\\[\\]::TEXT\\[\\],\\s*false\\)`));
    }
  });
});
