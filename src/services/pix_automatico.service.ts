/**
 * src/services/pix_automatico.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pix Automático (BookPlay): registro de acordos fechados no Pix automático
 * para acompanhamento de comissão — SEM vínculo com a tabela `acordos`.
 *
 * Regras:
 *   • operador registra NR + valor → linha nasce 'pendente'
 *   • líder+ aprova (trava o % do setor em pct_comissao) ou desaprova
 *   • desaprovado não conta em nenhum total; o dono pode excluir
 *   • % por setor em pix_automatico_config (padrão 0,25)
 *
 * Comissão = valor × pct ÷ 100 (pct 0.25 = 0,25%).
 */

import { supabase } from '@/lib/supabase';
import { tabelaSemTipo, rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { Database } from '@/lib/database.types';
import { primeiroDiaDoMes, type MesRef } from '@/lib/mesReferencia';

type PixAutoAcordoInsert = Database['public']['Tables']['pix_automatico_acordos']['Insert'];
type PixAutoAcordoUpdate = Database['public']['Tables']['pix_automatico_acordos']['Update'];
export type PixPremiacaoPagamento = Database['public']['Tables']['pix_automatico_premiacoes_pagamento']['Row'];

export type PixAutoStatus = 'pendente' | 'aprovado' | 'desaprovado';

export const PIX_AUTO_PCT_PADRAO = 0.25;

/**
 * Acordos Pix no mês que dobram a comissão do operador.
 *
 * Regra de negócio da operação: batendo esta quantidade, a comissão do mês vale
 * o dobro. Contam os acordos FEITOS (pendente + aprovado) — desaprovado não
 * existiu. É o mesmo conjunto que o contador mostra ao operador, senão ele veria
 * um número subir e a meta não sair do lugar.
 */
export const PIX_META_ACORDOS_DOBRA = 18;

/**
 * A meta de acordos que vale para um setor.
 *
 * Espelha `comissaoDe`, que já resolve o `pct` por setor com um mapa e um
 * padrão. O ranking mistura operadores de setores diferentes quando quem olha
 * é admin, então a meta tem de ser resolvida POR LINHA — um número só para a
 * tela inteira mostraria "cumpriu" para quem está em setor de meta maior.
 *
 * `PIX_META_ACORDOS_DOBRA` continua sendo o padrão: é o combinado da operação
 * e o default da coluna.
 */
export function metaDobraDoSetor(
  setorId: string | null | undefined,
  metaPorSetor: Record<string, number>,
): number {
  if (setorId != null && metaPorSetor[setorId] != null && metaPorSetor[setorId] > 0) {
    return metaPorSetor[setorId];
  }
  return PIX_META_ACORDOS_DOBRA;
}

/** Mapa setor → meta de acordos, do jeito que as telas consomem. */
export function metasDobraPorSetor(configs: PixAutoConfig[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const c of configs) {
    const m = Number(c.meta_acordos_dobra);
    if (Number.isFinite(m) && m > 0) mapa[c.setor_id] = m;
  }
  return mapa;
}

export interface PixAutoAcordo {
  id: string;
  empresa_id: string;
  operador_id: string;
  operador_nome: string | null;
  setor_id: string | null;
  nr_cliente: string;
  valor: number;
  status: PixAutoStatus;
  pct_comissao: number | null;
  avaliado_por: string | null;
  avaliado_por_nome: string | null;
  avaliado_em: string | null;
  /** Comissão desta linha já paga ao operador (líder+ marca). */
  pago: boolean;
  pago_em: string | null;
  pago_por: string | null;
  pago_por_nome: string | null;
  /**
   * Correção de divergência carimbada NESTE pagamento.
   *
   * Positivo: a empresa devia e está devolvendo aqui. Negativo: a empresa pagou
   * a mais antes e está descontando aqui. `null` = pagamento sem acerto.
   *
   * Fica na linha depois de o saldo ser quitado — é o histórico de "este
   * pagamento levou R$ 10,00 a mais, e por quê".
   */
  ajuste_valor: number | null;
  ajuste_motivo: string | null;
  ajuste_em: string | null;
  ajuste_por: string | null;
  ajuste_por_nome: string | null;
  /**
   * Etiqueta EXTRA — marcador VISUAL para a conferência do líder.
   *
   * Não altera comissão, não libera duplicidade e não pula autorização. Existe
   * porque o mesmo Pix às vezes é lançado pelo operador, pelo Receptivo e por
   * um terceiro setor: três registros, um dinheiro. Quem decide se o caso é
   * legítimo é quem confere, e a etiqueta é o pedido de que se confira duas
   * vezes.
   */
  extra: boolean;
  criado_em: string;
  atualizado_em: string;
}

/**
 * O que a empresa deve (ou tem a descontar) de uma pessoa no Pix automático.
 *
 * Nasce quando a liderança anota a divergência, fica RESERVADO quando alguém o
 * aplica num acordo aprovado e não pago, e só some quando esse acordo é pago.
 * Ver a migration `20260823080000` para o ciclo completo.
 */
export interface PixAutoSaldo {
  id: string;
  empresa_id: string;
  operador_id: string;
  operador_nome: string | null;
  setor_id: string | null;
  /** Positivo = a empresa deve. Negativo = a empresa tem a descontar. */
  valor: number;
  motivo: string | null;
  /** Acordo em que o saldo está reservado esperando o pagamento. */
  acordo_id: string | null;
  reservado_em: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PixAutoConfig {
  id: string;
  empresa_id: string;
  setor_id: string;
  pct: number;
  /**
   * Quantos acordos o operador precisa fazer no mês para o requisito 1 da
   * comissão dobrada. Era a constante `PIX_META_ACORDOS_DOBRA = 18`, fixa no
   * código; virou config por setor na 20260810c. Opcional no tipo porque a
   * coluna pode não existir em ambiente sem a migration.
   */
  meta_acordos_dobra?: number | null;
  /** Interruptor do setor: false = operador só visualiza, não registra. */
  permite_registro_operador: boolean;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  atualizado_em: string;
}

/** Registro histórico de NR (pix_automatico_nr_registro, mantido por triggers). */
export interface PixNrRegistro {
  id: string;
  empresa_id: string;
  nr_normalizado: string;
  nr_cliente: string;
  acordo_id: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  status: 'pendente' | 'validado' | 'recusado';
  avaliado_por: string | null;
  avaliado_por_nome: string | null;
  avaliado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export function normalizarNr(nr: string): string {
  return nr.trim().toLowerCase();
}

/** Comissão de uma linha: aprovado usa o % travado; pendente usa o % do setor. */
export function comissaoDe(a: Pick<PixAutoAcordo, 'valor' | 'status' | 'pct_comissao' | 'setor_id'>, pctPorSetor: Record<string, number>): number {
  const pct = a.status === 'aprovado' && a.pct_comissao != null
    ? Number(a.pct_comissao)
    : (a.setor_id != null && pctPorSetor[a.setor_id] != null ? pctPorSetor[a.setor_id] : PIX_AUTO_PCT_PADRAO);
  return Math.round(Number(a.valor) * pct) / 100; // valor × pct ÷ 100, 2 casas
}

/**
 * O que de fato sai para o operador nesta linha: a comissão mais a correção de
 * divergência carimbada nela.
 *
 * Existe separada de `comissaoDe` de propósito. A comissão é a conta do
 * percentual sobre o acordo — ela não muda porque alguém errou um Pix no mês
 * passado. O acerto é outro fato, com outra origem e outro histórico; somá-los
 * dentro de `comissaoDe` faria o ranking, a meta e o card de bônus passarem a
 * contar dinheiro que não é comissão.
 *
 * Quem paga usa esta; quem mede desempenho usa `comissaoDe`.
 */
export function valorAPagarDe(
  a: Pick<PixAutoAcordo, 'valor' | 'status' | 'pct_comissao' | 'setor_id' | 'ajuste_valor'>,
  pctPorSetor: Record<string, number>,
): number {
  const bruto = comissaoDe(a, pctPorSetor) + (Number(a.ajuste_valor) || 0);
  return Math.round(bruto * 100) / 100;
}

/** Valor numérico BR sem "R$" (ex.: 1234.5 → "1.234,50"). */
function valorBR(v: number): string {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Uma linha do "Copiar": só o CÓDIGO do acordo.
 *
 * A linha já trouxe operador, valor, data e comissão. Quem recebe este texto
 * confere código a código e paga o total — a comissão repetida em cada linha só
 * dava ruído e concorria com o total na leitura rápida.
 */
export function formatarLinhaPix(a: Pick<PixAutoAcordo, 'nr_cliente'>): string {
  return a.nr_cliente;
}

/**
 * O texto completo do "Copiar": um código por linha e, no fim, o total da
 * comissão somado.
 *
 * Somar à mão a comissão de doze acordos colados no WhatsApp é onde o erro
 * entra — e o erro aqui é dinheiro pago a menos ou a mais. A soma sai pronta.
 * O total aparece mesmo com um acordo só: é ele que diz quanto pagar, e sem a
 * comissão por linha não haveria valor nenhum no texto.
 */
export function formatarCopiaPix(
  itens: {
    acordo: Pick<PixAutoAcordo, 'nr_cliente'>;
    /** Já com a correção somada, quando houver — ver `valorAPagarDe`. */
    comissao: number;
    /**
     * Correção de divergência desta linha, quando houver.
     *
     * Ganha uma linha própria antes do total. Sem ela, quem recebe o texto
     * somaria os códigos de cabeça, não bateria com o total e voltaria a
     * perguntar — que é justamente o que este formato existe para evitar.
     */
    ajuste?: number | null;
  }[],
): string {
  if (itens.length === 0) return '';
  const linhas = itens.map(i => formatarLinhaPix(i.acordo));
  const total = itens.reduce((s, i) => s + i.comissao, 0);

  const correcoes = itens
    .filter(i => Number(i.ajuste) !== 0 && i.ajuste != null)
    .map(i => {
      const v = Number(i.ajuste);
      return `Correção no ${i.acordo.nr_cliente}: ${v > 0 ? '+' : '−'}R$ ${valorBR(Math.abs(v))}`;
    });

  return [...linhas, ...correcoes, `R$ ${valorBR(total)}`].join('\n');
}

// ── Acordos ────────────────────────────────────────────────────────────────

/**
 * Acordos Pix da empresa.
 *
 * `setorId` existe porque a RLS de líder é da EMPRESA, não do setor: sem ele, o
 * líder do Receptivo puxava os acordos (e os operadores, e as equipes) de todos
 * os setores. O recorte é pelo setor CARIMBADO na linha — o mesmo critério do
 * filtro da tela —, então quem mudou de setor não leva o histórico junto.
 */
export async function fetchAcordosPix(
  empresaId: string,
  opts?: { operadorId?: string; setorId?: string | null },
): Promise<PixAutoAcordo[]> {
  let q = supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false });
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  if (opts?.setorId)    q = q.eq('setor_id', opts.setorId);
  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchAcordosPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoAcordo[]) ?? [];
}

/**
 * Linhas desenhadas por vez na tabela do Pix.
 *
 * A paginação é de EXIBIÇÃO: a consulta traz o conjunto filtrado inteiro e a
 * tabela desenha uma fatia. Não é economia de rede — é economia de DOM, e é o
 * que mantém corretos os números que somam o filtro todo.
 *
 * Paginar no servidor quebraria dois deles: os totais por status e o pago ×
 * a pagar são "sobre o conjunto visível", ou seja, sobre o RECORTE DO FILTRO.
 * Calculados sobre uma página, o líder que filtra por equipe veria o total das
 * 100 linhas abertas achando que é o da equipe.
 */
export const PIX_LINHAS_POR_PAGINA = 100;

/**
 * Edita um registro do operador — só NR e valor, e só enquanto PENDENTE.
 *
 * O `.eq('status', 'pendente')` repete no cliente o que a policy e o gatilho da
 * migration 20260804c já garantem. Não é desconfiança da RLS: é o que faz a
 * tela dizer "este acordo já foi avaliado" em vez de gravar zero linhas em
 * silêncio quando o líder aprovou enquanto o formulário estava aberto.
 */
export async function editarAcordoPix(p: {
  id: string;
  nrCliente: string;
  valor: number;
}): Promise<{ ok: boolean; error?: string }> {
  const nr = p.nrCliente.trim();
  if (!nr) return { ok: false, error: 'Informe o NR do acordo.' };
  if (!Number.isFinite(p.valor) || p.valor <= 0) return { ok: false, error: 'Valor inválido.' };

  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .update({ nr_cliente: nr, valor: p.valor })
    .eq('id', p.id)
    .eq('status', 'pendente')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Este acordo não está mais pendente e não pode ser editado.' };
  }
  return { ok: true };
}

