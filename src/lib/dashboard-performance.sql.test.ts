import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ARQUIVO = path.resolve(
  __dirname,
  '../../supabase/migrations/20260820183000_dashboard_incremental_performance.sql',
);
const SQL = fs.readFileSync(ARQUIVO,'utf8');
const SQL_REVOKE_ANON = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../supabase/migrations/20260820183100_dashboard_incremental_revoke_anon.sql',
  ),
  'utf8',
);

describe('migration de performance incremental do dashboard', () => {
  it('é atômica e garante old/new completos no realtime', () => {
    expect(SQL.trimStart()).toMatch(/^--[\s\S]*?\bBEGIN\s*;/i);
    expect(SQL).toMatch(/ALTER TABLE public\.acordos REPLICA IDENTITY FULL/i);
    expect(SQL.trimEnd()).toMatch(/COMMIT\s*;$/i);
  });

  it('mantém as policies legadas e troca só o par da matriz por operação', () => {
    expect(SQL).not.toMatch(/FROM pg_policies[\s\S]*tablename='acordos'/i);
    for (const operacao of ['select','insert','update','delete']) {
      expect(SQL).toMatch(new RegExp(`DROP POLICY IF EXISTS permissoes3_acordos_${operacao}_allow`,'i'));
      expect(SQL).toMatch(new RegExp(`DROP POLICY IF EXISTS permissoes3_acordos_${operacao}_gate`,'i'));
      expect(SQL).toMatch(new RegExp(`CREATE POLICY permissoes3_acordos_${operacao}_allow`,'i'));
      expect(SQL).toMatch(new RegExp(`CREATE POLICY permissoes3_acordos_${operacao}_gate`,'i'));
    }
    expect(SQL).toMatch(/AS RESTRICTIVE FOR SELECT/i);
  });

  it('calcula as empresas permitidas em InitPlans, não por linha', () => {
    expect(SQL).toMatch(/SELECT public\.fn_acordos_empresas_permitidas/g);
    expect(SQL).not.toMatch(/USING\s*\([\s\S]{0,400}fn_tem_permissao/i);
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_acordos_empresas_permitidas\(TEXT\[\],BOOLEAN\) FROM anon/i,
    );
    expect(SQL_REVOKE_ANON.trimStart()).toMatch(/^--[\s\S]*?\bBEGIN\s*;/i);
    expect(SQL_REVOKE_ANON).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_acordos_empresas_permitidas\(TEXT\[\],BOOLEAN\)[\s\S]*FROM anon/i,
    );
    expect(SQL_REVOKE_ANON.trimEnd()).toMatch(/COMMIT\s*;$/i);
  });

  it('indexa exatamente empresa, intervalo do mês e desempate', () => {
    expect(SQL).toMatch(/ON public\.acordos\(empresa_id,vencimento,id\)/i);
  });

  it('mantém setor_id na RPC JSON e calcula permissões antes da agregação', () => {
    expect(SQL).toMatch(/COALESCE\(ar\.setor_id,imp\.setor_id\) AS setor_id/i);
    expect(SQL).toMatch(/v_visao_ampla := public\.fn_tem_permissao/i);
    expect(SQL).toMatch(/AND \(v_visao_ampla OR ar\.operador_id=v_uid\)/i);
  });
});
