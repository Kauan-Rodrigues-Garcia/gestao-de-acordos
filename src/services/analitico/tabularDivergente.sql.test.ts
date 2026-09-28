/**
 * tabularDivergente.sql.test.ts — o Divergente do Analítico mora no servidor.
 *
 * Até 28/09/2026 o fluxo rodava no navegador, com a RLS de quem clicava: a
 * checagem não enxergava o acordo do colega (alcance «próprios») e o DELETE do
 * acordo alheio afetava zero linhas sem erro. O acordo ficava com o dono
 * antigo e o operador caía no pedido de autorização do líder — o que o
 * Divergente existe para evitar.
 *
 * Quem cumpre a regra é o Postgres. O que dá para provar aqui é que ela está
 * escrita, e que ninguém a devolveu ao cliente sem querer.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const SERVICO    = path.resolve(__dirname, 'analitico.service.ts');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

/** Sem comentários e sem espaço significativo. */
function compacto(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');
}

const SQL          = migration('_analitico_divergente_transfere_no_servidor.sql');
const TRANSFERIR   = compacto(corpoDaFuncao(SQL, 'fn_analitico_tabular_divergente'));
const STATUS       = compacto(corpoDaFuncao(SQL, 'fn_analitico_status_tabulacao'));
const ACHAR        = compacto(corpoDaFuncao(SQL, 'fn_analitico_acordos_do_codigo'));

describe('a transferência do Divergente', () => {
  it('roda no servidor, ignorando a RLS de quem clica', () => {
    expect(TRANSFERIR).toContain('SECURITY DEFINER');
    expect(STATUS).toContain('SECURITY DEFINER');
    expect(ACHAR).toContain('SECURITY DEFINER');
  });

  it('muda o dono do acordo — não apaga nem manda para a lixeira', () => {
    expect(TRANSFERIR).toMatch(/UPDATE public\.acordos SET operador_id = v_novo\.id, setor_id = v_novo\.setor_id/);
    expect(compacto(SQL)).not.toMatch(/DELETE FROM public\.acordos/);
    expect(compacto(SQL)).not.toMatch(/lixeira_acordos/);
  });

  it('o acordo vai para o operador DA LINHA, não para quem clicou', () => {
    expect(TRANSFERIR).toMatch(/SELECT \* INTO v_novo FROM public\.perfis WHERE id = v_linha\.operador_id/);
  });

  it('pode o dono da linha, ou quem o painel deixa alterar o acordo — sem lista de cargo', () => {
    expect(TRANSFERIR).toContain('IF v_uid = v_novo.id THEN');
    expect(TRANSFERIR).toContain("public.fn_user_escopo('acordos') >= 3");
    expect(TRANSFERIR).toContain("public.fn_user_escopo('acordos') >= 2");
    expect(TRANSFERIR).not.toMatch(/perfil\s+IN\s*\(/i);
  });

  it('re-aponta o EXTRA do par para o novo dono', () => {
    expect(TRANSFERIR).toMatch(/SET vinculo_operador_id = \$1, vinculo_operador_nome = \$2/);
    expect(TRANSFERIR).toMatch(/tipo_vinculo = ''extra''/);
  });

  it('não transfere para quem está desligado', () => {
    expect(TRANSFERIR).toContain("'destinatario_desligado'");
  });

  it('deixa rastro: log e notificação', () => {
    expect(TRANSFERIR).toContain('public.fn_log_registrar(');
    expect(TRANSFERIR).toContain("'analitico_divergente'");
    expect(TRANSFERIR).toContain('INSERT INTO public.notificacoes');
  });
});

describe('o status da linha', () => {
  it('o EXTRA do dono da linha conta como tabulado — confirmar desfaria o par', () => {
    // O «meu» não filtra tipo_vinculo; só o alvo (o do outro) exige DIRETO.
    const meu  = ACHAR.slice(ACHAR.indexOf('(SELECT a.id'), ACHAR.indexOf('LIMIT 1)'));
    expect(meu).toContain('a.operador_id = $3');
    expect(meu).not.toContain('tipo_vinculo');
    expect(ACHAR).toContain("COALESCE(a.tipo_vinculo, 'direto') = 'direto'");
  });

  it('prefere o acordo titular do NR em nr_registros', () => {
    expect(ACHAR).toMatch(/ORDER BY \(r\.acordo_id IS NOT NULL\) DESC/);
  });
});

describe('os auxiliares são internos', () => {
  it('só as duas RPCs ficam abertas para authenticated', () => {
    const c = compacto(SQL);
    expect(c).toContain('GRANT EXECUTE ON FUNCTION public.fn_analitico_status_tabulacao(UUID) TO authenticated');
    expect(c).toContain('GRANT EXECUTE ON FUNCTION public.fn_analitico_tabular_divergente(UUID) TO authenticated');
    expect(c).toContain('REVOKE ALL ON FUNCTION public.fn_analitico_acordos_do_codigo(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated');
    expect(c).toContain('REVOKE ALL ON FUNCTION public.fn_analitico_campo_tabulacao(UUID) FROM PUBLIC, anon, authenticated');
  });
});

describe('o cliente só chama as RPCs', () => {
  const src = fs.readFileSync(SERVICO, 'utf8');
  const trecho = src.slice(
    src.indexOf('export async function verificarStatusTabulacao'),
    src.indexOf('// ── Notificar todos os usuários após importação'),
  );

  it('verificar e transferir passam pelo servidor', () => {
    expect(trecho).toContain("'fn_analitico_status_tabulacao'");
    expect(trecho).toContain("'fn_analitico_tabular_divergente'");
  });

  it('nenhum acesso direto a acordos nem à lixeira pelo navegador', () => {
    expect(trecho).not.toContain(".from('acordos')");
    expect(trecho).not.toContain('enviarParaLixeira');
  });
});
