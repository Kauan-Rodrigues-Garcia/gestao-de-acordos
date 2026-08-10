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
import type { Database } from '@/lib/database.types';

type PixAutoAcordoInsert = Database['public']['Tables']['pix_automatico_acordos']['Insert'];
type PixAutoAcordoUpdate = Database['public']['Tables']['pix_automatico_acordos']['Update'];

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
  itens: { acordo: Pick<PixAutoAcordo, 'nr_cliente'>; comissao: number }[],
): string {
  if (itens.length === 0) return '';
  const linhas = itens.map(i => formatarLinhaPix(i.acordo));
  const total = itens.reduce((s, i) => s + i.comissao, 0);
  return [...linhas, `R$ ${valorBR(total)}`].join('\n');
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
    .order('criado_em', { ascending: false })
    .limit(1000);
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  if (opts?.setorId)    q = q.eq('setor_id', opts.setorId);
  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchAcordosPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoAcordo[]) ?? [];
}

/** Linhas por página na tabela do Pix. */
export const PIX_LINHAS_POR_PAGINA = 100;

export interface PaginaPix {
  itens: PixAutoAcordo[];
  /** Total de linhas no filtro atual — o que dá o número de páginas. */
  total: number;
  /** Página pedida (1-based), já normalizada. */
  pagina: number;
  totalPaginas: number;
}

/**
 * Uma página da tabela, contada e recortada NO SERVIDOR.
 *
 * A tela usa duas consultas com escopos diferentes, e a diferença é
 * intencional:
 *
 *   • esta aqui alimenta a TABELA — recorte por `.range()`, 100 linhas;
 *   • `fetchAcordosPixDoMes` alimenta os AGREGADOS (dobra, ranking, meta), que
 *     precisam do mês inteiro.
 *
 * Paginar a fonte dos agregados faria o operador que fez 40 acordos ver
 * "3/18": o contador enxergaria só a página aberta. Foi por isso que as duas
 * consultas ficaram separadas em vez de uma servir às duas coisas.
 */
export async function fetchPaginaAcordosPix(
  empresaId: string,
  opts?: {
    operadorId?: string;
    setorId?: string | null;
    pagina?: number;
    porPagina?: number;
  },
): Promise<PaginaPix> {
  const porPagina = opts?.porPagina ?? PIX_LINHAS_POR_PAGINA;
  const pedida    = Math.max(1, Math.floor(opts?.pagina ?? 1));
  const de        = (pedida - 1) * porPagina;

  let q = supabase
    .from('pix_automatico_acordos')
    // `count: 'exact'` na mesma ida: o rodapé precisa do total para saber
    // quantas páginas existem, e uma segunda consulta só para contar dobraria
    // a latência de cada troca de página.
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .range(de, de + porPagina - 1);

  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  if (opts?.setorId)    q = q.eq('setor_id', opts.setorId);

  const { data, error, count } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchPaginaAcordosPix:', error.message);
    return { itens: [], total: 0, pagina: 1, totalPaginas: 1 };
  }

  const total = count ?? 0;
  return {
    itens: (data as unknown as PixAutoAcordo[]) ?? [],
    total,
    pagina: pedida,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  };
}

/**
 * Os acordos do MÊS, para os agregados.
 *
 * Sem `.limit()`: o recorte é o mês, que é pequeno por natureza, e um teto
 * arbitrário aqui é o bug que existia antes — `fetchAcordosPix` cortava em
 * 1000 linhas em silêncio, e a partir daí a dobra, o ranking e a meta
 * passavam a mentir sem nada na tela indicando isso.
 *
 * `mes` no formato `YYYY-MM`, o mesmo que `calcularDobraComissao` compara.
 */
export async function fetchAcordosPixDoMes(
  empresaId: string,
  mes: string,
  opts?: { operadorId?: string; setorId?: string | null },
): Promise<PixAutoAcordo[]> {
  const [ano, m] = mes.split('-').map(Number);
  if (!ano || !m) return [];
  const inicio = new Date(Date.UTC(ano, m - 1, 1)).toISOString();
  const fim    = new Date(Date.UTC(ano, m, 1)).toISOString();

  let q = supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .gte('criado_em', inicio)
    .lt('criado_em', fim)
    .order('criado_em', { ascending: false });

  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  if (opts?.setorId)    q = q.eq('setor_id', opts.setorId);

  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchAcordosPixDoMes:', error.message);
    return [];
  }
  return (data as unknown as PixAutoAcordo[]) ?? [];
}

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
 * Só linha APROVADA pode virar paga: pagar comissão de acordo pendente ou
 * desaprovado é dinheiro saindo por engano, e o `.eq('status','aprovado')`
 * fecha isso mesmo que a tela ofereça o botão por descuido.
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
  if (p.pago) q = q.eq('status', 'aprovado');
  const { data, error } = await q.select('id');
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: (data ?? []).length };
}

export async function criarAcordoPix(p: {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
  nrCliente: string;
  valor: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('pix_automatico_acordos').insert({
    empresa_id:    p.empresaId,
    operador_id:   p.operadorId,
    operador_nome: p.operadorNome,
    setor_id:      p.setorId,
    nr_cliente:    p.nrCliente.trim(),
    valor:         p.valor,
    status:        'pendente',
  });
  if (error) return { ok: false, error: error.message };
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
 * NRs que NÃO podem ser registrados de novo: registro histórico com status
 * pendente ou validado (recusado pode voltar). Retorna o conjunto normalizado.
 */
export async function fetchNrsBloqueados(empresaId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pix_automatico_nr_registro')
    .select('nr_normalizado, status')
    .eq('empresa_id', empresaId)
    .in('status', ['pendente', 'validado']);
  if (error) {
    // Migration ausente → sem bloqueio pelo cliente (trigger também não existe)
    console.warn('[pix_automatico.service] fetchNrsBloqueados:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { nr_normalizado: string }[]).map(r => r.nr_normalizado));
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
 * Dedupe por NR (único por empresa): pula NRs já bloqueados no registro
 * histórico (pendente/validado) e repetidos na própria planilha.
 */
export async function criarAcordosPixLote(
  empresaId: string,
  linhas: LinhaPixLote[],
): Promise<{ ok: boolean; importados: number; ignorados: number; duplicados: number; error?: string }> {
  const bloqueados = await fetchNrsBloqueados(empresaId);
  // Fallback dos ambientes sem a migration do registro: dedupe pelos acordos
  const existentes = bloqueados.size === 0 ? await fetchAcordosPix(empresaId) : [];
  existentes.forEach(e => {
    if (e.status !== 'desaprovado') bloqueados.add(normalizarNr(e.nr_cliente));
  });

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

/** Volta uma linha avaliada para pendente (correção de engano do líder). */
export async function reavaliarAcordoPix(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_acordos')
    .update({ status: 'pendente', pct_comissao: null, avaliado_por: null, avaliado_por_nome: null, avaliado_em: null })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
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
    .eq('status', 'desaprovado');

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
