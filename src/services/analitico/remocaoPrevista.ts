/**
 * remocaoPrevista.ts — o que a importação do 58 vai APAGAR, dito antes.
 *
 * ## O incidente que gerou isto
 *
 * Na BookPlay o 58 é o retrato completo do mês: ao importar, o que não está no
 * arquivo é **removido** do setor (`sincronizarAusentesDoSetor`). A regra faz
 * sentido — é ela que tira do sistema a linha que o ERP cancelou.
 *
 * Em 13/09/2026 alguém importou um export salvo da manhã do dia 11. O sistema
 * fez o que devia: apagou 413 linhas e R$ 175.768,38 do Receptivo, incluindo os
 * dias 12, 13 e 14 inteiros. O único registro foi uma frase no log, **depois**
 * do fato:
 *
 *     «1 linha nova, 2103 já existentes, 1 reconciliada, 413 ausentes removidas»
 *
 * Ninguém leu. E não havia como ler antes.
 *
 * ## O que este módulo faz
 *
 * Pergunta ao banco, no preview, quantas linhas e quanto valor sairiam se aquele
 * arquivo fosse confirmado — e de quais dias. A conta é a MESMA que a importação
 * faz depois: chave `operador_usuario::codigo` dentro do mês.
 *
 * Repare que o número não é «tudo o que está depois da última data do arquivo».
 * Um NR pago nos dias 3 e 13 sobrevive, porque a chave dele está no arquivo pelo
 * dia 3. Simulando o incidente: um arquivo parando em 11/09 tiraria 124 linhas,
 * não as 413 — é o preço de a chave não olhar a data, e é por isso que a conta
 * é feita no banco e não por diferença de datas na tela.
 *
 * ## Não bloqueia
 *
 * Avisa. Reduzir o mês é uma operação legítima — o ERP cancela acordo, e o
 * relatório encolhe de verdade. Uma trava dura faria a pessoa procurar como
 * desligá-la; o que faltava era a informação na hora da decisão.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface DiaRemovido {
  dia: string;
  linhas: number;
  valor: number;
}

export interface RemocaoPrevista {
  linhas: number;
  valor: number;
  /** Só os dias que perdem algo, em ordem. Vazio quando nada sai. */
  porDia: DiaRemovido[];
}

/**
 * A chave que a importação usa para decidir o que sobrevive.
 *
 * Tem de ser idêntica ao `chaveLinhaAnalitico` de `analitico.service.ts` menos o
 * mês, que já está no recorte da consulta — e, por tabela, idêntica a
 * `idx_analitico_unicidade`. São três lugares que precisam andar juntos:
 *
 *   índice ..... (empresa, codigo, data, forma, operador)
 *   importador . chaveLinhaAnalitico
 *   aviso ...... esta função
 *
 * Se divergirem, o aviso mente — e mente para MENOS, dizendo que nada sai
 * quando sai, que é o pior lado para errar.
 *
 * `data` no formato `yyyy-MM-dd`, como o banco grava.
 */
export function chaveDaLinha(
  operadorUsuario: string,
  codigo: string,
  data: string,
  formaPagamento: string,
): string {
  return `${operadorUsuario}::${codigo}::${data}::${formaPagamento}`;
}

/** `Date` → `yyyy-MM-dd` local, como o parser monta e o banco grava. */
export function diaISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * O que sairia se este arquivo fosse confirmado.
 *
 * `mes` no formato `yyyy-MM`. Devolve `null` quando não há setor — sem setor a
 * sincronização mensal nem roda, e não há o que prever.
 */
export async function preverRemocao(
  empresaId: string,
  setorId: string | null,
  mes: string,
  chaves: readonly string[],
): Promise<RemocaoPrevista | null> {
  if (!setorId || !/^\d{4}-\d{2}$/.test(mes)) return null;

  const { data, error } = await rpcSemTipo<{ dia: string; linhas: unknown; valor: unknown }[]>(
    'fn_analitico_remocao_prevista',
    {
      p_empresa_id: empresaId,
      p_setor_id: setorId,
      p_mes: `${mes}-01`,
      p_chaves: [...new Set(chaves)],
    },
  );
  if (error) throw new Error(error.message);

  const porDia: DiaRemovido[] = (data ?? []).map(d => ({
    dia: d.dia,
    linhas: Number(d.linhas ?? 0) || 0,
    valor: Number(d.valor ?? 0) || 0,
  }));

  return {
    linhas: porDia.reduce((s, d) => s + d.linhas, 0),
    valor:  porDia.reduce((s, d) => s + d.valor, 0),
    porDia,
  };
}

/**
 * A remoção é grande o bastante para pedir confirmação?
 *
 * Dois gatilhos, e basta um: muitas linhas OU muito dinheiro. Só por linha
 * deixaria passar o caso de poucas linhas caras; só por valor deixaria passar a
 * faxina de centenas de linhas pequenas.
 *
 * Os cortes são baixos de propósito. Remoção legítima costuma ser de uma ou duas
 * linhas — um acordo cancelado. Dezenas já merecem um olhar.
 */
export const CORTE_LINHAS = 10;
export const CORTE_VALOR  = 1000;

export function remocaoPreocupa(r: RemocaoPrevista | null): boolean {
  if (!r) return false;
  return r.linhas >= CORTE_LINHAS || r.valor >= CORTE_VALOR;
}
