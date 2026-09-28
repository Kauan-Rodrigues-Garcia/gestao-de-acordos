/**
 * `fn_acordo_agendar_proxima_parcela` conferida no SQL da migration.
 *
 * O que ela guarda é a promessa do pedido: o líder agenda, mas a parcela é do
 * DONO. E a régua de quem pode tem de ser a mesma de `acordos_select` — foi a
 * diferença entre a régua de ler e a de inserir que fez o botão aparecer e
 * falhar para o líder de equipe.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_reagendar_pelo_servidor.sql'));
const BRUTO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
const LISO = BRUTO.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('a porta', () => {
  it('SECURITY DEFINER, search_path fixo, anon fora', () => {
    expect(LISO).toContain('SECURITY DEFINER');
    expect(LISO).toContain("SET search_path TO 'public'");
    expect(BRUTO).toMatch(/REVOKE ALL ON FUNCTION public\.fn_acordo_agendar_proxima_parcela[^;]*FROM PUBLIC, anon/);
    expect(BRUTO).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_acordo_agendar_proxima_parcela[^;]*TO authenticated/);
  });

  it('sem sessão, recusa', () => {
    expect(LISO).toContain('IF auth.uid() IS NULL THEN');
  });

  it('trava a linha de origem — dois cliques não passam juntos', () => {
    expect(LISO).toMatch(/FROM public\.acordos WHERE id = p_acordo_id FOR UPDATE/);
  });
});

describe('quem pode: a régua de acordos_select', () => {
  it('dono, super_admin, escopo 3 e escopo 2 por setor', () => {
    expect(LISO).toContain('b.operador_id = auth.uid()');
    expect(LISO).toContain('v_escopo >= 3');
    expect(LISO).toMatch(/v_escopo >= 2 AND \( b\.setor_id = public\.fn_user_setor_id\(\)/);
    expect(LISO).toContain('public.fn_operador_clonado_no_setor(b.operador_id, public.fn_user_setor_id())');
  });

  it('o ramo que a RLS de insert NÃO tem: líder de equipe', () => {
    expect(LISO).toContain('v_escopo = 1 AND public.fn_operador_no_meu_alcance_de_equipe(b.operador_id)');
  });

  it('e ainda precisa de editar_acordos', () => {
    expect(LISO).toContain("public.fn_user_tem('editar_acordos')");
  });
});

describe('a parcela é do DONO', () => {
  it('operador_id vem da parcela de origem, nunca de auth.uid()', () => {
    const insert = LISO.slice(LISO.indexOf('INSERT INTO public.acordos'));
    const valores = insert.slice(insert.indexOf('VALUES'), insert.indexOf('RETURNING'));
    expect(valores).toContain('b.operador_id');
    expect(valores).not.toContain('auth.uid()');
  });

  it('copia a identidade inteira — o que cada tela esquecia', () => {
    const insert = LISO.slice(LISO.indexOf('INSERT INTO public.acordos'), LISO.indexOf('RETURNING'));
    for (const c of ['estado_uf', 'valor_total', 'usou_quarenta_pct', 'valor_entrada',
                     'tipo_vinculo', 'vinculo_operador_id', 'acordo_grupo_id']) {
      expect(insert, c).toContain(c);
    }
  });

  it('nasce pendente', () => {
    expect(LISO).toContain("'verificar_pendente', round(p_valor, 2), p_vencimento");
  });
});

describe('o que pode ser reagendado', () => {
  it('nunca PIX Automático nem Cartão Recorrente', () => {
    expect(LISO).toContain("b.tipo IN ('pix_automatico', 'cartao_recorrente')");
  });
  it('só parcelamento, e não a última', () => {
    expect(LISO).toContain('COALESCE(b.parcelas, 1) <= 1');
    expect(LISO).toContain('v_proxima > COALESCE(b.parcelas, 1)');
  });
  it('sem grupo, não há onde pendurar', () => {
    expect(LISO).toContain('b.acordo_grupo_id IS NULL');
  });
});

describe('duplicidade', () => {
  it('parcela que já existe é devolvida, não duplicada', () => {
    expect(LISO).toContain('v_existia := TRUE');
    expect(LISO).toContain('EXCEPTION WHEN unique_violation THEN');
  });
});

describe('a migration', () => {
  it('confere as colunas antes — plpgsql só descobre coluna faltando ao rodar', () => {
    expect(LISO).toContain('information_schema.columns');
    expect(LISO).toContain("RAISE EXCEPTION 'acordos sem as colunas: %'");
  });
  it('transação, lock_timeout, nada de DROP', () => {
    expect(BRUTO).toMatch(/^begin;/m);
    expect(BRUTO).toMatch(/^commit;/m);
    expect(BRUTO).not.toMatch(/\bdrop (table|function|policy)\b/i);
  });
});
