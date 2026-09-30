/**
 * Os textos do aviso de pagamento — spec §4. Puro: sem Deno, sem banco.
 *
 * A Edge Function não importa de `src/`, então o cliente abreviado e a forma do
 * pagamento são CÓPIA de `src/lib/mobile/formato.ts` (e de `familiaDaForma`, em
 * `src/lib/formasPagamento.ts`). O teste `src/lib/mobile/formato.paridade.test.ts`
 * roda os mesmos casos contra as duas cópias: mudou uma, o teste acusa.
 */

// ── Cópia de src/lib/mobile/formato.ts ──────────────────────────────────────

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function capitalizar(palavra: string): string {
  const minusc = palavra.toLocaleLowerCase('pt-BR');
  return minusc.charAt(0).toLocaleUpperCase('pt-BR') + minusc.slice(1);
}

export function limparNomeCliente(nome: string | null | undefined, codigo?: string | null): string {
  let s = String(nome ?? '').trim();
  const c = String(codigo ?? '').trim();
  if (c && s.startsWith(c)) s = s.slice(c.length);
  s = s.replace(/^\s*[-–—:|.]\s*/, '');
  s = s.replace(/^\d[\d./]*\s*[-–—:|]\s*/, '');
  s = s.replace(/^\d{4,}\s+/, '');
  return s.trim();
}

export function abreviarCliente(nome: string | null | undefined, codigo?: string | null): string {
  const partes = limparNomeCliente(nome, codigo).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'Cliente';
  const primeiro = capitalizar(partes[0]);
  const resto = partes.slice(1).filter(p => !PARTICULAS.has(p.toLocaleLowerCase('pt-BR')));
  if (resto.length === 0) return primeiro;
  const ultimo = resto[resto.length - 1];
  return `${primeiro} ${ultimo.charAt(0).toLocaleUpperCase('pt-BR')}.`;
}

const ROTULO_AJUSTE = 'Ajuste manual';
const ROTULO_CARTAO = 'Cartão';
const ROTULO_BOLETO_PIX = 'Pix/Boleto';

function familiaDaForma(rotulo: string): { chave: string; rotulo: string } | null {
  const n = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (n.includes('recorrente')) return { chave: 'cartao_recorrente', rotulo: 'Cartão recorrente' };
  if (n.includes('cart'))       return { chave: 'cartao',            rotulo: 'Cartão' };
  if (/^\s*(pix\s*\/\s*boleto|boleto\s*\/\s*pix)\s*$/.test(n)) {
    return { chave: 'boleto_pix_cofen', rotulo: 'Boleto/Pix Cofen' };
  }
  if (n.includes('boleto'))     return { chave: 'boleto',            rotulo: 'Boleto' };
  if (n.includes('pix') && n.includes('autom')) return { chave: 'pix_automatico', rotulo: 'Pix automático' };
  if (n.includes('pix'))        return { chave: 'pix',               rotulo: 'Pix' };
  return null;
}

export function formaDoPagamento(
  forma: string, detalhe?: string | null,
): { chave: string; rotulo: string } {
  const d = (detalhe ?? '').trim();
  if (d === ROTULO_AJUSTE) return { chave: 'ajuste', rotulo: ROTULO_AJUSTE };
  if (!d) {
    return forma === 'cartao'
      ? { chave: 'cartao', rotulo: ROTULO_CARTAO }
      : { chave: 'boleto_pix', rotulo: ROTULO_BOLETO_PIX };
  }
  return familiaDaForma(d) ?? { chave: d, rotulo: d };
}

// ── Os avisos ───────────────────────────────────────────────────────────────

export interface Aviso { titulo: string; corpo: string; tag?: string; url?: string }

export interface ItemFila {
  id: number;
  perfil_id: string;
  valor: number | string;
  forma_pagamento: string;
  forma_detalhe: string | null;
  nome_cliente: string | null;
  /** NR do pagamento (`codigo` do analítico). Ausente em fila de antes de 20260930170000. */
  codigo?: string | null;
}

export interface PessoaLote {
  em_ho: boolean;
  antes: number | string;
  depois: number | string;
  degraus: (number | string)[];
}

