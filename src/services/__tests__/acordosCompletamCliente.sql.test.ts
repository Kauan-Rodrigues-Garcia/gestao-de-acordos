/**
 * Acordo novo completa nome do cliente e instituição pelo histórico da chave —
 * conferido no SQL da migration 20261117120000 e no script de preenchimento.
 *
 * O que não pode quebrar: a instituição só entra em acordo COM NR (sem NR ela
 * é a chave — o Código da regra Cofen), nada é sobrescrito, e as instituições
 * fora da tela viram MUNDIAL EDITORA.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INSTITUICOES_OPTIONS } from '@/lib/index';

const RAIZ = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_acordos_completam_cliente.sql'));

function liso(p: string): string {
  return fs.readFileSync(p, 'utf8').replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
}

const SQL = liso(path.join(MIGRATIONS, arquivo as string));
const SCRIPT = liso(path.join(RAIZ, 'supabase/sql_scripts/preencher_cliente_dos_acordos_20261117.sql'));

function corpoDe(nome: string): string {
  const i = SQL.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  return SQL.slice(i, SQL.indexOf('$function$;', i));
}

describe('fn_instituicao_oficial', () => {
  const corpo = corpoDe('fn_instituicao_oficial');

  it('conhece as quatro da tela, com o mesmo texto', () => {
    for (const inst of INSTITUICOES_OPTIONS) {
      expect(corpo).toContain(`WHEN '${inst}' THEN '${inst}'`);
    }
  });

  it('UNIVERSIDADE PLAY e EDIT BRASIL viram MUNDIAL EDITORA (17/11/2026)', () => {
    expect(corpo).toContain("WHEN 'UNIVERSIDADE PLAY' THEN 'MUNDIAL EDITORA'");
    expect(corpo).toContain("WHEN 'EDIT BRASIL' THEN 'MUNDIAL EDITORA'");
  });

  it('o resto não entra (CASE sem ELSE)', () => {
    expect(corpo).not.toContain('ELSE');
  });
});

describe('fn_cliente_conhecido', () => {
  const corpo = corpoDe('fn_cliente_conhecido');

  it('procura primeiro no acordo anterior, depois no relatório', () => {
    const acordo = corpo.indexOf('FROM public.acordos a');
    const relatorio = corpo.indexOf('FROM public.analitico_recebimentos r');
    expect(acordo).toBeGreaterThan(-1);
    expect(relatorio).toBeGreaterThan(acordo);
    expect(corpo).toContain('IF v_nome IS NULL THEN');
  });

  it('fica na mesma empresa', () => {
    expect(corpo).toContain('a.empresa_id = p_empresa_id');
    expect(corpo).toContain('r.empresa_id = p_empresa_id');
  });

  it('instituição só quando a chave é o NR', () => {
    expect(corpo).toContain("IF v_campo = 'nr_cliente' AND v_inst IS NULL THEN");
    expect(corpo).toContain("IF v_campo <> 'nr_cliente' THEN v_inst := NULL;");
  });

  it('nome com CPF não é aproveitado', () => {
    expect(corpo.split('NOT public.fn_texto_tem_cpf(').length - 1).toBe(3);
  });

  it('é interna: lê nome de cliente de qualquer operador', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.fn_cliente_conhecido(uuid, text, text) FROM PUBLIC, anon, authenticated',
    );
  });
});

describe('fn_acordos_completa_cliente', () => {
  const corpo = corpoDe('fn_acordos_completa_cliente');

  it('só completa o que chegou vazio', () => {
    expect(corpo).toContain("v_falta_nome boolean := btrim(coalesce(NEW.nome_cliente, '')) = ''");
    expect(corpo).toContain('IF v_falta_nome AND v_nome IS NOT NULL THEN');
    expect(corpo).toContain('IF v_falta_inst AND v_inst IS NOT NULL THEN');
  });

  it('instituição vazia só conta como falta quando há NR', () => {
    expect(corpo).toContain(
      "v_falta_inst boolean := btrim(coalesce(NEW.nr_cliente, '')) <> '' AND btrim(coalesce(NEW.instituicao, '')) = ''",
    );
  });

  it('erro na busca não derruba o salvamento', () => {
    expect(corpo).toContain('EXCEPTION WHEN OTHERS THEN');
  });

  it('é BEFORE INSERT e roda antes do gatilho de CPF (ordem alfabética)', () => {
    expect(SQL).toContain(
      'CREATE TRIGGER trg_acordos_completa_cliente BEFORE INSERT ON public.acordos FOR EACH ROW',
    );
    expect('trg_acordos_completa_cliente' < 'trg_acordos_recusa_cpf').toBe(true);
    expect('trg_acordos_completa_cliente' > 'trg_acordos_chave_so_numeros').toBe(true);
  });
});

describe('a migration não escreve em linha nenhuma por conta própria', () => {
  it('fora das funções não há UPDATE, INSERT nem DELETE', () => {
    let fora = SQL;
    for (;;) {
      const i = fora.indexOf('AS $function$');
      if (i < 0) break;
      fora = fora.slice(0, i) + fora.slice(fora.indexOf('$function$;', i) + '$function$;'.length);
    }
    expect(fora).not.toMatch(/\b(UPDATE|INSERT INTO|DELETE FROM)\b/);
  });
});

describe('script de preenchimento', () => {
  it('a prévia vem antes e só lê', () => {
    const previa = SCRIPT.slice(0, SCRIPT.indexOf('BEGIN;'));
    expect(previa).toContain('fn_cliente_conhecido');
    expect(previa).not.toMatch(/\bUPDATE\b/);
  });

  it('não sobrescreve nada e só mexe na instituição de acordo com NR', () => {
    expect(SCRIPT).toContain("CASE WHEN btrim(coalesce(a.nome_cliente, '')) = '' THEN c.cliente_nome END");
    expect(SCRIPT).toContain(
      "CASE WHEN btrim(coalesce(a.nr_cliente, '')) <> '' AND btrim(coalesce(a.instituicao, '')) = '' THEN c.cliente_instituicao END",
    );
    expect(SCRIPT).toContain('SET nome_cliente = coalesce(alvo.nome_novo, a.nome_cliente)');
    expect(SCRIPT).toContain('instituicao = coalesce(alvo.inst_nova, a.instituicao)');
  });

  it('desliga a sincronização do par só dentro da transação', () => {
    expect(SCRIPT).toContain("SET LOCAL app.par_vinculo_em_curso = 'on'");
  });
});
