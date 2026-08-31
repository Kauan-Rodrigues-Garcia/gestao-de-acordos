import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  __dirname,
  '../../supabase/migrations/20260831203244_pix_premiacao_status_pagamento.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8').toLowerCase();

describe('migration do pagamento mensal da premiação Pix', () => {
  it('guarda uma única situação por empresa, pessoa e mês', () => {
    expect(SQL).toContain('unique (empresa_id, operador_id, mes)');
    expect(SQL).toContain("check (mes = date_trunc('month', mes)::date)");
  });

  it('não oferece escrita direta e protege a RPC por cargo e empresa', () => {
    expect(SQL).toContain('revoke all on table public.pix_automatico_premiacoes_pagamento');
    expect(SQL).toContain("array['gerencia', 'diretoria', 'administrador', 'super_admin']::text[]");
    expect(SQL).toContain('fn_can_access_empresa(p_empresa_id)');
    expect(SQL).toContain('revoke all on function public.fn_pix_premiacao_marcar_pagamento');
  });

  it('mantém trilha de auditoria financeira', () => {
    expect(SQL).toContain('trg_log_pix_premiacao_pagamento');
    expect(SQL).toContain("'financeiro', 'pix_premiacao_pagamento'");
  });
});
