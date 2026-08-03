/**
 * pixAutomaticoView.ts — as contas da tela do Pix Automático.
 *
 * ## Por que isto saiu do componente
 *
 * `PixAutomatico.tsx` tinha 1.014 linhas, 31 `useState` e 9 `useMemo`. Entre
 * eles, dois decidem DINHEIRO — o total de comissão por status e o card de
 * bônus por meta — e nenhum tinha teste, porque exercitá-los exigia montar a
 * tela inteira com autenticação, empresa e Supabase.
 *
 * Aqui são funções puras. O componente ficou com estado, efeitos e JSX.
 *
 * ## Uma correção que veio junto
 *
 * O cálculo do bônus abria `new Date()` e lia `getFullYear()`/`getMonth()`
 * para descobrir o mês corrente. Isso é a hora da MÁQUINA de quem abre a tela,
 * não o fuso da operação: num navegador fora do Brasil, na virada do mês, o
 * card somaria a comissão do mês errado. Agora o mês entra por parâmetro, e o
 * componente passa `mesAtual()`, que é São Paulo — a mesma fonte que o resto
 * do sistema usa desde a correção de datas de 2026-08.
 */
import type { MetasConfigMes } from '@/lib/supabase';
import {
  diasUteisDoMes, diasUteisDecorridos, quartilAtual,
} from '@/lib/diasUteis';
import { partesDoMes, type MesRef } from '@/lib/mesReferencia';
import {
  comissaoDe, type PixAutoAcordo, type PixAutoStatus,
} from '@/services/pix_automatico.service';

export interface OperadorInfo {
  id: string;
  nome: string;
  equipe_id: string | null;
  setor_id: string | null;
  perfil: string;
}

// ── Mapas de operador ───────────────────────────────────────────────────────

export function mapaOperadorEquipe(ops: OperadorInfo[]): Record<string, string | null> {
  const m: Record<string, string | null> = {};
  for (const o of ops) m[o.id] = o.equipe_id;
  return m;
}

export function mapaOperadorSetor(ops: OperadorInfo[]): Record<string, string | null> {
  const m: Record<string, string | null> = {};
  for (const o of ops) m[o.id] = o.setor_id;
  return m;
}

/** Só quem tem cargo de operador — líder não aparece no filtro nem no vínculo. */
export function apenasOperadores(ops: OperadorInfo[]): OperadorInfo[] {
  return ops.filter(o => String(o.perfil ?? '').toLowerCase() === 'operador');
}

export const MAX_SUGESTOES_VINCULO = 8;

/** Sugestões do campo de vínculo. Busca vazia não sugere nada. */
export function sugerirOperadores(ops: OperadorInfo[], busca: string): OperadorInfo[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return [];
  return ops
    .filter(o => o.nome.toLowerCase().includes(termo))
    .slice(0, MAX_SUGESTOES_VINCULO);
}

// ── Filtro da lista ─────────────────────────────────────────────────────────

export interface FiltrosPix {
  busca?: string;
  status?: PixAutoStatus | 'todos';
  operadorId?: string | null;
  equipeId?: string | null;
  setorId?: string | null;
}

export interface MapasOperador {
  porEquipe: Record<string, string | null>;
  porSetor: Record<string, string | null>;
}

/**
 * Linhas que sobram depois dos filtros da barra.
 *
 * O setor da linha é o CARIMBADO nela; só quando falta é que se olha o setor
 * atual do operador. Um operador que mudou de setor não leva embora o
 * histórico de comissão do setor anterior.
 */
export function filtrarItensPix(
  itens: PixAutoAcordo[],
  filtros: FiltrosPix,
  mapas: MapasOperador,
): PixAutoAcordo[] {
  const termo = (filtros.busca ?? '').trim().toLowerCase();
  return itens.filter(i => {
    if (filtros.status && filtros.status !== 'todos' && i.status !== filtros.status) return false;
    if (filtros.operadorId && i.operador_id !== filtros.operadorId) return false;
    if (filtros.equipeId && mapas.porEquipe[i.operador_id] !== filtros.equipeId) return false;
    if (filtros.setorId
        && (i.setor_id ?? mapas.porSetor[i.operador_id] ?? null) !== filtros.setorId) return false;
    if (!termo) return true;
    return i.nr_cliente.toLowerCase().includes(termo)
        || (i.operador_nome ?? '').toLowerCase().includes(termo);
  });
}