// ── Pagamento da comissão ──────────────────────────────────────────────────

/**
 * Marca (ou desmarca) o pagamento da comissão. Só líder+ — a policy de UPDATE
 * ampla é dele, e o gatilho devolve estas colunas se um operador tentar.
 *
 * Duas travas no caminho de PAGAR, as duas espelhando
 * `fn_pix_valida_pagamento` (migration 20260811c):
 *
 *   `status = 'aprovado'` — pagar comissão de acordo pendente ou desaprovado é
 *   dinheiro saindo por engano;
 *
 *   `pago = false` — quem já está pago não é pago de novo. `pago` é booleano,
 *   então o clique repetido não somaria nada; o que ele faz é reescrever
 *   `pago_em` e `pago_por`, apagando quem de fato pagou e quando. É esse rastro
 *   que se protege. Desfazer o pagamento é o caminho para refazê-lo.
 */
export async function marcarComissaoPaga(p: {
  ids: string[];
  pago: boolean;
  responsavelId: string;
  responsavelNome: string;
}): Promise<{ ok: boolean; count: number; error?: string }> {
  if (p.ids.length === 0) return { ok: true, count: 0 };
  const payload: PixAutoAcordoUpdate = p.pago
    ? {
        pago: true,
        pago_em: new Date().toISOString(),
        pago_por: p.responsavelId,
        pago_por_nome: p.responsavelNome,
      }
    : { pago: false, pago_em: null, pago_por: null, pago_por_nome: null };

  let q = supabase
    .from('pix_automatico_acordos')
    .update(payload)
    .in('id', p.ids);
  if (p.pago) q = q.eq('status', 'aprovado').eq('pago', false);
  const { data, error } = await q.select('id');
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: (data ?? []).length };
}

