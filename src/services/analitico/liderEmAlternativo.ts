/**
 * liderEmAlternativo.ts — o líder não conta na equipe de setor alternativo.
 *
 * ## A regra (Cleber, 06/10/2026)
 *
 * Setor alternativo (Marília Digital, Treinamento, Treinamento Marília) clona
 * gente de outros setores. Nele:
 *
 *   • o recebimento do OPERADOR (clone ou cadastro) conta na equipe dele e no
 *     total do setor;
 *   • o recebimento do LÍDER conta só no total do setor — em NENHUMA das
 *     equipes que ele lidera ali, sejam uma ou duas;
 *   • cada pessoa conta uma vez no total.
 *
 * Fora do alternativo continua a regra de 29/09/2026 (`equipeDoLider.ts`): o
 * líder conta em todas as equipes que lidera.
 *
 * ## Como
 *
 * A composição já chega montada (ao vivo ou do retrato), com o líder em todas
 * as equipes que lidera. Aqui a equipe de alternativo que ele lidera sai das
 * equipes dele, e o SETOR dela fica em `setores_extra` — é por ali que
 * `setoresDoOperador` continua contando o líder, uma vez, no total do setor.
 *
 * Sem React e sem banco.
 */
import type { OperadorEquipeInfo } from './analitico.service';

export interface EntradaLiderEmAlternativo {
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  /** pessoa → equipes que ela lidera no mês. */
  lideradas: Record<string, string[]>;
  setorDaEquipe: ReadonlyMap<string, string>;
  nomeDaEquipe: ReadonlyMap<string, string>;
  /** Setores alternativos no mês. */
  alternativos: ReadonlySet<string>;
}

export function liderNaoContaEmEquipeDeAlternativo(e: EntradaLiderEmAlternativo): {
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
} {
  const { lideradas, setorDaEquipe, nomeDaEquipe, alternativos } = e;
  if (!alternativos.size) {
    return { operadorEquipeMap: e.operadorEquipeMap, equipesExtrasPorOperador: e.equipesExtrasPorOperador };
  }
  const operadorEquipeMap = { ...e.operadorEquipeMap };
  const equipesExtrasPorOperador = { ...e.equipesExtrasPorOperador };
  const ehAlternativa = (eq: string) => alternativos.has(setorDaEquipe.get(eq) ?? '');

  for (const [pessoa, equipes] of Object.entries(lideradas)) {
    const info = operadorEquipeMap[pessoa];
    if (!info) continue;
    const tirar = new Set(equipes.filter(ehAlternativa));
    if (!tirar.size) continue;

    let extras = (equipesExtrasPorOperador[pessoa] ?? []).filter(eq => !tirar.has(eq));
    const novo: OperadorEquipeInfo = { ...info };
    if (info.equipe_id && tirar.has(info.equipe_id)) {
      // O rótulo passa para outra equipe que ela lidera (fora do alternativo);
      // nunca para um clone — quem é só clone segue «Sem equipe».
      const proxima = extras.find(eq => equipes.includes(eq)) ?? null;
      extras = extras.filter(eq => eq !== proxima);
      novo.equipe_id = proxima;
      novo.equipe_nome = proxima ? (nomeDaEquipe.get(proxima) ?? 'Sem equipe') : 'Sem equipe';
      // Sem outra equipe, fica o setor que já estava: o do alternativo.
      if (proxima) novo.setor_id = setorDaEquipe.get(proxima) ?? info.setor_id;
    }

    const continua = new Set<string>();
    if (novo.setor_id) continua.add(novo.setor_id);
    for (const eq of extras) { const s = setorDaEquipe.get(eq); if (s) continua.add(s); }
    const extraDeSetor = [...new Set([...(info.setores_extra ?? []), ...[...tirar].map(eq => setorDaEquipe.get(eq)!)])]
      .filter(s => s && !continua.has(s));
    if (extraDeSetor.length) novo.setores_extra = extraDeSetor;
    else delete novo.setores_extra;

    operadorEquipeMap[pessoa] = novo;
    if (extras.length) equipesExtrasPorOperador[pessoa] = extras;
    else delete equipesExtrasPorOperador[pessoa];
  }
  return { operadorEquipeMap, equipesExtrasPorOperador };
}
