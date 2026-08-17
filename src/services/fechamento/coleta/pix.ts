/**
 * coleta/pix.ts — o Pix Automático do mês, no escopo do relatório.
 *
 * ## Reusa a conta da tela, não reescreve
 *
 * `comissaoDe`, `PIX_AUTO_PCT_PADRAO` e `metaDobraDoSetor` vêm de
 * `pix_automatico.service` — os mesmos que a tela usa. Reescrever a comissão
 * aqui produziria um relatório que discorda do painel de Pix aberto ao lado, e
 * comissão é dinheiro de gente.
 *
 * ## O valor do Pix JÁ ESTÁ no recebimento
 *
 * `pix_automatico_acordos` acompanha o Pix em si; o dinheiro dele entra no
 * total do mês pelo analítico. A seção existe para acompanhar o Pix, nunca para
 * somar ao recebimento — e a página diz isso em texto, porque num relatório
 * apresentado à diretoria a ausência da ressalva convida à soma errada.
 */

import { supabase } from '@/lib/supabase';
import {
  fetchAcordosPix, comissaoDe, metaDobraDoSetor, metasDobraPorSetor,
  PIX_AUTO_PCT_PADRAO,
  type PixAutoAcordo, type PixAutoConfig,
} from '@/services/pix_automatico.service';
import { primeiroDiaDoMes, ultimoDiaDoMes, partesDoMes } from '@/lib/mesReferencia';
import { pctLimitado } from '@/lib/projecaoMetas';
import type { BlocoPixFechamento, MetaPixEquipe, LinhaPixOperador, NivelFechamento } from '../tipos';

interface MetaPixRow {
  equipe_id: string;
  meta_valor: number | string | null;
  meta_acordos: number | string | null;
}

export interface ParametrosPix {
  empresaId: string;
  mes: string;
  nivel: NivelFechamento;
  /** Recorte do setor. `null` no nível diretoria (empresa inteira). */
  setorId: string | null;
  /** Preenchido só no nível operador. */
  operadorId: string | null;
  /** `operador_id` → nome, para o ranking. */
  nomePorOperador: Map<string, string>;
  /** `equipe_id` → nome, para a tabela de metas. */
  nomePorEquipe: Map<string, string>;
  /** `operador_id` → `equipe_id`, para agrupar o realizado por equipe. */
  equipeDoOperador: Map<string, string | null>;
  /** Equipes do setor em foco — inclusive as sem meta. */
  equipesDoEscopo: string[];
  /** Dias úteis do mês e decorridos, para a projeção de Pix. */
  diasUteis: { total: number; decorridos: number };
}

/** O acordo de Pix caiu dentro do mês? A data que vale é a de criação. */
function noMes(a: PixAutoAcordo, mes: string): boolean {
  const dia = String((a as unknown as { criado_em?: string }).criado_em ?? '').slice(0, 10);
  return dia >= primeiroDiaDoMes(mes) && dia <= ultimoDiaDoMes(mes);
}

/**
 * O Pix do escopo, ou `null` quando não houve nenhum.
 *
 * `null`, e não um bloco zerado: a seção inteira some quando o escopo não usa
 * Pix, e um bloco de zeros na apresentação parece resultado ruim em vez de
 * módulo não utilizado.
 */
