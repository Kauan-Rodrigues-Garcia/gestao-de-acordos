/**
 * As garantias do Banco de horas que vivem no BANCO, conferidas no SQL.
 *
 * Mesmo recurso de `fechamentoOperadores.sql.test.ts`: não há Postgres nos
 * testes, então o que se prova é que a regra ESTÁ ESCRITA.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../supabase/migrations/20261118180000_banco_de_horas.sql'),
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

describe('registro de escopo e catálogo', () => {
  it('`banco_horas` entra no registro, sem perder as abas de antes', () => {
    const corpo = corpoDaFuncao('fn_abas_escopo');
    expect(corpo).toContain('fn_abas_escopo_antes_banco_horas_20261118()');
    expect(corpo).toContain("VALUES ('banco_horas', 'ver_banco_horas')");
  });

  it('as quatro chaves nascem sem cargo nenhum', () => {
    for (const chave of ['ver_banco_horas', 'banco_horas_escopo_setor',
                         'banco_horas_escopo_todos_setores', 'banco_horas_gerenciar']) {
      expect(CODIGO).toMatch(new RegExp(`\\('${chave}',\\s+ARRAY\\['bookplay'\\]::TEXT\\[\\], ARRAY\\[\\]::TEXT\\[\\], false\\)`));
    }
  });
});

describe('tabela', () => {
  it('uma linha por setor do DP por data: importar de novo não duplica', () => {
    expect(SQL).toContain('UNIQUE (empresa_id, saldo_em, empresa_codigo, setor_dp)');
  });

  it('só leitura pela API: nenhuma policy de escrita, e a escrita direta revogada', () => {
    // `SELECT ... FOR UPDATE` dentro da RPC não é policy; só policy interessa aqui.
    expect(CODIGO).not.toMatch(/CREATE POLICY[^;]*FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
    expect(CODIGO).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.banco_horas_setores FROM authenticated');
    expect(CODIGO).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.banco_horas_mapa    FROM authenticated');
  });

  it('a leitura passa pelo alcance da aba', () => {
    expect(CODIGO).toContain('USING (public.fn_banco_horas_alcanca(empresa_id, empresa_codigo, setor_dp))');
  });
});

describe('alcance', () => {
  const alcance = corpoDaFuncao('fn_banco_horas_alcanca');

  it('a aba é própria: não depende do Fechamento', () => {
    expect(alcance).not.toContain('ver_fechamento');
  });

  it('o nível é o da própria aba, nunca o do Fechamento', () => {
    expect(alcance).toContain("fn_user_escopo('banco_horas')");
    expect(alcance).not.toContain("fn_user_escopo('fechamento')");
  });

  it('no nível setor, só o que o vínculo liga aos setores da pessoa', () => {
    expect(alcance).toContain('public.banco_horas_mapa');
    expect(alcance).toContain('fn_setores_do_operador((SELECT auth.uid()))');
  });

  it('é SECURITY DEFINER com search_path travado', () => {
    expect(alcance).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/);
  });
});

describe('escrita', () => {
  const gerenciar = corpoDaFuncao('fn_banco_horas_pode_gerenciar');

  it('gerenciar exige a chave e o alcance de todos os setores', () => {
    expect(gerenciar).toContain("fn_user_tem('banco_horas_gerenciar')");
    expect(gerenciar).toContain("fn_user_escopo('banco_horas') >= 3");
  });

  it('a chave do rascunho (aba dentro do Fechamento) é tirada dos cargos', () => {
    expect(CODIGO).toContain("SET permissoes = permissoes - 'fechamento_sub_banco_horas'");
  });

  it('importar, apagar e ligar setores conferem a permissão antes de tudo', () => {
    for (const fn of ['fn_banco_horas_importar', 'fn_banco_horas_apagar', 'fn_banco_horas_mapa_salvar']) {
      const corpo = corpoDaFuncao(fn);
      const i = corpo.indexOf('fn_banco_horas_pode_gerenciar(p_empresa_id)');
      expect(i, fn).toBeGreaterThan(-1);
      expect(corpo.indexOf('DELETE'), fn).toSatisfy((d: number) => d === -1 || d > i);
      expect(corpo.indexOf('INSERT'), fn).toSatisfy((d: number) => d === -1 || d > i);
    }
  });

  it('setor igual não é tocado: compara a assinatura antes de trocar', () => {
    const corpo = corpoDaFuncao('fn_banco_horas_importar');
    expect(corpo).toContain('ELSIF v_atual.assinatura = v_ass THEN');
    expect(corpo).toContain('v_iguais := v_iguais + 1');
  });

  it('o vínculo só aceita setor da própria empresa', () => {
    expect(corpoDaFuncao('fn_banco_horas_mapa_salvar')).toContain('s.empresa_id = p_empresa_id');
  });
});
