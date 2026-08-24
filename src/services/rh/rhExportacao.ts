/**
 * rhExportacao.ts — o fechamento numa planilha que uma pessoa consegue ler.
 *
 * ## O critério é a leitura humana, não o dump
 *
 * O pedido é explícito: «o arquivo precisa ser legível por uma pessoa do RH» e
 * «separar claramente Premiação — Birigui de Comissão — Marília». Então a
 * exportação tem uma aba POR CIDADE, com o tipo de remuneração no nome da aba,
 * e uma aba de resumo na frente.
 *
 * Um `select *` em CSV cumpriria o item da lista e não serviria para conferir
 * pagamento — que é para o que o arquivo existe.
 *
 * ## As colunas são as do pedido, nesta ordem
 *
 *   Competência · Cidade · Setor · Equipe · Crachá · Operador · Percentual ·
 *   Tipo · Valor · Status · Motivo
 *
 * `Valor` sai como NÚMERO, não como texto formatado: quem recebe vai somar a
 * coluna, e «R$ 450,00» numa célula de texto não soma.
 *
 * ## Quem está FORA DA FOLHA precisa dizer isso na planilha
 *
 * Uma linha dispensada chega aqui com `valor` nulo e `status` `pendente` — o
 * status por baixo nunca avançou, porque não havia o que preencher. Escrito
 * assim, a planilha do pagamento dizia «Pendente / 0,00» para quem foi tirado
 * da folha de propósito: a mesma frase que descreve quem simplesmente não foi
 * preenchido, e as duas exigem ações opostas de quem confere.
 *
 * `Status` passa a dizer «Fora da folha», e `Motivo` carrega a justificativa
 * registrada — que é exatamente o que alguém procura numa auditoria.
 *
 * A montagem é pura e testável; escrever o arquivo é do chamador.
 */

import { utils as xlsxUtils, write as xlsxWrite } from '@e965/xlsx';
import { ESTADO_META, TIPO_REMUNERACAO_LABEL, type StatusLancamento, type TipoRemuneracao } from './rhEstados';
import { montarArvore, type LinhaAgregavel } from './rhAgregacao';

/** O que a exportação precisa de cada lançamento. */
export interface LinhaExportavel extends LinhaAgregavel {
  nome_snapshot: string;
  cracha_snapshot: string | null;
  percentual_snapshot: number | null;
  /**
   * Motivo da dispensa. Opcional porque `database.types.ts` ainda não conhece a
   * coluna (migration `20260823200000`) — ausente vale «sem motivo escrito»,
   * nunca «não foi dispensado»: quem responde isso é `dispensado`.
   */
  motivo_dispensa?: string | null;
  observacao?: string | null;
}

export interface LinhaPlanilha {
  Competência: string;
  Cidade: string;
  Setor: string;
  Equipe: string;
  Crachá: string;
  Operador: string;
  Percentual: string;
  Tipo: string;
  Valor: number;
  Status: string;
  /** Motivo da dispensa ou a observação do lançamento. Vazio quando não há. */
  Motivo: string;
}

/** O rótulo de status na planilha. Fora da folha vence o status por baixo. */
export const STATUS_FORA_DA_FOLHA = 'Fora da folha';

/** Uma aba pronta: nome e linhas. */
export interface AbaPlanilha {
  nome: string;
  linhas: LinhaPlanilha[];
  total: number;
}

/** `2026-09-01` → `Setembro/2026`. */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  const nomes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const i = Number(mes) - 1;
  return `${nomes[i] ?? mes}/${ano}`;
}

/**
 * Nome da aba do Excel.
 *
 * O Excel recusa mais de 31 caracteres e os caracteres `: \ / ? * [ ]`. Deixar
 * isso para o momento de escrever o arquivo produziria um erro obscuro em vez
 * de um nome cortado.
 */
export function nomeDeAba(bruto: string): string {
  return bruto.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
}

/**
 * Monta as abas — uma por cidade, na ordem configurada.
 *
 * Linha sem valor entra com zero e o status verdadeiro. Omiti-la faria a soma
 * fechar e a conferência não: quem lê precisa ver que aquela pessoa ficou sem
 * lançamento, e não descobrir isso contando nomes.
 */
