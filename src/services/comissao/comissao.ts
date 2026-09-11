/**
 * comissao.ts — a comissão por faixa de meta.
 *
 * ## A regra
 *
 * Cada operador tem degraus de meta no mês: a 1ª Meta é `metas.meta_valor`, e da
 * 2ª em diante são as `metas_extras`. A configuração do mês (padrão do setor ou
 * exceção da equipe) diz o percentual de cada posição. Então:
 *
 *   comissão da faixa = valor da meta × % ÷ 100, em centavos
 *
 * e vale a MAIOR faixa atingida — as faixas não somam.
 *
 * ## Por que o valor da faixa vem das metas
 *
 * A tela de Metas já guarda, por operador e por mês, a meta e os degraus. Uma
 * segunda «1ª Meta» na configuração de comissão seria outro número para a mesma
 * pergunta. Aqui a configuração guarda só o que só ela sabe: os percentuais.
 *
 * ## O benefício do setor
 *
 * Existe quando a linha do SETOR tem regra (`percentual_especial` ou
 * `multiplicador`) E a liderança confirmou que o setor bateu a meta. A
 * confirmação é manual de propósito: o operador não enxerga o acumulado do setor,
 * e reescrever essa regra fora do card de Desempenho Equipes criaria duas
 * respostas. Vale na direta e na indireta.
 *
 * ## Unidade
 *
 * Quem chama passa `fatorUnidade`: 1 na BookPlay (bruto), 0,2496 na PaguePlay
 * (H.O.). As metas e o recebido indireto chegam em bruto e são convertidos aqui;
 * o recebido direto já chega na unidade, porque o H.O. do analítico vem linha a
 * linha do relatório e não da conversão.
 *
 * Sem React, sem fetch. Os casos estão em `comissao.test.ts`.
 */

export type ModoIndireta = 'junto' | 'separado';
export type RegraSetor = 'nenhuma' | 'percentual_especial' | 'multiplicador';

export interface FaixaConfig {
  /** 1 = 1ª Meta. */
  ordem: number;
  pct: number;
  /** % quando o setor bate a meta. `null` = usa o `pct`. */
  pctEspecial: number | null;
}

/** Uma configuração do mês: o padrão do setor (`equipeId` nulo) ou a exceção de uma equipe. */
export interface ConfigComissao {
  id: string;
  empresaId: string;
  setorId: string;
  equipeId: string | null;
  ano: number;
  mes: number;
  modoIndireta: ModoIndireta;
  pctIndireta: number | null;
  pctIndiretaEspecial: number | null;
  /** Só a linha do setor carrega regra; a exceção sempre vem `nenhuma`. */
  regraSetor: RegraSetor;
  multiplicador: number | null;
  setorMetaConfirmadaEm: string | null;
  setorMetaConfirmadaPor: string | null;
  setorMetaConfirmadaPorNome: string | null;
  faixas: FaixaConfig[];
}

/**
 * A configuração que vale para um operador, e a linha do setor dele.
 *
 * `setorId` e `equipeId` são os de ORIGEM — o clone é calculado pelo usuário
 * original, nunca pela equipe que o tomou emprestado.
 */
export function configDoOperador(params: {
  configs: readonly ConfigComissao[];
  setorId: string | null;
  equipeId: string | null;
}): { config: ConfigComissao | null; doSetor: ConfigComissao | null } {
  const { configs, setorId, equipeId } = params;
  if (!setorId) return { config: null, doSetor: null };

  const doSetor = configs.find(c => c.setorId === setorId && c.equipeId === null) ?? null;
  const excecao = equipeId
    ? configs.find(c => c.setorId === setorId && c.equipeId === equipeId) ?? null
    : null;

  return { config: excecao ?? doSetor, doSetor };
}

export interface EntradaComissao {
  /** `metas.meta_valor`, em BRUTO. `null`/0 = sem meta. */
  metaBruta: number | null;
  /** `metas.metas_extras`, em BRUTO, na ordem em que foram gravadas. */
  metasExtrasBrutas: readonly number[];
  /** Meta indireta ligada, em BRUTO. `null` = desligada. */
  metaIndiretaBruta: number | null;
  /** Recebido direto já na unidade da comissão (BookPlay: bruto; PaguePlay: H.O.). */
  recebidoDireto: number;
  /** Recebido indireto (acordos extra pagos), em BRUTO. */
  recebidoIndiretoBruto: number;
  /** 1 na BookPlay; `PP_HO_PERCENTUAL` na PaguePlay. */
  fatorUnidade: number;
  /** A configuração que vale — ver `configDoOperador`. */
  config: ConfigComissao | null;
  /** A linha do setor: dona da regra e da confirmação. */
  doSetor: ConfigComissao | null;
}

