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

});

const SO_SUPER = semComentarios(migration('_mes_fechado_so_super_admin.sql'));
const EXCLUIDA = semComentarios(migration('_equipe_excluida_fica_no_mes_fechado.sql'));
const SO_SUPER_BRUTO = migration('_mes_fechado_so_super_admin.sql');

describe('mês fechado é só do super admin (20261029220000)', () => {
  it('a barreira não lê mais a permissão', () => {
    const barrar = SO_SUPER.match(/FUNCTION public\.fn_mes_fechado_barrar[\s\S]*?\$function\$;/)![0];
    expect(barrar).not.toContain('fn_user_tem');
    expect(barrar).toMatch(/IF public\.fn_user_is_super_admin\(\) THEN RETURN; END IF;/);
  });

  it('a chave sai do catálogo SQL, pela convenção do teste do catálogo', () => {
    expect(SO_SUPER_BRUTO).toMatch(/--\s*REMOVE_PERMISSOES:\s*ignorar_fechamento_mes/);
    expect(SO_SUPER).toMatch(/WHERE c\.chave <> 'ignorar_fechamento_mes'/);
  });
});

describe('equipe excluída fica no mês fechado (20261029221000)', () => {
  it('a recusa da fase 1 sai: excluir equipe volta a ser possível', () => {
    expect(EXCLUIDA).toContain('DROP TRIGGER IF EXISTS trg_equipes_preserva_mes_fechado ON public.equipes');
  });

  it('as tabelas de história perdem a FK para equipes (e o subgrupo da comissão)', () => {
    for (const t of ['comissao_config', 'pix_automatico_metas', 'analitico_ajustes_manuais',
      'vendas', 'indicacoes', 'perfis_transferencias', 'comemoracoes']) {
      expect(EXCLUIDA, t).toContain(`'public.${t}'::regclass`);
    }
    expect(EXCLUIDA).toMatch(/c\.confrelid = 'public\.equipe_subgrupos'::regclass\s+AND c\.conrelid = 'public\.comissao_config'::regclass/);
  });

  it('a estrutura de hoje continua com FK', () => {
    for (const t of ['equipe_lideres', 'equipe_operadores_clones', 'equipe_membros', 'tv_paineis', 'perfis']) {
      expect(EXCLUIDA, t).not.toContain(`'public.${t}'::regclass`);
    }
  });

  it('o mês em aberto continua sendo limpo, por gatilho em equipes e subgrupos', () => {
    expect(EXCLUIDA).toMatch(/BEFORE DELETE ON public\.equipes\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_equipe_excluida_limpa_mes_aberto\(\)/);
    expect(EXCLUIDA).toMatch(/BEFORE DELETE ON public\.equipe_subgrupos\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_equipe_excluida_limpa_mes_aberto\(\)/);
  });

  it('só o mês em aberto perde comissão e meta de Pix', () => {
    const limpa = EXCLUIDA.match(/FUNCTION public\.fn_equipe_excluida_limpa_mes_aberto\(\)[\s\S]*?\$function\$;/)![0];
    const deletes = limpa.match(/DELETE FROM[\s\S]*?;/g)!;
    expect(deletes).toHaveLength(3);
    for (const d of deletes) expect(d).toMatch(/public\.fn_mes_texto\(ano, mes\) >= v_corrente/);
  });
});

const RECEBIDO = semComentarios(migration('_recebido_do_mes_fechado_le_o_retrato.sql'));

function corpo(nome: string): string {
  return RECEBIDO.match(new RegExp(String.raw`FUNCTION public\.${nome}\([\s\S]*?\$function\$;`))![0];
}

