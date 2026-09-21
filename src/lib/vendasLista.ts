/**
 * vendasLista.ts — o que a lista da aba Vendas precisa decidir, sem tela.
 *
 * ## O status da LINHA não é a gaveta da régua
 *
 * `classificarVenda` responde «em que gaveta do placar esta venda cai», e
 * aberta é aberta. A lista precisa de uma pergunta a mais: **quem vai mexer
 * nela agora?** Uma venda aberta que o operador acabou de lançar está
 * esperando o relatório — quando o NR aparecer na importação do geral, a
 * projeção preenche situação, assinatura, estado e forma de pagamento sozinha
 * (`fn_vendas_projetar` casa pelo NR). Uma aberta que veio da prévia do setor
 * é outra coisa: o ERP já a conhece, e ela ainda não foi confirmada lá.
 *
 * Por isso `statusDaLinha` separa `aguardando_relatorio` de `em_aberto`. É o
 * que deixa o cadastro ser curto: o operador digita NR e valor, e a tela diz
 * em voz alta que o resto chega pelo relatório.
 *
 * ## A régua continua sendo a de `@/lib/vendas`
 *
 * Nada aqui reimplementa «confirmada E assinada». O status parte da gaveta.
 */
import { classificarVenda, type OrigemVenda, type VendaClassificavel } from './vendas';

/* ── Status da linha ──────────────────────────────────────────────────────── */

export type StatusDaLinha =
  | 'na_meta'
  | 'falta_assinatura'
  | 'aguardando_relatorio'
  | 'em_aberto'
  | 'devolvida'
  | 'cancelada';

export interface VendaComOrigem extends VendaClassificavel {
  origem: OrigemVenda;
}

export function statusDaLinha(venda: VendaComOrigem): StatusDaLinha {
  const gaveta = classificarVenda(venda);
  switch (gaveta) {
    case 'aberta':
      return venda.origem === 'manual' ? 'aguardando_relatorio' : 'em_aberto';
    case 'pendente_assinatura':
      return 'falta_assinatura';
    default:
      return gaveta;
  }
}

export interface DescricaoDoStatus {
  rotulo: string;
  /** A frase do `title` — o que acontece a seguir com esta venda. */
  dica: string;
  /** Pílula nos tokens do tema, no mesmo desenho do status do acordo. */
  classe: string;
  /** Ponto colorido da legenda. */
  ponto: string;
}

export const STATUS_DA_LINHA: Record<StatusDaLinha, DescricaoDoStatus> = {
  na_meta: {
    rotulo: 'Na meta',
    dica: 'Confirmada e assinada — já conta no placar.',
    classe: 'bg-success/15 text-success border-success/30',
    ponto: 'bg-success',
  },
  falta_assinatura: {
    rotulo: 'Falta assinatura',
    dica: 'Confirmada, mas o contrato não voltou assinado. Só entra na meta quando assinar.',
    classe: 'bg-warning/15 text-warning border-warning/30',
    ponto: 'bg-warning',
  },
  aguardando_relatorio: {
    rotulo: 'Aguardando relatório',
    dica: 'Lançada na mão. Quando o NR aparecer na importação, a venda é validada sozinha.',
    classe: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400',
    ponto: 'bg-sky-500',
  },
  em_aberto: {
    rotulo: 'Em aberto',
    dica: 'O ERP já conhece esta venda, mas ela ainda não foi confirmada.',
    classe: 'bg-muted text-muted-foreground border-border',
    ponto: 'bg-muted-foreground/60',
  },
  devolvida: {
    rotulo: 'Devolvida',
    dica: 'Voltou depois de confirmada. Entra no percentual de devolução.',
    classe: 'bg-destructive/15 text-destructive border-destructive/30',
    ponto: 'bg-destructive',
  },
  cancelada: {
    rotulo: 'Cancelada',
    dica: 'Caiu. Entra no percentual de cancelamento.',
    classe: 'bg-destructive/15 text-destructive border-destructive/30',
    ponto: 'bg-destructive',
  },
};

/** De onde a linha veio, em palavra de quem usa a tela. */
export const ORIGEM_DA_LINHA: Record<OrigemVenda, { rotulo: string; dica: string }> = {
  manual: { rotulo: 'Lançada',   dica: 'Digitada na aba Vendas.' },
  setor:  { rotulo: 'Prévia',    dica: 'Veio do relatório do setor.' },
  geral:  { rotulo: 'Relatório', dica: 'Validada pelo relatório geral — é o número oficial.' },
};

