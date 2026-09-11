/**
 * acumuladoDoSetor.ts — o número do card de setor, num lugar só.
 *
 * ## Por que saiu do JSX
 *
 * A conta vivia dentro de `DesempenhoEquipes.tsx`, dividida entre o `useMemo`
 * que somava o analítico e o `map` que desenha o card. Enquanto só o card lia o
 * número, isso era desenho. Com a comissão por meta, a liderança passa a
 * CONFIRMAR «o setor bateu a meta» na tela de Metas olhando este mesmo número,
 * e duas cópias da regra divergiriam no primeiro ajuste — com dinheiro
 * dependendo do resultado.
 *
 * ## A regra, sem mudança
 *
 *   • PaguePlay e setor alternativo → soma dos operadores (clones e órfãos
 *     incluídos), decidido por `setorSomaPorUsuarios`;
 *   • BookPlay, setor normal        → total do relatório carimbado por setor;
 *   • Contribuição Receptivo        → soma no bruto, nunca no H.O.: é valor
 *     digitado à mão, sem H.O. próprio;
 *   • ajuste manual                 → sempre da soma. Nos dois caminhos ele já
 *     está dentro do acumulado; o que muda entre eles é de onde vem o TOTAL,
 *     não esta parcela.
 *
 * Sem React e sem chamada ao banco.
 */
import {
  setoresDoOperador, type OperadorEquipeInfo, type ResumoOperadorAnalitico,
} from './analitico.service';
import { setorSomaPorUsuarios } from './escopoAnalitico';

export interface SomaDoSetor {
  bruto: number;
  ho: number;
  /** Quanto do bruto veio de ajuste manual. Já está somado no bruto. */
  ajuste: number;
}

function zerado(): SomaDoSetor {
  return { bruto: 0, ho: 0, ajuste: 0 };
}

/**
 * O analítico somado por setor.
 *
 * Cada operador soma no próprio setor e nos setores das equipes em que é clone —
 * `setoresDoOperador` devolve um `Set`, então clone dentro do próprio setor não
 * conta duas vezes. É a mesma regra do «Total recebido» do AnaliticoLider.
 *
 * Os órfãos (linhas sem operador) pertencem ao setor da importação e entram só
 * no bruto: o total deles não traz H.O. separado.
 */
export function somarAnaliticoPorSetor(params: {
  resumos: readonly ResumoOperadorAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  setorDaEquipe: Map<string, string>;
  orfaosPorSetor: Record<string, { total: number; qtd: number }>;
}): Record<string, SomaDoSetor> {
  const {
    resumos, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe, orfaosPorSetor,
  } = params;

  const porSetor: Record<string, SomaDoSetor> = {};
  const doSetor = (sid: string): SomaDoSetor => {
    if (!porSetor[sid]) porSetor[sid] = zerado();
    return porSetor[sid];
  };

  for (const r of resumos) {
    const setores = setoresDoOperador(
      r.operador_id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
    );
    for (const sid of setores) {
      const s = doSetor(sid);
      s.bruto  += Number(r.total_recebido) || 0;
      s.ho     += Number(r.total_ho) || 0;
      s.ajuste += Number(r.ajuste_manual) || 0;
    }
  }

  for (const [sid, orfaos] of Object.entries(orfaosPorSetor)) {
    doSetor(sid).bruto += Number(orfaos.total) || 0;
  }

  return porSetor;
}

/** O acumulado que o card de setor mostra — e que a comissão confirma. */
export function acumuladoDoSetor(params: {
  setorId: string;
  isPaguePlay: boolean;
  alternativo: boolean;
  somaPorSetor: Record<string, SomaDoSetor>;
  totalPorSetor: Record<string, { total: number; ho: number }>;
  receptivoPorSetor: Record<string, { acumulado: number }>;
}): SomaDoSetor {
  const {
    setorId, isPaguePlay, alternativo, somaPorSetor, totalPorSetor, receptivoPorSetor,
  } = params;

  const soma = somaPorSetor[setorId];
  const relatorio = totalPorSetor[setorId];
  const usarSoma = setorSomaPorUsuarios({ isPaguePlay, alternativo });

  const bruto = usarSoma ? (soma?.bruto ?? 0) : (Number(relatorio?.total) || 0);
  const ho    = usarSoma ? (soma?.ho ?? 0)    : (Number(relatorio?.ho) || 0);

  return {
    bruto: bruto + (Number(receptivoPorSetor[setorId]?.acumulado) || 0),
    ho,
    ajuste: soma?.ajuste ?? 0,
  };
}
