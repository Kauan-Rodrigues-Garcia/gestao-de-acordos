/**
 * fonteDoSetor.service.ts — de onde cada setor tira o número.
 *
 * ## O que esta troca faz
 *
 * Até aqui o 59 vivia só no Painel Diretoria. Trocar a fonte de um setor grava
 * o 59 dentro de `analitico_recebimentos` — a tabela que **~30 módulos** já
 * leem. Dashboard, Painel Líder e suas sub-abas, Analítico, comissão, desafios:
 * nenhum deles muda de código, e todos passam a mostrar o número do 59.
 *
 * Foi por isso que o caminho escolhido não foi «reescrever 30 telas para lerem
 * o 59», e sim «fazer o 59 escrever onde as 30 telas já leem».
 *
 * ## E o 58 vira prévia
 *
 * Depois da troca, importar o 58 daquele setor continua servindo para conferir,
 * mas não grava mais. A razão é contagem dupla: nos 44 NRs (de 7.584) em que as
 * duas fontes discordam da **data**, a chave de unicidade é outra, e entrariam
 * duas linhas para o mesmo pagamento.
 *
 * Quem decide é o banco, e a resposta é derivada — existe linha com
 * `procedencia = 'relatorio_59'` naquele setor/mês? Então ele é do 59. Sem
 * flag, sem tabela de marcação, sem ninguém para lembrar de ligar.
 *
 * ## Dá para voltar
 *
 * `devolverAo58` repõe o retrato que a troca guardou em `analitico_removidos`
 * (Fase 5). Não depende de reimportar nada — o 58 daquele dia pode já não
 * existir.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export type FonteDoSetor = 'relatorio_58' | 'relatorio_59';

export interface LinhaDeFonte {
  setorId: string;
  setorNome: string;
  fonte: FonteDoSetor;
  linhasHoje: number;
  valorHoje: number;
  linhasProjetado: number;
  valorProjetado: number;
  /** Sem lote vigente do 59 não há o que aplicar. */
  temLote59: boolean;
  /** Há retrato guardado — então dá para devolver ao 58. */
  temGuardado: boolean;
}

export interface ResultadoTroca {
  removidas: number;
  gravadas: number;
  /** Linhas que estavam em OUTRO setor e o 59 trouxe para este. */
  deOutroSetor: number;
  valorAntes: number;
  valorDepois: number;
  delta: number;
}

export interface ResultadoVolta {
  tiradasDo59: number;
  guardadas: number;
  voltaram: number;
  jaEstavam: number;
  valorAntes: number;
  valorDepois: number;
}

/** O quanto a troca mexe. Negativo quer dizer que o setor encolhe. */
export function deltaDaLinha(l: LinhaDeFonte): number {
  return l.valorProjetado - l.valorHoje;
}

/**
 * Esta linha pode trocar para o 59?
 *
 * Precisa de lote vigente do 59 **e** de projeção com conteúdo. Projeção vazia
 * com 59 cheio significa carteira sem vínculo — e trocar nesse estado apagaria
 * o 58 sem pôr nada no lugar, zerando o setor em todas as telas. O banco recusa
 * (`PROJECAO_VAZIA`); aqui o botão nem aparece.
 */
export function podeTrocarPara59(l: LinhaDeFonte): boolean {
  return l.fonte === 'relatorio_58' && l.temLote59 && l.linhasProjetado > 0;
}

export function podeVoltarPara58(l: LinhaDeFonte): boolean {
  return l.fonte === 'relatorio_59' && l.temGuardado;
}

export async function buscarFontesDosSetores(
  empresaId: string,
  mes: string,
): Promise<LinhaDeFonte[]> {
  const { data, error } = await rpcSemTipo<{
    setor_id: string; setor_nome: string; fonte: FonteDoSetor;
    linhas_hoje: unknown; valor_hoje: unknown;
    linhas_projetado: unknown; valor_projetado: unknown;
    tem_lote_59: boolean; tem_guardado: boolean;
  }[]>('fn_mestre_fontes_dos_setores', { p_empresa_id: empresaId, p_mes: mes });
  if (error) throw new Error(error.message);

  return (data ?? []).map(l => ({
    setorId:         l.setor_id,
    setorNome:       l.setor_nome,
    fonte:           l.fonte,
    linhasHoje:      n(l.linhas_hoje),
    valorHoje:       n(l.valor_hoje),
    linhasProjetado: n(l.linhas_projetado),
    valorProjetado:  n(l.valor_projetado),
    temLote59:       l.tem_lote_59,
    temGuardado:     l.tem_guardado,
  }));
}

export async function trocarPara59(
  empresaId: string, mes: string, setorId: string,
): Promise<ResultadoTroca> {
  const { data, error } = await rpcSemTipo<{
    removidas: unknown; gravadas: unknown; de_outro_setor: unknown;
    valor_antes: unknown; valor_depois: unknown; delta: unknown;
  }>('fn_mestre_aplicar_no_analitico', {
    p_empresa_id: empresaId, p_mes: mes, p_setor_id: setorId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O banco não respondeu à troca de fonte.');

  return {
    removidas:    n(data.removidas),
    gravadas:     n(data.gravadas),
    deOutroSetor: n(data.de_outro_setor),
    valorAntes:   n(data.valor_antes),
    valorDepois:  n(data.valor_depois),
    delta:        n(data.delta),
  };
}

export async function devolverAo58(
  empresaId: string, mes: string, setorId: string,
): Promise<ResultadoVolta> {
  const { data, error } = await rpcSemTipo<{
    tiradas_do_59: unknown; guardadas: unknown; voltaram: unknown;
    ja_estavam: unknown; valor_antes: unknown; valor_depois: unknown;
  }>('fn_mestre_devolver_ao_58', {
    p_empresa_id: empresaId, p_mes: mes, p_setor_id: setorId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O banco não respondeu à devolução.');

  return {
    tiradasDo59: n(data.tiradas_do_59),
    guardadas:   n(data.guardadas),
    voltaram:    n(data.voltaram),
    jaEstavam:   n(data.ja_estavam),
    valorAntes:  n(data.valor_antes),
    valorDepois: n(data.valor_depois),
  };
}

/**
 * A frase depois de trocar.
 *
 * Diz o delta **e** quantas linhas vieram de outro setor, quando vierem. Esse
 * segundo número é fácil de esquecer e é o que explica um setor vizinho ter
 * encolhido sem ninguém mexer nele.
 */
export function fraseDaTroca(r: ResultadoTroca): string {
  const sinal = r.delta >= 0 ? 'a mais' : 'a menos';
  const base = `${r.gravadas} linha${r.gravadas !== 1 ? 's' : ''} do 59 no lugar de `
    + `${r.removidas} do 58 — R$ ${Math.abs(r.delta).toLocaleString('pt-BR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sinal}.`;
  if (r.deOutroSetor === 0) return base;
  return `${base} ${r.deOutroSetor} ${r.deOutroSetor !== 1 ? 'vieram' : 'veio'} `
    + 'de outro setor, onde o 58 tinha posto.';
}
