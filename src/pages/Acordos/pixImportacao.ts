/**
 * pixImportacao.ts — a planilha do Pix que a liderança mantém por fora, lida e
 * conferida contra o Pix de TODOS os setores antes de lançar (12/11/2026).
 *
 * ## As planilhas
 *
 * Cada setor tem a sua, uma aba por mês, o cabeçalho na 1ª ou 2ª linha. As
 * duas que existiam em 12/11/2026:
 *
 *   Play 2 .. (data sem título) | operador | nr | Valor de Nota | % | valor |
 *             Meta batida | nome completo | código crachá | CHAVE PIX | LIDER
 *             abas «Novembro», «OUTUBRO»…
 *   Digital . codigo | Data | Login/Operador | nr | Valor de Nota | % | valor |
 *             Meta batida | pix | SIT
 *             abas «OUTUBRO PIX AUTOMATICO», «PIX AUTOMATICO NOVEMBRO»…
 *
 * O que entra no Pix é o par **NR + Valor de Nota**, no nome do operador, no
 * dia da linha. `%` e `valor` (a comissão que a planilha calculou) servem para
 * conferir: o Pix calcula a comissão pelo % do setor (mais o bônus do período)
 * e trava na aprovação. «Meta batida» é a dobra, que o Pix calcula sozinho.
 * Código/crachá, chave Pix, nome e líder ficam de fora.
 *
 * ## O que já foi pago
 *
 * Cada setor marca de um jeito, e as duas marcas valem:
 *
 *   • Play 2 pinta a linha de VERDE (o `34A853` do Google Planilhas);
 *   • Digital escreve na coluna SIT (ou numa coluna sem título no fim):
 *     «pagos», «pg», «ok pago», «já enviado». «pendente» é não pago.
 *
 * Amarelo, laranja e rosa são destaque, não pagamento. Linha paga tem de estar
 * APROVADA e PAGA no Pix: a que falta entra assim, e a que já está lá sem isso
 * cai em «Pagamento a acertar».
 *
 * ## A conferência
 *
 * Cada NR é procurado no Pix inteiro da empresa — qualquer setor, mês e status:
 *
 *   faltando ... não está no Pix: pode ser adicionado (vem marcado);
 *   repetido ... está no Pix com OUTRA pessoa, ou com a mesma em outro mês —
 *                aparece para verificar. Só a outra pessoa em outro mês o
 *                banco aceita, e vem desmarcado (ver `conflitoDeNrPix`);
 *   acertar .... já está com esta pessoa neste mês, mas o pagamento diverge:
 *                pago na planilha e não no Pix (marcado: aprova e paga), ou
 *                pago no Pix e não na planilha (só aviso);
 *   lancado .... já está, e bate (avisa se valor ou comissão diferem);
 *   problema ... NR ou valor ilegível, data fora do mês da tela, NR repetido
 *                na própria planilha.
 *
 * Tudo aqui é puro — a leitura do arquivo e a gravação moram no diálogo e no
 * serviço — para dar para testar com as planilhas de verdade em forma de matriz.
 */
import { gruposDeNumeros, soNumeros } from '@/lib/soNumeros';
import { parseCurrencyInput } from '@/lib/index';
import { dataLocalPix, mesLocalPix } from '@/lib/mesPix';
import { normalizarNr, type RegistroPixConferencia } from '@/services/pix_automatico.service';

// ── Leitura ─────────────────────────────────────────────────────────────────

