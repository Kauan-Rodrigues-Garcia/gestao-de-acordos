/**
 * relatorioQuitacao.ts — lê o relatório mensal de parcelas pagas do ERP (ex.:
 * SETEMBRO.xls, aba «Informações») e devolve os acordos QUITADOS NO MÊS, que
 * alimentam o Ranking de quitação.
 *
 * O critério (análise de setembro, 06/10/2026):
 *
 *   - «Situação Atual» = Quitação. «Situação» não serve: é o tipo do acordo na
 *     criação (924 linhas de setembro diziam Quitação ali, só 247 quitaram);
 *   - «Data da quitação» dentro do mês do arquivo. «Situação Atual» é a foto do
 *     dia da extração, então o relatório de setembro traz acordos que quitaram
 *     em outubro — esses entram pelo relatório de outubro;
 *   - um acordo conta UMA vez (Cód. Acordo) — o arquivo tem uma linha por
 *     parcela paga; o valor é o recebido no mês (ver abaixo).
 *
 * Junção que quita (análise de 13/10/2026, relatórios de setembro e outubro):
 *
 *   - «Data da quitação» é do CONTRATO (Nr. Documento): quando ele quita, o ERP
 *     carimba a data em todos os acordos dele. A Junção que juntou as parcelas
 *     até o fim do contrato vem com saldo zerado E a data; a Junção que só
 *     juntou parcelas atrasadas vem sem a data (ou com saldo) — essa não conta;
 *   - pagamento desmembrado (ex.: Pix como Quitação + cartão como Junção, mesmo
 *     contrato, mesma data) é UMA quitação, com a soma dos acordos. O código
 *     gravado é o do acordo Quitação, se houver.
 *
 * Quitação que completa um Parcelamento (pedido de 21/10/2026, NR 12800154):
 *
 *   - o cliente pagou parte de um Parcelamento (R$ 1.095,00 de R$ 1.793,00) e
 *     quitou o saldo (R$ 698,00) com outros acordos no mesmo contrato e na
 *     mesma data (Quitação R$ 648,00 + Parcela única R$ 50,00). É UMA quitação
 *     completa, de R$ 1.793,00 — não só os R$ 648,00 do acordo Quitação;
 *   - só vale quando os números FECHAM: o saldo dos acordos em aberto do
 *     contrato, naquela data, é o que os outros acordos pagaram (até R$ 1,00
 *     de diferença, o arredondamento do ERP). O valor é o pago de cada um:
 *     Valor Acordo − Valor Restante do que estava aberto, mais o resto;
 *   - acordo já pago por inteiro (saldo 0), do mesmo contrato, operador e
 *     data, SOMA o que recebeu no mês — mesmo sem saldo em aberto no contrato
 *     (decisão de 04/11/2026, NR 13022960: Parcelamento das parcelas 1–4 +
 *     Junção das 5–8 no mesmo dia é uma quitação de R$ 1.936,80).
 *
 * Saldo zerado quita (pedido de 28/10/2026, NR 12552080):
 *
 *   - acordo com «Valor Restante» 0 e a «Data da quitação» quita, qualquer que
 *     seja o rótulo (Parcelamento, Parcela única, Semestral...) — ex.: um
 *     Parcelamento de 1 parcela que pagou as atrasadas e quitou o contrato;
 *   - só quando o contrato NÃO tem acordo Quitação: tendo, as outras peças
 *     seguem as regras acima.
 *
 * O VALOR é o RECEBIDO NO MÊS (pedido de 04/11/2026, NR 12604078 do
 * eduardo_naia): a soma da coluna «Recebido» das parcelas que os acordos da
 * quitação pagaram no mês do arquivo — não o «Valor Acordo» inteiro. Quitar a
 * última parcela de um boleto de 16 conta o que entrou agora (R$ 420,30), não
 * os R$ 6.723,00 do acordo. O «Valor Acordo» e o «Valor Restante» seguem
 * decidindo SE quita e se a quitação completa um Parcelamento; o valor que
 * entra é o recebido de todos os acordos somados nela.
 *
 * Última parcela de carnê NÃO é quitação (pedido de 12/11/2026, análise do
 * 671.xlsx de novembro):
 *
 *   - acordo no Boleto (ou Recorrente) com mais de uma parcela é pago mês a
 *     mês. Quando o cliente paga a última, o ERP muda a «Situação Atual» para
 *     Quitação e carimba a data — mas ninguém negociou uma quitação: o
 *     parcelamento só terminou. Ex.: NR 12696562, boleto 18/18, Valor Acordo
 *     R$ 4.950,00, recebido no mês R$ 275,00. No 671.xlsx foram 10 assim (9
 *     Boleto + 1 Recorrente), R$ 2.476,17 — todas com o recebido no mês bem
 *     abaixo do Valor Acordo, porque o resto entrou nos meses anteriores;
 *   - esse acordo não vira quitação por rótulo nem por saldo zerado, e não
 *     soma em outra quitação do contrato (é só a parcela do mês);
 *   - CONTINUAM contando: Boleto à vista (1 parcela — o boleto paga tudo) e
 *     Cartão parcelado (o cartão paga o acordo inteiro de uma vez: no 671.xlsx
 *     o recebido é igual ao Valor Acordo em todos os 42).
 *   - precisa das colunas «Tp. Doc» e «Qtd. Parcelas Acordo»; sem elas a
 *     regra não tem como ser aplicada e o relatório é lido como antes.
 *
 * A ORIGEM de cada quitação vai junto (`tipo`, pedido de 12/11/2026): cada
 * setor escolhe o que aceita (config `aceita`, 20261112230000). O Play 2 quer
 * só acordo de Quitação; o Play 3 aceita tudo o que quita o contrato.
 *
 *   quitacao      tem um acordo com «Situação Atual» Quitação (sozinho ou com
 *                 peças do mesmo contrato somadas);
 *   juncao        quitou por uma Junção que fechou o contrato (troca de
 *                 plano), sem acordo Quitação;
 *   saldo_zerado  quitou porque um Parcelamento, Parcela única, Semestral…
 *                 ficou com saldo zero e a data da quitação.
 *
 * «Nr. Documento» e «Valor Restante» são opcionais: sem eles, cada acordo
 * conta sozinho e a Junção vale só com a data.
 *
 * O mês do arquivo é o mês da maioria das «Dt. Pgto» (o relatório é de um mês
 * de pagamentos; data zerada do ERP, 30/12/1899, não conta).
 *
 * Puro — a leitura do arquivo (`lerRelatorioQuitacao`) carrega o xlsx só na
 * hora, como os outros importadores.
 */
