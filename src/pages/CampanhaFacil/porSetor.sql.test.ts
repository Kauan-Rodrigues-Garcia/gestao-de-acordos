/**
 * Migration 20261016210000: a Campanha Fácil separada por setor (Cleber,
 * 16/10/2026). Conferência do texto — o banco de verdade é produção.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_campanha_facil_por_setor.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

const TABELAS = ['campanha_facil_mensagens', 'campanha_facil_descontos', 'campanha_facil_mensagens_ocultas'];

describe('Campanha Fácil por setor', () => {
  it('o setor alcançado é o do líder, ou qualquer um para quem tem a chave de todos os setores', () => {
    expect(LISO).toContain('CREATE OR REPLACE FUNCTION public.fn_cf_alcanca_setor(p_empresa UUID, p_setor UUID)');
    expect(LISO).toContain('p_setor = public.fn_user_setor_id()');
    expect(LISO).toContain("public.fn_cf_tem(p_empresa, 'campanha_escopo_todos_setores')");
    expect(LISO).toContain('public.fn_cf_pode_liberar(p_empresa)');
  });

  it('mensagens, excluídas e descontos ganham o setor de quem criou', () => {
    for (const t of TABELAS) {
      expect(LISO).toContain(`ALTER TABLE public.${t} ADD COLUMN IF NOT EXISTS setor_id UUID`);
    }
    expect(LISO).toMatch(/UPDATE public\.campanha_facil_mensagens t SET setor_id = p\.setor_id .*WHERE p\.id = t\.criado_por/);
    expect(LISO).toMatch(/UPDATE public\.campanha_facil_descontos t SET setor_id = p\.setor_id .*WHERE p\.id = t\.criado_por/);
    expect(LISO).toMatch(/UPDATE public\.campanha_facil_mensagens_ocultas t SET setor_id = p\.setor_id .*WHERE p\.id = t\.ocultado_por/);
    // Nada é apagado: o que fica sem setor só deixa de aparecer.
    for (const t of TABELAS) expect(LISO).not.toMatch(new RegExp(`DELETE FROM public\\.${t}\\b`));
  });

  it('toda policy de leitura e escrita das três olha o setor', () => {
    for (const t of TABELAS) {
      const policies = [...LISO.matchAll(new RegExp(`CREATE POLICY (\\w+) ON public\\.${t} (.*?);`, 'g'))];
      expect(policies.length).toBeGreaterThanOrEqual(4);
      for (const [, , corpo] of policies) {
        expect(corpo).toContain('TO authenticated');
        expect(corpo).toContain('public.fn_cf_alcanca_setor(empresa_id, setor_id)');
      }
      expect(LISO).toContain(`REVOKE ALL ON public.${t} FROM anon`);
    }
  });

  it('o nome do desconto e a mensagem excluída passam a valer por setor', () => {
    expect(LISO).toContain('DROP INDEX IF EXISTS public.uq_cf_descontos_empresa_nome');
    expect(LISO).toContain('ON public.campanha_facil_descontos (empresa_id, setor_id, lower(nome))');
    expect(LISO).toContain('DROP CONSTRAINT IF EXISTS campanha_facil_mensagens_ocultas_pkey');
    // É a chave do `upsert` de ocultarMensagemPadrao.
    expect(LISO).toContain('ON public.campanha_facil_mensagens_ocultas (empresa_id, setor_id, template_id)');
  });

  it('o histórico abre para o setor só na leitura', () => {
    expect(LISO).toContain('CREATE POLICY cf_lotes_select ON public.campanha_facil_lotes FOR SELECT TO authenticated USING ( criado_por = (SELECT auth.uid()) OR public.fn_cf_alcanca_setor(empresa_id, setor_id) )');
    // As ações seguem de quem lançou: nenhuma delas é redefinida aqui.
    for (const f of ['lote_ativar', 'lote_excluir', 'lote_editar', 'envios_criar', 'avisar_repasse']) {
      expect(LISO).not.toContain(`FUNCTION public.fn_campanha_facil_${f}`);
    }
    // Contatos (dados de cliente) não abrem: o andamento vem pela função.
    expect(LISO).not.toMatch(/POLICY \w+ ON public\.campanha_facil_contatos/);
    expect(LISO).toContain('CREATE OR REPLACE FUNCTION public.fn_campanha_facil_envios_do_lote(p_lote UUID)');
    expect(LISO).toContain('REVOKE ALL ON FUNCTION public.fn_campanha_facil_envios_do_lote(UUID) FROM PUBLIC, anon');
  });

  it('liberar confere o setor da campanha e de quem recebe', () => {
    expect(LISO).toContain("RAISE EXCEPTION 'Escolha o setor da campanha.'");
    expect(LISO).toContain('IF NOT public.fn_cf_alcanca_setor(v_empresa, v_setor) THEN');
    expect(LISO).toContain('BEFORE INSERT ON public.campanha_facil_envios FOR EACH ROW EXECUTE FUNCTION public.fn_cf_envio_do_setor()');
    expect(LISO).toContain('public.fn_cf_pessoa_no_setor(NEW.operador_id, NEW.setor_id)');
  });

  it('registra a si mesma', () => {
    expect(LISO).toContain("('20261016210000', 'campanha_facil_por_setor'");
  });
});
