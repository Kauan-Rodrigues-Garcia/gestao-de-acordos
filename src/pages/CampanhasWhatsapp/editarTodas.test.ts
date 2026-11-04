/**
 * «Editar todas» (28/10/2026): o operador reescreve o modelo da parte dele.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { avisosDoModelo } from './EditarTodas';

const SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20261028160000_campanha_operador_edita_todas.sql'),
  'utf8',
);

describe('os avisos do modelo do operador', () => {
  it('variável que não existe trava o salvar', () => {
    const [a] = avisosDoModelo('Olá {{primero_nome}}', false);
    expect(a.bloqueia).toBe(true);
    expect(a.texto).toContain('{{primero_nome}}');
  });

  it('valor na campanha sem valores (245) trava; nas outras, não', () => {
    expect(avisosDoModelo('Quite por {{quitacao}}', true).some((a) => a.bloqueia)).toBe(true);
    expect(avisosDoModelo('Quite por {{quitacao}}', false)).toEqual([]);
  });

  it('«R$» antes de variável em reais só avisa', () => {
    const avisos = avisosDoModelo('Quite por R$ {{quitacao}}', false);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].bloqueia).toBe(false);
  });
});

describe('o banco reescreve só o que é do operador', () => {
  const reescrever = SQL.slice(SQL.indexOf('FUNCTION public.fn_campanha_facil_reescrever_minhas'));

  it('confere dono, campanha ativa e prazo, como a policy de UPDATE', () => {
    for (const f of [SQL.slice(SQL.indexOf('FUNCTION public.fn_campanha_facil_meu_modelo')), reescrever]) {
      expect(f).toContain('en.operador_id = (SELECT auth.uid())');
      expect(f).toContain('en.ativa AND en.expira_em > now()');
    }
  });

  it('mexe só nas pendentes, em mensagem_editada, com fn_cf_renderizar', () => {
    expect(reescrever).toContain("c.status = 'pendente'");
    expect(reescrever).toContain('SET mensagem_editada = public.fn_cf_renderizar(v_texto, c.variaveis)');
    expect(reescrever).not.toMatch(/SET\s+mensagem\s*=/);
  });

  it('todo UPDATE tem WHERE (safeupdate)', () => {
    const updates = SQL.match(/UPDATE public\.[a-z_]+[\s\S]*?;/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(u).toMatch(/WHERE/);
  });
});