/* ── Abas ─────────────────────────────────────────────────────────────────── */

/**
 * As abas da lista.
 *
 * `pendencias` não é um recorte do mês: é a fila de quem ainda precisa de
 * alguém — aberta, ou confirmada sem assinatura —, de qualquer mês. Uma venda
 * de agosto esperando assinatura continua sendo trabalho de hoje.
 */
export type AbaDaLista = 'todas' | 'na_meta' | 'pendencias' | 'perdas';

export function abaDaVenda(venda: VendaClassificavel): Exclude<AbaDaLista, 'todas'> {
  const gaveta = classificarVenda(venda);
  if (gaveta === 'na_meta') return 'na_meta';
  if (gaveta === 'devolvida' || gaveta === 'cancelada') return 'perdas';
  return 'pendencias';
}

/* ── Busca ────────────────────────────────────────────────────────────────── */

/** Minúscula e sem acento: «joão» acha «JOAO». */
export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export interface VendaBuscavel {
  nr_documento: string;
  cliente: string | null;
  perfis?: { nome: string } | null;
}

/**
 * A venda casa com a busca?
 *
 * NR casa por dígito — colar «13.073.323» acha «13073323». Cliente e operador
 * casam por trecho, sem acento.
 */
export function casaComBusca(venda: VendaBuscavel, busca: string): boolean {
  const termo = normalizarTexto(busca);
  if (!termo) return true;
  const digitos = termo.replace(/\D/g, '');
  if (digitos.length >= 3 && venda.nr_documento.replace(/\D/g, '').includes(digitos)) {
    return true;
  }
  return normalizarTexto(venda.cliente).includes(termo)
      || normalizarTexto(venda.perfis?.nome).includes(termo)
      || normalizarTexto(venda.nr_documento).includes(termo);
}

/* ── Valor digitado ───────────────────────────────────────────────────────── */

/**
 * Lê um valor em reais do jeito que as pessoas digitam e colam.
 *
 * `parseBRL` de `@/lib/money` lê «5572.00» como 557.200 — trata todo ponto
 * como milhar. Na colagem isso é real: o Excel em inglês e o relatório do ERP
 * mandam `159.0`. Aqui a regra é explícita:
 *
 *   tem vírgula ........................ pt-BR (`5.572,00`, `5572,5`)
 *   ponto seguido de 1 ou 2 dígitos no fim  decimal (`5572.00`, `159.0`)
 *   senão .............................. ponto é milhar (`5.572` = 5572)
 *
 * Devolve `null` quando não há número — e nunca 0 por engano.
 */