export type SituacaoFaixa = 'atingida' | 'atual' | 'proxima' | 'nao_atingida';

export interface FaixaComissao {
  ordem: number;
  /** Valor da meta, na unidade da comissão. */
  meta: number;
  /** % configurado no mês. `null` = faixa sem % neste mês. */
  pctNormal: number | null;
  /** % que vale agora — com o benefício, quando ativo. */
  pctEfetivo: number | null;
  comissaoNormal: number | null;
  comissao: number | null;
  situacao: SituacaoFaixa;
  atingida: boolean;
  /** Quanto falta. `null` quando já atingida. */
  falta: number | null;
}

export interface IndiretaComissao {
  meta: number;
  recebido: number;
  atingida: boolean;
  falta: number | null;
  pctNormal: number | null;
  pctEfetivo: number | null;
  /** O que a indireta paga ao ser atingida, sem e com o benefício. */
  valorNormal: number | null;
  valor: number | null;
  /** O que ela soma agora: o valor quando atingida, zero antes disso. */
  comissaoNormal: number;
  comissao: number;
}

export type MotivoSemComissao = 'sem_meta' | 'sem_config' | 'nenhuma_faixa';

export interface ResultadoComissao {
  /** Por que não há faixa atual. `null` = há. */
  motivo: MotivoSemComissao | null;
  /** `null` quando o operador não tem meta indireta ligada. */
  modoIndireta: ModoIndireta | null;
  /** O recebido que as faixas medem (no modo `junto`, direto + indireto). */
  recebido: number;
  faixas: FaixaComissao[];
  atual: FaixaComissao | null;
  proxima: FaixaComissao | null;
  /** Só no modo `separado`. */
  indireta: IndiretaComissao | null;
  regraSetor: RegraSetor;
  multiplicador: number | null;
  temRegraSetor: boolean;
  beneficioAtivo: boolean;
  confirmadaEm: string | null;
  confirmadaPorNome: string | null;
  /** Faixa atual + indireta. */
  total: number;
  /** O mesmo total sem o benefício — o «anterior» da tela. */
  totalNormal: number;
}

/** Centavos inteiros: a unidade em que se compara e se arredonda. */
function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

function arredondar(valor: number): number {
  return emCentavos(valor) / 100;
}

/**
 * Meta × %, em reais, arredondado em centavos.
 *
 * `meta × pct` já é o valor em centavos (`meta × pct ÷ 100 × 100`), então o
 * arredondamento acontece uma vez só, sobre o número que vira dinheiro.
 */
function comissaoDe(meta: number, pct: number | null): number | null {
  if (pct === null) return null;
  return Math.round(meta * pct) / 100;
}

interface Beneficio {
  ativo: boolean;
  regra: RegraSetor;
  multiplicador: number | null;
}

function percentualEfetivo(pct: number | null, pctEspecial: number | null, b: Beneficio): number | null {
  if (pct === null) return null;
  if (!b.ativo) return pct;
  if (b.regra === 'percentual_especial') return pctEspecial ?? pct;
  if (b.regra === 'multiplicador' && b.multiplicador !== null) return pct * b.multiplicador;
  return pct;
}