import { norm, toDate } from '@/services/analitico/analiticoComum';

/** De onde a quitação veio (ver o cabeçalho). Cada setor escolhe o que aceita. */
export type TipoQuitacao = 'quitacao' | 'juncao' | 'saldo_zerado';

/** Na quitação que juntou acordos, vale a origem mais forte. */
const FORCA: Record<TipoQuitacao, number> = { quitacao: 3, juncao: 2, saldo_zerado: 1 };

export interface AcordoQuitado {
  cod_acordo: string;
  operador_usuario: string;
  /**
   * O RECEBIDO no mês pelos acordos da quitação (soma da coluna «Recebido»).
   * O nome ficou o da coluna do banco (`ranking_quitacao_acordos.valor_acordo`).
   */
  valor_acordo: number;
  /** `AAAA-MM-DD`. */
  data_quitacao: string;
  tipo: TipoQuitacao;
}

export interface RelatorioQuitacao {
  /** Primeiro dia do mês do arquivo, `AAAA-MM-01`; `null` se não deu para saber. */
  mes: string | null;
  acordos: AcordoQuitado[];
  /** Linhas de parcela lidas (o arquivo inteiro, sem cabeçalho). */
  linhasLidas: number;
  /** Acordos quitados, mas em outro mês — ficam para o relatório daquele mês. */
  quitadosForaDoMes: number;
  /** Quantas das quitações do mês vieram de uma Junção (sozinha ou somada a outro acordo). */
  quitadosPorJuncao: number;
  /** Quantas quitaram o saldo de um Parcelamento do mesmo contrato e somaram o pago dele. */
  quitadosCompletandoParcelamento: number;
  /** Quantas quitações são de cada origem — o setor que aceita só Quitação deixa as outras de fora. */
  porTipo: Record<TipoQuitacao, number>;
  /**
   * Acordos de Boleto/Recorrente com mais de uma parcela que pagaram a última
   * no mês: o ERP diz Quitação, o ranking não conta. `null`: o arquivo não tem
   * «Tp. Doc» e «Qtd. Parcelas Acordo», e a regra não foi aplicada.
   */
  ultimasParcelasDeCarne: number | null;
  erros: string[];
}

