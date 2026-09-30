/**
 * Migration 20260930192744: avisos da EQUIPE (meta batida e resumo por hora).
 * Executada num Postgres 16 local descartável (30/09/2026) com duas empresas
 * (BookPlay e PaguePlay), líder explícito e de reserva, elite, clone, fantasma
 * de setor e ajuste manual:
 *   • `fn_desafio_contexto_equipe` devolveu o MESMO JSON antes e depois;
 *   • semente: a equipe que já estava em 100% não avisou; a que chegou avisou
 *     uma vez (líder + membros, sem repetir), e limpar/reimportar não avisou;
 *   • PaguePlay compara em H.O. (bruto passava, H.O. não — e não avisou);
 *   • resumo: 1ª hora avisa o dia, hora sem pagamento não avisa, novo pagamento
 *     avisa só a diferença, limpar/reimportar não avisa; elite só depois de
 *     ligar, líder deixa de receber ao desligar, sem `ver_painel_lider` nada;
 *   • reexecutável; rodadas só para service_role.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_push_avisos_da_equipe.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('push: avisos da equipe', () => {
  it('uma conta só: o desafio chama a mesma função, sem ajuste', () => {
    expect(LISO).toContain('FROM public.fn_recebido_por_equipe(v_empresas, v_mes_txt, v_ini, v_fim, FALSE) r');
    expect(LISO).toContain('public.fn_recebido_por_equipe( p_empresas, p_mes, ref.ini, (ref.ini + INTERVAL \'1 month\' - INTERVAL \'1 day\')::DATE, TRUE)');
  });
  it('meta: um aviso por equipe por mês, com semente ao ligar', () => {
    expect(LISO).toContain('PRIMARY KEY (equipe_id, mes)');
    expect(LISO).toContain("ON CONFLICT (equipe_id, mes) DO NOTHING RETURNING equipe_id, empresa_id");
    expect(LISO).toContain("'semente'");
  });
  it('PaguePlay em H.O., com a meta arredondada como metaNaUnidade', () => {
    expect(LISO).toContain('r.total_ho >= ROUND(mt.meta_valor * public.fn_pp_ho_percentual(), 2)');
  });
  it('o gatilho da importação marca a verificação, uma linha por empresa e mês', () => {
    expect(LISO).toContain('INSERT INTO public.push_equipes_verificar (empresa_id, mes) SELECT DISTINCT n.empresa_id');
    expect(LISO).toContain('AND NOT EXISTS (SELECT 1 FROM public.push_equipes_verificar) THEN RETURN;');
  });
  it('resumo: só o que passou do pico do dia; padrão ligado só para quem lidera', () => {
    expect(LISO).toContain('WHERE ROUND(r.total, 2) > COALESCE(a.pico, 0)');
    expect(LISO).toContain("COALESCE(pr.resumo_equipe, p.perfil = 'lider')");
    expect(LISO).toContain("public.fn_perfil_tem(p.id, 'ver_painel_lider')");
    expect(LISO).toContain("cron.schedule('push-resumo-equipes', '0 * * * *'");
  });
  it('a regra de quem lidera é a do Painel: explícito manda, reserva sem quem já lidera', () => {
    expect(LISO).toContain('WHERE NOT EXISTS (SELECT 1 FROM do_explicito d WHERE d.equipe_id = r.equipe_id)');
    expect(LISO).toContain('AND NOT EXISTS (SELECT 1 FROM explicitos e WHERE e.lider_id = l.id)');
  });
  it('fechada para a API; rodadas só para service_role', () => {
    expect(LISO).toContain('REVOKE ALL ON public.push_resumo_equipe FROM anon, authenticated');
    expect(LISO).toContain('GRANT EXECUTE ON FUNCTION public.fn_push_resumo_equipes() TO service_role');
    expect(LISO).toContain('GRANT EXECUTE ON FUNCTION public.fn_push_definir_resumo_equipe(BOOLEAN) TO authenticated');
  });
});