export function calcularComissao(entrada: EntradaComissao): ResultadoComissao {
  const { config, doSetor, fatorUnidade } = entrada;

  const regraSetor: RegraSetor = doSetor?.regraSetor ?? 'nenhuma';
  const multiplicador = doSetor?.multiplicador ?? null;
  const temRegraSetor = regraSetor !== 'nenhuma';
  const confirmadaEm = doSetor?.setorMetaConfirmadaEm ?? null;
  const beneficioAtivo = temRegraSetor && confirmadaEm !== null
    && (regraSetor !== 'multiplicador' || (multiplicador !== null && multiplicador > 0));

  const doCabecalho = {
    regraSetor,
    multiplicador,
    temRegraSetor,
    beneficioAtivo,
    confirmadaEm,
    confirmadaPorNome: doSetor?.setorMetaConfirmadaPorNome ?? null,
  };

  const semComissao = (motivo: MotivoSemComissao): ResultadoComissao => ({
    motivo,
    modoIndireta: null,
    recebido: arredondar(Number(entrada.recebidoDireto) || 0),
    faixas: [],
    atual: null,
    proxima: null,
    indireta: null,
    ...doCabecalho,
    total: 0,
    totalNormal: 0,
  });

  const metaBruta = Number(entrada.metaBruta) || 0;
  if (metaBruta <= 0) return semComissao('sem_meta');
  if (!config) return semComissao('sem_config');

  const beneficio: Beneficio = { ativo: beneficioAtivo, regra: regraSetor, multiplicador };

  // ── A frente indireta decide o que as faixas medem ─────────────────────────
  const metaIndiretaBruta = Number(entrada.metaIndiretaBruta) || 0;
  const modoIndireta: ModoIndireta | null = metaIndiretaBruta > 0 ? config.modoIndireta : null;
  const recebidoIndireto = arredondar((Number(entrada.recebidoIndiretoBruto) || 0) * fatorUnidade);
  const recebidoDireto = Number(entrada.recebidoDireto) || 0;
  const recebido = arredondar(
    modoIndireta === 'junto' ? recebidoDireto + recebidoIndireto : recebidoDireto,
  );

  // ── Degraus ───────────────────────────────────────────────────────────────
  const primeira = metaBruta + (modoIndireta === 'junto' ? metaIndiretaBruta : 0);
  const extras = entrada.metasExtrasBrutas
    .map(v => Number(v) || 0)
    .filter(v => v > 0);
  const degraus = [primeira, ...extras]
    .map(v => arredondar(v * fatorUnidade))
    .sort((a, b) => a - b);

  const faixaDaOrdem = new Map(config.faixas.map(f => [f.ordem, f]));

  const calculadas = degraus.map((meta, i) => {
    const ordem = i + 1;
    const cfg = faixaDaOrdem.get(ordem);
    const pctNormal = cfg ? cfg.pct : null;
    const pctEfetivo = percentualEfetivo(pctNormal, cfg?.pctEspecial ?? null, beneficio);
    const atingida = emCentavos(recebido) >= emCentavos(meta);
    return {
      ordem,
      meta,
      pctNormal,
      pctEfetivo,
      comissaoNormal: comissaoDe(meta, pctNormal),
      comissao: comissaoDe(meta, pctEfetivo),
      atingida,
      falta: atingida ? null : arredondar(meta - recebido),
    };
  });

  // A maior faixa atingida QUE TEM percentual: faixa sem % no mês não paga, e
  // não pode esconder a comissão da anterior.
  let indiceAtual = -1;
  calculadas.forEach((f, i) => { if (f.atingida && f.pctNormal !== null) indiceAtual = i; });
  const indiceProxima = calculadas.findIndex(f => !f.atingida);

  const faixas: FaixaComissao[] = calculadas.map((f, i) => ({
    ...f,
    situacao: i === indiceAtual ? 'atual'
      : f.atingida ? 'atingida'
      : i === indiceProxima ? 'proxima'
      : 'nao_atingida',
  }));
  const atual = indiceAtual >= 0 ? faixas[indiceAtual] : null;
  const proxima = indiceProxima >= 0 ? faixas[indiceProxima] : null;

  // ── Indireta à parte (modo separado) ───────────────────────────────────────
  let indireta: IndiretaComissao | null = null;
  if (modoIndireta === 'separado') {
    const meta = arredondar(metaIndiretaBruta * fatorUnidade);
    const atingida = emCentavos(recebidoIndireto) >= emCentavos(meta);
    const pctNormal = config.pctIndireta;
    const pctEfetivo = percentualEfetivo(pctNormal, config.pctIndiretaEspecial, beneficio);
    const valorNormal = comissaoDe(meta, pctNormal);
    const valor = comissaoDe(meta, pctEfetivo);
    indireta = {
      meta,
      recebido: recebidoIndireto,
      atingida,
      falta: atingida ? null : arredondar(meta - recebidoIndireto),
      pctNormal,
      pctEfetivo,
      valorNormal,
      valor,
      comissaoNormal: atingida ? (valorNormal ?? 0) : 0,
      comissao: atingida ? (valor ?? 0) : 0,
    };
  }

  return {
    motivo: atual ? null : 'nenhuma_faixa',
    modoIndireta,
    recebido,
    faixas,
    atual,
    proxima,
    indireta,
    ...doCabecalho,
    total: arredondar((atual?.comissao ?? 0) + (indireta?.comissao ?? 0)),
    totalNormal: arredondar((atual?.comissaoNormal ?? 0) + (indireta?.comissaoNormal ?? 0)),
  };
}
