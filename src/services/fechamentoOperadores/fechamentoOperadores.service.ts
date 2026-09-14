/**
 * fechamentoOperadores.service.ts — o que a aba Fechamento lê e grava no banco.
 *
 * Só as duas colunas manuais moram em tabela própria
 * (`fechamento_operadores`, migration 20260914170000). Recebimento, meta,
 * quartis e composição continuam vindo das fontes de sempre, lidas pelo hook.
 *
 * `tabelaSemTipo`/`rpcSemTipo` porque a tabela e a RPC são novas e ainda não
 * estão em `database.types.ts`.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { ehSituacaoFechamento, type SituacaoFechamento } from './situacoes';

export interface ManualFechamento {
  duTrabalhado: number | null;
  situacao: SituacaoFechamento | null;
}

interface LinhaManualBanco {
  operador_id: string;
  du_trabalhado: number | null;
  situacao: string | null;
}

export interface ManuaisDoMes {
  porOperador: Map<string, ManualFechamento>;
  /**
   * A tabela existe neste banco? `false` enquanto a migration não for aplicada:
   * a tela mostra o resto e avisa que D.U. e situação ainda não podem ser salvos.
   */
  disponivel: boolean;
  erro: string | null;
}

function tabelaAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache|could not find/i.test(mensagem);
}

/** D.U. e situação de todo mundo que a RLS deixa ver, no mês. */
export async function buscarManuaisDoMes(
  empresaId: string, ano: number, mes: number,
): Promise<ManuaisDoMes> {
  const { data, error } = await tabelaSemTipo<LinhaManualBanco>('fechamento_operadores')
    .select('operador_id, du_trabalhado, situacao')
    .eq('empresa_id', empresaId)
    .eq('ano', String(ano))
    .eq('mes', String(mes));

  if (error) {
    return {
      porOperador: new Map(),
      disponivel: !tabelaAusente(error.message),
      erro: error.message,
    };
  }

  const porOperador = new Map<string, ManualFechamento>();
  for (const l of data ?? []) {
    porOperador.set(l.operador_id, {
      duTrabalhado: l.du_trabalhado === null ? null : Number(l.du_trabalhado),
      situacao: ehSituacaoFechamento(l.situacao) ? l.situacao : null,
    });
  }
  return { porOperador, disponivel: true, erro: null };
}

/**
 * Grava a linha manual de um operador — os dois campos juntos, como estão na
 * tela. Nulo apaga o campo; os dois nulos apagam a linha.
 */
export async function salvarManualFechamento(params: {
  empresaId: string;
  operadorId: string;
  ano: number;
  mes: number;
  manual: ManualFechamento;
}): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await rpcSemTipo<string | null>('fn_fechamento_salvar', {
    p_empresa_id: params.empresaId,
    p_operador_id: params.operadorId,
    p_ano: params.ano,
    p_mes: params.mes,
    p_du_trabalhado: params.manual.duTrabalhado,
    p_situacao: params.manual.situacao,
  });
  if (!error) return { ok: true, erro: null };
  if (tabelaAusente(error.message)) {
    return { ok: false, erro: 'O Fechamento ainda não foi instalado neste banco.' };
  }
  return { ok: false, erro: error.message };
}
