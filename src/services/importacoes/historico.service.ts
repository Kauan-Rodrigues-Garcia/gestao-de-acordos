/**
 * historico.service.ts — a linha do tempo das importações dos dois relatórios.
 *
 * ## O histórico já existia; o que faltava era olhar junto
 *
 * O plano previa criar uma tabela de lotes do 58. Medindo antes de construir,
 * `logs_sistema` já guardava **1.416 importações concluídas e 34 falhadas**
 * desde 12/08/2026, cada uma com quem, quando, o arquivo e as contagens. Na
 * BookPlay são 463 eventos e 26 pessoas importando.
 *
 * Reconstruir lotes a partir de `analitico_recebimentos` seria pior: mostraria
 * só o que sobreviveu, não o que aconteceu — e lote cujas linhas foram todas
 * substituídas depois é justamente o que mais interessa olhar.
 *
 * ## As duas origens não têm a mesma forma, e a tela não finge que têm
 *
 * | | 58 | 59 |
 * |---|---|---|
 * | unidade | uma importação, de um setor | um lote, do mês inteiro |
 * | frequência | várias por dia, por setor | uma por arquivo novo |
 * | versionamento | não tem | `aberto` → `vigente` → `substituido` |
 *
 * Por isso o 58 traz `inseridos/atualizados/removidos` e o 59 traz `valor` e
 * `estado`. Forçar as duas nas mesmas colunas encheria metade da tabela de
 * traços e faria o leitor achar que a informação sumiu.
 *
 * ## O desfazer, e por que ele começa vazio
 *
 * Cada evento traz `loteId`, e é por ele que a tela acha o que aquela
 * importação apagou (`analitico_removidos`, migration 20260914021223) para
 * oferecer o desfazer na linha certa.
 *
 * O snapshot passou a existir em 14/09/2026. As 2.659 linhas removidas entre
 * agosto e setembro **não estão guardadas** — nada as guardava. Para os eventos
 * antigos não há o que desfazer, e a tela diz isso em vez de mostrar um botão
 * que falharia.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

const n = (v: unknown): number | null =>
  v === null || v === undefined ? null : (typeof v === 'number' ? v : Number(v) || 0);

export type OrigemImportacao = '58' | '59';

export interface EventoImportacao {
  /** O lote da importação. É por ele que o snapshot do que saiu se liga. */
  loteId: string | null;
  origem: OrigemImportacao;
  id: string;
  quando: string;
  quemId: string | null;
  quem: string;
  setorId: string | null;
  setorNome: string | null;
  mes: string;
  arquivo: string | null;
  linhas: number;
  /** Só o 58 responde. `null` no 59, que é retrato e não incremento. */
  inseridos: number | null;
  atualizados: number | null;
  removidos: number | null;
  /** Só o 59 responde. */
  valor: number | null;
  estado: string;
  deuErrado: boolean;
  descricao: string;
}

/**
 * Esta importação apagou o suficiente para merecer um olhar?
 *
 * Os mesmos cortes de `remocaoPrevista.ts`, e pelo mesmo motivo: remoção
 * legítima costuma ser de uma ou duas linhas — um acordo cancelado. Dezenas já
 * são outra coisa.
 *
 * O incidente que fundou essa régua: um export salvo da manhã do dia 11,
 * importado no dia 13, apagou 413 linhas e R$ 175.768,38 do Receptivo. O único
 * registro foi uma frase no log, depois do fato. Aqui essa frase vira uma marca
 * que se enxerga de longe.
 */
export const CORTE_REMOCAO = 10;

export function removeuDemais(e: EventoImportacao): boolean {
  return (e.removidos ?? 0) >= CORTE_REMOCAO;
}

/** O 59 não responde «quantas linhas mudaram» — ele substitui o mês inteiro. */
export function temContagemDeLinhas(e: EventoImportacao): boolean {
  return e.origem === '58';
}

export const ROTULO_ORIGEM: Record<OrigemImportacao, { curto: string; longo: string }> = {
  '58': {
    curto: 'Analítico 58',
    longo: 'Relatório analítico de um setor. Trata o arquivo como retrato do mês: o que '
         + 'não está nele é removido daquele setor.',
  },
  '59': {
    curto: 'Mestre 59',
    longo: 'Relatório mestre de todos os setores. Cada arquivo vira um lote; promover o '
         + 'novo marca o anterior como substituído.',
  },
};

export async function buscarHistoricoImportacoes(
  empresaId: string,
  opcoes: { mes?: string | null; origem?: OrigemImportacao | null; limite?: number } = {},
): Promise<EventoImportacao[]> {
  const { data, error } = await rpcSemTipo<{
    origem: OrigemImportacao; evento_id: string; lote_id: string | null; quando: string;
    quem_id: string | null; quem: string;
    setor_id: string | null; setor_nome: string | null;
    mes: string; arquivo: string | null;
    linhas: unknown; inseridos: unknown; atualizados: unknown; removidos: unknown;
    valor: unknown; estado: string; deu_errado: boolean; descricao: string;
  }[]>('fn_importacoes_historico', {
    p_empresa_id: empresaId,
    p_mes: opcoes.mes ?? null,
    p_origem: opcoes.origem ?? null,
    p_limite: opcoes.limite ?? 200,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map(e => ({
    origem:      e.origem,
    id:          e.evento_id,
    loteId:      e.lote_id,
    quando:      e.quando,
    quemId:      e.quem_id,
    quem:        e.quem,
    setorId:     e.setor_id,
    setorNome:   e.setor_nome,
    mes:         e.mes,
    arquivo:     e.arquivo,
    linhas:      n(e.linhas) ?? 0,
    inseridos:   n(e.inseridos),
    atualizados: n(e.atualizados),
    removidos:   n(e.removidos),
    valor:       n(e.valor),
    estado:      e.estado,
    deuErrado:   e.deu_errado,
    descricao:   e.descricao,
  }));
}

/** Um resumo do que a lista mostra, para o cabeçalho. */
export function resumoDoHistorico(eventos: EventoImportacao[]): {
  total: number; falhas: number; removidas: number; pessoas: number;
} {
  return {
    total:     eventos.length,
    falhas:    eventos.filter(e => e.deuErrado).length,
    removidas: eventos.reduce((t, e) => t + (e.removidos ?? 0), 0),
    pessoas:   new Set(eventos.map(e => e.quemId ?? e.quem)).size,
  };
}