/** Uma linha útil da planilha. */
export interface LinhaPlanilhaPix {
  /** Número da linha no Excel (1 = primeira), para a pessoa achar a linha. */
  linha: number;
  /** NR só com números; vazio = ilegível (ver `nrBruto`). */
  nr: string;
  nrBruto: string;
  /** Valor de Nota. `null` = vazio ou ilegível. */
  valor: number | null;
  /** Como a planilha escreve o operador (o login, quase sempre). */
  operador: string;
  nomeCompleto: string;
  /** `yyyy-MM-dd`, ou `null` sem data. */
  dia: string | null;
  /** % da planilha, na unidade do Pix (0,4 = 0,4%). */
  pct: number | null;
  /** Comissão que a planilha calculou. */
  comissao: number | null;
  /** A planilha diz que esta comissão já foi paga. */
  pago: boolean;
  /** Por quê: «verde» ou o texto da coluna de situação. Nulo = sem marca. */
  marcaPago: string | null;
}

/** Matriz de cores de fundo (`RRGGBB`), na mesma forma da matriz de valores. */
export type CoresDaAba = readonly (readonly (string | null | undefined)[] | undefined)[];

export interface AbaLidaPix {
  linhas: LinhaPlanilhaPix[];
  /** O que foi achado, para a tela dizer «li NR na coluna C». */
  colunas: Partial<Record<CampoPix, number>>;
  /** Sem NR ou sem valor no cabeçalho: a aba não é do Pix. */
  erro?: string;
}

type CampoPix = 'data' | 'operador' | 'nr' | 'valor' | 'pct' | 'comissao' | 'nomeCompleto' | 'situacao';

/** Minúsculo, sem acento, só letra/número/%, espaços simples. */
export function normalizarCabecalho(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

const NOMES = {
  data:         ['data', 'dia', 'data do acordo', 'data registro', 'data do registro'],
  operador:     ['operador', 'login', 'usuario', 'operador nome', 'operadora'],
  nr:           ['nr', 'nr do acordo', 'nr cliente', 'nr do cliente', 'numero do acordo'],
  pct:          ['%', 'pct', 'percentual', 'porcentagem', '% comissao'],
  nomeCompleto: ['nome completo', 'nome'],
  situacao:     ['sit', 'situacao', 'status', 'pago', 'pagamento', 'pago pendente'],
};
const NOMES_VALOR_NOTA = ['valor de nota', 'valor da nota', 'valor nota', 'valor do acordo',
  'valor total', 'valor total do acordo'];
const NOMES_COMISSAO = ['comissao', 'valor comissao', 'valor da comissao'];

/** O texto de situação diz «pago»? («pagos», «pg», «ok pago», «já enviado»). */
export function textoDizPago(v: unknown): boolean {
  const s = normalizarCabecalho(v);
  if (!s || /\b(nao|pendente|falta)\b/.test(s)) return false;
  return /^(ok )?(pg|pagos?|pagas?|quitado)\b/.test(s) || /\b(ja )?enviado\b/.test(s);
}

/** Texto de quem anota situação: pago, pendente, enviado, ok. */
function pareceSituacao(v: unknown): boolean {
  const s = normalizarCabecalho(v);
  return s !== '' && (textoDizPago(s) || /^(ok|pendente|nao pago|aguardando)\b/.test(s));
}

/**
 * Fundo verde: matiz entre 75° e 170°, cor de verdade (saturação ≥ 25%), nem
 * quase preto nem quase branco. Pega o `34A853` e o `6AA84F` do Play 2 e o
 * «Bom» do Excel (`C6EFCE`); deixa de fora o azul, o amarelo e o laranja.
 */
export function ehVerde(rgb: string | null | undefined): boolean {
  const m = /^#?(?:[0-9a-f]{2})?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(rgb ?? '').trim());
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return false;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h >= 75 && h <= 170 && s >= 0.25 && l >= 0.2 && l <= 0.9;
}

/** Serial do Excel → `yyyy-MM-dd` (dias desde 30/12/1899, UTC). */
function serialParaDia(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** A data de uma célula: serial do Excel, `dd/mm/aaaa` ou `aaaa-mm-dd`. */
export function lerDia(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const p = (x: number) => String(x).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === 'number') return serialParaDia(v);
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    const dia = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isNaN(new Date(`${dia}T12:00:00`).getTime()) ? null : dia;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d+(\.\d+)?$/.test(s)) return serialParaDia(Number(s));
  return null;
}

