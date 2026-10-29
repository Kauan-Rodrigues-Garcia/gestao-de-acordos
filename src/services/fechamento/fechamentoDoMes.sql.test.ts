/**
 * Fase 1 da auditoria de fechamento (29/10/2026), conferida no SQL das
 * migrations.
 *
 * Três garantias que não aparecem como erro quando quebram — a tela responde
 * com os números de hoje e ninguém nota:
 *
 *   1. o retrato do mês guarda também regra/cidade do setor, treinamento da
 *      equipe, se o cargo conta no recebimento, e a configuração do mês — e a
 *      configuração NUNCA é gravada para mês fechado (seria a contaminação de
 *      agosto/2026 de novo);
 *   2. o selo do fechamento é imutável, só super admin sela à mão, com motivo,
 *      e a virada roda antes de os desligados serem arquivados;
 *   3. excluir equipe e mexer em meta de Pix não apagam mês fechado.
 *
 * Quem garante o comportamento é o Postgres; aqui se prova que a regra ESTÁ
 * ESCRITA — mesmo recurso de `mesFechadoComposicao.sql.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const RETRATO = semComentarios(migration('_retrato_guarda_regra_treinamento_config_e_tv.sql'));
const SELO = semComentarios(migration('_selo_do_fechamento_do_mes.sql'));
const TRANCAS = semComentarios(migration('_equipe_e_meta_pix_preservam_mes_fechado.sql'));

describe('retrato completo (20261029200000)', () => {
  it('grava regra, cidade e tipo do setor', () => {
    expect(RETRATO).toMatch(/INSERT INTO public\.composicao_mes_setor\s*\([^)]*regra, cidade_id, tipo\)/);
  });

  it('grava o treinamento da equipe', () => {
    expect(RETRATO).toMatch(/INSERT INTO public\.composicao_mes_equipe\s*\([^)]*treinamento, treinamento_inicio\)/);
  });

  it('grava se o cargo conta no recebimento e se é robô', () => {
    expect(RETRATO).toMatch(/conta_no_recebimento, robo\)/);
    expect(RETRATO).toMatch(/LEFT JOIN public\.cargos cg ON cg\.slug = p\.perfil::TEXT/);
  });

  it('a configuração do mês só é gravada fora do mês fechado', () => {
    const bloco = RETRATO.match(/IF NOT v_fechado THEN\s*DELETE FROM public\.composicao_mes_config[\s\S]*?END IF;/);
    expect(bloco, 'bloco da config deve estar dentro de IF NOT v_fechado').toBeTruthy();
    expect(bloco![0]).toContain('INSERT INTO public.composicao_mes_config');
    // Nenhum outro INSERT na config fora desse bloco.
    expect(RETRATO.match(/INSERT INTO public\.composicao_mes_config/g)).toHaveLength(1);
  });

  it('a config guarda H.O. (empresas.config), cargos, ranking, Pix e o vínculo do 59', () => {
    expect(RETRATO).toMatch(/SELECT em\.config FROM public\.empresas em/);
    expect(RETRATO).toContain('FROM public.analitico_ranking_config rc');
    expect(RETRATO).toContain('FROM public.pix_automatico_config pc');
    expect(RETRATO).toContain('FROM public.mestre_grupos g');
    expect(RETRATO).toContain('FROM public.mestre_equipes me');
  });

  it('mês fechado com retrato continua só acrescentando quem recebeu', () => {
    expect(RETRATO).toMatch(/v_fechado := p_mes < v_mes_corrente AND v_antes_operador > 0;/);
    expect(RETRATO).toMatch(/AND \(NOT v_fechado OR p\.id = ANY\(v_novos\)\)/);
  });

  it('painel da TV: sem FK para painel ou equipe, e só o mês corrente é fotografado', () => {
    const tabela = RETRATO.match(/CREATE TABLE IF NOT EXISTS public\.tv_paineis_mes \([\s\S]*?\);/)![0];
    expect(tabela).not.toMatch(/REFERENCES public\.(tv_paineis|equipes|setores)/);
    expect(RETRATO).toMatch(/IF p_mes IS DISTINCT FROM to_char\(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\), 'YYYY-MM'\) THEN\s*RETURN 0;/);
  });

  it('falha no painel da TV não derruba o retrato', () => {
    expect(RETRATO).toMatch(/PERFORM public\.fn_tv_paineis_mes_congelar\(v_mes\);\s*EXCEPTION WHEN OTHERS THEN/);
  });

  it('congela às 23:50 e às 23:59 de São Paulo', () => {
    expect(RETRATO).toContain("schedule := '50,59 2 * * *'");
  });
});

describe('selo do fechamento (20261029201000)', () => {
  it('é imutável: UPDATE e DELETE recusados nas duas tabelas', () => {
    expect(SELO).toMatch(/BEFORE UPDATE OR DELETE ON public\.fechamento_mes\s/);
    expect(SELO).toMatch(/BEFORE UPDATE OR DELETE ON public\.fechamento_mes_numeros\s/);
  });

  it('não tem policy de escrita — só a função grava', () => {
    expect(SELO).not.toMatch(/CREATE POLICY[^;]*ON public\.fechamento_mes(_numeros)?\s+FOR (ALL|INSERT|UPDATE|DELETE)/);
  });

  it('à mão, só super admin e com motivo', () => {
    expect(SELO).toMatch(/IF NOT public\.fn_user_is_super_admin\(\) THEN\s*RAISE EXCEPTION 'NAO_AUTORIZADO/);
    expect(SELO).toContain('MOTIVO_OBRIGATORIO');
  });

  it('só sela mês fechado', () => {
    expect(SELO).toMatch(/IF NOT public\.fn_mes_fechado\(p_mes\) THEN\s*RAISE EXCEPTION 'MES_ABERTO/);
  });

  it('nada mudou = nenhuma versão nova', () => {
    expect(SELO).toMatch(/IF v_ult_versao IS NOT NULL AND v_ult_hash = v_hash THEN\s*RETURN v_ult_versao;/);
  });

  it('a virada roda dia 1º às 00:02 SP, antes de arquivar os desligados (00:10)', () => {
    expect(SELO).toContain("cron.schedule('fechamento-mes-selar', '2 3 1 * *'");
  });

  it('a virada sela o mês que acabou de fechar', () => {
    expect(SELO).toMatch(/date_trunc\('month', \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)\) - INTERVAL '1 day', 'YYYY-MM'/);
  });
});

describe('equipe e meta de Pix (20261029202000)', () => {
  it('meta de Pix ganha a trava de mês fechado', () => {
    expect(TRANCAS).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.pix_automatico_metas\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_trava_mes_fechado_ano_mes\('Meta de Pix'\)/);
  });

  it('excluir equipe com histórico fechado é recusado para todos, super admin incluído', () => {
    expect(TRANCAS).toMatch(/BEFORE DELETE ON public\.equipes\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_equipes_preserva_mes_fechado\(\)/);
    const gatilho = TRANCAS.match(/FUNCTION public\.fn_equipes_preserva_mes_fechado\(\)[\s\S]*?\$function\$;/)![0];
    expect(gatilho).not.toContain('fn_user_is_super_admin');
  });

  it('confere as duas tabelas que descem em CASCADE com histórico', () => {
    expect(TRANCAS).toContain('FROM public.comissao_config');
    expect(TRANCAS).toContain('FROM public.pix_automatico_metas');
  });
});
