/**
 * src/services/lixeira.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Serviço de Lixeira — armazena acordos excluídos (manual ou por transferência de NR)
 * na tabela `lixeira_acordos` por um período de retenção (padrão 30 dias).
 *
 * SQL para criar a tabela no Supabase (executar uma vez):
 * ───────────────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS public.lixeira_acordos (
 *   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   acordo_id       UUID NOT NULL,
 *   empresa_id      UUID,
 *   operador_id     UUID,
 *   operador_nome   TEXT,
 *   nome_cliente    TEXT,
 *   nr_cliente      TEXT,
 *   valor           NUMERIC,
 *   vencimento      DATE,
 *   tipo            TEXT,
 *   status          TEXT,
 *   observacoes     TEXT,
 *   instituicao     TEXT,
 *   dados_completos JSONB,          -- snapshot completo do acordo
 *   motivo          TEXT,           -- 'exclusao_manual' | 'transferencia_nr'
 *   autorizado_por_id   UUID,       -- ID do líder/admin que autorizou (se transferência)
 *   autorizado_por_nome TEXT,       -- nome do líder/admin
 *   transferido_para_id   UUID,     -- novo operador (se transferência)
 *   transferido_para_nome TEXT,     -- nome do novo operador
 *   excluido_em     TIMESTAMPTZ DEFAULT NOW(),
 *   expira_em       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
 * );
 * CREATE INDEX IF NOT EXISTS idx_lixeira_empresa ON public.lixeira_acordos(empresa_id);
 * CREATE INDEX IF NOT EXISTS idx_lixeira_operador ON public.lixeira_acordos(operador_id);
 * CREATE INDEX IF NOT EXISTS idx_lixeira_nr ON public.lixeira_acordos(nr_cliente);
 * -- RLS: habilitar e criar políticas conforme necessário
 * ALTER TABLE public.lixeira_acordos ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "lixeira_select" ON public.lixeira_acordos FOR SELECT USING (true);
 * CREATE POLICY "lixeira_insert" ON public.lixeira_acordos FOR INSERT WITH CHECK (true);
 */

import { supabase, Acordo } from '@/lib/supabase';

export type MotivoLixeira = 'exclusao_manual' | 'transferencia_nr';

export interface LixeiraAcordo {
  id: string;
  acordo_id: string;
  empresa_id?: string;
  operador_id?: string;
  operador_nome?: string;
  nome_cliente?: string;
  nr_cliente?: string;
  valor?: number;
  vencimento?: string;
  tipo?: string;
  status?: string;
  observacoes?: string;
  instituicao?: string;
  dados_completos?: Record<string, unknown>;
  motivo: MotivoLixeira;
  autorizado_por_id?: string;
  autorizado_por_nome?: string;
  transferido_para_id?: string;
  transferido_para_nome?: string;
  excluido_em: string;
  expira_em?: string;
}

export interface EnviarLixeiraParams {
  acordo: Acordo;
  motivo: MotivoLixeira;
  operadorNome?: string;
  autorizadoPorId?: string;
  autorizadoPorNome?: string;
  transferidoParaId?: string;
  transferidoParaNome?: string;
}

/** Envia um acordo para a lixeira (snapshot completo) */
export async function enviarParaLixeira(params: EnviarParaLixeiraParams): Promise<{ ok: boolean; error?: string }> {
  const { acordo, motivo, operadorNome, autorizadoPorId, autorizadoPorNome, transferidoParaId, transferidoParaNome } = params;

  const payload = {
    acordo_id: acordo.id,
    empresa_id: acordo.empresa_id ?? null,
    operador_id: acordo.operador_id ?? null,
    operador_nome: operadorNome ?? null,
    nome_cliente: acordo.nome_cliente ?? null,
    nr_cliente: acordo.nr_cliente ?? null,
    valor: acordo.valor ?? null,
    vencimento: acordo.vencimento ?? null,
    tipo: acordo.tipo ?? null,
    status: acordo.status ?? null,
    observacoes: acordo.observacoes ?? null,
    instituicao: acordo.instituicao ?? null,
    dados_completos: acordo as unknown as Record<string, unknown>,
    motivo,
    autorizado_por_id: autorizadoPorId ?? null,
    autorizado_por_nome: autorizadoPorNome ?? null,
    transferido_para_id: transferidoParaId ?? null,
    transferido_para_nome: transferidoParaNome ?? null,
  };

  const { error } = await supabase.from('lixeira_acordos').insert(payload);

  if (error) {
    console.warn('[lixeira.service] enviarParaLixeira error:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Busca itens da lixeira de uma empresa (para admin/líder) */
export async function fetchLixeira(empresaId: string, limit = 50): Promise<LixeiraAcordo[]> {
  const { data, error } = await supabase
    .from('lixeira_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('excluido_em', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[lixeira.service] fetchLixeira error:', error.message);
    return [];
  }
  return (data as LixeiraAcordo[]) || [];
}

// Alias para compatibilidade
export type EnviarParaLixeiraParams = EnviarLixeiraParams;