// ── Confirmação mensal da premiação ────────────────────────────────────────

/** Status manual exibido ao lado de “Falta pagar”, uma linha por pessoa/mês. */
export async function fetchPremiacoesPagamento(
  empresaId: string,
  mes: MesRef,
): Promise<PixPremiacaoPagamento[]> {
  const { data, error } = await supabase
    .from('pix_automatico_premiacoes_pagamento')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('mes', primeiroDiaDoMes(mes));

  if (error) {
    console.warn('[pix_automatico.service] fetchPremiacoesPagamento:', error.message);
    return [];
  }
  return data ?? [];
}

function mensagemPremiacaoPagamento(bruta: string): string {
  if (bruta.includes('PIX_PREMIACAO_SEM_PERMISSAO'))
    return 'Somente a gerência ou um cargo superior pode alterar este status.';
  if (bruta.includes('PIX_PREMIACAO_OPERADOR'))
    return 'Esta pessoa não pertence à empresa selecionada.';
  if (bruta.includes('PIX_PREMIACAO_EMPRESA'))
    return 'Esta empresa não está no seu acesso.';
  if (/function|does not exist|schema cache/i.test(bruta))
    return 'O controle de pagamento da premiação ainda não está disponível neste banco.';
  return bruta;
}

/** Escrita atômica e auditada; a RPC confere novamente cargo e empresa. */
export async function marcarPremiacaoPaga(p: {
  empresaId: string;
  operadorId: string;
  mes: MesRef;
  pago: boolean;
}): Promise<{ ok: boolean; pagamento?: PixPremiacaoPagamento; error?: string }> {
  const { data, error } = await supabase.rpc('fn_pix_premiacao_marcar_pagamento', {
    p_empresa_id: p.empresaId,
    p_operador_id: p.operadorId,
    p_mes: primeiroDiaDoMes(p.mes),
    p_pago: p.pago,
  });

  if (error) return { ok: false, error: mensagemPremiacaoPagamento(error.message) };
  return { ok: true, pagamento: data ?? undefined };
}

export async function criarAcordoPix(p: {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
  nrCliente: string;
  valor: number;
  /** Etiqueta visual para a conferência. Não muda regra nenhuma. */
  extra?: boolean;
}): Promise<{ ok: boolean; error?: string; nrDuplicado?: boolean }> {
  const { error } = await supabase.from('pix_automatico_acordos').insert({
    empresa_id:    p.empresaId,
    operador_id:   p.operadorId,
    operador_nome: p.operadorNome,
    setor_id:      p.setorId,
    nr_cliente:    p.nrCliente.trim(),
    valor:         p.valor,
    status:        'pendente',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `extra` só entra no tipo gerado depois da migration 20260902100000.
    ...(p.extra ? { extra: true } as any : {}),
  });
  if (error) {
    /*
     * O trigger `fn_pix_nr_bloqueia_duplicado` recusa com `unique_violation`.
     *
     * A tela precisa distinguir esse caso dos outros: aqui não é erro, é o
     * ponto onde se oferece o pedido de autorização ao líder. Sem o
     * sinalizador, ela mostraria «erro ao registrar» e a pessoa desistiria.
     */
    const duplicado = error.code === '23505'
      || /já está registrado no Pix/i.test(error.message);
    return { ok: false, error: error.message, nrDuplicado: duplicado };
  }
  return { ok: true };
}

export interface LinhaPixLote {
  nrCliente: string;
  valor: number;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
}

/**
 * NRs que NÃO podem ser registrados de novo.
 *
 * A regra, desde a migration 20260811c: **um NR, um registro — enquanto ele
 * existir**. Qualquer linha viva com aquele NR ocupa o NR, em qualquer status.
 * Excluir a linha (ela vai para a lixeira) libera.
 *
 * Vale também para `desaprovado`: ele existe registrado. A saída para o engano
 * é a de sempre — o dono apaga o próprio desaprovado, e o expurgo automático de
 * 2 dias úteis faz isso sozinho.
 *
 * O que ficou para trás e por quê:
 *   • até 20260811a o portão era o REGISTRO HISTÓRICO
 *     (`pix_automatico_nr_registro` em 'pendente'/'validado'). Ele sobrevive à
 *     exclusão do acordo, então trancava NR de registro que não existia mais —
 *     o bug que travou o time em 11/08/2026;
 *   • a 20260811a trocou por "aprovado + pago", o que abria demais: dois
 *     operadores podiam registrar o mesmo NR e ficar os dois pendentes.
 *
 * Esta lista tem de dizer o mesmo que `fn_pix_nr_bloqueia_duplicado`, senão a
 * tela promete o que o banco recusa (ou pior: o contrário).
 */
export async function fetchNrsBloqueados(empresaId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .select('nr_cliente')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[pix_automatico.service] fetchNrsBloqueados:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { nr_cliente: string }[]).map(r => normalizarNr(r.nr_cliente)));
}

