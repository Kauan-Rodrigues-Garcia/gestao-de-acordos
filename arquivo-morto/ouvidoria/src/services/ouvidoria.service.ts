/**
 * src/services/ouvidoria.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Ouvidoria (PaguePlay): demandas de suporte (reclamações/sugestões) e
 * controle de quem acessa a aba (ouvidoria_acessos).
 *
 * Regras de prazo (dias ÚTEIS, seg–sex):
 *   • prazo para resolver = 2 dias úteis após a tabulação (iniciado_em)
 *   • falta 1 dia útil          → urgência 'atencao'
 *   • prazo atingido/estourado  → urgência 'urgente'
 *   • resolvido                 → sem urgência
 *
 * Tabelas criadas na migration 20260717b_ouvidoria.sql e declaradas em
 * database.types.ts.
 */

import { supabase } from '@/lib/supabase';

export type OuvidoriaTipo   = 'reclamacao' | 'sugestao';
export type OuvidoriaStatus = 'pendente' | 'resolvido';
export type OuvidoriaNivel  = 'ver' | 'editar';
export type Urgencia        = 'no_prazo' | 'atencao' | 'urgente';

export const PRAZO_DIAS_UTEIS = 2;

export interface OuvidoriaAtendimento {
  id: string;
  empresa_id: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  tipo: OuvidoriaTipo;
  status: OuvidoriaStatus;
  nome_cliente: string;
  estado_uf: string | null;
  whatsapp: string | null;
  email: string | null;
  link: string | null;
  codigo: string | null;
  descricao: string | null;
  iniciado_em: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
  resolvido_por_nome: string | null;
  resolucao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface OuvidoriaAcesso {
  id: string;
  empresa_id: string;
  usuario_id: string;
  nivel: OuvidoriaNivel;
  concedido_por: string | null;
  concedido_por_nome: string | null;
  criado_em: string;
}

// ── Urgência (dias úteis) ──────────────────────────────────────────────────

/** Dias úteis (seg–sex) completos entre a data de início e hoje. */
export function diasUteisDesde(iso: string): number {
  const inicio = new Date(iso);
  const agora  = new Date();
  const d   = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  let count = 0;
  while (d < fim) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function urgenciaAtendimento(a: Pick<OuvidoriaAtendimento, 'status' | 'iniciado_em'>): Urgencia | null {
  if (a.status !== 'pendente') return null;
  const decorridos = diasUteisDesde(a.iniciado_em);
  if (decorridos >= PRAZO_DIAS_UTEIS) return 'urgente';
  if (decorridos === PRAZO_DIAS_UTEIS - 1) return 'atencao';
  return 'no_prazo';
}

/** Dias úteis restantes até o prazo (negativo = estourado). */
export function diasUteisRestantes(a: Pick<OuvidoriaAtendimento, 'iniciado_em'>): number {
  return PRAZO_DIAS_UTEIS - diasUteisDesde(a.iniciado_em);
}

// ── Atendimentos ───────────────────────────────────────────────────────────

export async function fetchAtendimentos(empresaId: string): Promise<OuvidoriaAtendimento[]> {
  const { data, error } = await supabase
    .from('ouvidoria_atendimentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('iniciado_em', { ascending: false })
    .limit(1000);
  if (error) {
    console.warn('[ouvidoria.service] fetchAtendimentos:', error.message);
    return [];
  }
  return (data as unknown as OuvidoriaAtendimento[]) ?? [];
}

export interface NovoAtendimento {
  empresaId: string;
  criadoPor: string;
  criadoPorNome: string;
  tipo: OuvidoriaTipo;
  nomeCliente: string;
  estadoUf?: string;
  whatsapp?: string;
  email?: string;
  link?: string;
  codigo?: string;
  descricao?: string;
}

export async function criarAtendimento(p: NovoAtendimento): Promise<{ ok: boolean; data?: OuvidoriaAtendimento; error?: string }> {
  const payload = {
    empresa_id:      p.empresaId,
    criado_por:      p.criadoPor,
    criado_por_nome: p.criadoPorNome,
    tipo:            p.tipo,
    status:          'pendente',           // sempre nasce pendente
    nome_cliente:    p.nomeCliente.trim(),
    estado_uf:       p.estadoUf?.trim() || null,
    whatsapp:        p.whatsapp?.trim() || null,
    email:           p.email?.trim() || null,
    link:            p.link?.trim() || null,
    codigo:          p.codigo?.trim() || null,
    descricao:       p.descricao?.trim() || null,
    // iniciado_em: DEFAULT NOW() no banco — data/hora exata do salvamento
  };
  const { data, error } = await supabase
    .from('ouvidoria_atendimentos')
    .insert(payload)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as OuvidoriaAtendimento };
}

export async function atualizarAtendimento(
  id: string,
  patch: Partial<Pick<OuvidoriaAtendimento,
    'tipo' | 'nome_cliente' | 'estado_uf' | 'whatsapp' | 'email' | 'link' | 'codigo' | 'descricao'>>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ouvidoria_atendimentos')
    .update(patch)
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resolverAtendimento(p: {
  id: string;
  resolucao: string;
  resolvidoPor: string;
  resolvidoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ouvidoria_atendimentos')
    .update({
      status:             'resolvido',
      resolucao:          p.resolucao.trim(),
      resolvido_em:       new Date().toISOString(),
      resolvido_por:      p.resolvidoPor,
      resolvido_por_nome: p.resolvidoPorNome,
    })
    .eq('id', p.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Volta um caso resolvido para pendente (mantém a resolução anterior no texto). */
export async function reabrirAtendimento(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ouvidoria_atendimentos')
    .update({ status: 'pendente', resolvido_em: null, resolvido_por: null, resolvido_por_nome: null })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function excluirAtendimento(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('ouvidoria_atendimentos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Acessos ────────────────────────────────────────────────────────────────

export async function fetchAcessos(empresaId: string): Promise<OuvidoriaAcesso[]> {
  const { data, error } = await supabase
    .from('ouvidoria_acessos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false });
  if (error) {
    console.warn('[ouvidoria.service] fetchAcessos:', error.message);
    return [];
  }
  return (data as unknown as OuvidoriaAcesso[]) ?? [];
}

/** Busca o nível concedido ao usuário atual (null = sem linha de acesso). */
export async function fetchMeuAcesso(empresaId: string, usuarioId: string): Promise<OuvidoriaNivel | null> {
  const { data, error } = await supabase
    .from('ouvidoria_acessos')
    .select('nivel')
    .eq('empresa_id', empresaId)
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { nivel: OuvidoriaNivel }).nivel ?? null;
}

export async function concederAcesso(p: {
  empresaId: string;
  usuarioId: string;
  nivel: OuvidoriaNivel;
  concedidoPor: string;
  concedidoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ouvidoria_acessos')
    .upsert({
      empresa_id:         p.empresaId,
      usuario_id:         p.usuarioId,
      nivel:              p.nivel,
      concedido_por:      p.concedidoPor,
      concedido_por_nome: p.concedidoPorNome,
    }, { onConflict: 'empresa_id,usuario_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revogarAcesso(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('ouvidoria_acessos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
