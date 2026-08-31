/**
 * situacaoUsuario.service.ts — situação operacional do usuário (item 5).
 *
 * ativo | ferias | desligado.
 *
 * FÉRIAS some de ranking e quartil (filtro na aplicação); o recebimento não é
 * filtrado, então os totais de setor/equipe seguem inteiros.
 *
 * DESLIGADO não loga (ativo=false + bloqueio no useAuth), mas continua INTEIRO
 * nas listas até a virada do mês — com uma etiqueta. Na virada é arquivado e
 * some de tudo, indo para a aba Desligados. Ver 20260723c e 20260831160000.
 */
import { supabase } from '@/lib/supabase';
import type { SituacaoUsuario } from '@/lib/supabase';
import { ehMesAtual } from '@/lib/mesReferencia';
import { tabelaSemTipo, rpcSemTipo } from '@/lib/supabaseSemTipo';

/**
 * Define a situação de um usuário, ajustando os efeitos colaterais:
 *   • desligado → ativo=false, desligado_em=now (bloqueia login) e os acordos
 *     dele perdem o vínculo Direto/Extra (ver desligamento.service).
 *   • ativo/ferias → ativo=true, desligado_em=null, arquivado=false
 *     (reativar traz de volta às listas e ao login).
 *
 * A liberação de vínculos é best-effort e roda DEPOIS do update: se ela
 * falhar, o desligamento em si continua valendo. Reverter o desligamento não
 * refaz os pareamentos — eles são desfeitos em definitivo.
 */
export async function definirSituacao(
  perfilId: string,
  situacao: SituacaoUsuario,
  /** Necessário para liberar os vínculos ao desligar. */
  contexto?: {
    empresaId?: string | null;
    isPaguePlay?: boolean;
    /** 'yyyy-MM-dd' — ÚLTIMO dia de férias. Obrigatório para `situacao='ferias'`. */
    feriasAte?: string | null;
    /** 'yyyy-MM-dd' — primeiro dia. Informativo; assume hoje quando ausente. */
    feriasDesde?: string | null;
  },
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { situacao, atualizado_em: new Date().toISOString() };
  if (situacao === 'desligado') {
    patch.ativo = false;
    patch.desligado_em = new Date().toISOString();
  } else {
    patch.ativo = true;
    patch.desligado_em = null;
    patch.arquivado = false;
  }

  if (situacao === 'ferias') {
    /*
     * Sem data de retorno não existe férias, desde 01/09/2026.
     *
     * A etiqueta antiga era um estado sem fim: alguém ligava, e desligar
     * dependia de outra pessoa lembrar. Ninguém lembra — e a falha é
     * silenciosa, porque quem não volta simplesmente não aparece no analítico.
     * A data é o que faz o retorno acontecer sozinho (`fn_encerrar_ferias_*`).
     */
    if (!contexto?.feriasAte) {
      return { error: 'Informe a data de retorno para marcar férias.' };
    }
    patch.ferias_ate   = contexto.feriasAte;
    patch.ferias_desde = contexto.feriasDesde ?? new Date().toISOString().slice(0, 10);
  } else if (situacao === 'desligado') {
    // Quem foi desligado não está de férias — a etiqueta pendurada faria a
    // tela de Metas avisar sobre alguém que não vai ter meta nenhuma.
    patch.ferias_ate   = null;
    patch.ferias_desde = null;
  }
  /*
   * Voltar para `ativo` NÃO limpa `ferias_ate`: é o rastro que a tela de Metas
   * lê para avisar que a pessoa esteve fora, e é lá que ele é zerado, quando a
   * próxima meta é configurada. Ver `limparAvisoDeFerias`.
   */
  const { error } = await supabase.from('perfis').update(patch).eq('id', perfilId);
  if (error) return { error: error.message };

  /*
   * Os vinculos NAO sao soltos aqui desde 31/08/2026.
   *
   * Quem trabalhou ate o dia 20 produziu recebimento ate o dia 20, e esse
   * dinheiro e da equipe naquele mes. Soltar os pareamentos no ato do
   * desligamento fazia o total da equipe encolher no meio do mes sem que uma
   * linha do relatorio tivesse mudado — foi assim que R$ 370,00 sumiram do
   * Desempenho Equipes de agosto/2026 e continuaram no relatorio do ERP.
   *
   * A liberação passou para o ARQUIVAMENTO, na virada do mês — ver
   * `arquivarDesligadosAnteriores` aqui embaixo e a migration 20260831160000.
   */
  return { error: null };
}

/**
 * Arquiva os desligados de meses anteriores: eles somem das listas e passam a
 * existir só na aba Desligados.
 *
 * É AQUI que os vínculos de acordo são soltos, e não mais no ato do
 * desligamento. Enquanto o mês corre, a pessoa desligada continua inteira —
 * na equipe, no analítico, nos cards — com uma etiqueta "Desligado". A conta do
 * mês em que ela trabalhou não pode encolher no meio do caminho.
 *
 * Best-effort dos dois lados: o arquivamento vale mesmo que a liberação falhe,
 * e a próxima passagem por aqui não tenta de novo (a pessoa já está arquivada).
 * O `pg_cron` da migration cuida do arquivamento sozinho todo dia às 00:10 de
 * São Paulo; esta função existe para o caso de alguém abrir a tela antes disso.
 */
