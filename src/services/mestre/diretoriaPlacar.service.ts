/**
 * diretoriaPlacar.service.ts — o que o placar da Visão geral (Painel Diretoria
 * 3.0) lê além do 59 e da Cofen.
 *
 *   buscarMetasDoPainel     a meta de cada SETOR (a do setor, sempre — Cleber,
 *                           04/10/2026) e o calendário do mês (feriados,
 *                           quartis, «conta o dia de hoje»)
 *   buscarFontesDoPainel    as fontes do Painel Líder (equipes, pessoas, metas
 *                           individuais, analítico) — as MESMAS que o celular
 *                           usa (`carregarFontes`), para a equipe e o quartil
 *                           de cada pessoa saírem da mesma conta do Painel Líder
 *   buscarAgendaDosSetores  o agendado do mês por setor (acordos salvos)
 *
 * Tudo guardado no cache do 59 (`cache59.ts`): trocar de aba e voltar não
 * relê, e o «Atualizar» do painel esquece tudo junto.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { QuartilConfig } from '@/lib/supabase';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { carregarFontes } from '@/pages/Mobile/equipe/useTelaEquipe';
import { buscarRecebimentoIndireto, type MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { VALIDADE_58_MS, espiarDo59, lerDo59 } from './cache59';

export interface MetasDoPainel {
  /** setor_id → meta do mês, em bruto (só as > 0). */
  metas: Record<string, number>;
  feriados: string[];
  contarHoje: boolean;
  quartis: QuartilConfig[];
}

async function metasNoBanco(empresaId: string, mes: string): Promise<MetasDoPainel> {
  const [ano, mesNum] = mes.split('-').map(Number);
  const [metasRes, cfg] = await Promise.all([
    supabase.from('metas').select('referencia_id, meta_valor')
      .eq('empresa_id', empresaId).eq('tipo', 'setor').eq('mes', mesNum).eq('ano', ano),
    getMetasConfig(empresaId, mesNum, ano),
  ]);
  if (metasRes.error) throw new Error(metasRes.error.message);
  const metas: Record<string, number> = {};
  for (const m of (metasRes.data as { referencia_id: string; meta_valor: number }[] | null) ?? []) {
    const v = Number(m.meta_valor) || 0;
    if (v > 0) metas[m.referencia_id] = v;
  }
  return {
    metas,
    feriados: cfg.data?.feriados ?? [],
    contarHoje: cfg.data?.contar_dia_atual === true,
    quartis: cfg.data?.quartis?.length ? cfg.data.quartis : QUARTIS_PADRAO,
  };
}

export function buscarMetasDoPainel(empresaId: string, mes: string): Promise<MetasDoPainel> {
  return lerDo59(['placar-metas', empresaId, mes], () => metasNoBanco(empresaId, mes));
}

/** As fontes do Painel Líder de uma empresa num mês (ver `carregarFontes`). */
export type FontesDoPainel = Awaited<ReturnType<typeof carregarFontes>>;

export function buscarFontesDoPainel(empresaId: string, mes: string): Promise<FontesDoPainel> {
  return lerDo59(['placar-fontes', empresaId, mes], () => carregarFontes(empresaId, mes), VALIDADE_58_MS);
}

export function espiarFontesDoPainel(empresaId: string, mes: string): FontesDoPainel | undefined {
  return espiarDo59(['placar-fontes', empresaId, mes], VALIDADE_58_MS);
}

/**
 * O recebimento indireto (acordos extra pagos) de quem tem meta indireta — a
 * segunda frente de meta da regra COFEN. Entra no quartil como no Painel Líder
 * (`combinarMetaDupla`). Ninguém com meta indireta: não vai ao banco.
 */
export function buscarIndiretoDoPainel(fontes: FontesDoPainel, empresaId: string): Promise<MapaRecebimentoIndireto> {
  const alvos = Object.keys(fontes.metasIndiretas).sort();
  if (!alvos.length) return Promise.resolve({});
  return lerDo59(['placar-indireto', empresaId, fontes.mes, alvos.join(',')],
    () => buscarRecebimentoIndireto({ empresaId, mes: fontes.mes, operadores: alvos }), VALIDADE_58_MS);
}

/**
 * A PaguePlay, para as equipes e pessoas do setor Cofen. `null` quando quem
 * olha não enxerga a outra empresa — a tela diz isso no lugar das equipes.
 */
export function buscarIdDaPaguePlay(): Promise<string | null> {
  return lerDo59(['placar-pp'], async () => {
    const { data } = await supabase.from('empresas').select('id').eq('slug', 'pagueplay').maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  });
}

export interface AgendaDoSetor {
  agendado: number;
  /** Recebido pela tabulação dos acordos do mês. */
  pago: number;
  naoPago: number;
  /** Agendado que ainda não virou pago nem não pago. */
  aVencer: number;
  acordos: number;
}

interface AgendaCrua {
  setor_id: string | null;
  total_agendado: unknown; total_recebido: unknown; total_nao_pago: unknown;
  total_restante: unknown; total_acordos: unknown;
}

const n = (v: unknown) => Number(v) || 0;

/** O agendado do mês por setor — a mesma soma da aba Setores (`fn_diretoria_setores_do_mes`). */
export function buscarAgendaDosSetores(empresaId: string, mes: string): Promise<Record<string, AgendaDoSetor>> {
  return lerDo59(['placar-agenda', empresaId, mes], async () => {
    const { data, error } = await rpcSemTipo<AgendaCrua[]>('fn_diretoria_setores_do_mes', { p_empresa_id: empresaId, p_mes: mes });
    if (error) throw new Error(error.message);
    const r: Record<string, AgendaDoSetor> = {};
    for (const l of data ?? []) {
      if (!l.setor_id) continue;
      r[l.setor_id] = {
        agendado: n(l.total_agendado), pago: n(l.total_recebido), naoPago: n(l.total_nao_pago),
        aVencer: n(l.total_restante), acordos: n(l.total_acordos),
      };
    }
    return r;
  }, VALIDADE_58_MS);
}
