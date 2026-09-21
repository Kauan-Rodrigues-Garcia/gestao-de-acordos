/**
 * vendasRelatorio.ts — tudo o que o relatório de prospecção traz, fatiado.
 *
 * ## Para que serve
 *
 * A importação só mostrava cinco números (mês, linhas, na régua, faturamento,
 * franquias). O arquivo traz ~30 colunas por venda — vendedor, franquia,
 * estado, forma de recebimento, produto, categoria, parcelas, motivo e setor
 * do cancelamento, lead, score, SPC — e a liderança pedia para «saber tudo
 * que está no relatório, igual o Painel Diretoria da BookPlay». Este arquivo
 * faz as contas; `RaioXDoRelatorio` desenha.
 *
 * ## A mesma função serve o arquivo e o banco
 *
 * A linha do parser (`LinhaProspeccao`, `LinhaSetor`) e a linha gravada em
 * `vendas_relatorio` têm os mesmos nomes de coluna. `LinhaDoRelatorio` é o
 * que as três têm em comum, com o que falta a alguma delas opcional. Assim a
 * prévia do arquivo, ANTES de gravar, e o relatório do mês, DEPOIS, contam
 * igual — não há duas contas para divergir.
 *
 * ## A régua é a mesma de sempre
 *
 * «Na régua» é `contaNaMeta` (confirmada E assinada), de `@/lib/vendas`. O
 * faturamento bruto aparece ao lado, com nome próprio, e nunca no lugar dela.
 *
 * ## Nada aqui soma recebimento como faturamento
 *
 * `valor_recebido` é quanto entrou; `valor_total` é quanto se vendeu. As
 * fatias carregam os dois, separados.
 */
import {
  classificarVenda, contaNaMeta,
  type GavetaVenda, type SituacaoVenda,
} from './vendas';
import { normalizarTexto } from './vendasLista';

/** O que o parser do geral, o do setor e `vendas_relatorio` têm em comum. */
export interface LinhaDoRelatorio {
  nr_documento: string;
  cliente?: string | null;
  data_venda: string;
  data_confirmacao: string | null;
  codigo_franquia?: string | null;
  franquia?: string | null;
  uf?: string | null;
  nome_vendedor?: string | null;
  login_vendedor?: string | null;
  situacao: SituacaoVenda;
  contrato_assinado: boolean;
  valor_total: number;
  qtde_parcela?: number | null;
  valor_parcela?: number | null;
  valor_recebido: number;
  valor_entrada?: number | null;
  tipo_recebimento?: string | null;
  tipo_documento?: string | null;
  produto?: string | null;
  categoria?: string | null;
  tipo_venda?: string | null;
  tipo_produto?: string | null;
  data_cancelamento?: string | null;
  data_devolucao?: string | null;
  motivo?: string | null;
  setor_cancelamento?: string | null;
  veio_de_lead?: boolean | null;
  score_classe?: string | null;
  spc_serasa?: string | null;
}

/** Uma fatia de qualquer recorte: vendedor, franquia, estado, produto… */
export interface Fatia {
  chave: string;
  rotulo: string;
  /** Texto de apoio (o login do vendedor, o código da franquia). */
  detalhe?: string;
  linhas: number;
  faturamento: number;
  naRegua: number;
  valorNaRegua: number;
  recebido: number;
  devolvidas: number;
  canceladas: number;
  /** Confirmadas sem assinatura. */
  semAssinatura: number;
}

export interface PontoDiario {
  /** 'yyyy-MM-dd' */
  dia: string;
  linhas: number;
  naRegua: number;
  valorNaRegua: number;
  faturamento: number;
}

export interface MotivoDePerda {
  motivo: string;
  canceladas: number;
  devolvidas: number;
  valor: number;
}

export interface RaioX {
  linhas: number;
  faturamento: number;
  naRegua: number;
  valorNaRegua: number;
  recebido: number;
  /** Entrada somada, e em quantas linhas ela veio. */
  entrada: number;
  comEntrada: number;
  /** Faturamento na régua ÷ vendas na régua. `null` sem venda na régua. */
  ticketMedio: number | null;
  porGaveta: Record<GavetaVenda, { linhas: number; valor: number }>;
  /** Sobre o que chegou a ser confirmado — mesmo denominador de `resumirVendas`. */
  pctDevolucao: number | null;
  pctCancelamento: number | null;
  /** Linhas que vieram de lead ÷ todas. `null` quando o arquivo não traz a coluna. */
  pctLead: number | null;
  /** Média de dias entre a venda e a confirmação, nas que têm as duas datas. */
  diasAteConfirmar: number | null;
  vendedores: Fatia[];
  franquias: Fatia[];
  estados: Fatia[];
  formas: Fatia[];
  produtos: Fatia[];
  categorias: Fatia[];
  tiposVenda: Fatia[];
  tiposProduto: Fatia[];
  documentos: Fatia[];
  parcelas: Fatia[];
  scores: Fatia[];
  spc: Fatia[];
  lead: Fatia[];
  setoresCancelamento: Fatia[];
  motivos: MotivoDePerda[];
  /** Pelo dia da confirmação; a linha sem confirmação cai no dia da venda. */
  porDia: PontoDiario[];
}

