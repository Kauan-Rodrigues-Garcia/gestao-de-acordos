/**
 * As garantias de Premiações e Comissões que vivem no BANCO, conferidas no SQL.
 *
 * Mesmo recurso de `fechamentoOperadores.sql.test.ts`: não há Postgres nos
 * testes, então o que se prova é que a regra ESTÁ ESCRITA e que nenhuma
 * refatoração a tirou.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20260918150000_fechamento_premiacoes_comissoes.sql'),
  'utf8',
);

/** O SQL sem comentários — um comentário que cita a regra não é a regra. */
const CODIGO = SQL.replace(/--.*$/gm, '');

function corpoDaFuncao(nome: string): string {
  const i = CODIGO.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = CODIGO.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return CODIGO.slice(i, fim);
}

describe('pré-requisitos', () => {
  it('aborta sem as tabelas do RH ou sem o alcance do Fechamento', () => {
    expect(CODIGO).toContain("to_regclass('public.rh_dados_operadores') IS NULL");
    expect(CODIGO).toContain("to_regprocedure('public.fn_fechamento_alcanca(uuid,uuid,integer,integer)') IS NULL");
  });

  it('não cria tabela, policy nem grava dado ao ser aplicada', () => {
    // O INSERT de dentro de `fn_fechamento_salvar_cracha` só roda quando chamada.
    const foraDasFuncoes = CODIGO.replace(/\$function\$[\s\S]*?\$function\$/g, '');
    expect(foraDasFuncoes).not.toMatch(/CREATE\s+TABLE|CREATE\s+POLICY|ALTER\s+TABLE/i);
    expect(foraDasFuncoes).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });
});

describe('leitura', () => {
  const corpo = corpoDaFuncao('fn_fechamento_premiacoes_dados');

  it('exige a empresa e o nível setor ou todos do Fechamento', () => {
    expect(corpo).toContain("public.fn_user_escopo('fechamento')");
    expect(corpo).toContain('NOT public.fn_can_access_empresa(p_empresa_id)');
    expect(corpo).toMatch(/IF v_nivel < 2 THEN\s+RAISE EXCEPTION/);
  });

  it('o crachá passa pelo alcance, salvo no nível empresa', () => {
    expect(corpo).toMatch(/v_nivel >= 3\s+OR public\.fn_fechamento_alcanca\(p_empresa_id, d\.operador_id, p_ano, p_mes\)/);
  });

  it('é SECURITY DEFINER com search_path vazio, só para authenticated', () => {
    expect(corpo).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/);
    expect(CODIGO).toContain('REVOKE ALL ON FUNCTION public.fn_fechamento_premiacoes_dados(UUID, INTEGER, INTEGER) FROM PUBLIC;');
    expect(CODIGO).toContain('GRANT EXECUTE ON FUNCTION public.fn_fechamento_premiacoes_dados(UUID, INTEGER, INTEGER) TO authenticated;');
  });
});

describe('gravação do crachá', () => {
  const corpo = corpoDaFuncao('fn_fechamento_salvar_cracha');

  it('exige fechamento_editar, a empresa do operador e o alcance', () => {
    expect(corpo).toContain("public.fn_user_tem('fechamento_editar')");
    expect(corpo).toContain('p.id = p_operador_id AND p.empresa_id = p_empresa_id');
    expect(corpo).toContain('NOT public.fn_fechamento_alcanca(p_empresa_id, p_operador_id, p_ano, p_mes)');
  });

  it('grava na tabela do RH, a mesma que o RH Gestão lê', () => {
    expect(corpo).toContain('INSERT INTO public.rh_dados_operadores');
    expect(corpo).toContain('ON CONFLICT (empresa_id, operador_id) DO UPDATE');
  });

  it('crachá repetido é recusado dizendo de quem é', () => {
    expect(corpo).toContain("RAISE EXCEPTION 'O crachá % já é de %.'");
  });

  it('é SECURITY DEFINER, só para authenticated', () => {
    expect(corpo).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/);
    expect(CODIGO).toContain('REVOKE ALL ON FUNCTION public.fn_fechamento_salvar_cracha(UUID, UUID, INTEGER, INTEGER, TEXT) FROM PUBLIC;');
  });
});