const COLUNAS = {
  codAcordo: 'cod.acordo',
  operador: 'operador',
  dtPgto: 'dt.pgto',
  recebido: 'recebido',
  situacaoAtual: 'situacaoatual',
  valorAcordo: 'valoracordo',
  dataQuitacao: 'datadaquitacao',
} as const;

/** Opcionais: refinam a regra (Junção, desmembrado) quando o relatório os traz. */
const OPCIONAIS = {
  nrDocumento: 'nr.documento',
  valorRestante: 'valorrestante',
  /** Boleto, Pix, Cartão, Recorrente… — com a quantidade de parcelas, separa o carnê. */
  tpDoc: 'tp.doc',
  qtdParcelasAcordo: 'qtd.parcelasacordo',
} as const;

/** Formas de pagamento cobradas mês a mês: com mais de uma parcela, a última não é quitação. */
const PAGO_MES_A_MES = new Set(['boleto', 'recorrente']);

const ROTULOS: Record<keyof typeof COLUNAS, string> = {
  codAcordo: 'Cód. Acordo', operador: 'Operador', dtPgto: 'Dt. Pgto', recebido: 'Recebido',
  situacaoAtual: 'Situação Atual', valorAcordo: 'Valor Acordo', dataQuitacao: 'Data da quitação',
};

