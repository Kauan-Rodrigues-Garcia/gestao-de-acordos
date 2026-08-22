/**
 * fechamento.service.ts — o retrato do mês, montado a partir do que já existe.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não inventa métrica nova. Cada número aqui sai da mesma fonte que a tela
 * correspondente já usa:
 *
 *   total, por dia, por forma   `agregarAnalitico` sobre `fn_analitico_dashboard_mes`
 *   quem conta em cada escopo   `escopoAnalitico` + `buscarFontesDeEscopo`
 *   Direto/Extra                `diretoExtra.service`
 *   ranking por operador        `fn_analitico_resumo_por_operador`
 *   destaque do dia             `fn_analitico_destaques_dia`
 *   dias úteis / quartis        `lib/diasUteis` + `metas_config_mes`
 *   projeção e quartil          `lib/projecaoMetas`
 *
 * Isso é requisito, não elegância: o relatório é levado para reunião de
 * diretoria, e um PDF que discorda do painel aberto na mesma sala destrói a
 * confiança nos dois. Se um número precisa mudar, muda na origem e os dois
 * lados acompanham.
 *
 * ## Escopo: o relatório vê o mesmo que o usuário
 *
 * O nível sai do ESCOPO DO DASHBOARD (`escopoEfetivo('dashboard', …)`, resolvido
 * no `BotaoFechamento`), nunca de um parâmetro escolhido na tela:
 *
 *   operador  → só ele. Sem colega, sem ranking dos outros, sem setor.
 *   setor     → o setor dele, com o detalhamento dos operadores.
 *   diretoria → todos os setores, mais o comparativo entre eles.
 *
 * A RLS continua sendo a barreira de verdade — um líder que tentasse pedir
 * outro setor receberia zero linhas do banco de qualquer jeito. O recorte aqui
 * existe para o relatório ser COERENTE, não para ser seguro.
 */

import { supabase } from '@/lib/supabase';
import type { MetasConfigMes, QuartilConfig } from '@/lib/supabase';
import {
  buscarAnaliticoDashboardMes,
  buscarResumoOperadoresAnalitico,
  buscarDestaquesDoMes,
  buscarFontesDeEscopo,
  operadoresDoSetor,
  type FontesDeEscopo,
} from '@/services/analitico/analitico.service';
import { agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import {
  escopoDeSetor, setorSomaPorUsuarios, temCarimboDeSetor,
  ESCOPO_EMPRESA, type EscopoAnalitico,
} from '@/services/analitico/escopoAnalitico';
import { buscarDiretoExtraDoMes } from '@/services/analitico/diretoExtra.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO, ordenarQuartis, quartilAtual,
} from '@/lib/diasUteis';
import { calcularProjecao, pctLimitado } from '@/lib/projecaoMetas';
import {
  partesDoMes, rotuloDoMes, normalizarMes, ehMesAtual, diasNoMes,
} from '@/lib/mesReferencia';
import { mesFechado } from '@/lib/fechamentoMes';
import { getTodayISO } from '@/lib/index';
import { coletarPix } from './coleta/pix';
import { coletarMesAnterior } from './coleta/mesAnterior';
import { coletarSeriesPorOperador, type SerieOperador } from './coleta/seriesPorOperador';
import { montarCuriosidades } from './curiosidades';
import { TETO_PAGINAS_INDIVIDUAIS } from './secoes/individual';
import type {
  DadosFechamento, NivelFechamento, FatiaForma, PontoDia,
  LinhaOperadorFechamento, LinhaSetorFechamento, FaixaQuartilFechamento,
  DestaqueDiaFechamento, ResumoFechamento, BlocoPixFechamento, ComparativoMes,
} from './tipos';

export interface ParametrosFechamento {
  empresaId: string;
  empresaNome: string;
  mes: string;
  nivel: NivelFechamento;
  /** Setor em foco. Obrigatório no nível `setor`; ignorado no `diretoria`. */
  setorId: string | null;
  /** Obrigatório no nível `operador`. */
  operadorId: string | null;
  operadorNome: string | null;
  isPaguePlay: boolean;
  /** O setor do usuário usa a lógica Direto/Extra? Sem ela o bloco some. */
  temLogicaDiretoExtra: boolean;
  geradoPor: string;
}

