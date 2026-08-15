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
 * `super_admin` passa pelo cadeado sempre — e passa com aviso visível na tela,
 * não em silêncio. É saída de manutenção, e por isso mora aqui em código: se
 * dependesse de linha de tabela, desligá-la sem querer trancaria o sistema com a
 * chave do lado de dentro.
 *
 * Qualquer outro cargo passa só com a permissão `ignorar_fechamento_mes`, ligada
 * nominalmente em Configurações › Permissões. Ela nasce desligada para todo
 * mundo, administrador incluído: a decisão original foi que reabrir mês é ato de
 * manutenção, não rotina de gestão, e o catálogo não deve revogar sozinho uma
 * decisão que alguém tomou de propósito (ver `PERMISSOES_EXPLICITAS`).
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
  /**
   * Esta pessoa passa pelo cadeado — por ser `super_admin` ou por ter a
   * permissão `ignorar_fechamento_mes`.
   *
   * O nome ficou de quando a única saída era o cargo. Vale para a tela como
   * sempre valeu: é o sinal de "você está escrevendo em mês já apresentado".
   */
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
  /**
   * A permissão `ignorar_fechamento_mes` já resolvida por quem chamou.
   *
   * Entra como parâmetro, e não como consulta aqui dentro, para este arquivo
   * seguir puro: quem lê permissão precisa de React, e a regra de calendário é
   * usada em teste, em serviço e em componente.
   */
  liberadoPorPermissao?: boolean;
  /** Mês corrente. Só os testes passam — a produção usa o de São Paulo. */
  hoje?: string;
}): EstadoFechamento {
  const fechado = mesFechado(params.mes, params.hoje ?? mesAtual());
  if (!fechado) return ABERTO;

  const liberadoPorCargo =
    podeIgnorarFechamento(params.cargo) || params.liberadoPorPermissao === true;
  return { fechado: true, liberadoPorCargo, bloqueado: !liberadoPorCargo };
}

/** Mesmo estado, a partir da DATA de um registro (vencimento do acordo). */
export function estadoFechamentoDaData(params: {
  data: string | null | undefined;
  cargo: string | null | undefined;
  liberadoPorPermissao?: boolean;
  hoje?: string;
}): EstadoFechamento {
  const mes = mesDaData(params.data);
  if (!mes) return ABERTO;
  return estadoFechamento({
    mes,
    cargo: params.cargo,
    liberadoPorPermissao: params.liberadoPorPermissao,
    hoje: params.hoje,
  });
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

/**
 * A frase para quem passa por cima do cadeado.
 *
 * Não diz mais "como super admin": desde que a exceção virou permissão, quem lê
 * isto pode ser gerência com `ignorar_fechamento_mes` ligada, e nomear o cargo
 * errado faria a pessoa descartar o aviso como se não fosse com ela.
 */
export function mensagemFechamentoLiberado(mes: string | null | undefined): string {
  return `${rotuloDoMes(mes)} está fechado, e você tem permissão para escrever `
    + 'assim mesmo — a alteração muda um mês que já foi apresentado.';
}
