/**
 * Comissão por meta — as garantias da migration 20260911190000, conferidas no SQL.
 *
 * Quem cumpre «escrita só por RPC», «a trava vale para configurar e não para
 * confirmar» e «importar não copia a confirmação» é o Postgres. O que dá para
 * provar aqui é que as regras ESTÃO ESCRITAS. Mesmo recurso de
 * `numerosSituacoesPrazo.sql.test.ts`.
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

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

const SQL    = migration('_comissao_por_meta.sql');
const CODIGO = semComentarios(SQL);
const corpo  = (nome: string) => semComentarios(corpoDaFuncao(SQL, nome));

/** Cada RPC e a chave que ela exige. */
const RPCS: Record<string, string> = {
  fn_comissao_salvar:                'metas_comissao_editar',
  fn_comissao_importar_mes_anterior: 'metas_comissao_editar',
  fn_comissao_excluir_excecao:       'metas_comissao_editar',
  fn_comissao_confirmar_meta_setor:  'metas_comissao_confirmar_setor',
};

describe('as tabelas', () => {
  it('existem as duas, com RLS ligada', () => {
    for (const t of ['comissao_config', 'comissao_faixas']) {
      expect(CODIGO, t).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
      expect(CODIGO, t).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('uma competência por setor, equipe e mês — a equipe nula incluída', () => {
    expect(CODIGO).toMatch(
      /UNIQUE NULLS NOT DISTINCT\s*\(\s*empresa_id,\s*setor_id,\s*equipe_id,\s*ano,\s*mes\s*\)/,
    );
  });

  it('a exceção de equipe não carrega regra nem confirmação do setor', () => {
    expect(CODIGO).toContain('CONSTRAINT comissao_config_excecao_sem_regra');
  });

  it('só existe policy de leitura — escrita é por RPC', () => {
    const policies = [...CODIGO.matchAll(
      /CREATE POLICY\s+\w+\s+ON\s+public\.comissao_(?:config|faixas)\s+FOR\s+(\w+)/g,
    )].map(m => m[1].toUpperCase());
    expect(policies).toEqual(['SELECT', 'SELECT']);
  });
});

describe('as RPCs', () => {
  it.each(Object.entries(RPCS))('%s exige a chave %s', (nome, chave) => {
    const c = corpo(nome);
    expect(c).toContain('SECURITY DEFINER');
    expect(c).toContain(`fn_user_tem('${chave}')`);
  });

  it.each(Object.keys(RPCS))('%s confere a empresa de quem chama', nome => {
    expect(corpo(nome)).toContain('fn_can_access_empresa');
  });

  it.each(['fn_comissao_salvar', 'fn_comissao_importar_mes_anterior', 'fn_comissao_excluir_excecao'])(
    '%s respeita a trava da meta do setor',
    nome => { expect(corpo(nome)).toContain('fn_metas_esta_validada'); },
  );

  it('confirmar a meta do setor não passa pela trava', () => {
    expect(corpo('fn_comissao_confirmar_meta_setor')).not.toContain('fn_metas_esta_validada');
  });

  it('salvar e importar não tocam na confirmação', () => {
    expect(corpo('fn_comissao_salvar')).not.toContain('setor_meta_confirmada');
    expect(corpo('fn_comissao_importar_mes_anterior')).not.toContain('setor_meta_confirmada');
  });

  it('importar cria linhas novas, com faixas novas', () => {
    const c = corpo('fn_comissao_importar_mes_anterior');
    expect(c).toContain('INSERT INTO public.comissao_config');
    expect(c).toContain('INSERT INTO public.comissao_faixas');
  });

  it('salvar recusa exceção de equipe sem o padrão do setor no mês', () => {
    expect(corpo('fn_comissao_salvar')).toMatch(/Configure o padr[aã]o do setor/);
  });

  it.each(Object.keys(RPCS))('%s só executa para quem está logado', nome => {
    expect(CODIGO).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\([^)]*\\) FROM PUBLIC, anon`));
    expect(CODIGO).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${nome}\\([^)]*\\) TO authenticated`));
  });
});

describe('tempo real e catálogo', () => {
  it('as duas tabelas entram na publicação do realtime', () => {
    expect(CODIGO).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.comissao_config');
    expect(CODIGO).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.comissao_faixas');
  });

  const CHAVES = [...new Set(Object.values(RPCS)), 'metas_comissao_ver', 'dashboard_comissao'];

  it.each(CHAVES)('a chave %s entra no catálogo', chave => {
    expect(CODIGO).toContain(`('${chave}'`);
  });

  it.each(CHAVES)('o padrão de %s chega aos cargos sem sobrescrever o que foi feito à mão', chave => {
    expect(CODIGO).toContain(`NOT (cp.permissoes ? '${chave}')`);
  });
});