// ── Totais ──────────────────────────────────────────────────────────────────

export interface TotalPix { qtd: number; valor: number; comissao: number }
export type TotaisPix = Record<PixAutoStatus, TotalPix>;

/**
 * Totais por status, SEMPRE sobre o conjunto visível — um líder que filtrou
 * por equipe tem que ver o total daquela equipe, não o da empresa.
 *
 * A comissão vem de `comissaoDe`: linha aprovada usa o percentual travado no
 * momento da aprovação; pendente usa o percentual atual do setor. Mudar o
 * percentual do setor não pode reescrever o que já foi aprovado.
 */
export function totaisPorStatus(
  visiveis: PixAutoAcordo[],
  pctPorSetor: Record<string, number>,
): TotaisPix {
  const soma = (status: PixAutoStatus): TotalPix => {
    const doStatus = visiveis.filter(i => i.status === status);
    return {
      qtd:      doStatus.length,
      valor:    doStatus.reduce((acc, i) => acc + Number(i.valor), 0),
      comissao: doStatus.reduce((acc, i) => acc + comissaoDe(i, pctPorSetor), 0),
    };
  };
  return { pendente: soma('pendente'), aprovado: soma('aprovado'), desaprovado: soma('desaprovado') };
}

// ── Bônus por meta ──────────────────────────────────────────────────────────

export interface EntradaBonusMeta {
  operadorId: string | null | undefined;
  itens: PixAutoAcordo[];
  pctPorSetor: Record<string, number>;
  /** Meta de recebimento do operador no mês. Sem meta, não há bônus. */
  metaValor: number | null;
  /** Quanto ele já recebeu no mês (relatório analítico). */
  recebidoMes: number | null;
  configMes: MetasConfigMes | null;
  /** Mês de referência 'yyyy-MM' — São Paulo, não o relógio da máquina. */
  mes: MesRef;
  hojeISO: string;
}

export interface BonusMeta {
  /** Comissão APROVADA no mês — é este valor que é pago de novo se bater a meta. */
  acumulado: number;
  metaBatida: boolean;
  quartil: number | null;
  projecao: number;
}

/**
 * O card de bônus por meta.
 *
 * A comissão que o operador já teve aprovada no mês é paga DE NOVO se ele
 * bater a meta. O card mostra quanto está em jogo e em que pé está:
 * meta batida (garantido), 1º quartil (projetando a meta) ou informativo.
 *
 * Devolve `null` quando não há nada a mostrar — sem operador, sem meta, sem
 * configuração do mês, ou sem nenhuma comissão aprovada ainda. É diferente de
 * mostrar zero: zero afirmaria que ele não tem bônus a receber, e a verdade é
 * que a pergunta ainda não faz sentido.
 */
export function calcularBonusMeta(e: EntradaBonusMeta): BonusMeta | null {
  if (!e.operadorId || e.metaValor == null || e.metaValor <= 0) return null;
  if (!e.configMes || e.recebidoMes == null) return null;

  const acumulado = e.itens
    .filter(i => i.operador_id === e.operadorId
              && i.status === 'aprovado'
              && i.criado_em.startsWith(e.mes))
    .reduce((s, i) => s + comissaoDe(i, e.pctPorSetor), 0);
  if (acumulado <= 0) return null;

  const { ano, mes } = partesDoMes(e.mes);
  const totalUteis = diasUteisDoMes(ano, mes, e.configMes.feriados);
  const decorridos = totalUteis === 0 ? 0 : diasUteisDecorridos(
    ano, mes, e.configMes.feriados, e.hojeISO, undefined,
    e.configMes.contar_dia_atual === true,
  );
  // `Math.max(decorridos, 1)`: no primeiro dia do mês, dividir por zero dias
  // decorridos daria projeção infinita. Um dia é o piso.
  const esperado = totalUteis === 0 ? 0 : (e.metaValor / totalUteis) * Math.max(decorridos, 1);
  const projecao = esperado > 0 ? Math.min(Math.round((e.recebidoMes / esperado) * 100), 999) : 0;
  const quartil  = quartilAtual(projecao, e.configMes.quartis);

  return {
    acumulado,
    metaBatida: e.recebidoMes >= e.metaValor,
    quartil: quartil?.quartil ?? null,
    projecao,
  };
}
