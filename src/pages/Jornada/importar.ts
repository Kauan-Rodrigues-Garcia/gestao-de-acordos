/**
 * importar.ts — ler uma lista de NRs colada (ou de um .csv/.txt) e montar o
 * arquivo para baixar. Contas puras, sem tela (04/11/2026).
 *
 * Cada linha traz um NR e, se quiser, a data: «12345678», «12345678;03/11/2026»,
 * «03/11/2026 12345678», colunas copiadas do Excel (tab)… A linha sem data usa
 * a data escolhida na tela. O cabeçalho («NR;Data») e linhas sem número somem.
 */
import type { ItemImportado } from '@/services/jornada/jornada.service';

export interface Leitura {
  itens: ItemImportado[];
  /** O mesmo NR mais de uma vez no mesmo mês dentro da própria lista. */
  repetidosNaLista: number;
  /** Data depois de hoje. */
  futuras: number;
  /** Linha com número, mas sem NR reconhecível ou com data impossível. */
  ignoradas: number;
}

/** «03/11/2026», «3/11/26», «03-11-2026», «2026-11-03» → ISO; senão null. */
export function lerData(t: string): string | null {
  let a: number, m: number, d: number;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (x) {
    [a, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  } else {
    x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
    if (!x) return null;
    [d, m, a] = [Number(x[1]), Number(x[2]), Number(x[3])];
    if (a < 100) a += 2000;
  }
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function lerLista(texto: string, dataPadrao: string, hoje: string): Leitura {
  const itens: ItemImportado[] = [];
  const vistos = new Set<string>();
  let repetidosNaLista = 0;
  let futuras = 0;
  let ignoradas = 0;

  for (const linha of texto.split(/\r?\n/)) {
    if (!/\d/.test(linha)) continue; // vazia ou cabeçalho
    const pedacos = linha.split(/[;,\t|]+|\s+/).map(p => p.trim().replace(/^"|"$/g, '')).filter(Boolean);

    let data: string | null = null;
    let nr: string | null = null;
    let dataRuim = false;
    for (const p of pedacos) {
      if (/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(p)) {
        const lida = lerData(p);
        if (lida) data ??= lida; else dataRuim = true;
      } else if (nr === null && /^\d{1,20}$/.test(p)) {
        nr = p;
      }
    }
    if (!nr || dataRuim) { ignoradas++; continue; }

    const dia = data ?? dataPadrao;
    if (dia > hoje) { futuras++; continue; }

    const chave = `${nr}|${dia.slice(0, 7)}`;
    if (vistos.has(chave)) { repetidosNaLista++; continue; }
    vistos.add(chave);
    itens.push({ nr, data: dia });
  }
  return { itens, repetidosNaLista, futuras, ignoradas };
}

/** CSV que abre direto no Excel em português (separador «;»), só NR e data. */
export function paraCsv(itens: ItemImportado[]): string {
  const linhas = itens.map(i => `${i.nr};${i.data.split('-').reverse().join('/')}`);
  return ['NR;Data', ...linhas].join('\r\n') + '\r\n';
}

/** Dispara o download do CSV (com BOM, para o Excel ler os acentos). */
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
