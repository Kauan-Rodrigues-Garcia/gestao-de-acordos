/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTE DE INTEGRAÇÃO — PARSER DA PLANILHA REAL DA PAGUEPLAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Valida o parser ponta-a-ponta contra a planilha real fornecida pelo cliente:
 *   uploaded_files/Planilha sem título (1).xlsx
 *
 * Estrutura real esperada:
 *   Row 1 (decorativa): "Dados Obrigatórios" ... "Dados Opcionais"
 *   Row 2 (header):     Inscrição | Estado | Forma de pagamento | Quant. Parcelas
 *                       | Valor | Data de venci. | Status... | Nome do profissional
 *                       | CPF | Whatsapp
 *   Rows 3-7 (dados):   5 acordos com NR numérico em col A, UF em B, tipo em C,
 *                       parcelas em D, valor em E, vencimento em F, status em G,
 *                       nome em H.
 *
 * REGRESSÃO PROTEGIDA: "Nenhum registro reconhecido. Verifique o formato da planilha."
 * — antes a col A (NR numérico puro, ex: 1000.0) fazia classificarLinha classificar
 * cada linha de dados como 'ruido' (fallback), e o parsearTabela pulava todas elas.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Stub do cliente Supabase para evitar "supabaseUrl is required" ao importar a página.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  },
}));

// Stub do hook useAuth (puxado transitivamente pela página).
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, perfil: null }) }));

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';

describe('parsearPlanilha — planilha real da PaguePlay', () => {
  // Timeout generoso: o primeiro carregamento inclui dynamic import de
  // ImportarExcel.tsx (transformação SWC da página inteira) + leitura XLSX.
  const TEST_TIMEOUT = 30_000;

  // Cache: carrega a página + planilha UMA VEZ para o describe inteiro.
  let _cache: Awaited<ReturnType<typeof carregarPlanilhaImpl>> | null = null;

  async function carregarPlanilhaImpl() {
    const filePath = path.resolve(
      process.cwd(),
      'tests/fixtures/pagueplay-planilha-real.xlsx',
    );
    const buf = fs.readFileSync(filePath);
    const wb  = xlsxRead(buf, { type: 'buffer', cellDates: false, raw: true });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsxUtils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const { parsearPlanilha, classificarLinha } = await import('@/pages/ImportarExcel');
    return { rows, parsearPlanilha, classificarLinha };
  }

  async function carregarPlanilha() {
    if (!_cache) _cache = await carregarPlanilhaImpl();
    return _cache;
  }

  beforeAll(async () => {
    // Pré-aquece o cache (amortiza o custo do 1º import em um único lugar).
    await carregarPlanilha();
  }, TEST_TIMEOUT);

  it('carrega as 7 linhas esperadas da planilha real', async () => {
    const { rows } = await carregarPlanilha();
    expect(rows.length).toBeGreaterThanOrEqual(7);
  });

  it('classifica Row 1 (decorativa) como ruído', async () => {
    const { rows, classificarLinha } = await carregarPlanilha();
    expect(classificarLinha(rows[0])).toBe('ruido');
  });

  it('classifica Row 2 (headers) como cabeçalho', async () => {
    const { rows, classificarLinha } = await carregarPlanilha();
    expect(classificarLinha(rows[1])).toBe('cabecalho');
  });

  it('produz 5 registros a partir das 5 linhas de dados (antes era 0)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros, modo } = parsearPlanilha(rows);
    expect(modo).toBe('tabela');
    expect(registros.length).toBe(5);
  });

  it('todos os 5 registros são válidos (têm vencimento e valor)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    for (const r of registros) {
      expect(r.valido).toBe(true);
      expect(r.vencimento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.valor).toBeGreaterThan(0);
    }
  });

  it('mapeia corretamente o primeiro registro (Inscrição 1000, Heloisa, PI, Boleto)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    const r0 = registros[0];
    // PaguePlay: col A 'Inscrição' → instituicao; CPF (col I) → nr_cliente (vazio nesta amostra)
    expect(r0.instituicao).toBe('1000');
    expect(r0.nr_cliente).toBe(''); // CPF vazio na planilha-exemplo
    expect(r0.nome_cliente).toContain('Heloisa');
    expect(r0.estado_uf).toBe('PI');
    expect(r0.tipo).toBe('boleto');
    expect(r0.parcelas).toBe(5);
    expect(r0.valor).toBeCloseTo(350.39, 2);
    expect(r0.vencimento).toBe('2026-04-22');
    expect(r0.status).toBe('verificar_pendente'); // 'pendente' → verificar_pendente (semântica preexistente)
  });

  it('reconhece "pago" (Row 4: Fátima, PIX)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    const r1 = registros[1];
    expect(r1.instituicao).toBe('2000');
    expect(r1.nome_cliente).toMatch(/F[aá]tima/);
    expect(r1.estado_uf).toBe('MT');
    expect(r1.tipo).toBe('pix');
    expect(r1.parcelas).toBe(3);
    expect(r1.status).toBe('pago');
  });

  it('reconhece tipo "Cartão" (Row 5: Maria Gabriela, MAIÚSCULA)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    const r2 = registros[2];
    expect(r2.instituicao).toBe('3000');
    expect(r2.estado_uf).toBe('PI');
    expect(r2.tipo).toBe('cartao');
    expect(r2.parcelas).toBe(12);
  });

  it('reconhece tipo "boleto" em minúscula (Row 6: Willian, MA)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    const r3 = registros[3];
    expect(r3.instituicao).toBe('4000');
    expect(r3.estado_uf).toBe('MA');
    expect(r3.tipo).toBe('boleto');
    expect(r3.parcelas).toBe(1);
  });

  it('reconhece tipo "cartão" em minúscula (Row 7: Gabriel, CE, pago)', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    const r4 = registros[4];
    expect(r4.instituicao).toBe('5000');
    expect(r4.estado_uf).toBe('CE');
    expect(r4.tipo).toBe('cartao');
    expect(r4.status).toBe('pago');
    expect(r4.valor).toBeCloseTo(4530, 2);
  });

  it('UFs de todos os estados reconhecidos: PI, MT, PI, MA, CE', async () => {
    const { rows, parsearPlanilha } = await carregarPlanilha();
    const { registros } = parsearPlanilha(rows);
    expect(registros.map(r => r.estado_uf)).toEqual(['PI', 'MT', 'PI', 'MA', 'CE']);
  });
});
