/**
 * acumuladoDaEquipe.ts — o recebido de cada EQUIPE e os dias úteis dela.
 *
 * Saiu de dentro do `useMemo` de `DesempenhoEquipes` (30/09/2026) para a tela
 * da equipe no celular usar a MESMA conta do card do Painel do Líder — ver
 * docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §2. Nada aqui é
 * regra nova: é o mesmo laço, com nome.
 *
 * ## As três fontes do acumulado de uma equipe
 *
 *   • o resumo de cada operador cai na equipe PRINCIPAL dele;
 *   • e também em cada equipe em que ele é CLONE (sem contar duas vezes quando
 *     o clone é na própria equipe);
 *   • quem saiu por transferência de setor deixa na equipe de origem só o que
 *     recebeu no setor de origem (`creditosDeOrigem`).
 *
 * `ajuste` viaja junto com o acumulado: ele já está DENTRO de `total_recebido`,
 * e a pergunta que responde é «quanto deste número foi lançado à mão».
 */
import { diasUteisDecorridos, diasUteisDoMes } from '@/lib/diasUteis';
import type { SomaDoSetor } from '@/services/analitico/acumuladoDoSetor';
import type {
  OperadorEquipeInfo, ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import type { CreditoDeOrigem } from '@/services/analitico/fantasmaTransferencia';

export interface EntradaSomaPorEquipe {
  resumos: ReadonlyArray<ResumoOperadorAnalitico>;
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  creditosDeOrigem: ReadonlyArray<CreditoDeOrigem>;
}

export function somarPorEquipe(entrada: EntradaSomaPorEquipe): Record<string, SomaDoSetor> {
  const { resumos, operadorEquipeMap, equipesExtrasPorOperador, creditosDeOrigem } = entrada;
  const porEquipe: Record<string, SomaDoSetor> = {};
  const somar = (id: string, r: ResumoOperadorAnalitico) => {
    if (!porEquipe[id]) porEquipe[id] = { bruto: 0, ho: 0, ajuste: 0 };
    porEquipe[id].bruto  += r.total_recebido;
    porEquipe[id].ho     += Number(r.total_ho) || 0;
    porEquipe[id].ajuste += Number(r.ajuste_manual) || 0;
  };

  for (const r of resumos) {
    const info = operadorEquipeMap[r.operador_id];
    if (info?.equipe_id) somar(info.equipe_id, r);
    // Clones: o recebimento conta TAMBÉM nas equipes clonadas
    for (const eqId of equipesExtrasPorOperador[r.operador_id] ?? []) {
      if (eqId !== info?.equipe_id) somar(eqId, r);
    }
  }
  // Quem saiu da equipe por transferência de setor deixa nela o que recebeu
  // no setor de origem, e só isso — o resto já está no resumo, onde a pessoa
  // está agora.
  for (const c of creditosDeOrigem) {
    if (!porEquipe[c.equipeId]) porEquipe[c.equipeId] = { bruto: 0, ho: 0, ajuste: 0 };
    porEquipe[c.equipeId].bruto += c.bruto;
    porEquipe[c.equipeId].ho    += c.ho;
  }
  return porEquipe;
}

export interface DiasDaEquipe { totalUteis: number; decorridos: number }

/**
 * Dias úteis do mês e os já decorridos — reduzidos quando a equipe é de
 * TREINAMENTO (contam a partir do início dela). Os mesmos dias descem para os
 * operadores dentro do card: era aqui que a aba Quartis divergia.
 */
export function diasDaEquipe(entrada: {
  ano: number; mes: number; feriados: string[]; hojeISO: string;
  contarHoje: boolean; inicioTreino?: string | null;
}): DiasDaEquipe {
  const { ano, mes, feriados, hojeISO, contarHoje } = entrada;
  const inicio = entrada.inicioTreino ?? undefined;
  return {
    totalUteis: diasUteisDoMes(ano, mes, feriados, inicio),
    decorridos: diasUteisDecorridos(ano, mes, feriados, hojeISO, inicio, contarHoje),
  };
}
