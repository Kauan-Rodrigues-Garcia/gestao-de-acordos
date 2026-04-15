/**
 * src/services/nr_registros.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Serviço de NR Registros — tabela central que rastreia qual operador possui
 * vínculo ativo com cada NR/Inscrição, por empresa.
 *
 * Bookplay  → campo 'nr_cliente'
 * PaguePay  → campo 'instituicao'
 *
 * Esta tabela é a fonte da verdade para verificação em tempo real — mais
 * eficiente do que fazer full-scan na tabela `acordos`.
 */
import { supabase } from '@/lib/supabase';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type NrCampo = 'nr_cliente' | 'instituicao';

export interface NrRegistro {
  id:            string;
  empresa_id:    string;
  nr_value:      string;
  campo:         NrCampo;
  operador_id:   string;
  operador_nome: string | null;
  acordo_id:     string;
  criado_em:     string;
  atualizado_em: string;
}

export interface NrConflito {
  /** ID do registro na nr_registros */
  registroId:    string;
  /** ID do acordo ativo que possui este NR */
  acordoId:      string;
  /** ID do operador que possui o vínculo */
  operadorId:    string;
  /** Nome do operador (desnormalizado) */
  operadorNome:  string;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Verifica se um NR está registrado e vinculado a algum operador.
 * Retorna null se livre, ou NrConflito se ocupado.
 */
export async function verificarNrRegistro(
  nrValue:   string,
  empresaId: string,
  campo:     NrCampo,
  /** Ignorar este acordo_id na busca (útil na edição) */
  acordoIdExcluir?: string,
): Promise<NrConflito | null> {
  if (!nrValue?.trim()) return null;

  let query = supabase
    .from('nr_registros')
    .select('id, operador_id, operador_nome, acordo_id')
    .eq('empresa_id', empresaId)
    .eq('nr_value', nrValue.trim())
    .eq('campo', campo)
    .limit(1);

  if (acordoIdExcluir) {
    query = query.neq('acordo_id', acordoIdExcluir);
  }

  const { data } = await query;
  if (!data || data.length === 0) return null;

  const item = data[0] as NrRegistro;
  return {
    registroId:   item.id,
    acordoId:     item.acordo_id,
    operadorId:   item.operador_id,
    operadorNome: item.operador_nome ?? 'Operador desconhecido',
  };
}

/**
 * Registra um NR na tabela nr_registros (INSERT).
 * Deve ser chamado APÓS inserir o acordo com sucesso.
 */
export async function registrarNr(params: {
  empresaId:    string;
  nrValue:      string;
  campo:        NrCampo;
  operadorId:   string;
  operadorNome: string;
  acordoId:     string;
}): Promise<{ ok: boolean; error?: string }> {
  const { empresaId, nrValue, campo, operadorId, operadorNome, acordoId } = params;
  if (!nrValue?.trim()) return { ok: true }; // NR vazio → ignorar

  const { error } = await supabase
    .from('nr_registros')
    .upsert(
      {
        empresa_id:    empresaId,
        nr_value:      nrValue.trim(),
        campo,
        operador_id:   operadorId,
        operador_nome: operadorNome,
        acordo_id:     acordoId,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,nr_value,campo' },
    );

  if (error) {
    console.warn('[nr_registros.service] registrarNr error:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Transfere a titularidade de um NR para outro operador.
 * Usado quando um líder autoriza a transferência de NR de um acordo
 * para outro operador.
 */
export async function transferirNr(params: {
  empresaId:       string;
  nrValue:         string;
  campo:           NrCampo;
  novoOperadorId:  string;
  novoOperadorNome: string;
  novoAcordoId:    string;
}): Promise<{ ok: boolean; error?: string }> {
  const { empresaId, nrValue, campo, novoOperadorId, novoOperadorNome, novoAcordoId } = params;
  if (!nrValue?.trim()) return { ok: true };

  const { error } = await supabase
    .from('nr_registros')
    .upsert(
      {
        empresa_id:    empresaId,
        nr_value:      nrValue.trim(),
        campo,
        operador_id:   novoOperadorId,
        operador_nome: novoOperadorNome,
        acordo_id:     novoAcordoId,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,nr_value,campo' },
    );

  if (error) {
    console.warn('[nr_registros.service] transferirNr error:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Remove o registro de um NR (quando o acordo é excluído ou marcado como nao_pago).
 */
export async function liberarNr(params: {
  empresaId: string;
  nrValue:   string;
  campo:     NrCampo;
}): Promise<{ ok: boolean; error?: string }> {
  const { empresaId, nrValue, campo } = params;
  if (!nrValue?.trim()) return { ok: true };

  const { error } = await supabase
    .from('nr_registros')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('nr_value', nrValue.trim())
    .eq('campo', campo);

  if (error) {
    console.warn('[nr_registros.service] liberarNr error:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Remove o vínculo de NR por acordo_id (usado ao excluir acordo).
 */
export async function liberarNrPorAcordoId(acordoId: string): Promise<{ ok: boolean; error?: string }> {
  if (!acordoId) return { ok: true };

  const { error } = await supabase
    .from('nr_registros')
    .delete()
    .eq('acordo_id', acordoId);

  if (error) {
    console.warn('[nr_registros.service] liberarNrPorAcordoId error:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Busca todos os NRs registrados de uma empresa (para cache inicial).
 */
export async function fetchNrRegistros(empresaId: string): Promise<NrRegistro[]> {
  const { data, error } = await supabase
    .from('nr_registros')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('atualizado_em', { ascending: false });

  if (error) {
    console.warn('[nr_registros.service] fetchNrRegistros error:', error.message);
    return [];
  }
  return (data as NrRegistro[]) ?? [];
}

/**
 * Verifica em lote quais NRs de uma lista já estão registrados.
 * Usado na importação em massa.
 * Retorna Map: nrValue → NrConflito
 */
export async function verificarNrsEmLote(
  nrs:       string[],
  empresaId: string,
  campo:     NrCampo,
): Promise<Map<string, NrConflito>> {
  const resultado = new Map<string, NrConflito>();
  const nrsTrimados = [...new Set(nrs.map(n => n.trim()).filter(Boolean))];
  if (!nrsTrimados.length) return resultado;

  const { data } = await supabase
    .from('nr_registros')
    .select('id, nr_value, operador_id, operador_nome, acordo_id')
    .eq('empresa_id', empresaId)
    .eq('campo', campo)
    .in('nr_value', nrsTrimados);

  if (data) {
    for (const item of data as NrRegistro[]) {
      resultado.set(item.nr_value, {
        registroId:   item.id,
        acordoId:     item.acordo_id,
        operadorId:   item.operador_id,
        operadorNome: item.operador_nome ?? 'Operador desconhecido',
      });
    }
  }
  return resultado;
}