/** Histórico completo de NRs da empresa (para consulta/ferramentas futuras). */
export async function fetchNrRegistros(empresaId: string): Promise<PixNrRegistro[]> {
  const { data, error } = await supabase
    .from('pix_automatico_nr_registro')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('atualizado_em', { ascending: false })
    .limit(2000);
  if (error) {
    console.warn('[pix_automatico.service] fetchNrRegistros:', error.message);
    return [];
  }
  return (data as unknown as PixNrRegistro[]) ?? [];
}

/**
 * Cria vários acordos Pix de uma vez (importação de planilha).
 *
 * Dedupe por NR: pula o que já está registrado na empresa e o que se repete
 * dentro da própria planilha. Mesma régua do banco — o insert em lote é uma
 * transação só, e uma linha recusada pelo trigger derrubaria a importação
 * inteira.
 */
export async function criarAcordosPixLote(
  empresaId: string,
  linhas: LinhaPixLote[],
): Promise<{ ok: boolean; importados: number; ignorados: number; duplicados: number; error?: string }> {
  const bloqueados = await fetchNrsBloqueados(empresaId);

  let ignorados = 0;
  let duplicados = 0;
  const vistosNoLote = new Set<string>();
  const novos: PixAutoAcordoInsert[] = [];

  for (const l of linhas) {
    const nr = (l.nrCliente ?? '').trim();
    const valor = Number(l.valor);
    if (!nr || !Number.isFinite(valor) || valor <= 0) { ignorados++; continue; }
    const k = normalizarNr(nr);
    if (bloqueados.has(k) || vistosNoLote.has(k)) { duplicados++; continue; }
    vistosNoLote.add(k);
    novos.push({
      empresa_id:    empresaId,
      operador_id:   l.operadorId,
      operador_nome: l.operadorNome,
      setor_id:      l.setorId,
      nr_cliente:    nr,
      valor,
      status:        'pendente',
    });
  }

  if (novos.length === 0) return { ok: true, importados: 0, ignorados, duplicados };

  const { error } = await supabase.from('pix_automatico_acordos').insert(novos);
  if (error) return { ok: false, importados: 0, ignorados, duplicados, error: error.message };
  return { ok: true, importados: novos.length, ignorados, duplicados };
}

/**
 * Aprova ou desaprova. Na aprovação, trava o % vigente do setor na linha
 * (pct_comissao) — mudanças futuras de configuração não alteram o aprovado.
 */
