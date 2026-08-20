import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../supabase/migrations/20260820184619_restringir_acordos_ao_setor_permitido.sql',
  ),
  'utf8',
);

describe('migration de escopo dos acordos por setor', () => {
  it('é atômica e troca somente as policies de leitura', () => {
    expect(SQL.trimStart()).toMatch(/^--[\s\S]*?\bBEGIN\s*;/i);
    expect(SQL.trimEnd()).toMatch(/COMMIT\s*;$/i);
    expect(SQL).toMatch(/DROP POLICY IF EXISTS permissoes3_acordos_select_allow/i);
    expect(SQL).toMatch(/DROP POLICY IF EXISTS permissoes3_acordos_select_gate/i);
    expect(SQL).not.toMatch(/permissoes3_acordos_(insert|update|delete)/i);
  });

  it('preserva os próprios acordos sem exigir visão geral', () => {
    expect(SQL.match(/operador_id=\(SELECT auth\.uid\(\)\)/g)).toHaveLength(2);
  });

  it('exige visão geral antes de liberar qualquer acordo de terceiro', () => {
    expect(SQL.match(/ARRAY\['ver_dashboard','ver_acordos'\]::TEXT\[],true/g)).toHaveLength(2);
  });

  it('só abre outros setores com a chave específica', () => {
    expect(SQL.match(/ARRAY\['ver_todos_setores'\]::TEXT\[],false/g)).toHaveLength(2);
    expect(SQL.match(/setor_id=\(SELECT public\.fn_user_setor_id\(\)\)/g)).toHaveLength(2);
  });

  it('mantém acordos antigos sem setor e operadores clonados no setor', () => {
    expect(SQL.match(/fn_operador_setor_id\(operador_id\)/g)).toHaveLength(2);
    expect(SQL.match(/fn_operador_clonado_no_setor/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('instala uma barreira restritiva e valida a expressão criada', () => {
    expect(SQL).toMatch(/CREATE POLICY permissoes3_acordos_select_gate[\s\S]*?AS RESTRICTIVE/i);
    expect(SQL).toMatch(/DO \$verify\$/i);
    expect(SQL).toMatch(/NOT p\.polpermissive/i);
  });
});