export interface AvisosDaPessoa {
  perfilId: string;
  ids: number[];
  avisos: Aviso[];
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/** Singular e plural de cada forma, para o resumo. */
const NOMES: Record<string, [string, string]> = {
  pix: ['Pix', 'Pix'],
  pix_automatico: ['Pix automático', 'Pix automáticos'],
  boleto: ['boleto', 'boletos'],
  cartao: ['cartão', 'cartões'],
  cartao_recorrente: ['cartão recorrente', 'cartões recorrentes'],
  boleto_pix: ['Pix/Boleto', 'Pix/Boleto'],
  boleto_pix_cofen: ['Boleto/Pix Cofen', 'Boleto/Pix Cofen'],
  ajuste: ['ajuste', 'ajustes'],
};

/**
 * O corpo do aviso de UM pagamento — pedido de 30/09/2026: o nome, embaixo o
 * NR, depois o valor. Duas linhas (o Android e o iPhone mostram as duas na
 * notificação recolhida):
 *
 *   Maria S.
 *   NR 12345 · Pix de R$ 350,00
 */
export function linhasDoPagamento(i: Pick<ItemFila, 'valor' | 'forma_pagamento' | 'forma_detalhe' | 'nome_cliente' | 'codigo'>): string {
  const f = formaDoPagamento(i.forma_pagamento, i.forma_detalhe);
  const nr = String(i.codigo ?? '').trim();
  const valor = `${f.rotulo} de ${brl(Number(i.valor) || 0)}`;
  return `${abreviarCliente(i.nome_cliente, nr)}\n${nr ? `NR ${nr} · ` : ''}${valor}`;
}

/** Quantas faixas estão batidas com `valor`. Degraus em ordem (1ª, 2ª…). */
export function faixasBatidas(valor: number, degraus: number[]): number {
  return degraus.filter(d => d > 0 && valor >= d).length;
}

/**
 * Os avisos de um lote, por pessoa — spec §4:
 *   • até `corte` pagamentos: um aviso cada;
 *   • acima: um resumo com o total, as formas e o recebido do mês;
 *   • cruzou faixa da meta no lote: mais um aviso, só com a maior.
 * O valor do pagamento é BRUTO (o que o cliente pagou); o «no mês» e a meta
 * estão na unidade do Dashboard (H.O. na PaguePlay) — vêm prontos do banco.
 */
export function montarAvisos(
  itens: ItemFila[], pessoas: Record<string, PessoaLote>, corte: number, mes: string,
): AvisosDaPessoa[] {
  const porPessoa = new Map<string, ItemFila[]>();
  for (const i of itens) {
    const lista = porPessoa.get(i.perfil_id) ?? [];
    lista.push(i);
    porPessoa.set(i.perfil_id, lista);
  }

  const saida: AvisosDaPessoa[] = [];
  for (const [perfilId, lista] of porPessoa) {
    const avisos: Aviso[] = [];
    if (lista.length <= corte) {
      for (const i of lista) {
        avisos.push({
          titulo: '💰 Pagamento recebido!',
          corpo: linhasDoPagamento(i),
          tag: `pgto:${i.id}`,
          url: '/#/m?novos=1',
        });
      }
    } else {
      const total = lista.reduce((s, i) => s + (Number(i.valor) || 0), 0);
      const contagem = new Map<string, number>();
      for (const i of lista) {
        const c = formaDoPagamento(i.forma_pagamento, i.forma_detalhe).chave;
        contagem.set(c, (contagem.get(c) ?? 0) + 1);
      }
      const formas = [...contagem.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${n} ${(NOMES[c] ?? [c, c])[n === 1 ? 0 : 1]}`)
        .join(', ');
      const p = pessoas[perfilId];
      const noMes = p ? ` · no mês: ${brl(Number(p.depois) || 0)}` : '';
      avisos.push({
        titulo: `💰 Você recebeu ${lista.length} pagamentos!`,
        corpo: `${brl(total)} · ${formas}${noMes}`,
        tag: `lote:${perfilId}:${lista[0].id}`,
        url: '/#/m?novos=1',
      });
    }

    const p = pessoas[perfilId];
    if (p) {
      const degraus = p.degraus.map(Number);
      const antes = faixasBatidas(Number(p.antes) || 0, degraus);
      const depois = faixasBatidas(Number(p.depois) || 0, degraus);
      if (depois > antes) {
        avisos.push({
          titulo: `🎯 Você bateu a ${depois}ª meta!`,
          corpo: 'Toque para ver sua comissão',
          tag: `meta:${perfilId}:${mes}:${depois}`,
          url: '/#/m',
        });
      }
    }

    saida.push({ perfilId, ids: lista.map(i => i.id), avisos });
  }
  return saida;
}
