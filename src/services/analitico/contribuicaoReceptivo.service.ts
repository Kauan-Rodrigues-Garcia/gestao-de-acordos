/**
 * contribuicaoReceptivo.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Contribuição Receptivo por setor/mês (BookPlay) — tabela
 * `contribuicao_receptivo` (migration 20260730a).
 *
 * Antes o valor vivia em `localStorage`, então existia só no navegador de quem
 * digitou: dois líderes do mesmo setor viam números diferentes e trocar de
 * máquina zerava o card. Agora é uma linha por (empresa, setor, mês),
 * compartilhada.
 *
 * Tolerante à migration ausente, como `metasConfig.service`: enquanto o SQL não
 * for aplicado, `dbAtiva` volta false e a tela cai no localStorage antigo — o
 * card continua funcionando exatamente como antes em vez de ficar vazio.
 */
import { supabase } from '@/lib/supabase';

export interface ContribuicaoReceptivo {
  acumulado: number;
  meta:      number;
}

export interface ResultadoContribuicoes {
  /** setor_id → valores. Setor sem linha no banco simplesmente não aparece. */
  porSetor: Record<string, ContribuicaoReceptivo>;
  /** false = migration 20260730a ainda não aplicada; use o fallback local. */
  dbAtiva:  boolean;
}

/** Erro de "tabela/coluna não existe" — migration pendente, não falha real. */
function ehMigrationAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache/i.test(mensagem);
}

/**
 * Lê as contribuições de TODOS os setores da empresa no mês, numa única query.
 *
 * Uma query para o mês inteiro (em vez de uma por setor) porque a aba renderiza
 * vários setores em sequência para admin/diretoria sem setor.
 */
export async function buscarContribuicoesReceptivo(
  empresaId: string,
  mes:       string,
): Promise<ResultadoContribuicoes> {
  try {
    const { data, error } = await supabase
      .from('contribuicao_receptivo')
      .select('setor_id, acumulado, meta')
      .eq('empresa_id', empresaId)
      .eq('mes', mes);

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[contribuicaoReceptivo] erro na leitura:', error.message);
      return { porSetor: {}, dbAtiva: !pendente };
    }

    const porSetor: Record<string, ContribuicaoReceptivo> = {};
    for (const linha of (data ?? []) as { setor_id: string; acumulado: number | string; meta: number | string }[]) {
      porSetor[linha.setor_id] = {
        // NUMERIC volta como string no postgres-js — Number() sempre.
        acumulado: Number(linha.acumulado) || 0,
        meta:      Number(linha.meta)      || 0,
      };
    }
    return { porSetor, dbAtiva: true };
  } catch {
    return { porSetor: {}, dbAtiva: false };
  }
}

/**
 * Grava a contribuição do setor no mês (cria ou atualiza).
 *
 * Upsert pela UNIQUE (empresa_id, setor_id, mes): dois líderes salvando ao mesmo
 * tempo resultam numa linha só, a última vence — em vez de duas linhas
 * duplicadas somando errado no card do setor.
 *
 * @returns `true` se gravou. `false` cobre tanto migration pendente quanto
 *          recusa da RLS (operador tentando editar) — quem chama avisa na tela.
 */
export async function salvarContribuicaoReceptivo(params: {
  empresaId:      string;
  setorId:        string;
  mes:            string;
  acumulado:      number;
  meta:           number;
  atualizadoPor?: string | null;
}): Promise<boolean> {
  const { empresaId, setorId, mes, acumulado, meta, atualizadoPor } = params;
  try {
    const { error } = await supabase
      .from('contribuicao_receptivo')
      .upsert(
        {
          empresa_id:     empresaId,
          setor_id:       setorId,
          mes,
          acumulado,
          meta,
          atualizado_por: atualizadoPor ?? null,
        },
        { onConflict: 'empresa_id,setor_id,mes' },
      );

    if (error) {
      console.warn('[contribuicaoReceptivo] erro ao salvar:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[contribuicaoReceptivo] exceção ao salvar:', e);
    return false;
  }
}