/** Número de uma célula: número do Excel ou texto em formato brasileiro. */
export function lerNumero(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/\d/.test(s)) return null;
  // «6076.5» (ponto decimal, sem vírgula, 1 ou 2 casas) é o número do CSV
  // em inglês — o `parseBRL` leria o ponto como milhar.
  if (/^-?\d+\.\d{1,2}$/.test(s)) return Number(s);
  const n = parseCurrencyInput(s.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * O % da planilha na unidade do Pix. A planilha guarda a fração (0,004);
 * o Pix guarda o percentual (0,4). Abaixo de 0,1 é fração — ninguém paga 10%.
 */
export function lerPct(v: unknown): number | null {
  const n = lerNumero(v);
  if (n == null || n <= 0) return null;
  if (typeof v === 'string' && v.includes('%')) return n;
  return n < 0.1 ? Math.round(n * 100 * 10_000) / 10_000 : n;
}

/** O NR só com números; com mais de um número na célula, ilegível. */
export function lerNr(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? String(v) : '';
  const s = String(v).trim();
  return gruposDeNumeros(s) === 1 ? soNumeros(s) : '';
}

/**
 * Lê uma aba já em matriz: `matriz[i]` é a linha `i + 1` do Excel (sem pular
 * linha em branco — o número da linha é o que a pessoa procura na planilha).
 * `cores`, quando vem, tem a mesma forma e dá o fundo de cada célula.
 *
 * O cabeçalho é a primeira das 20 primeiras linhas que tem uma coluna «NR».
 * Linhas sem NR e sem operador (totais, sobras de fórmula) são puladas em
 * silêncio; a que tem um dos dois e não tem o outro vira problema na conferência.
 */
export function lerAbaPix(matriz: readonly (readonly unknown[] | undefined)[], cores?: CoresDaAba): AbaLidaPix {
  const iCab = matriz.slice(0, 20).findIndex(
    l => (l ?? []).some(c => NOMES.nr.includes(normalizarCabecalho(c))),
  );
  if (iCab < 0) return { linhas: [], colunas: {}, erro: 'Não achei a coluna «NR» no começo da aba.' };

  const cab = (matriz[iCab] ?? []).map(normalizarCabecalho);
  const achar = (nomes: string[]) => {
    const i = cab.findIndex(c => nomes.includes(c));
    return i >= 0 ? i : undefined;
  };
  const colunas: Partial<Record<CampoPix, number>> = {
    nr:           achar(NOMES.nr),
    operador:     achar(NOMES.operador),
    pct:          achar(NOMES.pct),
    nomeCompleto: achar(NOMES.nomeCompleto),
    data:         achar(NOMES.data),
    situacao:     achar(NOMES.situacao),
  };
  const iValorNota = achar(NOMES_VALOR_NOTA);
  const iValor     = achar(['valor']);
  const iComissao  = achar(NOMES_COMISSAO);
  if (iValorNota != null) {
    colunas.valor = iValorNota;
    colunas.comissao = iComissao ?? iValor;
  } else {
    colunas.valor = iValor;
    colunas.comissao = iComissao;
  }
  if (colunas.valor == null) {
    return { linhas: [], colunas, erro: 'Não achei a coluna do valor («Valor de Nota» ou «Valor»).' };
  }

  const dados = matriz.slice(iCab + 1);
  const comNr = dados.filter(l => lerNr(l?.[colunas.nr!]) !== '');
  const largura = Math.max(cab.length, ...comNr.map(l => l?.length ?? 0));
  const usadas = new Set(Object.values(colunas));
  // As colunas sem título: a da data (Play 2) e a da situação (Digital até
  // agosto, Play 2 em junho). É a maioria das células preenchidas que decide.
  for (let c = 0; c < largura && comNr.length > 0; c++) {
    if ((cab[c] ?? '') !== '' || usadas.has(c)) continue;
    const cheias = comNr.map(l => l?.[c]).filter(v => v != null && String(v).trim() !== '');
    if (colunas.data == null && comNr.filter(l => lerDia(l?.[c]) != null).length / comNr.length >= 0.5) {
      colunas.data = c;
      usadas.add(c);
    } else if (colunas.situacao == null && cheias.length > 0
      && cheias.filter(pareceSituacao).length / cheias.length >= 0.6) {
      colunas.situacao = c;
      usadas.add(c);
    }
  }

  // Colunas cuja cor diz se a linha foi paga: as que identificam o acordo.
  const colunasDaCor = [colunas.operador, colunas.nr, colunas.valor].filter((c): c is number => c != null);

  const texto = (l: readonly unknown[], i: number | undefined) =>
    i == null ? '' : String(l?.[i] ?? '').trim();
  const linhas: LinhaPlanilhaPix[] = [];
  dados.forEach((l, k) => {
    if (!l) return;
    const nrBruto = texto(l, colunas.nr);
    const operador = texto(l, colunas.operador).replace(/\s+/g, ' ');
    if (!nrBruto && !operador) return;
    // O cabeçalho repetido no meio da aba (acontece em planilha colada).
    if (NOMES.nr.includes(normalizarCabecalho(nrBruto))) return;
    const i = iCab + 1 + k;
    const situacao = texto(l, colunas.situacao);
    const verdes = colunasDaCor.filter(c => ehVerde(cores?.[i]?.[c])).length;
    const verde = colunasDaCor.length > 0 && verdes * 2 > colunasDaCor.length;
    const pagoNoTexto = textoDizPago(situacao);
    linhas.push({
      linha: i + 1,
      nr: lerNr(colunas.nr == null ? '' : l[colunas.nr]),
      nrBruto,
      valor: (() => { const v = lerNumero(l[colunas.valor!]); return v != null && v > 0 ? v : null; })(),
      operador,
      nomeCompleto: texto(l, colunas.nomeCompleto).replace(/\s+/g, ' '),
      dia: colunas.data == null ? null : lerDia(l[colunas.data]),
      pct: colunas.pct == null ? null : lerPct(l[colunas.pct]),
      comissao: colunas.comissao == null ? null : lerNumero(l[colunas.comissao]),
      pago: verde || pagoNoTexto,
      marcaPago: pagoNoTexto ? `«${situacao}»` : verde ? 'verde' : null,
    });
  });
  return { linhas, colunas };
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * A aba do mês da tela: «Novembro» e «PIX AUTOMATICO NOVEMBRO» para 2026-11.
 * Sem ela, a primeira.
 */
export function abaDoMes(nomes: readonly string[], mes: string): string | undefined {
  return abaPeloNome(nomes, mes) ?? nomes[0];
}

/** A aba cujo NOME diz o mês, ou nenhuma. */
function abaPeloNome(nomes: readonly string[], mes: string): string | undefined {
  const nome = MESES[Number(mes.slice(5, 7)) - 1];
  return nome ? nomes.find(n => normalizarCabecalho(n).split(' ').includes(nome)) : undefined;
}

/**
 * De que mês a aba é, pelas DATAS das linhas: o mês da maioria. Nulo quando
 * as linhas não têm data. É o que deixa reconhecer «Planilha1» ou «Pix» — e
 * pegar a aba que se chama «Novembro» mas tem as linhas de outubro.
 */
export function mesDasLinhas(linhas: readonly Pick<LinhaPlanilhaPix, 'dia'>[]): string | null {
  const conta = new Map<string, number>();
  for (const l of linhas) if (l.dia) conta.set(l.dia.slice(0, 7), (conta.get(l.dia.slice(0, 7)) ?? 0) + 1);
  let melhor: string | null = null;
  for (const [m, n] of conta) if (melhor == null || n > conta.get(melhor)!) melhor = m;
  return melhor;
}

/**
 * Qual aba abrir para o mês da tela: a que tem o mês no nome; senão, a cujas
 * linhas são do mês; senão, a primeira (e a tela avisa que a aba é de outro
 * mês, com o botão para trocar).
 */
export function escolherAba(abas: readonly { nome: string; mes: string | null }[], mes: string): string | undefined {
  return abaPeloNome(abas.map(a => a.nome), mes)
    ?? abas.find(a => a.mes === mes)?.nome
    ?? abas[0]?.nome;
}

/** «out/2026» para `2026-10`. */
export function mesCurto(mes: string): string {
  const nome = MESES[Number(mes.slice(5, 7)) - 1] ?? '';
  return `${nome.slice(0, 3)}/${mes.slice(0, 4)}`;
}

// ── O arquivo ───────────────────────────────────────────────────────────────

/** Uma aba como matrizes de valores e de cores, linha `i` = linha `i + 1` do Excel. */
export interface AbaDoArquivo {
  valores: unknown[][];
  cores: (string | null)[][];
}

/** O pedaço do `xlsx` que a leitura usa (o diálogo carrega a biblioteca no clique). */
interface UtilsDoXlsx {
  decode_cell(endereco: string): { r: number; c: number };
  encode_cell(cel: { r: number; c: number }): string;
}

/**
 * A aba do SheetJS (lida com `cellStyles`) como matriz de valores e de cores.
 *
 * Montada célula a célula, e não pelo `sheet_to_json`: ele começa no canto do
 * `!ref` e pode pular linha vazia — o número da linha deixaria de ser o que a
 * pessoa procura na planilha, e a cor deixaria de casar com o valor.
 *
 * O tamanho vem das células que TÊM valor, e não do `!ref`: formatação
 * aplicada na coluna inteira declara 1 milhão de linhas, e o laço travaria o
 * navegador. Até a coluna 60 — as planilhas do Pix usam menos de 30.
 */
export function matrizDaAba(utils: UtilsDoXlsx, ws: Record<string, unknown>): AbaDoArquivo {
  const valores: unknown[][] = [];
  const cores: (string | null)[][] = [];
  let ultimaLinha = -1, ultimaColuna = -1;
  for (const k of Object.keys(ws)) {
    if (k.startsWith('!')) continue;
    const cel = ws[k] as { v?: unknown } | undefined;
    if (cel?.v == null || cel.v === '') continue;
    const { r, c } = utils.decode_cell(k);
    if (r > ultimaLinha) ultimaLinha = r;
    if (c > ultimaColuna) ultimaColuna = c;
  }
  ultimaColuna = Math.min(ultimaColuna, 60);
  for (let R = 0; R <= ultimaLinha; R++) {
    const lv: unknown[] = [];
    const lc: (string | null)[] = [];
    for (let C = 0; C <= ultimaColuna; C++) {
      const cel = ws[utils.encode_cell({ r: R, c: C })] as
        | { v?: unknown; s?: { patternType?: string; fgColor?: { rgb?: string } } } | undefined;
      lv.push(cel?.v ?? '');
      lc.push(cel?.s?.patternType === 'solid' ? cel.s.fgColor?.rgb ?? null : null);
    }
    valores.push(lv);
    cores.push(lc);
  }
  return { valores, cores };
}

// ── Quem é o operador ───────────────────────────────────────────────────────

export interface PessoaPix {
  id: string;
  nome: string;
  usuario: string | null;
  email: string | null;
  setor_id: string | null;
  ativo?: boolean;
  arquivado?: boolean;
}

/** Só letras e números, sem acento: «poliana_ Shueter » = «polianashueter». */
export function chaveDePessoa(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** O operador da planilha como chave do mapa de operadores escolhidos. */
export function chaveDoOperadorDaPlanilha(l: Pick<LinhaPlanilhaPix, 'operador' | 'nomeCompleto'>): string {
  return chaveDePessoa(l.operador) || chaveDePessoa(l.nomeCompleto);
}

/**
 * A pessoa do app que a planilha quis dizer: pelo login (`usuario`), pelo
 * começo do e-mail ou pelo nome — e, se o login não bater, pelo «nome
 * completo». Duas pessoas iguais: fica quem está ativo; se continuar empatado,
 * ninguém (a tela pede para escolher).
 */
export function reconhecerOperador(
  l: Pick<LinhaPlanilhaPix, 'operador' | 'nomeCompleto'>,
  pessoas: readonly PessoaPix[],
): PessoaPix | null {
  const tentar = (alvo: string) => {
    if (!alvo) return [];
    return pessoas.filter(p =>
      chaveDePessoa(p.usuario) === alvo
      || chaveDePessoa(p.email?.split('@')[0]) === alvo
      || chaveDePessoa(p.nome) === alvo);
  };
  const unico = (achados: readonly PessoaPix[]): PessoaPix | null | undefined => {
    if (achados.length === 1) return achados[0];
    if (achados.length > 1) {
      const vivos = achados.filter(p => p.ativo !== false && !p.arquivado);
      return vivos.length === 1 ? vivos[0] : null;
    }
    return undefined;
  };
  for (const alvo of [chaveDePessoa(l.operador), chaveDePessoa(l.nomeCompleto)]) {
    const r = unico(tentar(alvo));
    if (r !== undefined) return r;
  }
  // Por último, as PALAVRAS do login no nome (12/11/2026): «igor_s_rocha» é
  // «Igor Rocha», «leonardo_nunes» é «Leonardo Nunes Keppler». Inicial solta
  // não conta, e são pelo menos duas palavras — «maria» sozinha acharia meia
  // empresa. Só vale se der uma pessoa.
  const palavrasDoLogin = palavras(l.operador).filter(p => p.length >= 2);
  if (palavrasDoLogin.length >= 2) {
    const r = unico(pessoas.filter(p => {
      const doNome = new Set(palavras(p.nome));
      return palavrasDoLogin.every(x => doNome.has(x));
    }));
    if (r) return r;
  }
  return null;
}

/** As palavras de um nome ou login, sem acento: «igor_s_rocha» → igor, s, rocha. */
function palavras(v: string | null | undefined): string[] {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// ── A conferência ───────────────────────────────────────────────────────────

export type SituacaoImportacao = 'faltando' | 'repetido' | 'acertar' | 'lancado' | 'problema';

/** O que «aplicar» faz com a linha marcada. */
export type AcaoImportacao =
  /** Lança no Pix (pendente; aprovado e pago quando `pago`). */
  | 'adicionar'
  /** O registro já existe: aprova (se pendente) e marca pago. */
  | 'acertar';

export interface LinhaConferida extends LinhaPlanilhaPix {
  /** Chave estável da linha na conferência (o número da linha). */
  ref: string;
  situacao: SituacaoImportacao;
  /** O porquê, em uma frase, para a coluna «Situação». */
  motivo: string;
  pessoa: PessoaPix | null;
  /** Os registros do Pix com este NR (todos os setores e meses). */
  noPix: RegistroPixConferencia[];
  /** O que marcar a linha faz. Nulo = nada a fazer daqui. */
  acao: AcaoImportacao | null;
  /** Vem marcada. */
  marcada: boolean;
  /** O registro desta pessoa neste mês (lançado ou a acertar). */
  registro?: RegistroPixConferencia;
  /** Valor de Nota diferente do Pix. */
  valorDiferente?: boolean;
  /** Comissão da planilha diferente da do Pix (só em registro aprovado). */
  comissaoDiferente?: boolean;
}

/** A chave de comparação do NR: só números quando der, senão a de sempre. */
export function chaveDoNr(nr: string): string {
  const s = String(nr ?? '');
  return gruposDeNumeros(s) === 1 ? soNumeros(s) : normalizarNr(s);
}

export function indexarPorNr(
  registros: readonly RegistroPixConferencia[],
): Map<string, RegistroPixConferencia[]> {
  const m = new Map<string, RegistroPixConferencia[]>();
  for (const r of [...registros].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    const k = chaveDoNr(r.nr_cliente);
    if (!k) continue;
    const lista = m.get(k) ?? [];
    lista.push(r);
    m.set(k, lista);
  }
  return m;
}

const fmtMes = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
const fmtDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const ROTULO_STATUS: Record<string, string> = { pendente: 'pendente', aprovado: 'aprovado', desaprovado: 'desaprovado' };

export function conferirPlanilhaPix(p: {
  linhas: readonly LinhaPlanilhaPix[];
  /** Mês da tela (`yyyy-MM`): só ele entra, como em todo o resto da aba. */
  mes: string;
  /** NR → registros do Pix (`indexarPorNr`). */
  noPix: ReadonlyMap<string, readonly RegistroPixConferencia[]>;
  /** A pessoa de cada linha: a reconhecida ou a escolhida na tela. */
  pessoaDe: (l: LinhaPlanilhaPix) => PessoaPix | null;
  /** Nome do setor, para a frase do repetido. */
  nomeDoSetor: (id: string | null) => string;
  /** Quem importa pode aprovar? Sem isso, a linha paga entra pendente. */
  podeAprovar?: boolean;
  /** A comissão que o Pix calcula para o registro (`comissaoDe`). */
  comissaoNoPix?: (r: RegistroPixConferencia) => number;
}): LinhaConferida[] {
  const podeAprovar = p.podeAprovar ?? true;
  const primeiraLinhaDoNr = new Map<string, number>();
  return p.linhas.map(l => {
    const base = {
      ...l, ref: String(l.linha), pessoa: p.pessoaDe(l),
      noPix: [] as RegistroPixConferencia[], acao: null as AcaoImportacao | null, marcada: false,
    };
    const problema = (motivo: string): LinhaConferida => ({ ...base, situacao: 'problema', motivo });
    const verde = l.pago ? ` · pago na planilha (${l.marcaPago})` : '';

    if (!l.nr) return problema(l.nrBruto ? `NR ilegível («${l.nrBruto}»)` : 'Sem NR');
    const k = chaveDoNr(l.nr);
    const anterior = primeiraLinhaDoNr.get(k);
    if (anterior != null) return problema(`NR repetido na própria planilha (linha ${anterior})`);
    primeiraLinhaDoNr.set(k, l.linha);

    const noPix = [...(p.noPix.get(k) ?? [])];
    base.noPix = noPix;
    if (l.valor == null) return problema('Sem Valor de Nota');
    const mesDaLinha = l.dia ? l.dia.slice(0, 7) : p.mes;
    if (mesDaLinha !== p.mes) {
      return problema(`Data ${fmtDia(l.dia!)} é de ${fmtMes(mesDaLinha)} — troque o mês da tela para lançar`);
    }

    const pessoa = base.pessoa;
    const quem = (r: RegistroPixConferencia) =>
      `${r.operador_nome ?? '—'} (${p.nomeDoSetor(r.setor_id)}, ${fmtDia(dataLocalPix(r.criado_em))})`;

    // ── Já está no Pix com esta pessoa, neste mês ──
    const meuNoMes = pessoa
      ? noPix.find(r => r.operador_id === pessoa.id && mesLocalPix(r.criado_em) === p.mes)
      : undefined;
    if (meuNoMes) {
      const comRegistro = { ...base, registro: meuNoMes };
      const pagoNoPix = meuNoMes.status === 'aprovado' && meuNoMes.pago;
      if (l.pago && !pagoNoPix) {
        if (meuNoMes.status === 'desaprovado') {
          return { ...comRegistro, situacao: 'acertar',
            motivo: `Pago na planilha (${l.marcaPago}), mas DESAPROVADO no Pix — reavalie na tabela` };
        }
        if (meuNoMes.status === 'pendente' && !podeAprovar) {
          return { ...comRegistro, situacao: 'acertar',
            motivo: `Pago na planilha (${l.marcaPago}), pendente no Pix — aprovar é de quem tem a permissão` };
        }
        return { ...comRegistro, situacao: 'acertar', acao: 'acertar', marcada: true,
          motivo: meuNoMes.status === 'pendente'
            ? `Pago na planilha (${l.marcaPago}), pendente no Pix — marque para aprovar e pagar`
            : `Pago na planilha (${l.marcaPago}), aprovado sem pagamento no Pix — marque para pagar` };
      }
      if (!l.pago && meuNoMes.pago) {
        return { ...comRegistro, situacao: 'acertar',
          motivo: 'Pago no Pix, mas a planilha não marca como pago — confira' };
      }
      const valorDiferente = Math.abs(Number(meuNoMes.valor) - l.valor) >= 0.005;
      const noPixComissao = p.comissaoNoPix && meuNoMes.status === 'aprovado' ? p.comissaoNoPix(meuNoMes) : null;
      const comissaoDiferente = noPixComissao != null && l.comissao != null
        && Math.abs(noPixComissao - l.comissao) >= 0.01;
      const avisos = [
        valorDiferente && 'com outro valor',
        comissaoDiferente && `comissão no Pix ${noPixComissao!.toFixed(2).replace('.', ',')}`,
      ].filter(Boolean).join(', ');
      return {
        ...comRegistro, situacao: 'lancado', valorDiferente, comissaoDiferente,
        motivo: `Já lançado (${ROTULO_STATUS[meuNoMes.status] ?? meuNoMes.status}${meuNoMes.pago ? ', pago' : ''})`
          + (avisos ? ` — ${avisos}` : ''),
      };
    }

    // ── Não está no Pix ──
    if (noPix.length === 0) {
      if (!pessoa) return { ...base, situacao: 'faltando', motivo: `Não está no Pix — escolha o operador${verde}` };
      return {
        ...base, situacao: 'faltando', acao: 'adicionar', marcada: true,
        motivo: !l.pago ? 'Não está no Pix'
          : podeAprovar ? `Não está no Pix · pago na planilha (${l.marcaPago}): entra aprovado e pago`
          : `Não está no Pix · pago na planilha: entra pendente (aprovar é de quem tem a permissão)`,
      };
    }

    // ── Está no Pix com outra pessoa, ou com a mesma em outro mês ──
    if (!pessoa) {
      return { ...base, situacao: 'repetido',
        motivo: `Já está com ${quem(noPix[0])} — escolha o operador para conferir${verde}` };
    }
    const meu = noPix.find(r => r.operador_id === pessoa.id);
    if (meu) {
      return { ...base, situacao: 'repetido',
        motivo: `A mesma pessoa já tem este NR em ${fmtMes(mesLocalPix(meu.criado_em))} — o banco não deixa repetir${verde}` };
    }
    const doMes = noPix.find(r => mesLocalPix(r.criado_em) === p.mes);
    if (doMes) {
      return { ...base, situacao: 'repetido',
        motivo: `Está com ${quem(doMes)} neste mês — só com pedido de transferência${verde}` };
    }
    return { ...base, situacao: 'repetido', acao: 'adicionar',
      motivo: `Está com ${quem(noPix[noPix.length - 1])}, em outro mês — confira antes de adicionar${verde}` };
  });
}

/** Quantas linhas em cada situação. */
export function contarSituacoes(linhas: readonly LinhaConferida[]): Record<SituacaoImportacao, number> {
  const c: Record<SituacaoImportacao, number> = { faltando: 0, repetido: 0, acertar: 0, lancado: 0, problema: 0 };
  for (const l of linhas) c[l.situacao]++;
  return c;
}
