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
import type { EscopoAnalitico } from './escopoAnalitico';

export interface ContribuicaoReceptivo {
  acumulado: number;
  meta:      number;
}

/**
 * Quanto do Receptivo entra no acumulado que a tela está mostrando.
 *
 * ## O erro que esta função existe para não deixar acontecer
 *
 * O valor do card é do SETOR — digitado à mão, sem dono. O painel somava por
 * cima sempre que o escopo era 'setor' ou 'empresa'. Só que o escopo do
 * dashboard NÃO diz de quem são os dados: para um operador comum ele fica
 * travado no setor DELE (`setorTravado`), enquanto a RPC devolve apenas as
 * linhas dele (`fn_analitico_dashboard_mes`: operador → próprias linhas,
 * líder+ → empresa).
 *
 * O resultado era o operador ver "R$ x recebido + R$ 3.936,55 do receptivo" no
 * próprio total acumulado — dinheiro do setor inteiro creditado a uma pessoa.
 *
 * Daí `veDadosDeOutros`: o Receptivo só soma quando a tela está de fato
 * mostrando um AGREGADO (líder+ olhando o setor ou a empresa). Não é uma
 * questão de permissão — o operador pode saber quanto o setor fez —, é de a
 * quem o número está sendo atribuído.
 */
export function receptivoDoEscopo(params: {
  escopo:   EscopoAnalitico | null;
  porSetor: Record<string, number>;
  /** true = a tela mostra dados de mais gente que o próprio usuário (líder+). */
  veDadosDeOutros: boolean;
}): number {
  const { escopo, porSetor, veDadosDeOutros } = params;
  if (!escopo || !veDadosDeOutros) return 0;
  // Recorte de equipe ou de um operador: o valor não é daquele conjunto.
  if (escopo.tipo === 'empresa') {
    return Object.values(porSetor).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  if (escopo.tipo === 'setor') return Number(porSetor[escopo.setorId]) || 0;
  return 0;
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
