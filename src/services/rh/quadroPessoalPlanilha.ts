/**
 * quadroPessoalPlanilha.ts — o Quadro de Pessoal para dentro e para fora do Excel.
 *
 * Só esta parte conhece o `xlsx`, e o carrega quando alguém clica: a
 * biblioteca pesa, e a tela abre sem ela (a mesma lição do Pix, 19/10/2026).
 *
 * Ler a planilha acontece no navegador e termina no navegador. O arquivo não
 * sobe para lugar nenhum e nada é gravado — é o que deixa a «importação» do RH
 * ser uma conferência, e não uma edição do cadastro.
 */
import { baixarArquivo, TIPO_XLSX } from '@/lib/baixarArquivo';
import type { LinhaPlanilha, PlanilhaQuadro } from './quadroPessoal';

/** Larguras legíveis: a do cabeçalho ou do maior valor, entre 8 e 42. */
function larguras(linhas: readonly LinhaPlanilha[]): { wch: number }[] {
  const chaves = Object.keys(linhas[0] ?? {});
  return chaves.map(k => ({
    wch: Math.min(42, Math.max(8, k.length + 2, ...linhas.map(l => String(l[k] ?? '').length + 1))),
  }));
}

export async function baixarPlanilha(
  abas: Partial<PlanilhaQuadro> | Record<string, LinhaPlanilha[]>,
  nomeArquivo: string,
): Promise<void> {
  const { utils, write } = await import('@e965/xlsx');
  const wb = utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    if (!linhas) continue;
    const ws = linhas.length ? utils.json_to_sheet(linhas) : utils.aoa_to_sheet([['Nada nesta aba']]);
    if (linhas.length) ws['!cols'] = larguras(linhas);
    utils.book_append_sheet(wb, ws, nome.slice(0, 31));
  }
  const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  baixarArquivo(buf, nomeArquivo, TIPO_XLSX);
}

export interface PlanilhaLida {
  aba: string;
  linhas: Record<string, unknown>[];
}

/**
 * As linhas da planilha, como objetos pelo cabeçalho.
 *
 * Abre a aba «Pessoas» quando existe (é a do arquivo que esta tela exporta);
 * senão, a primeira. CSV também passa — o `xlsx` lê os dois.
 */
export async function lerPlanilha(arquivo: File): Promise<PlanilhaLida> {
  const { read, utils } = await import('@e965/xlsx');
  const wb = read(await arquivo.arrayBuffer(), { type: 'array', cellDates: false });
  const aba = wb.SheetNames.find(n => n.trim().toLowerCase() === 'pessoas') ?? wb.SheetNames[0];
  if (!aba) return { aba: '', linhas: [] };
  const linhas = utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[aba], { defval: '', raw: false });
  return { aba, linhas };
}