export function lerValorDigitado(texto: string | null | undefined): number | null {
  const limpo = String(texto ?? '').replace(/R\$|\s/gi, '').trim();
  if (!limpo || !/\d/.test(limpo)) return null;
  if (!/^-?[\d.,]+$/.test(limpo)) return null;

  let n: number;
  if (limpo.includes(',')) {
    n = Number(limpo.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d+\.\d{1,2}$/.test(limpo)) {
    n = Number(limpo);
  } else {
    n = Number(limpo.replace(/\./g, ''));
  }
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* ── Colar várias vendas ──────────────────────────────────────────────────── */

export interface VendaColada {
  /** Linha do texto colado, 1 = primeira. Para o erro apontar onde. */
  linha: number;
  nr: string;
  valor: number;
  cliente: string | null;
  /** 'yyyy-MM-dd', ou `null` para «hoje». */
  data: string | null;
  erro: string | null;
}

const RE_DATA = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
/** NR do ERP: só dígitos, e comprido — o mais curto medido tem 8. */
const RE_NR = /^\d{5,}$/;

function lerData(token: string, anoPadrao: number): string | null {
  const m = RE_DATA.exec(token.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : anoPadrao;
  if (ano < 100) ano += 2000;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCMonth() !== mes - 1) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Quebra a linha nos pedaços que a pessoa quis separar.
 *
 * Excel manda tabulação; planilha exportada, `;`; mensagem de WhatsApp, « - ».
 * Sem nenhum desses, sobra a linha corrida — «13073323 Maria Souza 5.572,00» —
 * e aí os números são pescados por forma, e o que sobra é o nome.
 */
function pedacos(linha: string): string[] {
  const porSeparador = linha.split(/\t|;|\|/).map(s => s.trim()).filter(Boolean);
  if (porSeparador.length > 1) return porSeparador;
  const porTraco = linha.split(/\s+[-–—]\s+/).map(s => s.trim()).filter(Boolean);
  if (porTraco.length > 1) return porTraco;
  return linha.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

/** Um pedaço é dinheiro quando tem cara de dinheiro, não só quando é número. */
function pareceDinheiro(token: string): boolean {
  const t = token.replace(/\s/g, '');
  return /R\$/i.test(t)
      || /^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(t)
      || /^\d+,\d{1,2}$/.test(t)
      || /^\d+\.\d{1,2}$/.test(t);
}

/**
 * Lê uma colagem de várias vendas — uma por linha.
 *
 * Em cada linha procura: o **NR** (só dígitos, 5 ou mais), o **valor** (com
 * cara de dinheiro, ou o primeiro número que sobrar depois do NR), uma
 * **data** opcional (`19/09`, `19/09/2026`) e, no que sobra de texto, o
 * **cliente**. A ordem das colunas não importa — cada coisa é reconhecida pela
 * forma.
 *
 * Linha sem NR ou sem valor volta com `erro`, e não some: quem colou 20 e viu
 * 19 precisa saber qual ficou para trás. Cabeçalho («NR  Cliente  Valor») é
 * pulado em silêncio, porque colar a planilha com o título é o caso comum.
 * NR repetido na mesma colagem: a segunda ocorrência vira erro.
 */
export function lerVendasColadas(texto: string, anoPadrao = new Date().getFullYear()): VendaColada[] {
  const saida: VendaColada[] = [];
  const vistos = new Set<string>();

  String(texto ?? '').split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.trim();
    if (!linha) return;
    // Cabeçalho: tem letras, e nenhum número de 3+ dígitos.
    if (!/\d{3,}/.test(linha) && /[a-z]/i.test(linha)) return;

    let valor: number | null = null;
    let data: string | null = null;
    const nome: string[] = [];
    /** Só dígitos: candidato a NR, ou valor sem centavos («5572»). */
    const inteiros: string[] = [];
    /** Com ponto de milhar («5.572»): nunca NR, só valor. */
    const comMilhar: string[] = [];

    for (const token of pedacos(linha)) {
      const t = token.replace(/^[-–—:]+|[-–—:]+$/g, '').trim();
      if (!t) continue;
      if (!data && RE_DATA.test(t)) { data = lerData(t, anoPadrao); if (data) continue; }
      if (pareceDinheiro(t)) {
        if (valor === null) valor = lerValorDigitado(t);
        continue;
      }
      if (/^\d+$/.test(t)) { inteiros.push(t); continue; }
      if (/^\d{1,3}(\.\d{3})+$/.test(t)) { comMilhar.push(t); continue; }
      if (/^R\$?$/i.test(t)) continue;
      nome.push(t);
    }

    // O NR é o inteiro MAIS COMPRIDO, e não o primeiro: «12000 13073323» tem o
    // valor antes do NR, e o primeiro número viraria documento.
    const candidatos = inteiros.filter(n => RE_NR.test(n));
    const nr = candidatos.length > 0
      ? candidatos.reduce((a, b) => (b.length > a.length ? b : a))
      : null;
    const sobra = [...inteiros.filter(n => n !== nr), ...comMilhar];
    // Valor sem vírgula nem «R$» («5572»): o primeiro número que sobrou.
    if (valor === null && sobra.length > 0) valor = lerValorDigitado(sobra[0]);

    const cliente = nome.join(' ').replace(/\s+/g, ' ').trim() || null;
    let erro: string | null = null;
    if (!nr) erro = 'sem NR (número do documento, só dígitos)';
    else if (valor === null || valor <= 0) erro = 'sem valor';
    else if (vistos.has(nr)) erro = 'NR repetido nesta colagem';

    if (nr && !erro) vistos.add(nr);
    saida.push({ linha: i + 1, nr: nr ?? '', valor: valor ?? 0, cliente, data, erro });
  });

  return saida;
}