describe('recebido do mês fechado lê o retrato (20261029222000)', () => {
  const EQUIPE = corpo('fn_recebido_por_equipe');
  const SETOR = corpo('fn_recebido_por_setor');

  it('as duas funções decidem pelo mês fechado COM retrato, por empresa', () => {
    for (const f of [EQUIPE, SETOR]) {
      expect(f).toMatch(/retrato AS \(\s*SELECT em\.id AS empresa_id[\s\S]*?public\.fn_mes_fechado\(p_mes\)[\s\S]*?FROM public\.composicao_mes cm/);
    }
  });

  it('equipe: cargo, equipe e situação vêm de composicao_mes; quem está na foto não é arquivado', () => {
    expect(EQUIPE).toMatch(/WHEN cm\.operador_id IS NOT NULL THEN cm\.cargo/);
    expect(EQUIPE).toMatch(/WHEN cm\.operador_id IS NOT NULL THEN cm\.equipe_id/);
    expect(EQUIPE).toMatch(/WHEN cm\.operador_id IS NOT NULL THEN FALSE\s+ELSE p\.arquivado/);
  });

  it('equipe: liderança explícita do retrato (ordem < 100) e alternativo do mês', () => {
    expect(EQUIPE).toMatch(/FROM public\.composicao_mes_lider ml[\s\S]*?COALESCE\(ml\.ordem, 0\) < 100/);
    expect(EQUIPE).toMatch(/JOIN public\.composicao_mes_setor cs[\s\S]*?cs\.alternativo IS TRUE/);
  });

  it('equipe: clone do retrato sem as equipes que a pessoa lidera', () => {
    expect(EQUIPE).toMatch(/unnest\(COALESCE\(cm\.equipes_clone[\s\S]*?NOT EXISTS \(SELECT 1 FROM lideranca l/);
  });

  it('nenhuma leitura ao vivo de estrutura vale para empresa com retrato', () => {
    for (const [f, tabelas] of [
      [EQUIPE, ['public.equipe_lideres el', 'public.equipes e', 'public.equipe_operadores_clones cl']],
      [SETOR, ['public.equipe_operadores_clones cl']],
    ] as const) {
      for (const t of tabelas) {
        const trecho = f.slice(f.indexOf(`FROM ${t}`), f.indexOf(`FROM ${t}`) + 400);
        expect(trecho, t).toContain('NOT IN (SELECT r.empresa_id FROM retrato r)');
      }
    }
    expect(SETOR).toMatch(/FROM public\.perfis p\s+WHERE p\.empresa_id {2}= ANY \(p_empresas\)\s+AND p\.empresa_id NOT IN \(SELECT r\.empresa_id FROM retrato r\)/);
  });

  it('setor: a chave alternativo do mês, e setor criado depois não some', () => {
    expect(SETOR).toMatch(/FROM public\.composicao_mes_setor cs\s+WHERE cs\.empresa_id IN \(SELECT r\.empresa_id FROM retrato r\)/);
    expect(SETOR).toMatch(/FROM public\.setores st[\s\S]*?NOT EXISTS \(SELECT 1 FROM public\.composicao_mes_setor cs/);
  });

  it('a migration prova que o mês corrente não mudou, e aborta se mudou', () => {
    expect(RECEBIDO).toContain('CREATE TEMP TABLE _prova_antes');
    expect(RECEBIDO).toMatch(/IF v_dif > 0 THEN\s+RAISE EXCEPTION 'PROVA/);
  });
});

describe('fechamento de outubro (20261031200000)', () => {
  const OUTUBRO = semComentarios(migration('_retrato_guarda_subgrupo_rh_direto_extra_e_selo_refeito.sql'));

  it('o retrato guarda o subgrupo de cada pessoa', () => {
    expect(OUTUBRO).toMatch(/conta_no_recebimento, robo, subgrupo_id\)/);
    expect(OUTUBRO).toContain('COALESCE(p.robo, FALSE), p.subgrupo_id');
  });

  it('a config do mês guarda subgrupos, RH, Direto/Extra e bônus de Pix — e continua só no mês corrente', () => {
    const bloco = OUTUBRO.match(/IF NOT v_fechado THEN\s*DELETE FROM public\.composicao_mes_config[\s\S]*?END IF;/);
    expect(bloco).not.toBeNull();
    expect(bloco![0]).toMatch(/subgrupos, rh_setores, direto_extra, pix_bonus\)/);
    for (const t of ['equipe_subgrupos', 'rh_config_setores', 'direto_extra_config', 'pix_automatico_bonus']) {
      expect(bloco![0], t).toContain(`FROM public.${t}`);
    }
    expect(OUTUBRO.match(/INSERT INTO public\.composicao_mes_config/g)).toHaveLength(1);
  });

  it('o selo da virada se refaz nos dias 2 a 5, com motivo', () => {
    expect(OUTUBRO).toContain("schedule := '2 3 1-5 * *'");
    expect(OUTUBRO).toMatch(/IF v_dia > 1 THEN\s+v_motivo := format\('Relatório importado depois da virada/);
    expect(OUTUBRO).toContain('fn_fechamento_mes_selar(v_emp.id, v_mes, v_motivo)');
  });

  it('a migration regrava o mês corrente e aborta se o retrato não bater', () => {
    expect(OUTUBRO).toMatch(/PERFORM public\.fn_composicao_mes_snapshot\(v_emp\.id, v_mes\)/);
    expect(OUTUBRO.match(/RAISE EXCEPTION 'PROVA/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('travas que faltavam no mês fechado (20261031210000)', () => {
  const TRAVAS = semComentarios(migration('_mes_fechado_trava_exclusoes_contribuicao_e_bonus_pix.sql'));

  it('as três tabelas ganham a trava, com insert, update e delete', () => {
    for (const t of ['analitico_exclusoes_setor', 'contribuicao_receptivo', 'pix_automatico_bonus']) {
      expect(TRAVAS, t).toMatch(new RegExp(
        `CREATE TRIGGER trg_trava_mes_fechado\\s+BEFORE INSERT OR UPDATE OR DELETE ON public\\.${t}\\s`));
    }
  });

  it('a regra é a de sempre: fn_mes_fechado_barrar (só super admin passa)', () => {
    expect(TRAVAS).toContain("fn_mes_fechado_barrar(to_jsonb(OLD)->>'mes', v_oque)");
    expect(TRAVAS).toContain("fn_mes_fechado_barrar(to_char(NEW.inicio, 'YYYY-MM'), 'Bônus de Pix')");
  });
});

describe('mês fechado mostra o lugar de quem olha (20261031220000)', () => {
  const LUGAR = semComentarios(migration('_mes_fechado_mostra_o_lugar_de_quem_olha.sql'));

  it('as três RPCs do mês trocam o lugar de hoje pelo lugar do mês', () => {
    for (const fn of ['fn_analitico_dashboard_mes_json', 'fn_analitico_resumo_por_operador', 'fn_analitico_recebido_fora_do_setor']) {
      const corpo = LUGAR.slice(LUGAR.indexOf(`FUNCTION public.${fn}(`));
      const fim = corpo.indexOf('$function$;');
      const def = corpo.slice(0, fim);
      expect(def, fn).toContain('_no_mes(v_eu, p_empresa_id, p_mes)');
      expect(def, fn).not.toMatch(/fn_setores_do_operador\(v_eu\)|fn_equipes_de_alcance\(v_eu\)/);
    }
  });

  it('no mês corrente o lugar novo É o de hoje — e a migration prova', () => {
    expect(LUGAR).toMatch(/fn_analitico_setores_no_mes\(p_empresa_id, p_mes, ARRAY\[p_perfil\]\)/);
    expect(LUGAR).toMatch(/SELECT e\.eq\s+FROM public\.fn_equipes_de_alcance\(p_perfil\)/);
    expect(LUGAR).toMatch(/RAISE EXCEPTION 'PROVA: o lugar do mês corrente mudou/);
  });

  it('a tela pergunta o lugar à mesma regra (fn_meu_lugar_no_mes)', () => {
    expect(LUGAR).toContain('CREATE OR REPLACE FUNCTION public.fn_meu_lugar_no_mes(p_empresa_id uuid, p_mes text)');
    expect(LUGAR).toContain('GRANT EXECUTE ON FUNCTION public.fn_meu_lugar_no_mes(uuid, text) TO authenticated');
  });
});

describe('a carteira do 59 inteira no retrato (20261031230000)', () => {
  const CARTEIRA = semComentarios(migration('_retrato_guarda_a_carteira_inteira_do_59.sql'));

  it('grava a linha inteira de mestre_grupos e mestre_equipes', () => {
    expect(CARTEIRA).toContain('jsonb_agg(to_jsonb(g) ORDER BY g.cod_grupo_filtro)');
    expect(CARTEIRA).toContain('jsonb_agg(to_jsonb(me) ORDER BY me.cod_grupo_filtro, me.nome_subgrupo)');
  });

  it('continua sem gravar config de mês fechado', () => {
    expect(CARTEIRA).toMatch(/IF NOT v_fechado THEN\s*DELETE FROM public\.composicao_mes_config/);
  });
});

describe('Painel Diretoria lê o mês fechado (20261031230100)', () => {
  const DIRETORIA = semComentarios(migration('_diretoria_mes_fechado_le_o_retrato.sql'));

  /** O corpo de uma função da migration, de `CREATE` até o `$function$;` final. */
  function corpoDe(nome: string): string {
    const ini = DIRETORIA.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
    expect(ini, nome).toBeGreaterThanOrEqual(0);
    const abre = DIRETORIA.indexOf('$function$', ini);
    const fecha = DIRETORIA.indexOf('$function$', abre + 1);
    return DIRETORIA.slice(ini, fecha);
  }

  it('nenhuma das nove funções lê setores/carteiras de hoje direto', () => {
    for (const fn of ['fn_diretoria_cofen', 'fn_mestre_diretoria_alternativos', 'fn_mestre_diretoria_cidades',
      'fn_mestre_diretoria_dia', 'fn_mestre_diretoria_equipes_dos_setores', 'fn_mestre_diretoria_linhas',
      'fn_mestre_diretoria_setor', 'fn_mestre_diretoria_setores', 'fn_mestre_diretoria_visao_geral']) {
      const corpo = corpoDe(fn).replace(/public\.fn_(setores|mestre_grupos|mestre_equipes)_do_mes/g, '');
      expect(corpo, fn).not.toMatch(/\b(from|join)\s+(public\.)?(setores|mestre_grupos|mestre_equipes)\b/i);
    }
  });

  it('o Cofen continua lendo o setor da PaguePlay', () => {
    expect(DIRETORIA).toContain('FROM public.fn_setores_do_mes(v_pp, p_mes) s');
  });

  it('as tabelas do mês podem ser expandidas pelo planejador (sem SECURITY DEFINER nem SET)', () => {
    for (const t of ['fn_setores_do_mes', 'fn_mestre_grupos_do_mes', 'fn_mestre_equipes_do_mes']) {
      const def = corpoDe(t);
      const cabecalho = def.slice(0, def.indexOf('AS $function$'));
      expect(cabecalho, t).not.toMatch(/SECURITY DEFINER|SET search_path/);
    }
  });

  it('prova antes e depois, com sessão de super admin', () => {
    expect(DIRETORIA).toContain('CREATE TEMP TABLE _prova_antes');
    expect(DIRETORIA).toMatch(/RAISE EXCEPTION 'PROVA: a Diretoria mudou em/);
  });
});

describe('excluir usuário conta saldo e premiação do Pix (20261031230300)', () => {
  const EXCLUIR = semComentarios(migration('_excluir_usuario_conta_saldo_e_premiacao_do_pix.sql'));

  it('as duas tabelas entram na pergunta', () => {
    expect(EXCLUIR).toContain('FROM public.pix_automatico_saldos');
    expect(EXCLUIR).toContain('FROM public.pix_automatico_premiacoes_pagamento');
  });
});
