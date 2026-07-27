/**
 * parser.ts — lê a aba operacional de uma planilha e classifica as linhas.
 *
 * Determinístico e injetável: recebe a worksheet do ExcelJS já aberta e um
 * `resolverOperador` (login normalizado → operador | null | 'AMBIGUOUS'). Não
 * acessa banco nem move dinheiro; só transforma o Excel em ResultadoArquivo com
 * a prévia consolidada por operador.
 */

import type { Worksheet, Cell } from 'exceljs';
import {
  normalizarLogin, normalizarNr, normalizarCabecalho, mapearCabecalhos, cabecalhoTemObrigatorios,
  type CampoPlanilha,
} from './normalizar';
import { statusDaLinha, type FillLike } from './corStatus';
import { paraEscala5, somarEscala5, arredondarHalfUp, arredondar2HalfUp } from './consolidar';
import type {
  LinhaPlanilha, StatusLinha, ConsolidadoOperador, ResultadoArquivo,
} from './types';

export type OperadorResolvido = { id: string; nome: string; setorId: string | null };
export type ResolverOperador =
  (loginNormalizado: string) => OperadorResolvido | null | 'AMBIGUOUS';

/** sha256 hex (Web Crypto — browser e Node 20+). */
export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Texto limpo de uma célula (sem formatação/nbsp nas pontas). */
function textoCelula(cell: Cell): string {
  const t = cell.text;
  return (t == null ? "" : String(t)).trim();
}

/** Valor numérico exato como string decimal (fórmula usa o resultado calculado). */
function valorDecimalCelula(cell: Cell): string | null {
  const v = cell.value as unknown;
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown };
    if (typeof o.result === 'number') return String(o.result);
  }
  const t = textoCelula(cell);
  if (!t) return null;
  return t;
}

/** Data ISO a partir de Date ou serial do Excel. */
function dataISO(cell: Cell): string | null {
  const v = cell.value as unknown;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // serial Excel (base 1899-12-30)
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const t = textoCelula(cell);
  return t || null;
}

function acharLinhaCabecalho(ws: Worksheet): number {
  for (let r = 1; r <= 10; r++) {
    const vals = ws.getRow(r).values as unknown[];
    if (Array.isArray(vals) && vals.some(v => normalizarCabecalho(v) === 'login')) return r;
  }
  return -1;
}

function fillDaCelula(cell: Cell): FillLike | null {
  return (cell.fill as FillLike | undefined) ?? null;
}

export interface OpcoesLeitura {
  principal: string;         // responsável (nome do arquivo)
  nomeArquivo: string;
  hashArquivo: string;
  resolverOperador: ResolverOperador;
}

