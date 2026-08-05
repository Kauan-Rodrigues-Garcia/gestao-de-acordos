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

/**
 * Edita um registro do operador — só NR e valor, e só enquanto PENDENTE.
 *
 * O `.eq('status', 'pendente')` repete no cliente o que a policy e o gatilho da
 * migration 20260804a já garantem. Não é desconfiança da RLS: é o que faz a
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

export async function excluirAcordoPix(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('pix_automatico_acordos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Apaga todos os DESAPROVADOS do operador (botão "Limpar desaprovados"). */
export async function limparDesaprovados(empresaId: string, operadorId: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('operador_id', operadorId)
    .eq('status', 'desaprovado')
    .select('id');
  if (error) return { ok: false, count: 0, error: error.message };
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
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_config')
    .upsert({
      empresa_id:          p.empresaId,
      setor_id:            p.setorId,
      pct:                 p.pct,
      atualizado_por:      p.atualizadoPor,
      atualizado_por_nome: p.atualizadoPorNome,
      atualizado_em:       new Date().toISOString(),
    }, { onConflict: 'empresa_id,setor_id' });
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
 * Grava a meta de UMA equipe — só o VALOR. Meta de quantidade de acordos foi
 * retirada: para acompanhar equipe e setor, o que a operação usa é o valor.
 *
 * `metaValor` zerado apaga a linha: meta zero e "sem meta" são coisas
 * diferentes na tela (uma mostra "faltam R$ 0,00", a outra não mostra nada), e
 * é o apagar que devolve a equipe ao estado de "ainda não definida".
 */
export async function upsertMetaPixEquipe(p: {
  empresaId: string;
  setorId: string;
  equipeId: string;
  mes: number;
  ano: number;
  metaValor: number;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (p.metaValor <= 0) {
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
