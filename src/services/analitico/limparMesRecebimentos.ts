/**
 * limparMesRecebimentos.ts — "limpar o mês" apaga o analítico E o diário.
 *
 * ## A regra
 *
 * Na BookPlay as duas abas saem do MESMO arquivo: confirmar a importação chama
 * `importarLoteAnalitico` e, logo depois, `importarLoteDiario`
 * (`useAnaliticoImport`). Se o mês do analítico é apagado, o do diário tem de ir
 * junto — e voltar só quando o relatório for importado de novo.
 *
 * Antes cada lado tinha o seu botão e o diário não tinha nenhum por mês (só
 * "Limpar dia" e "Limpar tudo"). O resultado, medido em agosto/2026 na BookPlay:
 * o diário estava R$ 8.991,78 acima do analítico, e dois setores — Play Mix
 * Marília e Amauri Digital — tinham diário sem UMA linha de analítico.
 *
 * ## Por que um módulo só para isso
 *
 * A garantia precisa morar em um lugar, não na memória de quem escreve a
 * próxima tela. E não pode morar em nenhum dos dois serviços: `diario.service`
 * já importa de `analitico.service` (reexporta `resolverOperadores`), então o
 * caminho inverso fecharia um ciclo. Este módulo é a folha que conhece os dois.
 *
 * ## PaguePlay
 *
 * Lá o diário tem importação própria, com o seu próprio relatório — apagar o mês
 * do analítico não diz nada sobre ele. Daí `incluirDiario`, e não uma dedução
 * daqui: quem chama sabe o tenant.
 */

import {
  limparDadosDoMes,
  limparDadosDoMesSetor,
  type EscopoLimpezaSetor,
} from './analitico.service';
import { limparMesDiario } from '@/services/diario/diario.service';

export interface LimpezaMesParams {
  empresaId: string;
  mes: string;
  /** Setor em foco. `null` = empresa inteira (botão de admin/diretoria). */
  escopo: EscopoLimpezaSetor | null;
  /** BookPlay: o mesmo relatório alimenta o diário. PaguePlay: não. */
  incluirDiario: boolean;
}

export interface ResultadoLimpezaMes {
  /** Erro do analítico. Preenchido = o diário NÃO foi tocado. */
  error: string | null;
  /**
   * Erro só do diário. O analítico já saiu — a tela precisa dizer as duas
   * coisas, senão o líder acha que a limpeza inteira falhou e clica de novo.
   */
  erroDiario: string | null;
}

/**
 * Apaga o mês nas duas tabelas.
 *
 * A ordem é a garantia: o analítico primeiro. Se ele falhar, nada mais é
 * apagado e o líder tenta de novo — o pior estado possível é o inverso (diário
 * apagado, analítico de pé), porque aí o botão que reconstrói o diário é a
 * reimportação, e ela dedupe contra o analítico que sobrou.
 */
export async function limparMesRecebimentos(
  params: LimpezaMesParams,
): Promise<ResultadoLimpezaMes> {
  const { empresaId, mes, escopo, incluirDiario } = params;

  const { error } = escopo
    ? await limparDadosDoMesSetor(empresaId, mes, escopo)
    : await limparDadosDoMes(empresaId, mes);

  if (error) return { error, erroDiario: null };
  if (!incluirDiario) return { error: null, erroDiario: null };

  const { error: erroDiario } = await limparMesDiario(empresaId, mes, escopo);
  return { error: null, erroDiario };
}