interface PerfilFechamento {
  id: string;
  nome: string;
  usuario: string | null;
  setor_id: string | null;
  equipe_id: string | null;
  situacao: string | null;
}

interface MetaLinha {
  tipo: string;
  referencia_id: string;
  meta_valor: number;
  /** Degraus adicionais do mês (JSONB). Ver `metas_extras` em `MetasConfig`. */
  metas_extras?: unknown;
}

/** Meta principal e degraus, já ordenados e sem zeros. */
interface MetaComDegraus {
  valor: number;
  extras: number[];
}

/** Formata "05/08 (Ter)" — o rótulo curto dos destaques. */
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

function rotuloDiaCurto(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  const d = new Date(ano, mes - 1, dia);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} (${DIAS_CURTOS[d.getDay()]})`;
}

/** "15/08/2026 às 14:32" — quando o relatório foi tirado. */
function carimboDeHora(): string {
  const agora = new Date();
  const data = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = agora.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
  return `${data} às ${hora}`;
}

/**
 * O escopo de um setor, montado fora do React.
 *
 * Espelha o `useEscopoAnalitico` — mesma decisão de carimbo × soma de usuários.
 * O que ele NÃO traz é a exclusão de origens (`analitico_exclusoes_setor`): o
 * relatório de fechamento é o retrato do que o RELATÓRIO trouxe para o setor, e
 * excluir origens é um ajuste de acompanhamento do mês corrente. Está nos
 * avisos quando houver diferença.
 */
function escopoDoSetor(params: {
  setorId: string;
  fontes: FontesDeEscopo;
  isPaguePlay: boolean;
  temCarimbo: boolean;
}): EscopoAnalitico {
  const { setorId, fontes, isPaguePlay, temCarimbo } = params;
  return escopoDeSetor({
    setorId,
    alternativo: setorSomaPorUsuarios({
      isPaguePlay,
      alternativo: fontes.setoresAlternativos.has(setorId),
    }),
    operadores: operadoresDoSetor(setorId, fontes),
    temCarimbo,
  });
}

/** As formas de pagamento viram fatias ordenadas, com % já calculada. */
function montarFormas(
  porForma: Record<string, { bruto: number; ho: number; qtd: number }>,
  total: number,
): FatiaForma[] {
  return Object.entries(porForma)
    .map(([rotulo, f]) => ({
      rotulo,
      bruto: f.bruto,
      ho: f.ho,
      qtd: f.qtd,
      pct: total > 0 ? Math.round((f.bruto / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.bruto - a.bruto);
}

/** O mês inteiro em dias, inclusive os zerados — o gráfico precisa da régua. */
function montarDias(
  porDia: Record<number, { bruto: number; ho: number; qtd: number }>,
  mes: string,
): PontoDia[] {
  const total = diasNoMes(mes);
  const saida: PontoDia[] = [];
  for (let dia = 1; dia <= total; dia++) {
    const d = porDia[dia];
    saida.push({ dia, bruto: d?.bruto ?? 0, ho: d?.ho ?? 0, qtd: d?.qtd ?? 0 });
  }
  return saida;
}

function melhorDiaDe(dias: PontoDia[]): PontoDia | null {
  let melhor: PontoDia | null = null;
  for (const d of dias) {
    if (d.bruto > 0 && (!melhor || d.bruto > melhor.bruto)) melhor = d;
  }
  return melhor;
}

/**
 * Metas do mês, indexadas por `tipo:referencia_id`.
 *
 * Traz também os degraus em cascata (`metas_extras`). Eles são degraus, não
 * alvos concorrentes: o percentual e o quartil continuam saindo da meta
 * principal, como na tela — ver `MetaProgressoHeader`.
 */
async function buscarMetasDoMes(
  empresaId: string, mes: string,
): Promise<Map<string, MetaComDegraus>> {
  const { ano, mes: mesNum } = partesDoMes(mes);
  const mapa = new Map<string, MetaComDegraus>();

  // `metas_extras` é da migration das metas em cascata. Um banco mais antigo
  // recusa a coluna, e aí o fallback pede só o que sempre existiu — perder os
  // degraus é aceitável; perder a meta inteira não é.
  let data: MetaLinha[] | null = null;
  const comExtras = await supabase
    .from('metas')
    .select('tipo, referencia_id, meta_valor, metas_extras')
    .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', ano);

  if (comExtras.error) {
    const semExtras = await supabase
      .from('metas')
      .select('tipo, referencia_id, meta_valor')
      .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', ano);
    if (semExtras.error) return mapa;
    data = semExtras.data as MetaLinha[] | null;
  } else {
    data = comExtras.data as MetaLinha[] | null;
  }

  for (const m of data ?? []) {
    const valor = Number(m.meta_valor) || 0;
    if (valor <= 0) continue;
    const extras = (Array.isArray(m.metas_extras) ? m.metas_extras : [])
      .map(e => Number(e) || 0)
      .filter(e => e > 0)
      .sort((a, b) => a - b);
    mapa.set(`${m.tipo}:${m.referencia_id}`, { valor, extras });
  }
  return mapa;
}

/** Só o valor da meta — a maioria dos usos não precisa dos degraus. */
function valorMeta(metas: Map<string, MetaComDegraus>, chave: string): number | null {
  return metas.get(chave)?.valor ?? null;
}

/**
 * A meta de um grupo: a própria quando existir, senão a soma das individuais.
 *
 * Mesma precedência de `usePainelMetas` e `useAnalytics`. Membro sem meta soma
 * zero — o recebimento dele continua contando, só a meta não.
 */
function metaDoGrupo(
  metas: Map<string, MetaComDegraus>,
  tipo: 'setor' | 'equipe',
  id: string | null,
  membros: Iterable<string>,
): number | null {
  if (id) {
    const propria = valorMeta(metas, `${tipo}:${id}`);
    if (propria && propria > 0) return propria;
  }
  let soma = 0;
  for (const m of membros) soma += valorMeta(metas, `operador:${m}`) ?? 0;
  return soma > 0 ? soma : null;
}

export async function montarFechamento(
  params: ParametrosFechamento,
): Promise<DadosFechamento> {
  const mes = normalizarMes(params.mes);
  const { ano, mes: mesNum } = partesDoMes(mes);
  const avisos: string[] = [];

  // ── 1. As bases: linhas do mês, quem é quem, metas e config ────────────────
  const [analitico, fontes, metas, cfg, perfisResp, setoresResp] = await Promise.all([
    buscarAnaliticoDashboardMes(params.empresaId, mes),
    buscarFontesDeEscopo(params.empresaId, mes),
    buscarMetasDoMes(params.empresaId, mes),
    getMetasConfig(params.empresaId, mesNum, ano),
    supabase.from('perfis')
      .select('id, nome, usuario, setor_id, equipe_id, situacao')
      .eq('empresa_id', params.empresaId),
    supabase.from('setores').select('id, nome').eq('empresa_id', params.empresaId),
  ]);

  const linhas = analitico.data;
  const config: MetasConfigMes | null = cfg.data;
  const quartisConfig: QuartilConfig[] = config?.quartis?.length ? config.quartis : QUARTIS_PADRAO;
  const feriados = config?.feriados ?? [];
  const temCarimbo = temCarimboDeSetor(linhas);

  const perfis = ((perfisResp.data as PerfilFechamento[] | null) ?? []);
  const perfilPorId = new Map(perfis.map(p => [p.id, p]));
  const setores = ((setoresResp.data as { id: string; nome: string }[] | null) ?? []);
  const nomeSetor = new Map(setores.map(s => [s.id, s.nome]));
  const nomeEquipe = new Map<string, string>();
  for (const [, info] of Object.entries(fontes.operadorEquipeMap)) {
    if (info.equipe_id) nomeEquipe.set(info.equipe_id, info.equipe_nome);
  }

  // ── 2. Dias úteis ──────────────────────────────────────────────────────────
  // Mês fechado não tem "hoje": todos os dias úteis já decorreram, e a projeção
  // vira o próprio realizado. Sem isto, baixar julho em agosto compararia o mês
  // inteiro contra o esperado de zero dias.
  const noMesAtual = ehMesAtual(mes);
  const diasUteisTotal = diasUteisDoMes(ano, mesNum, feriados);
  const diasUteisDecorridosMes = noMesAtual
    ? diasUteisDecorridos(ano, mesNum, feriados, getTodayISO(), undefined, config?.contar_dia_atual === true)
    : diasUteisTotal;

  // ── 3. O escopo principal do relatório ─────────────────────────────────────
  let escopo: EscopoAnalitico;
  let rotuloEscopo: string;
  let membrosDoEscopo: Set<string>;

  if (params.nivel === 'operador' && params.operadorId) {
    escopo = { tipo: 'operador', operadorId: params.operadorId };
    rotuloEscopo = params.operadorNome ?? perfilPorId.get(params.operadorId)?.nome ?? 'Operador';
    membrosDoEscopo = new Set([params.operadorId]);
  } else if (params.nivel === 'setor' && params.setorId) {
    escopo = escopoDoSetor({
      setorId: params.setorId, fontes, isPaguePlay: params.isPaguePlay, temCarimbo,
    });
    rotuloEscopo = `Setor ${nomeSetor.get(params.setorId) ?? '—'}`;
    membrosDoEscopo = operadoresDoSetor(params.setorId, fontes);
  } else {
    escopo = ESCOPO_EMPRESA;
    rotuloEscopo = params.empresaNome;
    membrosDoEscopo = new Set(Object.keys(fontes.operadorEquipeMap));
  }

  const agregado = agregarAnalitico(linhas, escopo);

  // ── 4. Meta e projeção do escopo ───────────────────────────────────────────
  const metaEscopo = params.nivel === 'operador' && params.operadorId
    ? valorMeta(metas, `operador:${params.operadorId}`)
    : params.nivel === 'setor'
      ? metaDoGrupo(metas, 'setor', params.setorId, membrosDoEscopo)
      : metaDoGrupo(metas, 'setor', null, membrosDoEscopo);

  /**
   * Degraus do ESCOPO.
   *
   * Só existem quando a meta do escopo é uma meta CADASTRADA (do operador ou
   * do grupo). Quando ela é a soma das individuais, somar também os degraus de
   * cada um produziria um "2º degrau" que ninguém definiu.
   */
  const metasExtrasEscopo = params.nivel === 'operador' && params.operadorId
    ? (metas.get(`operador:${params.operadorId}`)?.extras ?? [])
    : (params.setorId ? metas.get(`setor:${params.setorId}`)?.extras ?? [] : []);

  const projecaoEscopo = calcularProjecao({
    meta: metaEscopo,
    recebido: agregado.bruto,
    totalUteis: diasUteisTotal,
    decorridos: diasUteisDecorridosMes,
    quartis: quartisConfig,
  });

  // ── 5. Onda 2: o que enriquece o relatório, mas não pode derrubá-lo ────────
  //
  // Direto/Extra, Pix, mês anterior e as séries por operador rodam em paralelo
  // e TOLERAM falha: cada um que não vier some da página e vira uma observação.
  // Um fechamento sem a seção de Pix ainda é um fechamento; um botão que não
  // produz arquivo nenhum não é nada.

  const nomePorOperador = new Map<string, string>();
  for (const p of perfis) nomePorOperador.set(p.id, p.nome);
  const equipeDoOperador = new Map<string, string | null>();
  for (const [id, info] of Object.entries(fontes.operadorEquipeMap)) {
    equipeDoOperador.set(id, info.equipe_id);
  }
  const equipesDoEscopo = [...new Set(
    [...membrosDoEscopo]
      .map(id => fontes.operadorEquipeMap[id]?.equipe_id ?? null)
      .filter((e): e is string => !!e),
  )];

  const diasUteis = { total: diasUteisTotal, decorridos: diasUteisDecorridosMes };

  const [dxResp, pixResp, comparativoResp, seriesResp] = await Promise.allSettled([
    params.temLogicaDiretoExtra
      ? buscarDiretoExtraDoMes({ empresaId: params.empresaId, mes, escopo })
      : Promise.resolve(null),
    coletarPix({
      empresaId: params.empresaId, mes, nivel: params.nivel,
      setorId: params.setorId, operadorId: params.operadorId,
      nomePorOperador, nomePorEquipe: nomeEquipe, equipeDoOperador,
      equipesDoEscopo, diasUteis,
    }),
    coletarMesAnterior({
      empresaId: params.empresaId, mes, escopo,
      brutoAtual: agregado.bruto, qtdAtual: agregado.qtd,
      metaAnterior: null,
    }),
    coletarSeriesPorOperador({
      empresaId: params.empresaId, mes,
      operadorId: params.nivel === 'operador' ? params.operadorId : null,
      setorId: params.nivel === 'setor' ? params.setorId : null,
    }),
  ]);

  let vinculo: ResumoFechamento['vinculo'] = null;
  const dx = dxResp.status === 'fulfilled' ? dxResp.value : null;
  if (dx) {
    vinculo = {
      direto: dx.direto, extra: dx.extra, naoTabulado: dx.naoTabulado,
      qtdDireto: dx.qtdDireto, qtdExtra: dx.qtdExtra, qtdNaoTabulado: dx.qtdNaoTabulado,
    };
    // A ressalva mais importante do relatório. Sem ela, quem lê "Sem vínculo
    // definido: R$ 60.637,66" conclui que a equipe não tabulou nada — quando o
    // que houve foi relatório importado antes de a coluna "Tipo comissão"
    // existir. Ver `mapearTipoComissaoPorCodigo`.
    const totalClassificavel = dx.direto + dx.extra + dx.naoTabulado;
    if (totalClassificavel > 0 && dx.naoTabulado / totalClassificavel > 0.2) {
      const pct = Math.round((dx.naoTabulado / totalClassificavel) * 100);
      avisos.push(
        `${pct}% do recebido está sem classificação Direto/Extra. `
        + 'São linhas importadas antes de o relatório trazer a coluna "Tipo comissão" — '
        + 'reimportar o mês preenche a classificação e o número se move para os cards corretos.',
      );
    }
  } else if (params.temLogicaDiretoExtra) {
    avisos.push('A classificação Direto/Extra não pôde ser lida — a composição por vínculo ficou de fora deste relatório.');
  }

  const pix: BlocoPixFechamento | null =
    pixResp.status === 'fulfilled' ? pixResp.value : null;
  if (pixResp.status === 'rejected') {
    avisos.push('Os dados de Pix Automático não puderam ser lidos — a seção ficou de fora deste relatório.');
  }

  const comparativo: ComparativoMes | null =
    comparativoResp.status === 'fulfilled' ? comparativoResp.value : null;

  const series: Map<string, SerieOperador> =
    seriesResp.status === 'fulfilled' ? seriesResp.value : new Map();
  if (seriesResp.status === 'rejected') {
    avisos.push('O detalhamento diário por operador não pôde ser lido — as páginas individuais saíram sem o gráfico de ritmo.');
  }

  const porFormaTotal = montarFormas(agregado.porForma, agregado.bruto);
  const porDia = montarDias(agregado.porDia, mes);

  const resumo: ResumoFechamento = {
    rotulo: rotuloEscopo,
    totalBruto: agregado.bruto,
    totalHO: agregado.ho,
    qtdPagamentos: agregado.qtd,
    meta: metaEscopo,
    pctMeta: metaEscopo ? pctLimitado(agregado.bruto, metaEscopo) : 0,
    projecao: projecaoEscopo,
    porForma: porFormaTotal,
    porDia,
    melhorDia: melhorDiaDe(porDia),
    vinculo,
  };

  // ── 6. Detalhamento por operador ───────────────────────────────────────────
  // Sai da RPC de resumo, e não da agregação local: para o OPERADOR a RPC
  // devolve apenas as linhas dele (é SECURITY DEFINER e deriva o escopo de
  // auth.uid()), o que já é a regra "cada um só baixa o que é seu".
  const { data: resumoOperadores } = await buscarResumoOperadoresAnalitico(params.empresaId, mes);

  const linhaDeOperador = (r: {
    operador_id: string; operador_usuario: string; operador_nome: string | null;
    total_recebido: number; total_ho: number; total_pagamentos: number;
  }): LinhaOperadorFechamento => {
    const p = perfilPorId.get(r.operador_id);
    const doBanco = metas.get(`operador:${r.operador_id}`);
    const meta = doBanco?.valor ?? null;
    const metasExtras = doBanco?.extras ?? [];
    const bruto = Number(r.total_recebido) || 0;
    const proj = calcularProjecao({
      meta, recebido: bruto,
      totalUteis: diasUteisTotal, decorridos: diasUteisDecorridosMes,
      quartis: quartisConfig,
    });
    const info = fontes.operadorEquipeMap[r.operador_id];
    const serie = series.get(r.operador_id);
    // A meta principal conta como degrau: "2 de 3 batidas" inclui ela.
    const degraus = meta ? [meta, ...metasExtras] : [];

    return {
      id: r.operador_id,
      nome: r.operador_nome ?? p?.nome ?? r.operador_usuario,
      usuario: r.operador_usuario,
      setorNome: nomeSetor.get(info?.setor_id ?? p?.setor_id ?? '') ?? null,
      equipeNome: info?.equipe_nome ?? (p?.equipe_id ? nomeEquipe.get(p.equipe_id) ?? null : null),
      bruto,
      ho: Number(r.total_ho) || 0,
      qtd: Number(r.total_pagamentos) || 0,
      meta,
      pctMeta: meta ? pctLimitado(bruto, meta) : 0,
      projecaoPct: proj ? proj.projecaoPct : null,
      quartil: proj?.quartil?.quartil ?? null,
      diferenca: proj ? proj.diferenca : null,
      metasExtras,
      metasBatidas: degraus.filter(v => bruto >= v).length,
      porDia: serie?.porDia ?? [],
      porForma: serie?.porForma ?? [],
    };
  };

  /**
   * Quem entra na tabela de operadores.
   *
   * Nível operador leva só a própria linha — foi o pedido explícito: cada um
   * pode baixar como foi no mês, sem levar junto o número dos colegas. Nível
   * setor recorta pelos membros do setor; diretoria leva todo mundo.
   */
  const noEscopo = (id: string): boolean => {
    if (params.nivel === 'operador') return id === params.operadorId;
    if (params.nivel === 'setor') return membrosDoEscopo.has(id);
    return true;
  };

  const operadores = resumoOperadores
    .filter(r => noEscopo(r.operador_id))
    .map(linhaDeOperador)
    .filter(l => l.bruto > 0 || l.meta !== null)
    .sort((a, b) => b.bruto - a.bruto);

  const ranking = [...operadores];

  // ── 7. Quartis ─────────────────────────────────────────────────────────────
  // Cada operador cai na faixa que a projeção dele alcança. Quem não tem meta
  // fica de fora: sem meta não existe projeção, e empilhá-lo no pior quartil
  // seria acusar de resultado ruim quem nunca teve alvo.
  const quartis: FaixaQuartilFechamento[] = ordenarQuartis(quartisConfig).map(faixa => ({
    faixa,
    operadores: operadores.filter(o =>
      o.projecaoPct !== null
      && quartilAtual(o.projecaoPct, quartisConfig)?.quartil === faixa.quartil),
  }));

  // ── 8. Comparativo entre setores (só diretoria) ────────────────────────────
  const linhasSetores: LinhaSetorFechamento[] = [];
  if (params.nivel === 'diretoria') {
    const totalEmpresa = agregado.bruto;
    for (const s of setores) {
      const escopoSetor = escopoDoSetor({
        setorId: s.id, fontes, isPaguePlay: params.isPaguePlay, temCarimbo,
      });
      const agg = agregarAnalitico(linhas, escopoSetor);
      const membros = operadoresDoSetor(s.id, fontes);
      const metaSetor = metaDoGrupo(metas, 'setor', s.id, membros);
      // Setor sem movimento E sem meta não vira linha: a tabela da diretoria
      // ficaria cheia de zeros de setores que não operam mais.
      if (agg.bruto <= 0 && metaSetor === null) continue;
      linhasSetores.push({
        id: s.id,
        nome: s.nome,
        bruto: agg.bruto,
        ho: agg.ho,
        qtd: agg.qtd,
        meta: metaSetor,
        pctMeta: metaSetor ? pctLimitado(agg.bruto, metaSetor) : 0,
        operadores: membros.size,
        pctDaEmpresa: totalEmpresa > 0
          ? Math.round((agg.bruto / totalEmpresa) * 1000) / 10
          : 0,
      });
    }
    linhasSetores.sort((a, b) => b.bruto - a.bruto);
  }

  // ── 9. Destaques do dia ────────────────────────────────────────────────────
  // A RPC já recorta por setor quando informado. No nível operador não faz
  // sentido: "quem mais recebeu no dia" é comparação entre pessoas.
  let destaques: DestaqueDiaFechamento[] = [];
  if (params.nivel !== 'operador') {
    const { data: dest } = await buscarDestaquesDoMes(
      params.empresaId, mes, null, params.nivel === 'setor' ? params.setorId : null,
    );
    destaques = dest.map(d => ({
      dia: d.dia,
      diaRotulo: rotuloDiaCurto(d.dia),
      nome: d.operador_nome ?? d.operador_usuario,
      total: Number(d.total_recebido) || 0,
      pagamentos: Number(d.total_pagamentos) || 0,
    }));
  }

  // ── 10. Avisos ─────────────────────────────────────────────────────────────
  if (!analitico.dbAtiva) {
    avisos.push('O relatório analítico não está disponível neste banco — os valores podem estar incompletos.');
  }
  if (!linhas.length) {
    avisos.push('Nenhum recebimento importado neste mês. Os totais estão zerados por falta de relatório, não por falta de resultado.');
  }
  if (metaEscopo === null) {
    avisos.push('Sem meta cadastrada para este escopo no mês — projeção, quartil e % da meta não aparecem.');
  }
  if (noMesAtual) {
    avisos.push(`${rotuloDoMes(mes)} ainda está aberto: este é um retrato parcial, tirado em ${carimboDeHora()}.`);
  }
  if (!config) {
    avisos.push('Feriados e quartis não foram configurados para o mês — a contagem de dias úteis usou apenas segunda a sexta.');
  }

  // ── 11. Curiosidades ───────────────────────────────────────────────────────
  // Derivadas do que já foi coletado. Cada uma se omite quando falta base.
  const curiosidades = montarCuriosidades({
    porDia,
    porForma: porFormaTotal,
    totalBruto: agregado.bruto,
    metaDiaria: projecaoEscopo?.metaDiaria ?? null,
    operadores,
    comparativo,
  });

  return {
    alvo: {
      nivel: params.nivel,
      empresaNome: params.empresaNome,
      mes,
      mesRotulo: rotuloDoMes(mes),
      setorNome: params.setorId ? nomeSetor.get(params.setorId) ?? null : null,
      operadorNome: params.nivel === 'operador' ? rotuloEscopo : null,
      geradoPor: params.geradoPor,
      geradoEm: carimboDeHora(),
      mesFechado: mesFechado(mes),
    },
    diasUteis,
    quartisConfig,
    resumo,
    // O nível operador leva a PRÓPRIA linha — é ela que vira a página
    // individual dele. A tabela comparativa de operadores não é renderizada
    // nesse nível; quem decide isso é `montarSecoes`, no gerador de HTML.
    operadores,
    ranking,
    quartis,
    setores: linhasSetores,
    destaques,
    pix,
    comparativo,
    curiosidades,
    operadoresSemPagina: Math.max(operadores.length - TETO_PAGINAS_INDIVIDUAIS, 0),
    metasExtrasEscopo,
    avisos,
  };
}