export async function arquivarDesligadosAnteriores(
  empresaId: string,
  contexto?: { isPaguePlay?: boolean },
): Promise<number> {
  const { data, error } = await rpcSemTipo<{ fn_arquivar_desligados_ids: string }[] | string[]>(
    'fn_arquivar_desligados_ids', { p_empresa_id: empresaId },
  );
  if (error) return 0;

  // A RPC devolve SETOF uuid; o PostgREST entrega ora uma lista de strings, ora
  // uma lista de objetos de uma chave, conforme a versão.
  const ids = (data ?? []).map(linha =>
    typeof linha === 'string' ? linha : linha.fn_arquivar_desligados_ids,
  ).filter(Boolean);

  if (ids.length > 0) {
    try {
      const { liberarVinculosDeDesligado } = await import('@/services/desligamento.service');
      for (const perfilId of ids) {
        await liberarVinculosDeDesligado({
          perfilId,
          empresaId,
          isPaguePlay: contexto?.isPaguePlay ?? false,
        });
      }
    } catch (e) {
      console.warn('[situacaoUsuario] falha ao liberar vínculos de arquivado', e);
    }
  }

  return ids.length;
}

/**
 * Devolve ao estado ativo quem passou da data de retorno das férias.
 *
 * Gêmea de `arquivarDesligadosAnteriores`: o `pg_cron` faz isso todo dia às
 * 00:15 de São Paulo (migration 20260901100000), e esta chamada existe para
 * quem abre a tela antes disso — ou para quando o cron não rodou.
 *
 * Devolve QUANTAS pessoas voltaram, para a tela poder avisar. Uma lista que
 * muda sozinha sem dizer nada parece defeito.
 */
export async function encerrarFeriasVencidas(empresaId: string): Promise<number> {
  const { data, error } = await rpcSemTipo<{ fn_encerrar_ferias_vencidas: string }[] | string[]>(
    'fn_encerrar_ferias_vencidas', { p_empresa_id: empresaId },
  );
  if (error) return 0;
  return (data ?? []).length;
}

/**
 * Apaga o rastro de férias de um operador.
 *
 * Chamada pela tela de Metas ao salvar: o aviso «esteve de férias» existe para
 * quem vai definir a meta do mês, e some quando essa meta foi definida — a
 * informação já cumpriu o papel dela.
 *
 * Best-effort de propósito: falhar aqui não pode derrubar o salvamento das
 * metas, que é o que a pessoa pediu. O pior caso é o aviso aparecer mais uma
 * vez.
 */
export async function limparAvisoDeFerias(perfilIds: readonly string[]): Promise<void> {
  if (perfilIds.length === 0) return;
  await supabase.from('perfis')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `ferias_ate`/`ferias_desde` só entram no tipo gerado depois da migration 20260901100000.
    .update({ ferias_ate: null, ferias_desde: null } as any)
    .in('id', [...perfilIds])
    .not('ferias_ate', 'is', null);
}

/**
 * Mapa operadorId → situacao para toda a empresa (sem filtrar por ativo, para
 * pegar desligados também). Usado para ocultar férias/desligado de ranking e
 * quartil sem afetar os totais.
 */
export async function buscarSituacaoOperadores(
  empresaId: string,
  mes?: string | null,
): Promise<Record<string, SituacaoUsuario>> {
  // Situação é um fato do MÊS, não de hoje: quem entrou de férias esta semana
  // trabalhou julho inteiro e não pode sumir do ranking de julho. Mês fechado
  // lê o retrato congelado (migration 20260803c); o corrente segue ao vivo.
  if (mes && !ehMesAtual(mes)) {
    const retrato = await tabelaSemTipo<{ operador_id: string; situacao: string | null }>('composicao_mes')
      .select('operador_id, situacao')
      .eq('empresa_id', empresaId).eq('mes', mes);
    if (!retrato.error && retrato.data?.length) {
      const doMes: Record<string, SituacaoUsuario> = {};
      for (const r of retrato.data) {
        doMes[r.operador_id] = (r.situacao as SituacaoUsuario) ?? 'ativo';
      }
      return doMes;
    }
    // Sem retrato (migration pendente ou mês antigo) → estado de hoje.
  }

  const { data, error } = await supabase
    .from('perfis')
    .select('id, situacao')
    .eq('empresa_id', empresaId);
  if (error || !data) return {};
  const out: Record<string, SituacaoUsuario> = {};
  for (const p of data as { id: string; situacao: string | null }[]) {
    out[p.id] = (p.situacao as SituacaoUsuario) ?? 'ativo';
  }
  return out;
}

/**
 * IDs que devem sumir de ranking e quartil.
 *
 * So FERIAS. Desligado ficava aqui e sumia no ato — mas quem foi desligado
 * neste mes trabalhou nele, e o numero e da equipe ate a virada. A partir do
 * dia 1 a pessoa e ARQUIVADA e nem chega ate aqui: some antes, na consulta de
 * operadores. Ver a migration 20260831160000.
 */
export function idsOcultosRankingQuartil(mapa: Record<string, SituacaoUsuario>): Set<string> {
  const s = new Set<string>();
  for (const [id, sit] of Object.entries(mapa)) if (sit === 'ferias') s.add(id);
  return s;
}
