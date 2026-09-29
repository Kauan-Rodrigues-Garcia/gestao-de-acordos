/**
 * fantasmaTransferencia.ts — quem saiu no meio do mês continua contando onde estava.
 *
 * ## O problema
 *
 * O agrupamento do analítico (equipe, setor) é lido de `composicao_mes` para mês
 * fechado e AO VIVO para o mês corrente — ver `buscarEquipesComOperadores`. O
 * retrato protege o passado: mover alguém hoje não reescreve julho.
 *
 * O mês corrente não tinha proteção nenhuma. Transferir alguém no dia 13 zerava
 * `equipe_id`, e no mesmo instante os 12 dias de recebimento dela sumiam do card
 * da equipe de origem. Ninguém apagou nada — o dinheiro continua no total da
 * empresa e no do setor (que soma pelo carimbo do relatório, imutável); ele
 * apenas deixa de ter equipe, e some da única tela onde o líder o procura.
 *
 * ## A regra
 *
 * No mês em que a transferência aconteceu, a pessoa é recolocada na equipe e no
 * setor de ORIGEM, marcada como transferida. A liderança da origem decide se
 * tira (`fantasma_ativo = false`) ou deixa; o padrão é deixar.
 *
 * Do mês seguinte em diante nada disso se aplica: `mes` na transferência não
 * casa mais, e a pessoa aparece no lugar novo. O fantasma expira sozinho, sem
 * ninguém precisar lembrar de limpá-lo — mesma escolha da composição do
 * acumulado (20260812e), pelo mesmo motivo: regra temporária que depende de
 * faxina manual vira regra permanente errada.
 *
 * ## Por que é um módulo puro
 *
 * A pergunta "quem conta nesta equipe?" já teve três respostas divergentes neste
 * projeto (ver `escopoAnalitico.ts`). Esta é uma correção EM CIMA daquela regra,
 * aplicada no mesmo ponto para os dois lados — dashboard e Painel Líder leem a
 * composição pela mesma função. Sendo pura, o teste cobre o caso que mais
 * importa e que nenhum mock de banco alcança: a pessoa que mudou de EMPRESA e
 * por isso nem existe mais na consulta de perfis da origem.
 */

import type { ComposicaoEquipes, OperadorEquipeInfo } from './analitico.service';

/** Uma transferência ainda com fantasma de pé, no mês pedido. */
export interface FantasmaTransferencia {
  id: string;
  perfilId: string;
  /**
   * Nome gravado no registro (20260813d).
   *
   * Não sai de JOIN: numa troca de empresa a origem não enxerga mais o perfil,
   * e é na origem que o fantasma aparece.
   */
  nome: string | null;
  /** Equipe de onde a pessoa saiu. `null` = ela não tinha equipe. */
  origemEquipeId: string | null;
  origemSetorId: string | null;
  /** 'setor' ou 'empresa' — só muda o texto que a tela mostra. */
  tipo: 'setor' | 'empresa';
}

/** O que a tela precisa saber para marcar a pessoa como transferida. */
export interface MarcaTransferido {
  transferenciaId: string;
  tipo: 'setor' | 'empresa';
  /** Para a tela que não tem o perfil à mão (quadro de membros da origem). */
  nome: string | null;
  /** Equipe onde o fantasma está pendurado. */
  equipeId: string | null;
}

/**
 * Recoloca na origem quem foi transferido neste mês.
 *
 * Não muda nada quando não há fantasma: devolve a composição com um mapa vazio,
 * preservando as referências de dentro.
 *
 * Dois casos, e o segundo é o que exige cuidado:
 *
 *   • **mesma empresa** — a pessoa está na composição ao vivo, já no lugar novo.
 *     Basta reescrever a entrada dela para a origem.
 *   • **outra empresa** — ela sumiu da consulta (`perfis` filtra por
 *     `empresa_id`), então não há entrada para reescrever: é preciso CRIAR uma.
 *     Sem isto o fantasma de quem trocou de empresa simplesmente não existiria,
 *     que é justamente a transferência mais difícil de desfazer depois.
 *
 * A equipe de origem volta para a lista de equipes visíveis mesmo que tenha
 * ficado sem nenhum membro ativo — uma equipe cujo último integrante foi
 * transferido ainda tem o recebimento dele para mostrar.
 */
