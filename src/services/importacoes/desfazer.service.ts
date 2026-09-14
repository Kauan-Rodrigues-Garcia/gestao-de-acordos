/**
 * desfazer.service.ts — trazer de volta o que uma importação do 58 apagou.
 *
 * ## O que isto desfaz, e o que não
 *
 * Desfaz a **remoção**, não a importação inteira. É assimetria de risco:
 *
 * | | |
 * |---|---|
 * | o que a importação removeu | estava perdido para sempre — é o dano |
 * | o que a importação inseriu | reimportar o arquivo traz de volta |
 *
 * Apagar o que uma importação inseriu, para «voltar ao ponto», tiraria linhas
 * que o 58 atual diz que existem, e a próxima importação as traria de novo.
 * Muito barulho para desfazer o lado que já se desfaz sozinho.
 *
 * ## Começa vazio, e isso é o esperado
 *
 * O snapshot passou a existir em 14/09/2026. As 2.659 linhas removidas entre
 * agosto e setembro não estão guardadas — nada as guardava. A tela não tem o
 * que oferecer até a primeira importação que remover algo depois dessa data.
 *
 * ## Dois números, não um
 *
 * `voltaram` e `jaEstavam` vêm separados de propósito. Entre a remoção e o
 * arrependimento, outra importação pode ter trazido a mesma linha de volta.
 * Dizer «restaurei 413» quando 400 já tinham voltado seria número bonito e
 * mentiroso — e mandaria alguém procurar 400 linhas duplicadas que não existem.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export interface RemocaoGuardada {
  loteId: string;
  setorId: string | null;
  mes: string;
  linhas: number;
  valor: number;
  removidoEm: string;
  restauradoEm: string | null;
  podeDesfazer: boolean;
}

export interface ResultadoRestauracao {
  /** Linhas que de fato voltaram para o analítico. */
  voltaram: number;
  /** Linhas que outra importação já tinha trazido de volta antes. */
  jaEstavam: number;
  total: number;
  valor: number;
  nota?: string;
}

export async function buscarRemocoesGuardadas(
  empresaId: string,
  mes?: string | null,
): Promise<RemocaoGuardada[]> {
  const { data, error } = await rpcSemTipo<{
    lote_id: string; setor_id: string | null; mes: string;
    linhas: unknown; valor: unknown;
    removido_em: string; restaurado_em: string | null; pode_desfazer: boolean;
  }[]>('fn_analitico_remocoes_guardadas', {
    p_empresa_id: empresaId,
    p_mes: mes ?? null,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map(r => ({
    loteId:       r.lote_id,
    setorId:      r.setor_id,
    mes:          r.mes,
    linhas:       n(r.linhas),
    valor:        n(r.valor),
    removidoEm:   r.removido_em,
    restauradoEm: r.restaurado_em,
    podeDesfazer: r.pode_desfazer,
  }));
}

export async function restaurarRemocao(loteId: string): Promise<ResultadoRestauracao> {
  const { data, error } = await rpcSemTipo<{
    voltaram: unknown; ja_estavam: unknown; total: unknown; valor: unknown; nota?: string;
  }>('fn_analitico_restaurar_remocao', { p_lote_id: loteId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O banco não respondeu à restauração.');

  return {
    voltaram:  n(data.voltaram),
    jaEstavam: n(data.ja_estavam),
    total:     n(data.total),
    valor:     n(data.valor),
    nota:      data.nota,
  };
}

/**
 * A frase que a tela mostra depois de restaurar.
 *
 * Ela precisa dizer as duas coisas quando as duas aconteceram. «13 linhas
 * voltaram» sozinho, num lote de 413, faz parecer que a restauração falhou;
 * «413 restauradas» faz parecer que voltou tudo. As duas metades juntas são a
 * única versão que não engana.
 */
export function fraseDaRestauracao(r: ResultadoRestauracao): string {
  if (r.total === 0) return r.nota ?? 'Não havia nada guardado para desfazer.';

  const plural = (q: number, s: string, p: string) => `${q} ${q === 1 ? s : p}`;

  if (r.jaEstavam === 0) {
    return `${plural(r.voltaram, 'linha voltou', 'linhas voltaram')} para o analítico.`;
  }
  if (r.voltaram === 0) {
    return `Nada precisou voltar: ${plural(r.jaEstavam, 'linha já estava', 'linhas já estavam')} `
         + 'no analítico, trazidas por uma importação posterior.';
  }
  return `${plural(r.voltaram, 'linha voltou', 'linhas voltaram')} para o analítico; `
       + `${plural(r.jaEstavam, 'já estava lá', 'já estavam lá')}, `
       + 'trazidas por uma importação posterior.';
}