const SEM = '(não informado)';

function texto(v: string | null | undefined): string {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t || SEM;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dia(v: string | null | undefined): string {
  return String(v ?? '').slice(0, 10);
}

function fatiaVazia(chave: string, rotulo: string, detalhe?: string): Fatia {
  return {
    chave, rotulo, detalhe,
    linhas: 0, faturamento: 0, naRegua: 0, valorNaRegua: 0, recebido: 0,
    devolvidas: 0, canceladas: 0, semAssinatura: 0,
  };
}

function somar(f: Fatia, l: LinhaDoRelatorio): void {
  const total = num(l.valor_total);
  f.linhas += 1;
  f.faturamento += total;
  f.recebido += num(l.valor_recebido);
  if (contaNaMeta(l)) { f.naRegua += 1; f.valorNaRegua += total; }
  const g = classificarVenda(l);
  if (g === 'devolvida') f.devolvidas += 1;
  if (g === 'cancelada') f.canceladas += 1;
  if (g === 'pendente_assinatura') f.semAssinatura += 1;
}

/**
 * Agrupa por uma chave, somando cada fatia numa passada só.
 *
 * Ordena por faturamento na régua, depois bruto, depois nome — o que mais
 * vale primeiro, e empate com ordem estável.
 */
export function fatiarPor(
  linhas: readonly LinhaDoRelatorio[],
  chaveDe: (l: LinhaDoRelatorio) => { chave: string; rotulo: string; detalhe?: string },
): Fatia[] {
  const mapa = new Map<string, Fatia>();
  for (const l of linhas) {
    const { chave, rotulo, detalhe } = chaveDe(l);
    let f = mapa.get(chave);
    if (!f) { f = fatiaVazia(chave, rotulo, detalhe); mapa.set(chave, f); }
    somar(f, l);
  }
  return [...mapa.values()].sort((a, b) =>
    b.valorNaRegua - a.valorNaRegua
    || b.faturamento - a.faturamento
    || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** Faixa de parcelas: o que a liderança pergunta é «à vista ou parcelado longo?». */
export function faixaDeParcelas(qtde: number | null | undefined): { chave: string; rotulo: string } {
  const q = num(qtde);
  if (q <= 0) return { chave: '0', rotulo: SEM };
  if (q === 1) return { chave: '1', rotulo: 'À vista (1x)' };
  if (q <= 6) return { chave: '2-6', rotulo: '2 a 6x' };
  if (q <= 12) return { chave: '7-12', rotulo: '7 a 12x' };
  if (q <= 24) return { chave: '13-24', rotulo: '13 a 24x' };
  return { chave: '25+', rotulo: '25x ou mais' };
}

function dataUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function raioXDoRelatorio(linhas: readonly LinhaDoRelatorio[]): RaioX {
  const porGaveta: RaioX['porGaveta'] = {
    na_meta: { linhas: 0, valor: 0 },
    pendente_assinatura: { linhas: 0, valor: 0 },
    aberta: { linhas: 0, valor: 0 },
    devolvida: { linhas: 0, valor: 0 },
    cancelada: { linhas: 0, valor: 0 },
  };
  let faturamento = 0, recebido = 0, entrada = 0, comEntrada = 0;
  let naRegua = 0, valorNaRegua = 0;
  let comLeadInformado = 0, deLead = 0;
  let somaDias = 0, comDuasDatas = 0;
  const motivos = new Map<string, MotivoDePerda>();
  const dias = new Map<string, PontoDiario>();

  for (const l of linhas) {
    const total = num(l.valor_total);
    const g = classificarVenda(l);
    porGaveta[g].linhas += 1;
    porGaveta[g].valor += total;
    faturamento += total;
    recebido += num(l.valor_recebido);
    const ent = num(l.valor_entrada);
    if (ent > 0) { entrada += ent; comEntrada += 1; }
    if (g === 'na_meta') { naRegua += 1; valorNaRegua += total; }

    if (l.veio_de_lead !== undefined && l.veio_de_lead !== null) {
      comLeadInformado += 1;
      if (l.veio_de_lead) deLead += 1;
    }

    const dv = dataUtc(dia(l.data_venda));
    const dc = l.data_confirmacao ? dataUtc(dia(l.data_confirmacao)) : null;
    if (dv !== null && dc !== null && dc >= dv) {
      somaDias += (dc - dv) / 86_400_000;
      comDuasDatas += 1;
    }

    if (g === 'devolvida' || g === 'cancelada') {
      const chave = texto(l.motivo);
      let m = motivos.get(chave);
      if (!m) { m = { motivo: chave, canceladas: 0, devolvidas: 0, valor: 0 }; motivos.set(chave, m); }
      if (g === 'devolvida') m.devolvidas += 1; else m.canceladas += 1;
      m.valor += total;
    }

    const d = dia(l.data_confirmacao || l.data_venda);
    if (d) {
      let p = dias.get(d);
      if (!p) { p = { dia: d, linhas: 0, naRegua: 0, valorNaRegua: 0, faturamento: 0 }; dias.set(d, p); }
      p.linhas += 1;
      p.faturamento += total;
      if (g === 'na_meta') { p.naRegua += 1; p.valorNaRegua += total; }
    }
  }

  const base = porGaveta.na_meta.linhas + porGaveta.pendente_assinatura.linhas
             + porGaveta.devolvida.linhas + porGaveta.cancelada.linhas;

  const perdas = linhas.filter(l => {
    const g = classificarVenda(l);
    return g === 'devolvida' || g === 'cancelada';
  });

  return {
    linhas: linhas.length,
    faturamento, naRegua, valorNaRegua, recebido, entrada, comEntrada,
    ticketMedio: naRegua > 0 ? valorNaRegua / naRegua : null,
    porGaveta,
    pctDevolucao:    base > 0 ? porGaveta.devolvida.linhas / base : null,
    pctCancelamento: base > 0 ? porGaveta.cancelada.linhas / base : null,
    pctLead: comLeadInformado > 0 ? deLead / comLeadInformado : null,
    diasAteConfirmar: comDuasDatas > 0 ? somaDias / comDuasDatas : null,

    vendedores: fatiarPor(linhas, l => {
      const login = String(l.login_vendedor ?? '').trim().toLowerCase();
      const nome = String(l.nome_vendedor ?? '').trim();
      return { chave: login || nome.toLowerCase() || SEM, rotulo: nome || login || SEM, detalhe: login || undefined };
    }),
    franquias: fatiarPor(linhas, l => {
      const codigo = String(l.codigo_franquia ?? '').trim();
      const nome = texto(l.franquia);
      return { chave: codigo || nome, rotulo: nome, detalhe: codigo || undefined };
    }),
    estados:      fatiarPor(linhas, l => { const t = texto(l.uf).toUpperCase(); return { chave: t, rotulo: t === SEM.toUpperCase() ? SEM : t }; }),
    formas:       fatiarPor(linhas, l => { const t = texto(l.tipo_recebimento); return { chave: t, rotulo: t }; }),
    produtos:     fatiarPor(linhas, l => { const t = texto(l.produto); return { chave: t, rotulo: t }; }),
    categorias:   fatiarPor(linhas, l => { const t = texto(l.categoria); return { chave: t, rotulo: t }; }),
    tiposVenda:   fatiarPor(linhas, l => { const t = texto(l.tipo_venda); return { chave: t, rotulo: t }; }),
    tiposProduto: fatiarPor(linhas, l => { const t = texto(l.tipo_produto); return { chave: t, rotulo: t }; }),
    documentos:   fatiarPor(linhas, l => { const t = texto(l.tipo_documento); return { chave: t, rotulo: t }; }),
    parcelas:     fatiarPor(linhas, l => faixaDeParcelas(l.qtde_parcela)),
    scores:       fatiarPor(linhas, l => { const t = texto(l.score_classe); return { chave: t, rotulo: t }; }),
    spc:          fatiarPor(linhas, l => { const t = texto(l.spc_serasa); return { chave: t, rotulo: t }; }),
    lead: fatiarPor(linhas, l => (
      l.veio_de_lead === true ? { chave: 'sim', rotulo: 'Veio de lead' }
      : l.veio_de_lead === false ? { chave: 'nao', rotulo: 'Prospecção própria' }
      : { chave: '?', rotulo: SEM }
    )),
    setoresCancelamento: fatiarPor(perdas, l => { const t = texto(l.setor_cancelamento); return { chave: t, rotulo: t }; }),
    motivos: [...motivos.values()].sort((a, b) =>
      (b.canceladas + b.devolvidas) - (a.canceladas + a.devolvidas) || b.valor - a.valor),
    porDia: [...dias.values()].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0)),
  };
}

/** A fatia só tem o «não informado»? Então o arquivo não traz a coluna. */
export function soNaoInformado(fatias: readonly Fatia[]): boolean {
  return fatias.length === 0 || (fatias.length === 1 && fatias[0].rotulo === SEM);
}

export const ROTULO_NAO_INFORMADO = SEM;

/* ── Franquia → setor ─────────────────────────────────────────────────────── */

/** A chave de nome no mapa de setores — ver `mapaDeSetorDaFranquia`. */
export function chaveDoNomeDaFranquia(nome: string | null | undefined): string {
  return `nome:${normalizarTexto(nome)}`;
}

/**
 * Franquia → setor, pelo código E pelo nome.
 *
 * O relatório geral traz o código; a prévia do setor, só o nome. As duas
 * chaves no mesmo mapa deixam o raio-x casar qualquer um dos dois arquivos.
 */
export function mapaDeSetorDaFranquia(
  franquias: readonly { codigo: string; nome: string | null; estado: string; setores?: { nome: string } | null }[],
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const f of franquias) {
    if (f.estado !== 'vinculado' || !f.setores?.nome) continue;
    mapa.set(f.codigo, f.setores.nome);
    if (f.nome) mapa.set(chaveDoNomeDaFranquia(f.nome), f.setores.nome);
  }
  return mapa;
}