export function montarAbas(
  linhas: readonly LinhaExportavel[],
  competencia: string,
  ordemCelulas: readonly string[] = [],
): AbaPlanilha[] {
  const rotulo = rotuloCompetencia(competencia);
  const { celulas } = montarArvore(linhas, ordemCelulas);

  return celulas.map(c => {
    const tipoLabel = TIPO_REMUNERACAO_LABEL[c.tipoRemuneracao as TipoRemuneracao]
      ?? c.tipoRemuneracao;
    const linhasAba: LinhaPlanilha[] = [];

    for (const setor of c.setores) {
      for (const equipe of setor.equipes) {
        for (const l of equipe.linhas) {
          linhasAba.push({
            Competência: rotulo,
            Cidade:      c.celula,
            Setor:       setor.setorNome,
            Equipe:      equipe.equipeNome,
            Crachá:      l.cracha_snapshot ?? '',
            Operador:    l.nome_snapshot,
            Percentual:  l.percentual_snapshot != null
                           ? `${Math.round(l.percentual_snapshot)}%` : '—',
            Tipo:        TIPO_REMUNERACAO_LABEL[
                           l.tipo_remuneracao_snapshot as TipoRemuneracao
                         ] ?? l.tipo_remuneracao_snapshot,
            Valor:       Number(l.valor ?? 0),
            Status:      l.dispensado
                           ? STATUS_FORA_DA_FOLHA
                           : (ESTADO_META[l.status as StatusLancamento]?.label ?? l.status),
            Motivo:      (l.dispensado ? l.motivo_dispensa : l.observacao) ?? '',
          });
        }
      }
    }

    return {
      nome: nomeDeAba(`${tipoLabel} - ${c.celula}`),
      linhas: linhasAba,
      total: linhasAba.reduce((s, x) => s + x.Valor, 0),
    };
  });
}

/** As linhas da aba de resumo — o que o RH confere antes de abrir as outras. */
export function montarResumo(
  abas: readonly AbaPlanilha[], competencia: string,
): Record<string, string | number>[] {
  // «Fora da folha» no resumo evita a pergunta que a planilha sempre gerava:
  // por que o bloco tem 20 pessoas e 17 valores. A resposta fica na primeira
  // aba, e não depois de contar linha por linha nas outras.
  const foraDaFolha = (a: AbaPlanilha) =>
    a.linhas.filter(l => l.Status === STATUS_FORA_DA_FOLHA).length;

  const linhas: Record<string, string | number>[] = abas.map(a => ({
    Competência: rotuloCompetencia(competencia),
    Bloco: a.nome,
    Pessoas: a.linhas.length,
    'Fora da folha': foraDaFolha(a),
    Total: a.total,
  }));
  linhas.push({
    Competência: rotuloCompetencia(competencia),
    Bloco: 'TOTAL GERAL',
    Pessoas: abas.reduce((s, a) => s + a.linhas.length, 0),
    'Fora da folha': abas.reduce((s, a) => s + foraDaFolha(a), 0),
    Total: abas.reduce((s, a) => s + a.total, 0),
  });
  return linhas;
}

/**
 * Gera o arquivo e devolve o Blob.
 *
 * Separado do download de propósito: quem chama decide se baixa, anexa ou
 * testa. A montagem acima é pura; só esta função conhece o `xlsx`.
 */
export function gerarPlanilhaRh(
  linhas: readonly LinhaExportavel[],
  competencia: string,
  ordemCelulas: readonly string[] = [],
): { blob: Blob; nomeArquivo: string; abas: AbaPlanilha[] } {
  const abas = montarAbas(linhas, competencia, ordemCelulas);
  const wb = xlsxUtils.book_new();

  xlsxUtils.book_append_sheet(
    wb, xlsxUtils.json_to_sheet(montarResumo(abas, competencia)), 'Resumo');

  for (const aba of abas) {
    xlsxUtils.book_append_sheet(wb, xlsxUtils.json_to_sheet(aba.linhas), aba.nome);
  }

  const buf = xlsxWrite(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    blob: new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    nomeArquivo: `rh_${competencia.slice(0, 7).replace('-', '_')}.xlsx`,
    abas,
  };
}
