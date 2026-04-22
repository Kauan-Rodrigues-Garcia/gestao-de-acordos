/**
 * REGRESSÃO — bug do dia 14 em planilhas "modo blocos por data".
 *
 * Contexto:
 *   O usuário reportou que, ao importar uma planilha com múltiplos blocos
 *   de data (14/04, 17/04, 25/04), o parser descartava silenciosamente o
 *   bloco do dia 14 e só produzia registros a partir do dia 17.
 *
 * Causa-raiz:
 *   A função `detectarCampo` usava `startsWith` flexível (p.ex. a célula
 *   "CLIENTE A" batia com a keyword "cliente" e "BANCO X" com "banco").
 *   Uma linha de dados como
 *     ["1001","CLIENTE A","100,00","1x","PENDENTE","(11)91111-1111","BANCO X"]
 *   acumulava 2 falsos positivos e era classificada como "cabecalho".
 *   Consequência: o primeiro bloco virava um mar de cabeçalhos repetidos e
 *   nenhum registro era criado — como se o dia 14 não existisse.
 *
 * Correção aplicada em ImportarExcel.tsx:
 *   1) `classificarLinha` agora usa `detectarCampoHeader` (estrita, via
 *      `importar_excel_keywords.ts`). Ela só aceita startsWith se o resto
 *      da célula for composto apenas por conectores/keywords
 *      (ex: "Nome do Cliente" ✓, "Cliente A" ✗).
 *   2) `classificarLinha` passo 6b: reconhece acordo_bloco em layout
 *      NR-first (col[0]=NR numérico + col[1]=nome-like + valor nas demais),
 *      que é o layout do modelo padrão do produto.
 *   3) `mapaAcordoBloco` detecta a variante NR-first e mapeia
 *      col[0]→nr_cliente, col[1]→nome_cliente (em vez do legado
 *      col[0]→nome_cliente).
 *
 * Este teste congela o comportamento correto usando uma fixture minimal
 * com nomes e instituições fictícias que disparavam o startsWith.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, perfil: null }) }));

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';

describe('Importar Excel — blocos 14/17/25 (regressão do bug do dia 14)', () => {
  async function carregar() {
    const filePath = path.resolve(process.cwd(), 'tests/fixtures/blocos-14-17-25.xlsx');
    const buf = fs.readFileSync(filePath);
    const wb  = xlsxRead(buf, { type: 'buffer', cellDates: false, raw: true });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsxUtils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const mod = await import('@/pages/ImportarExcel');
    return { rows, ...mod };
  }

  it('classifica cada linha da fixture corretamente', async () => {
    const { rows, classificarLinha } = await carregar();
    const tipos = rows.map(classificarLinha);
    // 1 data_bloco  -> 2 cabecalho -> 3/4 acordo_bloco -> 5 vazia
    // 6 data_bloco  -> 7 cabecalho -> 8 acordo_bloco   -> 9 vazia
    // 10 data_bloco -> 11 cabecalho -> 12 acordo_bloco
    expect(tipos).toEqual([
      'data_bloco',  'cabecalho',   'acordo_bloco', 'acordo_bloco', 'vazia',
      'data_bloco',  'cabecalho',   'acordo_bloco', 'vazia',
      'data_bloco',  'cabecalho',   'acordo_bloco',
    ]);
  });

  it('parseia 4 registros distribuídos em 3 blocos, cada um com a data do seu bloco', async () => {
    const { rows, parsearPlanilha } = await carregar();
    const resultado = parsearPlanilha(rows);

    expect(resultado.modo).toBe('blocos');
    expect(resultado.blocos).toBe(3);
    expect(resultado.registros).toHaveLength(4);

    // Distribuição por bloco
    const porVenc = resultado.registros.reduce<Record<string, number>>((acc, r) => {
      acc[r.vencimento] = (acc[r.vencimento] ?? 0) + 1;
      return acc;
    }, {});
    expect(porVenc).toEqual({
      '2026-04-14': 2, // CLIENTE A + CLIENTE B
      '2026-04-17': 1, // CLIENTE C
      '2026-04-25': 1, // CLIENTE D
    });
  });

  it('mapeia NR, NOME, VALOR, PARCELAS, STATUS, WHATS, INSTITUIÇÃO corretamente (layout NR-first)', async () => {
    const { rows, parsearPlanilha } = await carregar();
    const registros = parsearPlanilha(rows).registros;

    // Ordem preservada do arquivo: L3, L4, L8, L12
    expect(registros[0]).toMatchObject({
      vencimento: '2026-04-14',
      nr_cliente: '1001',
      nome_cliente: 'CLIENTE A',
      valor: 100,
      parcelas: 1,
      status: 'verificar_pendente',
      instituicao: 'BANCO X',
    });
    expect(registros[0].whatsapp).toMatch(/11911111111/);

    expect(registros[1]).toMatchObject({
      vencimento: '2026-04-14',
      nr_cliente: '1002',
      nome_cliente: 'CLIENTE B',
      valor: 200,
      parcelas: 2,
      status: 'pago',
      instituicao: 'BANCO Y',
    });

    expect(registros[2]).toMatchObject({
      vencimento: '2026-04-17',
      nr_cliente: '1003',
      nome_cliente: 'CLIENTE C',
      valor: 300,
      parcelas: 1,
      status: 'verificar_pendente',
      instituicao: 'BANCO Z',
    });

    expect(registros[3]).toMatchObject({
      vencimento: '2026-04-25',
      nr_cliente: '1004',
      nome_cliente: 'CLIENTE D',
      valor: 400,
      parcelas: 1,
      status: 'pago',
      instituicao: 'BANCO W',
    });
  });

  it('NÃO descarta o bloco do dia 14 — guarda contra regressão do bug original', async () => {
    const { rows, parsearPlanilha } = await carregar();
    const registros = parsearPlanilha(rows).registros;
    const nomesDia14 = registros
      .filter(r => r.vencimento === '2026-04-14')
      .map(r => r.nome_cliente);
    expect(nomesDia14).toEqual(['CLIENTE A', 'CLIENTE B']);
  });
});
