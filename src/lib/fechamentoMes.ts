/**
 * fechamentoMes.ts — mês passado é história, não rascunho.
 *
 * ## A regra
 *
 * Virou o mês, o anterior FECHA: não se cria acordo com vencimento nele, não se
 * edita, não se exclui, não se dispara WhatsApp, não se reagenda. A tela passa a
 * mostrar cadeado, e quem tenta agir recebe o motivo em vez de um erro genérico.
 *
 * O porquê é de negócio, não técnico: o fechamento do mês é apresentado para
 * diretoria e equipe (ver `services/fechamento`), e um número que ainda pode
 * mudar depois de apresentado não é fechamento — é foto de rascunho. Editar
 * agosto em setembro reescreve, em silêncio, um relatório que já circulou.
 *
 * ## O que NÃO fecha
 *
 * **Importar relatório** (Analítico e Recebimento diário) segue liberado em mês
 * fechado, de propósito. É o oposto de editar: reimportar não inventa dado, ele
 * completa o que o ERP já sabia — foi exatamente assim que as 2.535 linhas do
 * Receptivo em agosto/2026 ficaram sem a coluna "Tipo comissão" e o painel
 * mostrou R$ 60.637,66 em "Sem vínculo definido". Travar a importação junto
 * deixaria esse tipo de buraco impossível de tapar depois da virada do mês.
 *
 * **Ler** nunca fecha. O mês fechado continua navegável inteiro.
 *
 * ## A exceção
 *
 * Só `super_admin` passa pelo cadeado — e passa com aviso visível na tela, não
 * em silêncio. Administrador comum fica bloqueado como todo mundo: a decisão foi
 * que reabrir mês é ato de manutenção, não rotina de gestão.
 *
 * Puro e sem React de propósito, como `mesReferencia.ts`: são regras de
 * calendário e cargo, a parte que precisa ser a mesma em toda tela que pergunta.
 */

import { mesAtual, normalizarMes, rotuloDoMes } from '@/lib/mesReferencia';

/**
 * Cargos que continuam podendo escrever em mês fechado.
 *
 * Lista, e não um booleano solto, para que ampliar a exceção seja uma linha
 * óbvia num arquivo só — e não um `perfil === 'x' || perfil === 'y'` copiado
 * para dentro de cada tela, que foi como as quatro listas de autorização de
 * tabulação divergiram entre si (ver `PERFIS_AUTORIZADORES` em `lib/index.ts`).
 */
export const CARGOS_QUE_IGNORAM_FECHAMENTO = ['super_admin'] as const;

/** O cargo passa pelo cadeado? */
export function podeIgnorarFechamento(cargo: string | null | undefined): boolean {
  const c = String(cargo ?? '').toLowerCase().trim();
  return (CARGOS_QUE_IGNORAM_FECHAMENTO as readonly string[]).includes(c);
}

/**
 * Este mês já fechou?
 *
 * Estritamente ANTERIOR ao corrente. O mês atual está aberto o mês inteiro,
 * inclusive no dia 31 — não existe "fechamento parcial".
 *
 * O mês corrente sai de `mesAtual()`, que é São Paulo, e não da máquina: com
 * `new Date()` uma estação em UTC travaria o mês corrente às 21h do dia 31,
 * três horas antes de a empresa virar.
 */
export function mesFechado(
  mes: string | null | undefined,
  hoje: string = mesAtual(),
): boolean {
  return normalizarMes(mes) < normalizarMes(hoje);
}

/**
 * O mês (`yyyy-MM`) de uma data ISO — o recorte que decide o cadeado de um
 * acordo. `null` para entrada vazia ou fora do formato, e aí quem chama trata
 * como "sem data, sem cadeado".
 */
export function mesDaData(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2})/.exec(iso);
  return m ? m[1] : null;
}

export interface EstadoFechamento {
  /** O mês em si já fechou (fato de calendário, igual para todo mundo). */
  fechado: boolean;
  /** O cargo passa pelo cadeado (`super_admin`). */
  liberadoPorCargo: boolean;
  /** Fechado E sem liberação — é isto que a tela usa para desabilitar. */
  bloqueado: boolean;
}

const ABERTO: EstadoFechamento = {
  fechado: false, liberadoPorCargo: false, bloqueado: false,
};

/**
 * O estado completo de um mês para um cargo.
 *
 * Devolve os três campos, e não só `bloqueado`, porque a tela precisa distinguir
 * os dois motivos de não estar bloqueado: mês aberto (nada a dizer) e mês
 * fechado com cargo liberado (precisa avisar que está passando por cima).
 */
export function estadoFechamento(params: {
  mes: string | null | undefined;
  cargo: string | null | undefined;
  /** Mês corrente. Só os testes passam — a produção usa o de São Paulo. */
  hoje?: string;
}): EstadoFechamento {
  const fechado = mesFechado(params.mes, params.hoje ?? mesAtual());
  if (!fechado) return ABERTO;

  const liberadoPorCargo = podeIgnorarFechamento(params.cargo);
  return { fechado: true, liberadoPorCargo, bloqueado: !liberadoPorCargo };
}

/** Mesmo estado, a partir da DATA de um registro (vencimento do acordo). */
export function estadoFechamentoDaData(params: {
  data: string | null | undefined;
  cargo: string | null | undefined;
  hoje?: string;
}): EstadoFechamento {
  const mes = mesDaData(params.data);
  if (!mes) return ABERTO;
  return estadoFechamento({ mes, cargo: params.cargo, hoje: params.hoje });
}

/** Rótulo curto do cadeado, para chip e tooltip. */
export const ROTULO_MES_FECHADO = 'Mês fechado';

/**
 * A frase que o usuário lê ao esbarrar no cadeado.
 *
 * Diz o mês, diz que é somente leitura e diz o que AINDA dá para fazer — um
 * bloqueio que só nega deixa a pessoa procurando o botão quebrado.
 */
export function mensagemFechamento(mes: string | null | undefined): string {
  return `${rotuloDoMes(mes)} está fechado: somente leitura. `
    + 'Baixe o relatório de fechamento para consultar os números do mês.';
}

/** A frase para quem tem cargo que passa por cima. */
export function mensagemFechamentoLiberado(mes: string | null | undefined): string {
  return `${rotuloDoMes(mes)} está fechado. Você está editando como super admin — `
    + 'a alteração muda um mês que já foi apresentado.';
}