export async function coletarPix(p: ParametrosPix): Promise<BlocoPixFechamento | null> {
  try {
    const [acordos, configResp, metasResp] = await Promise.all([
      fetchAcordosPix(p.empresaId, {
        operadorId: p.nivel === 'operador' ? (p.operadorId ?? undefined) : undefined,
        setorId: p.nivel === 'setor' ? p.setorId : null,
      }),
      supabase.from('pix_automatico_config').select('*').eq('empresa_id', p.empresaId),
      // `pix_automatico_metas` guarda mês e ano como smallint separados, e não
      // como 'yyyy-MM'. Passar a string faria o Postgres recusar o filtro.
      supabase.from('pix_automatico_metas')
        .select('equipe_id, meta_valor, meta_acordos')
        .eq('empresa_id', p.empresaId)
        .eq('mes', partesDoMes(p.mes).mes)
        .eq('ano', partesDoMes(p.mes).ano),
    ]);

    const doMes = acordos.filter(a => noMes(a, p.mes));
    if (!doMes.length) return null;

    const configs = ((configResp.data as PixAutoConfig[] | null) ?? []);
    const pctPorSetor: Record<string, number> = {};
    for (const c of configs) {
      const setor = (c as unknown as { setor_id?: string | null }).setor_id;
      const pctCfg = Number((c as unknown as { pct_comissao?: number }).pct_comissao);
      if (setor && Number.isFinite(pctCfg)) pctPorSetor[setor] = pctCfg;
    }

    const total = doMes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const comissao = doMes.reduce((s, a) => s + comissaoDe(a, pctPorSetor), 0);
    const pctComissao = (p.setorId && pctPorSetor[p.setorId]) || PIX_AUTO_PCT_PADRAO;

    // ── Ranking por operador ────────────────────────────────────────────────
    // Vazio no nível operador: "ranking de um" não é ranking, e o pedido foi
    // que cada pessoa baixe só o que é dela.
    const ranking: LinhaPixOperador[] = [];
    if (p.nivel !== 'operador') {
      const porOperador = new Map<string, LinhaPixOperador>();
      for (const a of doMes) {
        const id = a.operador_id;
        if (!id) continue;
        const atual = porOperador.get(id) ?? {
          id, nome: p.nomePorOperador.get(id) ?? 'Operador', valor: 0, acordos: 0, comissao: 0,
        };
        atual.valor += Number(a.valor) || 0;
        atual.acordos += 1;
        atual.comissao += comissaoDe(a, pctPorSetor);
        porOperador.set(id, atual);
      }
      ranking.push(...[...porOperador.values()].sort((x, y) => y.valor - x.valor));
    }

    // ── Meta por equipe ─────────────────────────────────────────────────────
    const metasPorEquipe: MetaPixEquipe[] = [];
    let consolidado: BlocoPixFechamento['consolidado'] = null;

    if (p.nivel !== 'operador' && p.equipesDoEscopo.length) {
      const metaRows = ((metasResp.data as MetaPixRow[] | null) ?? []);
      const metaPorEquipe = new Map<string, { valor: number; acordos: number }>();
      for (const m of metaRows) {
        metaPorEquipe.set(m.equipe_id, {
          valor: Number(m.meta_valor) || 0,
          acordos: Number(m.meta_acordos) || 0,
        });
      }

      const realizadoPorEquipe = new Map<string, { valor: number; acordos: number }>();
      for (const a of doMes) {
        const equipe = a.operador_id ? p.equipeDoOperador.get(a.operador_id) ?? null : null;
        if (!equipe) continue;
        const atual = realizadoPorEquipe.get(equipe) ?? { valor: 0, acordos: 0 };
        atual.valor += Number(a.valor) || 0;
        atual.acordos += 1;
        realizadoPorEquipe.set(equipe, atual);
      }

      for (const equipeId of p.equipesDoEscopo) {
        const real = realizadoPorEquipe.get(equipeId) ?? { valor: 0, acordos: 0 };
        const meta = metaPorEquipe.get(equipeId);
        const metaValor = meta && meta.valor > 0 ? meta.valor : null;
        // Equipe sem meta NÃO some: o realizado dela é informação, e removê-la
        // faria a soma da tabela não fechar com o total do setor.
        if (!metaValor && real.valor <= 0) continue;
        metasPorEquipe.push({
          equipeId,
          nome: p.nomePorEquipe.get(equipeId) ?? 'Equipe',
          realizado: real.valor,
          acordos: real.acordos,
          meta: metaValor,
          metaAcordos: meta && meta.acordos > 0 ? meta.acordos : null,
          pctValor: metaValor ? pctLimitado(real.valor, metaValor) : 0,
          projecao: metaValor ? projecaoPix(real.valor, metaValor, p.diasUteis) : null,
        });
      }
      metasPorEquipe.sort((a, b) => b.realizado - a.realizado);

      // A meta do setor é a SOMA das metas das equipes. Guardar um total à
      // parte criaria dois lugares para a mesma verdade — mesma decisão de
      // `PixMetaPainel`.
      const somaMetas = metasPorEquipe.reduce((s, e) => s + (e.meta ?? 0), 0);
      const somaReal = metasPorEquipe.reduce((s, e) => s + e.realizado, 0);
      consolidado = {
        realizado: somaReal,
        meta: somaMetas > 0 ? somaMetas : null,
        pctValor: somaMetas > 0 ? pctLimitado(somaReal, somaMetas) : 0,
        projecao: somaMetas > 0 ? projecaoPix(somaReal, somaMetas, p.diasUteis) : null,
      };
    }

    // ── Dobra de comissão ───────────────────────────────────────────────────
    let dobra: BlocoPixFechamento['dobra'] = null;
    if (p.setorId) {
      const requisito = metaDobraDoSetor(p.setorId, metasDobraPorSetor(configs));
      if (requisito > 0) {
        const alcancado = doMes.length;
        const atingida = alcancado >= requisito;
        dobra = {
          requisito,
          alcancado,
          atingida,
          comissaoComDobra: atingida ? comissao * 2 : comissao,
        };
      }
    }

    return {
      total, acordos: doMes.length, comissao, pctComissao,
      ranking, metasPorEquipe, consolidado, dobra,
    };
  } catch {
    // Falha no Pix não derruba o fechamento. A seção some e entra uma
    // observação — ver a onda 2 em `fechamento.service`.
    return null;
  }
}

/**
 * Projeção de Pix pela mesma mecânica de dias úteis do dashboard.
 *
 * Escrita aqui, e não importada, porque `calcularProjecao` devolve o pacote
 * inteiro (quartil, próximo, paraSubir) e o Pix só usa a porcentagem. Passar
 * quartis fictícios para descartar o resultado seria pior.
 */
function projecaoPix(
  realizado: number, meta: number, dias: { total: number; decorridos: number },
): number {
  if (meta <= 0 || dias.total <= 0) return 0;
  const decorridos = Math.max(dias.decorridos, 1);
  const esperado = (meta / dias.total) * decorridos;
  return esperado > 0 ? Math.round((realizado / esperado) * 100) : 0;
}
