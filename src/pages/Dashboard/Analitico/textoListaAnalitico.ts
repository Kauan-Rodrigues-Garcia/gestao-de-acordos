/**
 * textoListaAnalitico.ts — o texto do botão "Copiar lista".
 *
 * Sai do sistema pelo WhatsApp e chega ao operador como prestação de contas do
 * mês. Formato herdado do protótipo HTML:
 *
 *   *Nome* — acordos pagos (período)
 *   CÓDIGO - Forma - Valor recebido - Total HO - Data
 *   Total: R$ x | HO: R$ y
 *
 * Estava no rodapé de `AnaliticoLider.tsx`, fora do componente mas dentro do
 * mesmo arquivo de 1.063 linhas — puro e sem teste. Aqui é só função.
 */
import { formatBRL } from '@/lib/money';
import type { AnaliticoRecebimento } from '@/lib/supabase';

/** 'yyyy-MM-dd' → 'dd/mm/yyyy'. Sem data, travessão. */
export function fmtDataAnalitico(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Só o que aparece na lista — o resto da linha não interessa aqui. */
type LinhaLista = Pick<
  AnaliticoRecebimento,
  'codigo' | 'forma_pagamento' | 'valor_recebido' | 'total_ho' | 'data_pagamento'
>;

function rotuloDaForma(forma: AnaliticoRecebimento['forma_pagamento']): string {
  return forma === 'cartao' ? 'Cartão' : 'Boleto/Pix';
}

/** Período coberto pelas linhas: menor e maior data de pagamento. */
export function periodoDasLinhas(linhas: LinhaLista[]): string {
  const datas = linhas.map(l => l.data_pagamento).filter(Boolean).sort();
  const inicio = datas[0] ?? null;
  const fim    = datas[datas.length - 1] ?? null;
  if (!inicio) return '';
  return inicio === fim
    ? fmtDataAnalitico(inicio)
    : `${fmtDataAnalitico(inicio)} a ${fmtDataAnalitico(fim)}`;
}

export function montarTextoListaAnalitico(nome: string, linhas: LinhaLista[]): string {
  const totalRecebido = linhas.reduce((s, l) => s + l.valor_recebido, 0);
  const totalHo       = linhas.reduce((s, l) => s + l.total_ho, 0);
  const periodo       = periodoDasLinhas(linhas);

  const cabecalho = `*${nome}* — acordos pagos${periodo ? ` (${periodo})` : ''}`;
  const itens = linhas.map(l =>
    `${l.codigo} - ${rotuloDaForma(l.forma_pagamento)} - ${formatBRL(l.valor_recebido)}`
    + ` - ${formatBRL(l.total_ho)} - ${fmtDataAnalitico(l.data_pagamento)}`,
  );

  return [
    cabecalho, '', ...itens, '',
    `Total: ${formatBRL(totalRecebido)} | HO: ${formatBRL(totalHo)}`,
  ].join('\n');
}
