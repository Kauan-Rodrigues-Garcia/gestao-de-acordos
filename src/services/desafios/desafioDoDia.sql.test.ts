/**
 * A migration do desafio do dia, conferida no SQL.
 *
 * As duas somas do Painel do Líder (`fn_recebido_por_equipe` e
 * `fn_recebido_por_setor`) ganharam uma versão com janela de chegada, e a
 * versão antiga passou a chamá-la. O corpo da nova é uma CÓPIA do anterior com
 * duas linhas a mais — e é justamente aí que um erro de cópia mudaria, sem
 * aviso, o número do resumo do celular, dos avisos de equipe e do desafio. Este
 * teste compara letra por letra.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

/** Sem comentários e com espaços colapsados. */
function liso(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** O corpo entre `AS $function$` e `$function$;` da função que casa com `cabecalho`. */
function corpo(sql: string, cabecalho: RegExp): string {
  const i = sql.search(cabecalho);
  expect(i, `função ${cabecalho} não encontrada`).toBeGreaterThan(-1);
  const ini = sql.indexOf('$function$', i) + '$function$'.length;
  const fim = sql.indexOf('$function$;', ini);
  return sql.slice(ini, fim).trim();
}

const NOVA = liso(migration('_desafio_do_dia.sql'));
const JANELA = 'AND (p_chegada_de IS NULL OR ar.importado_em >= p_chegada_de) AND (p_chegada_ate IS NULL OR ar.importado_em < p_chegada_ate)';

describe('as somas do Painel ganham a janela sem mudar o resto', () => {
  it('equipe: o corpo é o de 20261006180729 mais a janela', () => {
    const antiga = corpo(liso(migration('_lider_nao_conta_na_equipe_do_alternativo.sql')),
      /FUNCTION public\.fn_recebido_por_equipe\(/);
    const nova = corpo(NOVA, /FUNCTION public\.fn_recebido_por_equipe\( p_empresas UUID\[\], p_mes TEXT, p_ini DATE, p_fim DATE, p_com_ajustes BOOLEAN, p_chegada_de/);
    expect(nova).toContain(JANELA);
    expect(nova.replace(` ${JANELA}`, '')).toBe(antiga);
  });

  it('setor: o corpo é o de 20261006230500 mais a janela', () => {
    const antiga = corpo(liso(migration('_app_resumo_das_visoes.sql')),
      /FUNCTION public\.fn_recebido_por_setor\(/);
    const nova = corpo(NOVA, /FUNCTION public\.fn_recebido_por_setor\( p_empresas UUID\[\], p_mes TEXT, p_ini DATE, p_fim DATE, p_chegada_de/);
    expect(nova).toContain(JANELA);
    expect(nova.replace(` ${JANELA}`, '')).toBe(antiga);
  });

  it('as versões antigas viram a nova com a janela vazia', () => {
    expect(NOVA).toContain('FROM public.fn_recebido_por_equipe( p_empresas, p_mes, p_ini, p_fim, p_com_ajustes, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ) r;');
    expect(NOVA).toContain('FROM public.fn_recebido_por_setor( p_empresas, p_mes, p_ini, p_fim, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ) r;');
    // O padrão do ajuste continua lá: quem chama com quatro argumentos não quebra.
    expect(NOVA).toMatch(/p_fim DATE, p_com_ajustes BOOLEAN DEFAULT FALSE \)/);
  });

  it('as internas continuam fechadas para o app', () => {
    expect(NOVA).toContain('REVOKE ALL ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;');
    expect(NOVA).toContain('REVOKE ALL ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;');
  });
});

describe('fn_desafio_diario', () => {
  const fn = corpo(NOVA, /FUNCTION public\.fn_desafio_diario\(/);

  it('os três portões de fn_desafio_dados', () => {
    expect(fn).toContain('fn_desafio_alcanca_empresa(v_empresas)');
    expect(fn).toMatch(/v_d\.status = 'rascunho' AND NOT public\.fn_user_tem\('desafios_configurar'\) AND NOT public\.fn_user_tem\('desafios_configurar_setor'\)/);
    expect(fn).toContain('fn_desafio_no_meu_alcance(v_d.setor_id, v_d.regra, v_d.visibilidade)');
  });

  it('a janela é a de chegada, no fuso de São Paulo, com a hora do robô', () => {
    expect(fn).toContain("(v_dia + make_interval(hours => v_h_ini + 1)) AT TIME ZONE 'America/Sao_Paulo'");
    expect(fn).toContain("(v_dia + make_interval(hours => v_h_fim + 1)) AT TIME ZONE 'America/Sao_Paulo'");
  });

  it('o total é a conta do Painel', () => {
    expect(fn).toContain('fn_recebido_por_setor(v_empresas, v_mes, v_dia, v_dia, v_de, v_ate)');
    expect(fn).toContain('fn_recebido_por_equipe(v_empresas, v_mes, v_dia, v_dia, FALSE, v_de, v_ate)');
  });

  it('Cofen fica de fora, pela regra do setor', () => {
    expect(fn).toMatch(/IF v_regra = 'cofen' THEN RETURN jsonb_build_object\( 'suportado', FALSE/);
  });

  it('só quem está logado chama', () => {
    expect(NOVA).toContain('REVOKE ALL ON FUNCTION public.fn_desafio_diario(UUID) FROM PUBLIC, anon;');
    expect(NOVA).toContain('GRANT EXECUTE ON FUNCTION public.fn_desafio_diario(UUID) TO authenticated;');
  });
});

describe('20261019180000 — o receptivo e o «sem operador» no placar', () => {
  const RECEPTIVO = migration('_desafio_do_dia_receptivo.sql');
  const antigo = corpo(migration('_desafio_do_dia.sql'), /FUNCTION public\.fn_desafio_diario\(p_desafio_id UUID\)/);
  const novo = corpo(RECEPTIVO, /FUNCTION public\.fn_desafio_diario\(p_desafio_id UUID\)/);

  it('o total continua vindo das mesmas somas do Painel', () => {
    for (const trecho of [
      'public.fn_recebido_por_setor(v_empresas, v_mes, v_dia, v_dia, v_de, v_ate)',
      'public.fn_recebido_por_equipe(v_empresas, v_mes, v_dia, v_dia, FALSE, v_de, v_ate)',
    ]) {
      expect(liso(antigo)).toContain(trecho);
      expect(liso(novo)).toContain(trecho);
    }
  });

  it('separa a contribuição do receptivo nas linhas sem operador do alvo, na janela', () => {
    const l = liso(novo);
    expect(l).toContain("FILTER (WHERE ar.procedencia = 'contribuicao_59')");
    expect(l).toContain('AND ar.setor_id = v_alvo AND ar.operador_id IS NULL AND ar.data_pagamento = v_dia');
    expect(l).toContain('AND (v_de IS NULL OR ar.importado_em >= v_de) AND (v_ate IS NULL OR ar.importado_em < v_ate)');
    expect(l).toContain("'contribuicao_receptivo', jsonb_build_object(");
    expect(l).toContain("'sem_operador', jsonb_build_object(");
  });

  it('o CREATE OR REPLACE não perde o limite de tempo', () => {
    expect(liso(RECEPTIVO)).toContain("ALTER FUNCTION public.fn_desafio_diario(UUID) SET statement_timeout = '15s'");
  });
});
