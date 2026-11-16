// src/pages/Analitico/Extrato/situacaoAcordos.ts
/**
 * Em que pé está o ACORDO de cada recebimento — sem React, para testar sem tela.
 *
 * Até 16/11/2026 o resumo do operador só sabia «tabulado» ou «a tabular». Só
 * que tabular é o começo: o pagamento entrou no relatório, o acordo existe, e
 * ainda assim pode faltar marcar como pago, ou — no parcelado — agendar a
 * próxima parcela. Essas duas pendências só apareciam na aba Acordos, uma a
 * uma. Pedido do Cleber: o Analítico diz, linha a linha, o que falta.
 *
 *   a_tabular    a linha não tem acordo do operador (inclui Divergente e o par
 *                pelo relatório, que ainda pedem um clique);
 *   marcar_pago  tabulado, mas nenhum acordo desse código está PAGO no mês do
 *                recebimento — o dinheiro entrou e a planilha não sabe;
 *   reagendar    tabulado e pago, o acordo é parcelado, não é a última parcela
 *                e a próxima não existe (a mesma regra de `lib/reagendamento`);
 *   em_dia       nada a fazer.
 *
 * ## Por código, e não pelo `acordo_id` da linha
 *
 * O servidor liga a linha ao acordo mais recente do código que não seja «não
 * pago». Num parcelado, assim que a parcela 3 é agendada a linha do pagamento
 * da parcela 2 passa a apontar para a 3, que está pendente — e a linha
 * pareceria «falta marcar pago» logo depois de o operador fazer tudo certo.
 * Por isso a conta olha TODOS os acordos do operador com aquele código.
 *
 * ## As duas regras de negócio
 *
 * Nosso produto casa o código do relatório com o NR do acordo; Cofen, com a
 * instituição (o acordo Cofen não tem NR). Aqui quem decide é o próprio
 * acordo — a chave dele é o NR quando existe, senão a instituição, como
 * `fn_nr_campo_chave` no banco —, e não a empresa de quem olha. O mesmo vale
 * para os tipos que reparcelam (`candidataAReagendar`: Cofen não reparcela
 * cartão).
 *
 * Linha «Extra» tabulada no Direto do colega não tem acordo do operador: quem
 * marca pago e reagenda é o dono do Direto. Fica em dia.
 */
import { candidataAReagendar } from '@/lib/reagendamento';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { ehLinhaDeAjuste } from '@/services/analitico/ajusteManual.service';

export type SituacaoDaLinha = 'a_tabular' | 'marcar_pago' | 'reagendar' | 'em_dia';

/** O que a conta precisa saber de um acordo. */
export interface AcordoDoOperador {
  id: string;
  nr_cliente: string | null;
  instituicao: string | null;
  status: string;
  tipo: string;
  parcelas: number | null;
  numero_parcela: number | null;
  acordo_grupo_id: string | null;
  /** 'yyyy-MM-dd' */
  vencimento: string | null;
  /** 'yyyy-MM-dd' */
  data_pagamento: string | null;
}

export interface DetalheSituacao {
  situacao: SituacaoDaLinha;
  /** O acordo que resolve a pendência (o que marcar pago, ou a parcela paga a reagendar). */
  acordoId?: string;
  /** `reagendar`: a parcela que falta agendar, e de quantas. */
  parcela?: number;
  parcelas?: number;
}

export interface ResumoSituacoes {
  total: number;
  a_tabular: number;
  marcar_pago: number;
  reagendar: number;
  em_dia: number;
}

type LinhaDaConta = Pick<
  AnaliticoRecebimento, 'id' | 'codigo' | 'status_tabulacao' | 'data_pagamento' | 'lote_id'
>;

const limpo = (v: string | null | undefined): string => (v ?? '').trim();

/** A chave do acordo: o NR quando existe, senão a instituição (`fn_nr_campo_chave`). */
export function chaveDoAcordo(a: Pick<AcordoDoOperador, 'nr_cliente' | 'instituicao'>): string | null {
  return limpo(a.nr_cliente) || limpo(a.instituicao) || null;
}

