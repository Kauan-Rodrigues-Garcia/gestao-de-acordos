/**
 * Migration 20261009150000: o operador avalia o retorno da campanha.
 * Conferência do texto — o banco de verdade é produção.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_campanha_avaliacao.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('avaliação da campanha', () => {
  it('um voto por operador e campanha; some com a campanha excluída', () => {
    expect(LISO).toContain('PRIMARY KEY (lote_id, operador_id)');
    expect(LISO).toContain('REFERENCES public.campanha_facil_lotes(id) ON DELETE CASCADE');
  });

  it('o navegador só lê o próprio voto; escrita só pela RPC', () => {
    expect(LISO).toContain('ENABLE ROW LEVEL SECURITY');
    expect(LISO).toContain('REVOKE ALL ON public.campanha_facil_avaliacoes FROM PUBLIC, anon, authenticated');
    expect(LISO).toContain('GRANT SELECT ON public.campanha_facil_avaliacoes TO authenticated');
    expect(LISO).toContain('FOR SELECT TO authenticated USING (operador_id = (SELECT auth.uid()))');
    expect(LISO).toMatch(/FUNCTION public\.fn_campanha_facil_avaliar\(p_lote UUID, p_bom BOOLEAN\) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''/);
    expect(LISO).toContain('REVOKE ALL ON FUNCTION public.fn_campanha_facil_avaliar(uuid, boolean) FROM PUBLIC, anon');
  });

  it('só quem recebeu a campanha, e só enquanto ela não encerrou', () => {
    expect(LISO).toContain('lt.encerrada_em IS NULL');
    expect(LISO).toContain('e.lote_id = lt.id AND e.operador_id = v_uid');
  });

  it('a contagem do líder é refeita a partir dos votos', () => {
    expect(LISO).toContain('count(*) FILTER (WHERE a.bom)::INTEGER, count(*) FILTER (WHERE NOT a.bom)::INTEGER');
    expect(LISO).toContain('UPDATE public.campanha_facil_lotes SET votos_bom = v_bom, votos_ruim = v_ruim WHERE id = l.id');
  });

  it('registra a si mesma e a 20261009120000', () => {
    expect(LISO).toContain("('20261009120000', 'campanha_editar_delete_com_where'");
    expect(LISO).toContain("('20261009150000', 'campanha_avaliacao'");
  });
});