/** Lê a aba operacional e produz o resultado classificado + consolidado. */
export async function lerAbaOperacional(ws: Worksheet, opc: OpcoesLeitura): Promise<ResultadoArquivo> {
  const base: ResultadoArquivo = {
    nomeArquivo: opc.nomeArquivo, principal: opc.principal, abaUsada: ws.name,
    hashArquivo: opc.hashArquivo, ok: false, linhas: [],
    totais: { verdesPagas: 0, pendentes: 0, needsReview: 0, operadoresComPendencia: 0, totalPendenteBruto: '0.00000' },
    consolidado: [],
  };

  const hdr = acharLinhaCabecalho(ws);
  if (hdr < 0) { base.error = 'Cabeçalho não encontrado (linha com "Login").'; return base; }

  const mapa = mapearCabecalhos(ws.getRow(hdr).values as unknown[]);
  if (!cabecalhoTemObrigatorios(mapa)) {
    base.error = 'Cabeçalho sem colunas obrigatórias (Login, nr, Meta batida-Pendente).';
    return base;
  }
  const col = (c: CampoPlanilha) => mapa[c];
  const colData = col('data') ?? col('login')!;
  const colMeta = col('metaBatidaPendente')!;
  const colSuper = col('super');

  const principalNorm = normalizarLogin(opc.principal);
  const linhas: LinhaPlanilha[] = [];
  const pendentesBrutos: string[] = [];

  for (let r = hdr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const loginOriginal = textoCelula(row.getCell(col('login')!));
    const nrOriginal = textoCelula(row.getCell(col('nr')!));
    const metaStr = valorDecimalCelula(row.getCell(colMeta));

    // Validação: Login + nr + Meta>0
    let metaEscala5: bigint | null = null;
    try { metaEscala5 = metaStr != null ? paraEscala5(metaStr) : null; } catch { metaEscala5 = null; }
    const valida = !!loginOriginal && !!nrOriginal && metaEscala5 != null && metaEscala5 > 0n;
    if (!valida) continue; // ignora cabeçalho/total/vazio/zero/resumo lateral

    // Status por cor (colunas de dados, excluindo Super)
    const fills: (FillLike | null)[] = [];
    for (let c = colData; c <= colMeta; c++) {
      if (colSuper !== undefined && c === colSuper) continue;
      fills.push(fillDaCelula(row.getCell(c)));
    }
    const statusCor = statusDaLinha(fills);

    const loginNorm = normalizarLogin(loginOriginal);
    const nrNorm = normalizarNr(nrOriginal);
    const chave = await sha256Hex(`${principalNorm}|${nrNorm}|${loginNorm}`);

    let status: StatusLinha;
    let operadorId: string | null = null;
    let operadorNome: string | null = null;
    let operadorSetorId: string | null = null;
    let observacao: string | undefined;

    if (statusCor === 'PAGO') {
      status = 'PAGO_EXTERNO';
    } else if (statusCor === 'CONFLITO') {
      status = 'NEEDS_REVIEW';
      observacao = 'Cores conflitantes sem predominância.';
    } else {
      // PENDENTE → tenta vincular operador
      const op = opc.resolverOperador(loginNorm);
      if (op === 'AMBIGUOUS') { status = 'AMBIGUOUS_OPERATOR'; observacao = 'Mais de um operador para o login.'; }
      else if (op == null) { status = 'OPERATOR_NOT_FOUND'; observacao = 'Login sem operador cadastrado.'; }
      else { status = 'PENDENTE'; operadorId = op.id; operadorNome = op.nome; operadorSetorId = op.setorId; }
    }

    linhas.push({
      linhaExcel: r,
      loginOriginal, loginNormalizado: loginNorm,
      nrOriginal, nrNormalizado: nrNorm,
      superLinha: colSuper !== undefined ? (textoCelula(row.getCell(colSuper)) || null) : null,
      dataISO: col('data') !== undefined ? dataISO(row.getCell(col('data')!)) : null,
      matricula: col('matricula') !== undefined ? (textoCelula(row.getCell(col('matricula')!)) || null) : null,
      valorNota: col('valorNota') !== undefined ? valorDecimalCelula(row.getCell(col('valorNota')!)) : null,
      percentual: col('percentual') !== undefined ? valorDecimalCelula(row.getCell(col('percentual')!)) : null,
      valorCalculado: col('valorCalculado') !== undefined ? valorDecimalCelula(row.getCell(col('valorCalculado')!)) : null,
      metaBatidaPendente: metaStr!,
      statusCor, status, chaveIdempotente: chave,
      operadorId, operadorNome, operadorSetorId, observacao,
    });

    if (statusCor === 'PENDENTE') pendentesBrutos.push(metaStr!);
  }

  // Consolidação por operador (só PENDENTE vinculado)
  const porOperador = new Map<string, ConsolidadoOperador>();
  for (const l of linhas) {
    if (l.status !== 'PENDENTE' || !l.operadorId) continue;
    const atual = porOperador.get(l.operadorId) ?? {
      operadorId: l.operadorId, operadorNome: l.operadorNome ?? '', operadorSetorId: l.operadorSetorId,
      loginNormalizado: l.loginNormalizado,
      totalBruto: '0', totalArredondado: '0.00', linhas: [],
    };
    atual.linhas.push(l);
    porOperador.set(l.operadorId, atual);
  }
  for (const c of porOperador.values()) {
    const soma = somarEscala5(c.linhas.map(l => l.metaBatidaPendente));
    c.totalBruto = arredondarHalfUp(soma, 5);
    c.totalArredondado = arredondar2HalfUp(soma);
  }

  const verdes = linhas.filter(l => l.status === 'PAGO_EXTERNO').length;
  const pendentes = linhas.filter(l => l.status === 'PENDENTE').length;
  const needsReview = linhas.filter(l =>
    l.status === 'NEEDS_REVIEW' || l.status === 'OPERATOR_NOT_FOUND' || l.status === 'AMBIGUOUS_OPERATOR').length;

  base.ok = true;
  base.linhas = linhas;
  base.totais = {
    verdesPagas: verdes,
    pendentes,
    needsReview,
    operadoresComPendencia: porOperador.size,
    totalPendenteBruto: arredondarHalfUp(somarEscala5(pendentesBrutos.length ? pendentesBrutos : ['0']), 5),
  };
  base.consolidado = [...porOperador.values()].sort((a, b) => a.operadorNome.localeCompare(b.operadorNome));
  return base;
}