/** Acordo Cofen: a chave é a instituição, porque não há NR. */
function ehAcordoCofen(a: Pick<AcordoDoOperador, 'nr_cliente' | 'instituicao'>): boolean {
  return !limpo(a.nr_cliente) && !!limpo(a.instituicao);
}

const mesDe = (data: string | null | undefined): string => (data ?? '').slice(0, 7);

/**
 * A situação de cada linha.
 *
 * @param acordos todos os acordos do OPERADOR DAS LINHAS com os códigos delas
 *                — de qualquer mês: a próxima parcela pode vencer no seguinte.
 */
export function situacaoDasLinhas(
  linhas: readonly LinhaDaConta[],
  acordos: readonly AcordoDoOperador[],
): Map<string, DetalheSituacao> {
  const porChave = new Map<string, AcordoDoOperador[]>();
  for (const a of acordos) {
    const chave = chaveDoAcordo(a);
    if (!chave) continue;
    const lista = porChave.get(chave);
    if (lista) lista.push(a); else porChave.set(chave, [a]);
  }

  const saida = new Map<string, DetalheSituacao>();
  for (const l of linhas) {
    // Ajuste manual é linha sintética: não tem acordo para cobrar.
    if (ehLinhaDeAjuste(l)) { saida.set(l.id, { situacao: 'em_dia' }); continue; }
    if (l.status_tabulacao !== 'tabulado') { saida.set(l.id, { situacao: 'a_tabular' }); continue; }

    const meus = porChave.get(limpo(String(l.codigo ?? ''))) ?? [];
    // Tabulada sem acordo do operador: Extra no Direto do colega.
    if (meus.length === 0) { saida.set(l.id, { situacao: 'em_dia' }); continue; }

    const mes = mesDe(l.data_pagamento);
    const doMes = meus.filter(a => mesDe(a.vencimento) === mes || mesDe(a.data_pagamento) === mes);
    const pagos = doMes.filter(a => a.status === 'pago');

    if (pagos.length === 0) {
      const alvo = doMes.find(a => a.status !== 'nao_pago') ?? doMes[0] ?? meus[0];
      saida.set(l.id, { situacao: 'marcar_pago', acordoId: alvo.id });
      continue;
    }

    // A parcela paga mais adiantada do mês é a que pede a próxima.
    const ultima = pagos.reduce((m, a) => ((a.numero_parcela ?? 1) > (m.numero_parcela ?? 1) ? a : m));
    const proxima = (ultima.numero_parcela ?? 1) + 1;
    const falta = candidataAReagendar(ultima, ehAcordoCofen(ultima))
      && !meus.some(a => a.acordo_grupo_id === ultima.acordo_grupo_id && (a.numero_parcela ?? 1) === proxima);

    saida.set(l.id, falta
      ? { situacao: 'reagendar', acordoId: ultima.id, parcela: proxima, parcelas: ultima.parcelas ?? undefined }
      : { situacao: 'em_dia' });
  }
  return saida;
}

export function resumirSituacoes(
  linhas: readonly Pick<AnaliticoRecebimento, 'id'>[],
  situacoes: ReadonlyMap<string, DetalheSituacao>,
): ResumoSituacoes {
  const r: ResumoSituacoes = { total: linhas.length, a_tabular: 0, marcar_pago: 0, reagendar: 0, em_dia: 0 };
  for (const l of linhas) r[situacoes.get(l.id)?.situacao ?? 'em_dia'] += 1;
  return r;
}

/** Os códigos das linhas tabuladas — é só deles que vale buscar acordo. */
export function codigosTabulados(linhas: readonly LinhaDaConta[]): string[] {
  const vistos = new Set<string>();
  for (const l of linhas) {
    if (l.status_tabulacao !== 'tabulado' || ehLinhaDeAjuste(l)) continue;
    const codigo = limpo(String(l.codigo ?? ''));
    if (codigo) vistos.add(codigo);
  }
  return [...vistos].sort();
}