export function aplicarFantasmas(
  composicao: ComposicaoEquipes,
  fantasmas: readonly FantasmaTransferencia[],
  /** Nome da equipe de origem, para a entrada criada do caso cross-empresa. */
  nomeDaEquipe: (equipeId: string) => string | undefined,
  opcoes: {
    /**
     * BookPlay, 29/09/2026: no fantasma de SETOR a pessoa fica onde está.
     *
     * Recolocá-la inteira na origem tirava da equipe NOVA o que ela já recebeu
     * no setor novo (Stella e Camilly, Play 1 → Play 2 em 15/09: R$ 15.339,12
     * fora do card do Luan). Agora cada linha conta no setor do carimbo: o
     * resumo por operador só traz as do setor onde a pessoa está, e a equipe de
     * origem recebe as do setor de origem por `creditosDeOrigem`. Aqui só a
     * equipe de origem volta para a lista, para o card dela existir.
     *
     * Transferência de EMPRESA segue como era: lá todas as linhas são da origem.
     */
    setorFicaNoLugar?: boolean;
  } = {},
): ComposicaoEquipes {
  if (!fantasmas.length) return { ...composicao, transferidos: {} };

  const operadorEquipeMap: Record<string, OperadorEquipeInfo> = {
    ...composicao.operadorEquipeMap,
  };
  const situacaoPorOperador = { ...composicao.situacaoPorOperador };
  const transferidos: Record<string, MarcaTransferido> = {};
  const equipesQueVoltam = new Set<string>();

  for (const f of fantasmas) {
    if (opcoes.setorFicaNoLugar && f.tipo === 'setor') {
      if (f.origemEquipeId) equipesQueVoltam.add(f.origemEquipeId);
      continue;
    }
    // A ida zerou `equipe_id`, então a origem é a única fonte da equipe antiga.
    operadorEquipeMap[f.perfilId] = {
      equipe_id:   f.origemEquipeId,
      equipe_nome: (f.origemEquipeId && nomeDaEquipe(f.origemEquipeId)) ?? 'Sem equipe',
      setor_id:    f.origemSetorId,
    };
    // Quem mudou de empresa não veio na consulta de perfis: sem uma situação
    // explícita ele cairia em "desligado" ou sumiria de filtros que exigem
    // 'ativo'. Ele trabalhou o mês; a marca de transferido é que conta a história.
    situacaoPorOperador[f.perfilId] ??= 'ativo';
    transferidos[f.perfilId] = {
      transferenciaId: f.id,
      tipo:            f.tipo,
      nome:            f.nome,
      equipeId:        f.origemEquipeId,
    };
    if (f.origemEquipeId) equipesQueVoltam.add(f.origemEquipeId);
  }

  const jaListadas = new Set(composicao.equipes.map(e => e.id));
  const equipes = [...composicao.equipes];
  for (const equipeId of equipesQueVoltam) {
    if (jaListadas.has(equipeId)) continue;
    equipes.push({
      id:       equipeId,
      nome:     nomeDaEquipe(equipeId) ?? 'Equipe',
      setor_id: fantasmas.find(f => f.origemEquipeId === equipeId)?.origemSetorId ?? null,
    });
  }
  equipes.sort((a, b) => a.nome.localeCompare(b.nome));

  return {
    ...composicao,
    equipes,
    operadorEquipeMap,
    situacaoPorOperador,
    transferidos,
  };
}

/** O que a equipe de origem recebe de quem saiu dela por transferência de setor. */
export interface CreditoDeOrigem {
  perfilId: string;
  nome: string | null;
  equipeId: string;
  setorId: string | null;
  bruto: number;
  ho: number;
}

/** Uma linha de `fn_analitico_recebido_fora_do_setor`. */
export interface RecebidoForaDoSetor {
  operador_id: string;
  setor_id: string;
  total_recebido: number;
  total_ho: number;
}

/**
 * Casa o que ficou fora do setor da pessoa com o fantasma de SETOR dela.
 *
 * Só a linha carimbada no setor de ORIGEM vira crédito da equipe de origem —
 * «delas só vai aparecer para o Luan o recebimento que receberam para o Play 2»
 * (29/09/2026). Fantasma sem equipe de origem não gera crédito de equipe: o
 * setor de origem já soma essas linhas pelo carimbo.
 */
export function creditosDeOrigem(
  fantasmas: readonly FantasmaTransferencia[],
  fora: readonly RecebidoForaDoSetor[],
): CreditoDeOrigem[] {
  const saida: CreditoDeOrigem[] = [];
  for (const f of fantasmas) {
    if (f.tipo !== 'setor' || !f.origemEquipeId || !f.origemSetorId) continue;
    for (const r of fora) {
      if (r.operador_id !== f.perfilId || r.setor_id !== f.origemSetorId) continue;
      saida.push({
        perfilId: f.perfilId,
        nome:     f.nome,
        equipeId: f.origemEquipeId,
        setorId:  f.origemSetorId,
        bruto:    Number(r.total_recebido) || 0,
        ho:       Number(r.total_ho) || 0,
      });
    }
  }
  return saida;
}
