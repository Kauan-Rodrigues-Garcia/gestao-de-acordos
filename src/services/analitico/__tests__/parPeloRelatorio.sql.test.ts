/**
 * O par pelo relatório — conferido no SQL da migration 20261116234244.
 *
 * Linha Direto cujo acordo está com um colega que o relatório mostra como
 * Extra do mesmo código NÃO é Divergente: o colega fica Extra e o dono da
 * linha entra como Direto. Antes, «Confirmar transferência» tirava o acordo
 * de quem tinha recebimento Extra nele.
 *
 * As três funções são reescritas inteiras a cada `CREATE OR REPLACE`: uma
 * reescrita a partir de 20261028180000 devolveria a transferência sem erro
 * nenhum. O que dá para provar aqui é que a regra está escrita, e na ordem.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_analitico_par_pelo_relatorio.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

function corpoDe(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  return LISO.slice(i, LISO.indexOf('$function$;', i));
}

const EXTRA = "COALESCE(v_linha.tipo_comissao, '') ILIKE '%extra%'";
const PAR = 'public.fn_analitico_par_pelo_relatorio(';

describe('fn_analitico_par_pelo_relatorio', () => {
  const corpo = corpoDe('fn_analitico_par_pelo_relatorio');

  it('exige a linha Extra do colega, no mesmo código e no mesmo mês', () => {
    expect(corpo).toContain('r.codigo = p_codigo');
    expect(corpo).toContain('r.operador_id = p_alvo_operador_id');
    expect(corpo).toContain('r.mes_referencia = p_mes');
    expect(corpo).toContain("COALESCE(r.tipo_comissao, '') ILIKE '%extra%'");
  });

  it('só com o acordo do colega DIRETO e sem par — trocar um Extra de terceiro não é daqui', () => {
    expect(corpo).toContain('a.vinculo_operador_id IS NULL');
    expect(corpo).toContain("COALESCE(a.tipo_vinculo, 'direto') = 'direto'");
  });

  it('é interna', () => {
    expect(LISO).toContain(
      'REVOKE ALL ON FUNCTION public.fn_analitico_par_pelo_relatorio(UUID, TEXT, DATE, UUID, UUID) FROM PUBLIC, anon, authenticated',
    );
  });
});

describe.each([
  'fn_analitico_status_tabulacao',
  'fn_analitico_status_tabulacao_lote',
])('%s', nome => {
  const corpo = corpoDe(nome);

  it('o ramo Extra de 28/10 continua antes de tudo', () => {
    const extra = corpo.indexOf(`v_achado.alvo_id IS NOT NULL AND ${EXTRA}`);
    expect(extra).toBeGreaterThan(-1);
    expect(extra).toBeLessThan(corpo.indexOf(PAR));
  });

  it('o par vem antes do Divergente e não vira «divergente»', () => {
    const par = corpo.indexOf(PAR);
    expect(par).toBeGreaterThan(-1);
    expect(par).toBeLessThan(corpo.lastIndexOf("'divergente'"));
    expect(corpo).toContain("'par_pelo_relatorio', true");
  });
});

describe('fn_analitico_status_tabulacao_lote', () => {
  const corpo = corpoDe('fn_analitico_status_tabulacao_lote');

  it('lê o mês da linha', () => {
    expect(corpo).toContain('r.tipo_comissao, r.mes_referencia FROM public.analitico_recebimentos r');
  });

  it('no par, a linha não guarda o acordo do colega', () => {
    const par = corpo.indexOf(PAR);
    const trecho = corpo.slice(par, corpo.indexOf('ELSIF', par));
    expect(trecho).toContain("v_status := 'nao_tabulado'; v_acordo := NULL;");
  });
});

describe('fn_analitico_tabular_divergente', () => {
  const corpo = corpoDe('fn_analitico_tabular_divergente');
  const par = corpo.indexOf(`IF ${PAR}`);
  const transferencia = corpo.indexOf('SET operador_id = v_novo.id');

  it('forma o par antes de pensar em transferir, e depois de conferir quem pode', () => {
    expect(par).toBeGreaterThan(corpo.indexOf("'nao_autorizado'"));
    expect(par).toBeLessThan(transferencia);
  });

  it('no par ninguém perde: o do colega vira EXTRA e nasce o DIRETO do dono da linha', () => {
    const trecho = corpo.slice(par, transferencia);
    expect(trecho).toContain("SET tipo_vinculo = 'extra', vinculo_operador_id = v_novo.id");
    expect(trecho).toContain('INSERT INTO public.acordos');
    expect(trecho).toContain("'direto', v_acordo.operador_id");
    expect(trecho).toContain("'resultado', 'par_formado'");
    expect(trecho).not.toContain('SET operador_id');
    expect(trecho).not.toContain('DELETE FROM public.acordos');
  });

  it('se o Direto novo não nasce, o Extra do colega é desfeito junto', () => {
    const trecho = corpo.slice(par, transferencia);
    const bloco = trecho.slice(trecho.indexOf('BEGIN'), trecho.indexOf('END;'));
    expect(bloco).toContain("SET tipo_vinculo = 'extra'");
    expect(bloco).toContain('INSERT INTO public.acordos');
    expect(bloco).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(bloco).toContain("'par_recusado'");
  });

  it('nunca transfere o direto de uma linha Extra — a regra de 28/10', () => {
    const extra = corpo.indexOf(`IF ${EXTRA} THEN`);
    expect(extra).toBeGreaterThan(-1);
    expect(extra).toBeLessThan(corpo.indexOf('FOR UPDATE', extra));
  });

  it('quem sai ou vira Extra recebe o card no chat; os líderes, a notificação', () => {
    expect(corpo).toContain("public.fn_analitico_avisar_no_chat( 'virou_extra'");
    expect(corpo).toContain("public.fn_analitico_avisar_no_chat( 'transferido'");
    expect(corpo).toContain('(1, v_novo.lider_id), (2, v_ant_lider)');
  });

  it('a transferência continua igual: muda o dono, re-aponta o Extra, deixa log', () => {
    expect(corpo).toMatch(/UPDATE public\.acordos SET operador_id = v_novo\.id, setor_id = v_novo\.setor_id/);
    expect(corpo).toMatch(/SET vinculo_operador_id = \$1, vinculo_operador_nome = \$2/);
    expect(corpo).toContain("'analitico_divergente'");
    expect(corpo).toContain("'destinatario_desligado'");
  });
});

describe('fn_analitico_avisar_no_chat', () => {
  const corpo = corpoDe('fn_analitico_avisar_no_chat');

  it('é o card do acordo vinculado — aba antiga ainda sabe desenhar', () => {
    expect(corpo).toContain("v_texto, 'acordo_vinculo', v_dados");
  });

  it('a prévia não leva NR nem cliente (expurgo de CPF)', () => {
    const texto = corpo.slice(corpo.indexOf('v_texto := CASE'), corpo.indexOf('END;', corpo.indexOf('v_texto := CASE')));
    expect(texto).not.toContain('chave');
    expect(texto).not.toContain('cliente');
  });

  it('sem chat para um dos dois, vira notificação de quem tinha o acordo', () => {
    expect(corpo).toContain('NOT (public.fn_chat_pode_usar(p_de) AND public.fn_chat_pode_usar(p_para))');
    expect(corpo).toContain('INSERT INTO public.notificacoes');
  });

  it('é interna', () => {
    expect(LISO).toContain(
      'REVOKE ALL ON FUNCTION public.fn_analitico_avisar_no_chat(TEXT, UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated',
    );
  });
});

describe('a migration não escreve em linha nenhuma por conta própria', () => {
  it('fora das funções não há UPDATE, INSERT nem DELETE', () => {
    let fora = LISO;
    for (;;) {
      const i = fora.indexOf('AS $function$');
      if (i < 0) break;
      fora = fora.slice(0, i) + fora.slice(fora.indexOf('$function$;', i) + '$function$;'.length);
    }
    expect(fora).not.toMatch(/\b(UPDATE|INSERT INTO|DELETE FROM)\b/);
  });
});