const iso =(d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(/[R$\s]/g, '');
  // «1.234,56» (pt-BR) ou «1234.56».
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

/** O mês da maioria das datas de pagamento, `AAAA-MM-01`. */
function mesDoArquivo(datas: (Date | null)[]): string | null {
  const conta = new Map<string, number>();
  for (const d of datas) {
    if (!d || d.getFullYear() < 2000) continue;
    const m = iso(d).slice(0, 7) + '-01';
    conta.set(m, (conta.get(m) ?? 0) + 1);
  }
  let melhor: string | null = null;
  for (const [m, n] of conta) if (!melhor || n > conta.get(melhor)!) melhor = m;
  return melhor;
}

export function extrairQuitacoes(rows: unknown[][]): RelatorioQuitacao {
  const vazio = (erro: string): RelatorioQuitacao =>
    ({ mes: null, acordos: [], linhasLidas: 0, quitadosForaDoMes: 0, quitadosPorJuncao: 0, quitadosCompletandoParcelamento: 0,
       porTipo: { quitacao: 0, juncao: 0, saldo_zerado: 0 }, ultimasParcelasDeCarne: null, erros: [erro] });
  if (rows.length < 2) return vazio('Planilha sem dados.');

  const cab = (rows[0] ?? []).map(norm);
  const idx = Object.fromEntries(Object.entries(COLUNAS).map(([k, nome]) => [k, cab.indexOf(nome)])) as Record<keyof typeof COLUNAS, number>;
  const faltando = (Object.keys(COLUNAS) as (keyof typeof COLUNAS)[]).filter(k => idx[k] < 0);
  if (faltando.length) {
    return vazio(
      'Este não parece o relatório mensal de parcelas pagas: faltam as colunas ' +
      faltando.map(k => `«${ROTULOS[k]}»`).join(', ') + '.',
    );
  }

  const linhas = rows.slice(1).filter(r => r && r.some(c => c != null && c !== ''));
  const mes = mesDoArquivo(linhas.map(r => toDate(r[idx.dtPgto])));
  if (!mes) return { ...vazio('Não foi possível saber o mês do relatório pela coluna «Dt. Pgto».'), linhasLidas: linhas.length };

  const iNr = cab.indexOf(OPCIONAIS.nrDocumento);
  const iRestante = cab.indexOf(OPCIONAIS.valorRestante);
  const iTpDoc = cab.indexOf(OPCIONAIS.tpDoc);
  const iQtdParcelas = cab.indexOf(OPCIONAIS.qtdParcelasAcordo);
  const temCarne = iTpDoc >= 0 && iQtdParcelas >= 0;
  /** Carnê: Boleto/Recorrente com mais de uma parcela (ver o cabeçalho). */
  const ehCarne = (r: unknown[]) =>
    temCarne && PAGO_MES_A_MES.has(norm(r[iTpDoc])) && (numero(r[iQtdParcelas]) ?? 0) > 1;
  const centavos = (v: number) => Math.round(v * 100);

  /** O recebido no mês por Cód. Acordo, em centavos: uma linha por parcela paga. */
  const recebidoDoAcordo = new Map<string, number>();
  for (const r of linhas) {
    const pago = toDate(r[idx.dtPgto]);
    if (!pago || iso(pago).slice(0, 7) !== mes.slice(0, 7)) continue;
    const cod = String(r[idx.codAcordo] ?? '').trim();
    const v = numero(r[idx.recebido]);
    if (!cod || v == null) continue;
    recebidoDoAcordo.set(cod, (recebidoDoAcordo.get(cod) ?? 0) + centavos(v));
  }
  const recebido = (cod: string) => recebidoDoAcordo.get(cod) ?? 0;

  const contratoDa = (r: unknown[]) =>
    (iNr >= 0 ? String(r[iNr] ?? '').trim() : '') || `acordo:${String(r[idx.codAcordo] ?? '').trim()}`;
  // Quitação ou Junção que quita (saldo zerado e a data real — a zerada do ERP é 1899).
  const quitaPeloRotulo = (r: unknown[]) => {
    const situacao = norm(r[idx.situacaoAtual]);
    if (situacao === 'quitacao') return true;
    const quitou = toDate(r[idx.dataQuitacao]);
    return situacao === 'juncao' && !!quitou && quitou.getFullYear() >= 2000
      && (iRestante < 0 || numero(r[iRestante]) === 0);
  };
  /** Contratos que têm um acordo Quitação (ou Junção que quita): os outros acordos deles só somam pelas regras abaixo. */
  const comQuitacao = new Set(linhas.filter(r => quitaPeloRotulo(r) && !ehCarne(r)).map(contratoDa));

  // 1º os acordos que quitam (um por Cód. Acordo); 2º os do mesmo contrato viram uma quitação.
  // `valor_acordo` aqui é o Valor Acordo (confere as regras); `centavosRecebidos`, o que entra.
  type Quitou = AcordoQuitado & { contrato: string; juncao: boolean; centavosRecebidos: number };
  const porAcordo = new Map<string, Quitou>();
  const foraDoMes = new Set<string>();
  /** Os carnês que terminaram no mês (Cód. Acordo): o ERP diz Quitação, o ranking não conta. */
  const carnesQueTerminaram = new Set<string>();
  /** Os OUTROS acordos do contrato com data de quitação no mês: `contrato|operador|dia` → por Cód. Acordo. */
  type Peca = { valor: number; restante: number };
  const pecas = new Map<string, Map<string, Peca>>();
  for (const r of linhas) {
    const situacao = norm(r[idx.situacaoAtual]);
    const juncao = situacao === 'juncao';
    const cod = String(r[idx.codAcordo] ?? '').trim();
    const operador = String(r[idx.operador] ?? '').trim();
    const valor = numero(r[idx.valorAcordo]);
    const quitou = toDate(r[idx.dataQuitacao]);
    if (!cod || !operador || valor == null || !quitou) continue;
    // Última parcela de carnê: nem quitação nem peça de outra quitação.
    if (ehCarne(r)) {
      if (quitou.getFullYear() >= 2000 && iso(quitou).slice(0, 7) === mes.slice(0, 7)) carnesQueTerminaram.add(cod);
      continue;
    }
    const restante = iRestante >= 0 ? numero(r[iRestante]) : null;
    const nr = iNr >= 0 ? String(r[iNr] ?? '').trim() : '';
    const contrato = contratoDa(r);
    const dia = iso(quitou);
    // Saldo zerado com a data da quitação quita, qualquer que seja o rótulo (NR 12552080:
    // Parcelamento 1/1 que pagou as parcelas atrasadas e quitou o contrato) — se o contrato
    // não tiver um acordo Quitação, que continua sendo o dono da quitação.
    const quitaPeloSaldo = restante === 0 && quitou.getFullYear() >= 2000 && !comQuitacao.has(contrato);
    const quita = quitaPeloRotulo(r) || quitaPeloSaldo;
    if (!quita) {
      // Guardado só com contrato e saldo conhecidos: sem eles não há o que conferir.
      if (nr && restante != null && dia.slice(0, 7) === mes.slice(0, 7)) {
        const chave = `${contrato}|${operador}|${dia}`;
        const doContrato = pecas.get(chave) ?? new Map<string, Peca>();
        if (!doContrato.has(cod)) doContrato.set(cod, { valor, restante });
        pecas.set(chave, doContrato);
      }
      continue;
    }
    if (dia.slice(0, 7) !== mes.slice(0, 7)) { foraDoMes.add(contrato); continue; }
    if (!porAcordo.has(cod)) {
      const tipo: TipoQuitacao = situacao === 'quitacao' ? 'quitacao' : quitaPeloRotulo(r) ? 'juncao' : 'saldo_zerado';
      porAcordo.set(cod, {
        cod_acordo: cod, operador_usuario: operador, valor_acordo: valor, data_quitacao: dia, contrato, juncao, tipo,
        centavosRecebidos: recebido(cod),
      });
    }
  }

  const porContrato = new Map<string, Quitou & { codDeJuncao: boolean }>();
  for (const a of porAcordo.values()) {
    const chave = `${a.contrato}|${a.operador_usuario}`;
    const atual = porContrato.get(chave);
    if (!atual) { porContrato.set(chave, { ...a, codDeJuncao: a.juncao }); continue; }
    atual.valor_acordo = Math.round((atual.valor_acordo + a.valor_acordo) * 100) / 100;
    atual.centavosRecebidos += a.centavosRecebidos;
    atual.juncao ||= a.juncao;
    if (FORCA[a.tipo] > FORCA[atual.tipo]) atual.tipo = a.tipo;
    // O código que fica é o do acordo Quitação (a Junção só soma).
    if (atual.codDeJuncao && !a.juncao) {
      atual.cod_acordo = a.cod_acordo;
      atual.data_quitacao = a.data_quitacao;
      atual.codDeJuncao = false;
    }
  }

  /*
   * A quitação que pagou o saldo de um Parcelamento do mesmo contrato, na mesma
   * data. Soma só quando os números fecham: o saldo em aberto é o que os outros
   * acordos pagaram. Sem acordo em aberto, nada muda (ver o cabeçalho). A
   * conferência é pelo Valor Acordo e Valor Restante; o que entra é o recebido
   * no mês por todos esses acordos.
   */
  let completandoParcelamento = 0;
  for (const q of porContrato.values()) {
    const outras = pecas.get(`${q.contrato}|${q.operador_usuario}|${q.data_quitacao}`);
    if (!outras) continue;
    const pecasDe = (aberta: boolean) => [...outras.entries()].filter(([, p]) => (p.restante > 0) === aberta);
    const fechadas = pecasDe(false);
    // Peça já paga por inteiro (saldo 0) no mesmo contrato, operador e data é parte da
    // quitação e soma o que recebeu no mês (pedido de 04/11/2026, NR 13022960: Parcelamento
    // das parcelas 1–4 + Junção das 5–8, pagos no mesmo dia — R$ 1.000 + R$ 936,80).
    for (const [cod] of fechadas) q.centavosRecebidos += recebido(cod);
    const abertas = pecasDe(true);
    if (!abertas.length) continue;
    const faltava = abertas.reduce((s, [, p]) => s + centavos(p.restante), 0);
    const quitouCom = centavos(q.valor_acordo) + fechadas.reduce((s, [, p]) => s + centavos(p.valor), 0);
    if (Math.abs(faltava - quitouCom) > 100) continue;
    for (const [cod] of abertas) q.centavosRecebidos += recebido(cod);
    completandoParcelamento += 1;
  }

  const quitacoes = [...porContrato.values()];
  return {
    mes,
    acordos: quitacoes.map(({ cod_acordo, operador_usuario, centavosRecebidos, data_quitacao, tipo }) =>
      ({ cod_acordo, operador_usuario, valor_acordo: centavosRecebidos / 100, data_quitacao, tipo })),
    linhasLidas: linhas.length,
    quitadosForaDoMes: foraDoMes.size,
    quitadosPorJuncao: quitacoes.filter(q => q.juncao).length,
    quitadosCompletandoParcelamento: completandoParcelamento,
    porTipo: {
      quitacao: quitacoes.filter(q => q.tipo === 'quitacao').length,
      juncao: quitacoes.filter(q => q.tipo === 'juncao').length,
      saldo_zerado: quitacoes.filter(q => q.tipo === 'saldo_zerado').length,
    },
    ultimasParcelasDeCarne: temCarne ? carnesQueTerminaram.size : null,
    erros: [],
  };
}

/** Lê o arquivo do ERP. Carrega o xlsx só aqui (~484 KB): a aba em si não precisa dele. */
export async function lerRelatorioQuitacao(arquivo: File): Promise<RelatorioQuitacao> {
  const { read, utils } = await import('@e965/xlsx');
  const wb = read(await arquivo.arrayBuffer(), { cellDates: true });
  const nome = wb.SheetNames.find(n => norm(n) === 'informacoes') ?? wb.SheetNames[0];
  const ws = nome ? wb.Sheets[nome] : undefined;
  if (!ws) {
    return { mes: null, acordos: [], linhasLidas: 0, quitadosForaDoMes: 0, quitadosPorJuncao: 0, quitadosCompletandoParcelamento: 0,
      porTipo: { quitacao: 0, juncao: 0, saldo_zerado: 0 }, ultimasParcelasDeCarne: null, erros: ['Planilha vazia ou inválida.'] };
  }
  return extrairQuitacoes(utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]);
}

/** Por operador (login do relatório), para a prévia da importação. Por valor, desempate pela quantidade. */
export function resumoPorOperador(acordos: AcordoQuitado[]): { operador: string; quitacoes: number; valor: number }[] {
  const m = new Map<string, { operador: string; quitacoes: number; valor: number }>();
  for (const a of acordos) {
    const atual = m.get(a.operador_usuario) ?? { operador: a.operador_usuario, quitacoes: 0, valor: 0 };
    atual.quitacoes += 1;
    atual.valor += a.valor_acordo;
    m.set(a.operador_usuario, atual);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor || b.quitacoes - a.quitacoes);
}