export async function avaliarAcordoPix(p: {
  id: string;
  aprovar: boolean;
  pctAtual: number;
  avaliadorId: string;
  avaliadorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_acordos')
    .update({
      status:            p.aprovar ? 'aprovado' : 'desaprovado',
      pct_comissao:      p.aprovar ? p.pctAtual : null,
      avaliado_por:      p.avaliadorId,
      avaliado_por_nome: p.avaliadorNome,
      avaliado_em:       new Date().toISOString(),
    })
    .eq('id', p.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Volta uma linha avaliada para pendente (correção de engano do líder).
 *
 * Linha PAGA não volta. O pagamento é um fato sobre dinheiro que já saiu, e
 * desde a 20260811a é ele quem tranca o NR — uma linha `pendente` com
 * `pago = true` seria um estado que a regra nova não sabe ler, e nem excluir
 * daria mais para fazer. O caminho é "Desfazer" o pagamento antes.
 *
 * O `.eq('pago', false)` é o que garante isso mesmo se a tela oferecer o botão
 * por descuido; a mensagem existe porque zero linhas afetadas, sozinho, não
 * explica nada a quem clicou.
 */
export async function reavaliarAcordoPix(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .update({ status: 'pendente', pct_comissao: null, avaliado_por: null, avaliado_por_nome: null, avaliado_em: null })
    .eq('id', id)
    .eq('pago', false)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'A comissão deste acordo já foi paga. Desfaça o pagamento antes de voltar para pendente.' };
  }
  return { ok: true };
}

/**
 * Exclui um registro — passando pela lixeira.
 *
 * A ordem é snapshot ANTES do delete, e o delete só acontece se o snapshot
 * entrou. Ao contrário, uma falha ao gravar na lixeira apagaria a linha do
 * mesmo jeito e o operador acharia que tinha como voltar atrás.
 *
 * Foi exatamente o que faltou em 2026-08-10: o delete era direto, um registro
 * se perdeu e o valor não pôde ser recuperado — ele só existia nesta tabela.
 *
 * Linha PAGA não passa daqui. O trigger `trg_pix_a_impede_pago` (20260811a) é
 * quem de fato recusa; parar antes evita gravar na lixeira uma cópia que o
 * delete seguinte vai rejeitar, e devolve a frase certa em vez do texto cru do
 * Postgres.
 */
export async function excluirAcordoPix(
  id: string,
  quem?: { id?: string | null; nome?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { data: linha, error: errLer } = await supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (errLer)  return { ok: false, error: errLer.message };
  if (!linha)  return { ok: false, error: 'Registro não encontrado — recarregue a lista.' };

  const a = linha as unknown as PixAutoAcordo;
  if (a.pago) {
    return {
      ok: false,
      error: 'A comissão deste acordo já foi paga — ele não pode ser excluído. Desfaça o pagamento antes.',
    };
  }

  const { error: errLix } = await supabase.from('lixeira_pix_automatico').insert({
    empresa_id:        a.empresa_id,
    acordo_id:         a.id,
    nr_cliente:        a.nr_cliente,
    valor:             a.valor,
    status:            a.status,
    operador_id:       a.operador_id,
    operador_nome:     a.operador_nome,
    setor_id:          a.setor_id ?? null,
    dados_completos:   a,
    excluido_por:      quem?.id ?? null,
    excluido_por_nome: quem?.nome ?? null,
  } as never);

  if (errLix) {
    return { ok: false, error: `Não foi possível guardar na lixeira: ${errLix.message}` };
  }

  const { error } = await supabase.from('pix_automatico_acordos').delete().eq('id', id);
  if (error) {
    // A cópia ficou na lixeira sem o delete acontecer. Desfaz para a linha não
    // aparecer nos dois lugares — a tela mostraria o registro vivo E na
    // lixeira, e restaurar depois duplicaria o NR.
    await supabase.from('lixeira_pix_automatico').delete().eq('acordo_id', id);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── Lixeira ────────────────────────────────────────────────────────────────

export interface PixLixeiraItem {
  id: string;
  empresa_id: string;
  acordo_id: string;
  nr_cliente: string;
  valor: number;
  status: string;
  operador_id: string | null;
  operador_nome: string | null;
  setor_id: string | null;
  dados_completos: PixAutoAcordo;
  excluido_por: string | null;
  excluido_por_nome: string | null;
  excluido_em: string;
  expira_em: string;
}

/**
 * Itens da lixeira. `operadorId` restringe ao que era daquele operador — a RLS
 * já faz isso para quem não é líder, e passar aqui evita depender só dela para
 * a tela mostrar a coisa certa.
 */
export async function fetchLixeiraPix(
  empresaId: string,
  opts?: { operadorId?: string },
): Promise<PixLixeiraItem[]> {
  let q = supabase
    .from('lixeira_pix_automatico')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('excluido_em', { ascending: false });
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);

  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchLixeiraPix:', error.message);
    return [];
  }
  return (data as unknown as PixLixeiraItem[]) ?? [];
}

/**
 * Restaura um item. Vai por RPC porque a volta precisa de três coisas que o
 * cliente não consegue fazer junto: gravar o `status` original (a policy de
 * INSERT exige `pendente`), realinhar o registro de NR, e sair da lixeira na
 * mesma transação. Ver `fn_pix_restaurar_lixeira` na 20260810c.
 */
export async function restaurarItemLixeiraPix(
  itemId: string,
): Promise<{ ok: boolean; acordoId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('fn_pix_restaurar_lixeira', { p_item_id: itemId });
  if (error) {
    const msg = error.message.includes('SEM_PERMISSAO_RESTAURAR')
      ? 'Só líder ou superior pode restaurar registros do Pix automático.'
      : error.message.includes('LIXEIRA_ITEM_NAO_ENCONTRADO')
        ? 'Este item já saiu da lixeira — recarregue a lista.'
        : error.message;
    return { ok: false, error: msg };
  }
  return { ok: true, acordoId: (data as string) ?? undefined };
}

/** Apaga de vez um item da lixeira. */
export async function excluirItemLixeiraPix(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('lixeira_pix_automatico').delete().eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Remove o que passou dos 3 dias de retenção.
 *
 * Chamada ao abrir a lixeira (purga preguiçosa): não existe job agendado, e sem
 * isto o item expirado continuaria listado como se ainda desse para restaurar.
 */
export async function purgarLixeiraPixExpirada(empresaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_pix_lixeira_purgar', { p_empresa_id: empresaId });
  if (error) {
    console.warn('[pix_automatico.service] purgarLixeiraPixExpirada:', error.message);
    return 0;
  }
  return Number(data ?? 0);
}

// ── Log da aba ─────────────────────────────────────────────────────────────

/**
 * Uma ação registrada no histórico do Pix automático.
 *
 * Escrito só por triggers (`fn_pix_log*`, migration 20260811c) — não há caminho
 * de escrita pelo cliente, de propósito: log que a tela grava tem furo no dia
 * em que alguém esquece de chamar.
 */
export interface PixLogItem {
  id: string;
  empresa_id: string;
  acordo_id: string;
  nr_cliente: string;
  acao:
    | 'registrado' | 'restaurado' | 'editado'
    | 'aprovado' | 'desaprovado' | 'voltou_pendente'
    | 'pago' | 'pagamento_desfeito' | 'excluido';
  /** Frase pronta, montada no banco. A tela só desenha. */
  descricao: string;
  valor: number | null;
  /** Dono do registro — não é quem fez a ação. */
  operador_id: string | null;
  operador_nome: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  criado_em: string;
}

/** Quantas ações a tela mostra de uma vez. */
export const PIX_LOG_LIMITE = 300;

/**
 * Histórico da aba. `acordoId` filtra um registro só (o histórico de uma
 * linha); sem ele vem o da empresa inteira, do mais recente para o mais antigo.
 *
 * A RLS decide o recorte de quem lê: operador vê o que é dele, líder+ vê tudo.
 * Migration ausente devolve lista vazia, no padrão do resto do arquivo.
 */
export async function fetchLogPix(
  empresaId: string,
  opts?: { acordoId?: string; operadorId?: string; limite?: number },
): Promise<PixLogItem[]> {
  let q = supabase
    .from('pix_automatico_log')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(opts?.limite ?? PIX_LOG_LIMITE);
  if (opts?.acordoId)   q = q.eq('acordo_id', opts.acordoId);
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);

  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchLogPix:', error.message);
    return [];
  }
  return (data as unknown as PixLogItem[]) ?? [];
}

/**
 * Dias ÚTEIS que um acordo desaprovado sobrevive antes de ser excluído.
 *
 * O operador é avisado por notificação assim que o líder desaprova, e tem esse
 * prazo para conferir o que aconteceu. Passado o prazo, a linha some sozinha e
 * o NR volta a ficar livre — outra pessoa pode fechar o mesmo acordo depois.
 *
 * Fonte única no TypeScript: `prazoExpurgoDesaprovado` (que desenha a data na
 * tela) e o texto da tela importam DAQUI. Quem mostra e quem cumpre o prazo têm
 * de dizer o mesmo número.
 *
 * ⚠️ A outra ponta é SQL e não tem como importar isto: o mesmo `2` está em
 * `fn_pix_expurga_desaprovados` (migration `20260809a`), que é quem de fato
 * apaga. Mudar o prazo exige uma migration nova junto — senão a tela promete um
 * prazo e o banco cumpre outro.
 */
export const PIX_DIAS_UTEIS_EXPURGO = 2;

/**
 * Apaga os desaprovados cujo prazo já venceu e devolve quantos saíram.
 *
 * Chamada ao abrir a tela: não há job agendado neste projeto, e o expurgo
 * precisa acontecer mesmo assim. É idempotente e barata (índice por status), e
 * a policy do banco garante que só líder+ da empresa consegue executar.
 *
 * Migration ausente → devolve 0 sem barulho, no mesmo padrão de
 * `fetchNrsBloqueados`: o recurso some, o resto da tela segue.
 */
export async function expurgarDesaprovadosVencidos(empresaId: string): Promise<number> {
  // `fn_pix_expurga_desaprovados` é da migration 20260809a e ainda não está no
  // database.types.ts gerado — daí o cast.
  //
  // O cast é no CLIENTE e a chamada segue sendo `cliente.rpc(...)`:
  // `SupabaseClient.rpc` faz `return this.rest.rpc(...)`, então guardar o método
  // numa variável perde o `this` e estoura "Cannot read properties of undefined
  // (reading 'rest')" — o mesmo defeito que já tinha derrubado a exclusão de
  // usuário e a foto do setor (a694d7d).
  const cliente = supabase as unknown as {
    rpc: (nome: string, args: Record<string, unknown>) => Promise<{
      data: unknown; error: { message: string } | null;
    }>;
  };

  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    ({ data, error } = await cliente.rpc('fn_pix_expurga_desaprovados', {
      p_empresa_id: empresaId,
    }));
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  if (error) {
    console.warn('[pix_automatico.service] expurgarDesaprovadosVencidos:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

/**
 * Manda para a lixeira todos os DESAPROVADOS do operador
 * (botão "Limpar desaprovados").
 *
 * Passa pela lixeira como o excluir de uma linha só. É o botão que apaga
 * VÁRIAS de uma vez sem confirmação item a item — justamente o que mais
 * precisa de volta atrás.
 *
 * `pago = false` no recorte: desaprovado pago não deveria existir, mas basta
 * um "Pagar" seguido de "Voltar para pendente" de uma versão antiga para uma
 * linha assim ter ficado no banco. Sem o filtro, o trigger recusaria a linha e
 * derrubaria a limpeza INTEIRA (um DELETE, uma transação).
 */
export async function limparDesaprovados(
  empresaId: string,
  operadorId: string,
  quem?: { id?: string | null; nome?: string | null },
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data: linhas, error: errLer } = await supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('operador_id', operadorId)
    .eq('status', 'desaprovado')
    .eq('pago', false);

  if (errLer) return { ok: false, count: 0, error: errLer.message };

  const itens = (linhas ?? []) as unknown as PixAutoAcordo[];
  if (!itens.length) return { ok: true, count: 0 };

  const { error: errLix } = await supabase.from('lixeira_pix_automatico').insert(
    itens.map(a => ({
      empresa_id:        a.empresa_id,
      acordo_id:         a.id,
      nr_cliente:        a.nr_cliente,
      valor:             a.valor,
      status:            a.status,
      operador_id:       a.operador_id,
      operador_nome:     a.operador_nome,
      setor_id:          a.setor_id ?? null,
      dados_completos:   a,
      excluido_por:      quem?.id ?? null,
      excluido_por_nome: quem?.nome ?? null,
    })) as never,
  );
  if (errLix) {
    return { ok: false, count: 0, error: `Não foi possível guardar na lixeira: ${errLix.message}` };
  }

  const ids = itens.map(a => a.id);
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) {
    await supabase.from('lixeira_pix_automatico').delete().in('acordo_id', ids);
    return { ok: false, count: 0, error: error.message };
  }
  return { ok: true, count: (data ?? []).length };
}

// ── Configuração de % por setor ────────────────────────────────────────────

export async function fetchConfigsPix(empresaId: string): Promise<PixAutoConfig[]> {
  const { data, error } = await supabase
    .from('pix_automatico_config')
    .select('*')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[pix_automatico.service] fetchConfigsPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoConfig[]) ?? [];
}

export async function upsertConfigPix(p: {
  empresaId: string;
  setorId: string;
  pct: number;
  /** Meta de acordos da dobra. Omitido = não mexe no que já está gravado. */
  metaAcordosDobra?: number;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    empresa_id:          p.empresaId,
    setor_id:            p.setorId,
    pct:                 p.pct,
    atualizado_por:      p.atualizadoPor,
    atualizado_por_nome: p.atualizadoPorNome,
    atualizado_em:       new Date().toISOString(),
  };
  // Só entra no upsert quando veio: `undefined` no payload viraria NULL na
  // coluna, e a meta do setor sumiria ao alguém salvar só o percentual.
  if (p.metaAcordosDobra != null) payload.meta_acordos_dobra = p.metaAcordosDobra;

  const { error } = await supabase
    .from('pix_automatico_config')
    .upsert(payload as never, { onConflict: 'empresa_id,setor_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Meta de Pix automático por setor/mês ───────────────────────────────────

export interface PixAutoMeta {
  id: string;
  empresa_id: string;
  setor_id: string;
  /** Equipe dona da meta. null = linha antiga, de quando a meta era do setor. */
  equipe_id: string | null;
  mes: number;
  ano: number;
  /** Meta do VALOR dos acordos Pix do setor no mês (não da comissão). */
  meta_valor: number;
  /** Meta de QUANTIDADE de acordos Pix no mês. 0 = sem meta de quantidade. */
  meta_acordos: number;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Metas de Pix das EQUIPES de um setor no mês.
 *
 * A meta do setor não é digitada: é a soma das metas das equipes (Bryan,
 * Luciana, Matheus…). Por isso a leitura devolve a lista, e quem consolida é
 * quem exibe — guardar o total do setor também deixaria dois números para a
 * mesma verdade, e um deles ficaria velho.
 *
 * Tolera a migration ausente (tabela inexistente → lista vazia), no mesmo
 * padrão de `fetchNrsBloqueados`: o recurso some, o resto da tela segue.
 */
export async function fetchMetasPixEquipes(
  empresaId: string,
  setorId: string,
  mes: number,
  ano: number,
): Promise<PixAutoMeta[]> {
  const { data, error } = await supabase
    .from('pix_automatico_metas')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('setor_id', setorId)
    .eq('mes', mes)
    .eq('ano', ano);
  if (error) {
    console.warn('[pix_automatico.service] fetchMetasPixEquipes:', error.message);
    return [];
  }
  return (data as unknown as PixAutoMeta[]) ?? [];
}

/**
 * Grava a meta de UMA equipe. `metaValor` e `metaAcordos` zerados apagam a
 * linha: meta zero e "sem meta" são coisas diferentes na tela (uma mostra
 * "faltam R$ 0,00", a outra não mostra nada), e é o apagar que devolve a
 * equipe ao estado de "ainda não definida".
 */
export async function upsertMetaPixEquipe(p: {
  empresaId: string;
  setorId: string;
  equipeId: string;
  mes: number;
  ano: number;
  metaValor: number;
  metaAcordos: number;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (p.metaValor <= 0 && p.metaAcordos <= 0) {
    const { error } = await supabase
      .from('pix_automatico_metas')
      .delete()
      .eq('empresa_id', p.empresaId)
      .eq('equipe_id', p.equipeId)
      .eq('mes', p.mes)
      .eq('ano', p.ano);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('pix_automatico_metas')
    .upsert({
      empresa_id:          p.empresaId,
      setor_id:            p.setorId,
      equipe_id:           p.equipeId,
      mes:                 p.mes,
      ano:                 p.ano,
      meta_valor:          p.metaValor,
      meta_acordos:        p.metaAcordos,
      atualizado_por:      p.atualizadoPor,
      atualizado_por_nome: p.atualizadoPorNome,
    }, { onConflict: 'empresa_id,equipe_id,mes,ano' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Liga/desliga o registro manual dos operadores no setor (interruptor). */
export async function setPermiteRegistroOperador(p: {
  empresaId: string;
  setorId: string;
  permite: boolean;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_config')
    .upsert({
      empresa_id:                p.empresaId,
      setor_id:                  p.setorId,
      permite_registro_operador: p.permite,
      atualizado_por:            p.atualizadoPor,
      atualizado_por_nome:       p.atualizadoPorNome,
      atualizado_em:             new Date().toISOString(),
    }, { onConflict: 'empresa_id,setor_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Saldo de divergência ───────────────────────────────────────────────────
//
// O acerto de quando o Pix saiu com valor errado. Positivo: a empresa pagou de
// menos e deve. Negativo: pagou de mais e vai descontar. O ciclo inteiro está
// no cabeçalho da migration `20260823080000`.
//
// Toda escrita passa por RPC: aplicar e retirar mexem em `pix_automatico_saldos`
// e em `pix_automatico_acordos` ao mesmo tempo, e as duas precisam acontecer ou
// nenhuma. Não há policy de INSERT/UPDATE/DELETE na tabela de saldos — um
// UPDATE direto conseguiria mudar o valor de um saldo já reservado, que é
// exatamente o que as RPCs impedem.

/**
 * Saldos abertos da empresa. `setorId` recorta pelo setor CARIMBADO na linha —
 * o mesmo critério de `fetchAcordosPix`, para o líder não ver pendência de
 * setor que ele não acompanha.
 *
 * Migration ausente → lista vazia, no padrão do resto do arquivo: o recurso
 * some da tela e o Pix continua funcionando.
 */
export async function fetchSaldosPix(
  empresaId: string,
  opts?: { operadorId?: string; setorId?: string | null },
): Promise<PixAutoSaldo[]> {
  let q = supabase
    .from('pix_automatico_saldos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('atualizado_em', { ascending: false });
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  if (opts?.setorId)    q = q.eq('setor_id', opts.setorId);

  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchSaldosPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoSaldo[]) ?? [];
}

/** Mapa `operador_id → saldo`, do jeito que a tabela e o formulário consomem. */
export function saldosPorOperador(saldos: PixAutoSaldo[]): Record<string, PixAutoSaldo> {
  const mapa: Record<string, PixAutoSaldo> = {};
  for (const s of saldos) mapa[s.operador_id] = s;
  return mapa;
}

/**
 * Traduz o erro do banco para uma frase que explica o que fazer.
 *
 * Os códigos vêm das RPCs da migration. Sem esta tradução a tela mostraria
 * "new row violates..." ou o texto cru do RAISE, que não diz a ninguém qual é
 * o próximo passo.
 */
function mensagemSaldo(bruta: string): string {
  const t = bruta;
  if (t.includes('PIX_SALDO_SEM_PERMISSAO'))
    return 'Você não tem permissão para corrigir valor divergente.';
  if (t.includes('PIX_SALDO_RESERVADO'))
    return 'Este saldo já está aplicado num acordo aguardando pagamento. Retire a correção de lá antes.';
  if (t.includes('PIX_SALDO_INEXISTENTE'))
    return 'Não há saldo de divergência para este operador.';
  if (t.includes('PIX_SALDO_JA_APLICADO'))
    return 'Este acordo já carrega uma correção.';
  if (t.includes('PIX_SALDO_JA_PAGO'))
    return 'A comissão deste acordo já foi paga. Desfaça o pagamento antes.';
  if (t.includes('PIX_SALDO_SO_APROVADO'))
    return 'A correção só entra em acordo aprovado e ainda não pago.';
  if (t.includes('PIX_SALDO_SEM_CORRECAO'))
    return 'Este acordo não carrega correção.';
  if (t.includes('PIX_SALDO_OPERADOR'))
    return 'Operador não encontrado nesta empresa.';
  if (t.includes('PIX_SALDO_ACORDO'))
    return 'Registro não encontrado — recarregue a lista.';
  if (t.includes('PIX_SALDO_EMPRESA'))
    return 'Este registro é de outra empresa.';
  if (/function|does not exist|schema cache/i.test(t))
    return 'A correção de valor divergente ainda não está disponível neste banco.';
  return t;
}

/**
 * Anota o saldo de um operador.
 *
 * `somar` distingue as duas intenções que a tela oferece: «achei outra
 * divergência» soma ao que já existe; «eu tinha digitado errado» substitui.
 * Adivinhar qual delas é errar metade das vezes.
 *
 * Valor resultante zero apaga o saldo — saldo zerado e saldo inexistente são a
 * mesma coisa, e uma linha com 0 apareceria na tela como pendência que não pende.
 */
export async function definirSaldoPix(p: {
  empresaId: string;
  operadorId: string;
  valor: number;
  motivo?: string | null;
  somar?: boolean;
}): Promise<{ ok: boolean; saldo?: PixAutoSaldo | null; error?: string }> {
  if (!Number.isFinite(p.valor)) return { ok: false, error: 'Valor inválido.' };

  const { data, error } = await supabase.rpc('fn_pix_saldo_definir', {
    p_empresa_id:  p.empresaId,
    p_operador_id: p.operadorId,
    p_valor:       p.valor,
    p_motivo:      p.motivo ?? null,
    p_somar:       p.somar === true,
  });
  if (error) return { ok: false, error: mensagemSaldo(error.message) };
  return { ok: true, saldo: (data as unknown as PixAutoSaldo | null) ?? null };
}

/**
 * Carimba o saldo do operador num acordo aprovado e ainda não pago.
 *
 * O saldo fica RESERVADO ali — ainda existe, e só some quando esse acordo for
 * marcado como pago. É o que o pedido descreve: o valor não se limpa ao aplicar
 * a correção, se limpa quando o pagamento com ela acontece.
 */
export async function aplicarSaldoNoAcordo(
  acordoId: string,
): Promise<{ ok: boolean; acordo?: PixAutoAcordo; error?: string }> {
  const { data, error } = await supabase.rpc('fn_pix_saldo_aplicar', { p_acordo_id: acordoId });
  if (error) return { ok: false, error: mensagemSaldo(error.message) };
  return { ok: true, acordo: (data as unknown as PixAutoAcordo) ?? undefined };
}

/** Tira a correção de um acordo ainda não pago; o saldo volta a ficar livre. */
export async function retirarSaldoDoAcordo(
  acordoId: string,
): Promise<{ ok: boolean; acordo?: PixAutoAcordo; error?: string }> {
  const { data, error } = await supabase.rpc('fn_pix_saldo_retirar', { p_acordo_id: acordoId });
  if (error) return { ok: false, error: mensagemSaldo(error.message) };
  return { ok: true, acordo: (data as unknown as PixAutoAcordo) ?? undefined };
}

// ── Autorização de NR duplicado ─────────────────────────────────────────────
//
// Até 02/09/2026 o segundo registro de um NR era simplesmente recusado, e a
// mensagem mandava «excluir o registro existente para liberá-lo». Isso punha a
// decisão no pior lugar possível: quem apagaria seria o operador do OUTRO
// setor, que não sabe do caso e não deveria poder desfazer registro alheio.
//
// Agora o segundo vira PEDIDO. O líder vê os dois lado a lado — quem registrou
// primeiro, quem está pedindo, os valores, se é Extra — e decide. É o mesmo
// enredo do Receptivo lançando um Pix que outro setor já lançou.
//
// Toda escrita passa por RPC: não há policy de INSERT/UPDATE na tabela. Um
// INSERT solto criaria pedido em nome de outro; um UPDATE solto se
// autoaprovaria.

export type PixNrPedidoStatus = 'pendente' | 'aprovado' | 'recusado';

export interface PixNrPedido {
  id: string;
  empresa_id: string;
  /** Quem FICA com o acordo se for aprovado — pode não ser quem pediu. */
  operador_id: string;
  operador_nome: string | null;
  setor_id: string | null;
  nr_cliente: string;
  valor: number;
  extra: boolean;
  /**
   * O registro que já existia, por id e DESNORMALIZADO.
   *
   * A cópia importa: o acordo em conflito pode ser excluído entre o pedido e a
   * decisão, e sem ela o líder decidiria sobre «um registro que não existe
   * mais», sem saber de quem era nem de quanto.
   */
  conflito_acordo_id: string | null;
  conflito_operador: string | null;
  conflito_valor: number | null;
  conflito_status: string | null;
  conflito_em: string | null;
  motivo: string | null;
  status: PixNrPedidoStatus;
  decidido_por: string | null;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  decisao_motivo: string | null;
  acordo_id: string | null;
  criado_por: string | null;
  criado_em: string;
}

/** Traduz o `RAISE EXCEPTION` do banco para a frase que a tela mostra. */
function mensagemPedidoNr(bruta: string): string {
  if (/nao esta registrado|não está registrado/i.test(bruta)) {
    return 'Este NR não está mais registrado — faça o registro normal.';
  }
  if (/ja foi decidido|já foi decidido/i.test(bruta)) {
    return 'Outra pessoa já decidiu este pedido.';
  }
  if (/nao pode decidir|não pode decidir/i.test(bruta)) {
    return 'Você não tem permissão para decidir autorizações do Pix.';
  }
  return bruta.replace(/^.*?:\s*/, '') || 'Não foi possível concluir.';
}

/**
 * Os pedidos da empresa. `apenasAbertos` é o que a fila do líder usa; o
 * histórico completo serve à conferência de «por que este NR tem dois».
 */
export async function fetchPedidosNr(
  empresaId: string,
  apenasAbertos = true,
): Promise<PixNrPedido[]> {
  // `tabelaSemTipo`: a tabela so entra em database.types.ts quando os tipos
  // forem regerados, e a migration 20260902100000 e mais nova que eles.
  let q = tabelaSemTipo<PixNrPedido>('pix_automatico_nr_pedidos')
    .select('*')
    .eq('empresa_id', empresaId);
  if (apenasAbertos) q = q.eq('status', 'pendente');

  const { data, error } = await q;
  if (error) {
    // A tabela só existe depois da migration 20260902100000. Sem ela a tela
    // desenha a fila vazia — que é o estado correto, não um erro na cara.
    if (!/does not exist|schema cache/i.test(error.message)) {
      console.warn('[pix_automatico.service] fetchPedidosNr:', error.message);
    }
    return [];
  }
  // A ordenação é no cliente: `tabelaSemTipo` é de propósito estreita (só
  // `select` e `eq`), e a fila de pedidos abertos é curta — ordená-la aqui
  // custa menos que alargar o atalho para todo o projeto.
  return [...((data as unknown as PixNrPedido[]) ?? [])]
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}

/** Pede ao líder autorização para registrar um NR que já existe. */
export async function pedirAutorizacaoNr(p: {
  operadorId: string;
  nrCliente: string;
  valor: number;
  extra?: boolean;
  motivo?: string | null;
}): Promise<{ ok: boolean; pedido?: PixNrPedido; error?: string }> {
  const { data, error } = await rpcSemTipo<PixNrPedido>('fn_pix_nr_pedir', {
    p_operador_id: p.operadorId,
    p_nr_cliente:  p.nrCliente.trim(),
    p_valor:       p.valor,
    p_extra:       p.extra ?? false,
    p_motivo:      p.motivo ?? null,
  });
  if (error) return { ok: false, error: mensagemPedidoNr(error.message) };
  return { ok: true, pedido: (data as unknown as PixNrPedido) ?? undefined };
}

/**
 * Aprova ou recusa.
 *
 * Aprovado, o acordo nasce PENDENTE — autorizar a duplicidade não é aprovar a
 * comissão. O líder ainda vai avaliar o registro como avalia qualquer outro, e
 * é o que mantém as duas decisões separadas.
 */
export async function decidirPedidoNr(
  pedidoId: string,
  aprovar: boolean,
  motivo?: string | null,
): Promise<{ ok: boolean; pedido?: PixNrPedido; error?: string }> {
  const { data, error } = await rpcSemTipo<PixNrPedido>('fn_pix_nr_pedido_decidir', {
    p_pedido_id: pedidoId,
    p_aprovar:   aprovar,
    p_motivo:    motivo ?? null,
  });
  if (error) return { ok: false, error: mensagemPedidoNr(error.message) };
  return { ok: true, pedido: (data as unknown as PixNrPedido) ?? undefined };
}

/** Desiste do próprio pedido. Não precisa de líder para desfazer um engano. */
export async function cancelarPedidoNr(pedidoId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await rpcSemTipo('fn_pix_nr_pedido_cancelar', {
    p_pedido_id: pedidoId,
  });
  if (error) return { ok: false, error: mensagemPedidoNr(error.message) };
  return { ok: true };
}
