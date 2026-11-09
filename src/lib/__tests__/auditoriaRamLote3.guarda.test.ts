/**
 * Guarda da auditoria de RAM, lote 3 (migration 20261109220000, 09/11/2026).
 *
 * Olha a ÚLTIMA migration que mexe em cada objeto — é a que vale no banco:
 *
 *   - `fn_empresas_acessiveis` (124 policies de 71 tabelas) não pode voltar a
 *     chamar `fn_can_access_empresa` empresa por empresa: era uma
 *     `fn_user_tem` por empresa em quase toda leitura do app.
 *   - `autorizacoes_select` não pode voltar a chamar `fn_pode_autorizar_pedido`
 *     por linha (166 ms por leitura da lista).
 *   - `fn_analitico_mes_agregado` é plpgsql (o resultado grande em função SQL
 *     espalhava em disco, 20261109200000) e invocadora (RLS de quem chama).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const semComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

/** O trecho da última ocorrência de `abre` nas migrations até `fecha`. */
function ultimo(abre: RegExp, fecha: RegExp): { arquivo: string; sql: string } {
  for (const arquivo of [...ARQUIVOS].reverse()) {
    const sql = semComentarios(fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8'));
    const achados = [...sql.matchAll(new RegExp(abre.source, 'gi'))];
    if (!achados.length) continue;
    const inicio = achados[achados.length - 1].index ?? 0;
    const resto = sql.slice(inicio);
    const fim = resto.search(fecha);
    return { arquivo, sql: fim >= 0 ? resto.slice(0, fim) : resto };
  }
  throw new Error(`nada encontrado para ${abre}`);
}

const funcao = (nome: string) =>
  ultimo(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${nome}\\s*\\(`), /\$function\$\s*;/);

describe('auditoria de RAM, lote 3', () => {
  it('fn_empresas_acessiveis pergunta sobre a pessoa uma vez, não empresa por empresa', () => {
    const { arquivo, sql } = funcao('fn_empresas_acessiveis');
    expect(arquivo >= '20261109220000', `a última é ${arquivo}`).toBe(true);
    expect(sql).not.toMatch(/fn_can_access_empresa/);
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
  });

  it('fn_minhas_empresas é a mesma lista (não refaz a pergunta)', () => {
    const { sql } = funcao('fn_minhas_empresas');
    expect(sql).not.toMatch(/fn_can_access_empresa/);
    expect(sql).toMatch(/fn_empresas_acessiveis/);
  });

  it('autorizacoes_select não chama fn_pode_autorizar_pedido por linha', () => {
    const { arquivo, sql } = ultimo(/(CREATE|ALTER)\s+POLICY\s+"?autorizacoes_select"?\s+ON/, /;/);
    expect(arquivo >= '20261109220000', `a última é ${arquivo}`).toBe(true);
    expect(sql).not.toMatch(/fn_pode_autorizar_pedido|fn_can_access_empresa/);
  });

  it('fn_analitico_mes_agregado é plpgsql e invocadora, e devolve qtd', () => {
    const { sql } = funcao('fn_analitico_mes_agregado');
    expect(sql).toMatch(/LANGUAGE\s+plpgsql/i);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/'qtd'/);
  });
});
