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
  const n = rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
//
// Visual de 30/09/2026 (exemplo aprovado): textos sem emoji, diretos, e um
// ÍCONE PRÓPRIO por tipo (`icone` → /icons/avisos/<icone>.png, desenhado no
// estilo do ícone do app). O iPhone mostra sempre o ícone do app instalado; o
// título já diz o que é.

/** Os ícones por tipo — os arquivos de `public/icons/avisos/`. */
export type IconeAviso = 'pagamento' | 'saida' | 'meta' | 'operador' | 'equipe' | 'resumo';

export interface Aviso { titulo: string; corpo: string; tag?: string; url?: string; icone?: IconeAviso }

export interface ItemFila {
  id: number;
  perfil_id: string;
  valor: number | string;
  forma_pagamento: string;
  forma_detalhe: string | null;
  nome_cliente: string | null;
  /** NR do pagamento (`codigo` do analítico). Ausente em fila de antes de 20260930175642. */
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

/** «Maria S. · NR 12345» — o cliente e, se houver, o NR. */
function clienteENr(nome: string | null, codigo: string | null | undefined): string {
  const nr = String(codigo ?? '').trim();
  return `${abreviarCliente(nome, nr)}${nr ? ` · NR ${nr}` : ''}`;
}

/**
 * O corpo do aviso de UM pagamento — o cliente com o NR, embaixo a forma e o
 * valor (o Android e o iPhone mostram as duas linhas recolhidas):
 *
 *   Maria S. · NR 12345
 *   Pix · R$ 350,00
 */
export function linhasDoPagamento(i: Pick<ItemFila, 'valor' | 'forma_pagamento' | 'forma_detalhe' | 'nome_cliente' | 'codigo'>): string {
  const f = formaDoPagamento(i.forma_pagamento, i.forma_detalhe);
  return `${clienteENr(i.nome_cliente, i.codigo)}\n${f.rotulo} · ${brl(Number(i.valor) || 0)}`;
}

/** Quantas faixas estão batidas com `valor`. Degraus em ordem (1ª, 2ª…). */
export function faixasBatidas(valor: number, degraus: number[]): number {
  return degraus.filter(d => d > 0 && valor >= d).length;
}

/**
 * Os avisos de PAGAMENTO de um lote, por pessoa — spec §4:
 *   • até `corte` pagamentos: um aviso cada;
 *   • acima: um resumo com o total, as formas e o recebido do mês.
 * O valor do pagamento é BRUTO (o que o cliente pagou); o «no mês» está na
 * unidade do Dashboard (H.O. na PaguePlay) — vem pronto do banco.
 *
 * A meta alcançada saiu daqui (20260930195304): é conferida por estado no
 * banco, para avisar também quem lidera — ver `montarAvisosMetaOperador`.
 */
export function montarAvisos(
  itens: ItemFila[], pessoas: Record<string, PessoaLote>, corte: number,
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
          titulo: 'Pagamento recebido',
          corpo: linhasDoPagamento(i),
          tag: `pgto:${i.id}`,
          url: '/#/m?novos=1',
          icone: 'pagamento',
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
      const noMes = p ? `\nNo mês: ${brl(Number(p.depois) || 0)}` : '';
      avisos.push({
        titulo: `${lista.length} pagamentos recebidos`,
        corpo: `${brl(total)} · ${formas}${noMes}`,
        tag: `lote:${perfilId}:${lista[0].id}`,
        url: '/#/m?novos=1',
        icone: 'pagamento',
      });
    }
    saida.push({ perfilId, ids: lista.map(i => i.id), avisos });
  }
  return saida;
}

// ── Pagamento que saiu do recebimento (20260930175642) ─────────────────────

export interface ItemSaida extends ItemFila {
  /** 'removido' (apagado) | 'transferido' (foi para outra pessoa). */
  motivo: string;
}

export interface PessoaSaida {
  em_ho: boolean;
  /** Recebido hoje, já sem o que saiu — unidade do Dashboard. */
  hoje: number | string;
  /** Recebido no mês, já sem o que saiu — unidade do Dashboard. */
  mes: number | string;
}

/**
 * Os avisos de saída — dizer que o valor saiu do recebimento e mostrar sempre o
 * total recebido no dia (já sem ele):
 *
 *   Pagamento retirado do recebimento
 *   Maria S. · NR 12345 · R$ 350,00
 *   Recebido hoje: R$ 1.240,00
 *
 * Acima do corte, um resumo com o total que saiu, o de hoje e o do mês.
 */
export function montarAvisosDeSaida(
  itens: ItemSaida[], pessoas: Record<string, PessoaSaida>, corte: number,
): AvisosDaPessoa[] {
  const porPessoa = new Map<string, ItemSaida[]>();
  for (const i of itens) {
    const lista = porPessoa.get(i.perfil_id) ?? [];
    lista.push(i);
    porPessoa.set(i.perfil_id, lista);
  }

  const saida: AvisosDaPessoa[] = [];
  for (const [perfilId, lista] of porPessoa) {
    const p = pessoas[perfilId];
    const rotuloHoje = p?.em_ho ? 'Recebido hoje (H.O.)' : 'Recebido hoje';
    const hoje = p ? `\n${rotuloHoje}: ${brl(Number(p.hoje) || 0)}` : '';
    const avisos: Aviso[] = [];
    if (lista.length <= corte) {
      for (const i of lista) {
        avisos.push({
          titulo: 'Pagamento retirado do recebimento',
          corpo: `${clienteENr(i.nome_cliente, i.codigo)} · ${brl(Number(i.valor) || 0)}${hoje}`,
          tag: `saida:${i.id}`,
          url: '/#/m',
          icone: 'saida',
        });
      }
    } else {
      const total = lista.reduce((s, i) => s + (Number(i.valor) || 0), 0);
      const noMes = p ? ` · no mês: ${brl(Number(p.mes) || 0)}` : '';
      avisos.push({
        titulo: `${lista.length} pagamentos retirados do recebimento`,
        corpo: `${brl(total)} no total${hoje}${noMes}`,
        tag: `saidas:${perfilId}:${lista[0].id}`,
        url: '/#/m',
        icone: 'saida',
      });
    }
    saida.push({ perfilId, ids: lista.map(i => i.id), avisos });
  }
  return saida;
}

// ── Avisos de META e da EQUIPE (20260930192744, 20260930195304) ─────────────

/** Junta os avisos por pessoa (alguém pode receber de várias equipes). */
function porPessoa(): { add: (perfilId: string, aviso: Aviso) => void; lista: () => AvisosDaPessoa[] } {
  const mapa = new Map<string, Aviso[]>();
  return {
    add: (perfilId, aviso) => {
      const l = mapa.get(perfilId) ?? [];
      if (!l.some(a => a.tag && a.tag === aviso.tag)) l.push(aviso);
      mapa.set(perfilId, l);
    },
    lista: () => [...mapa.entries()].map(([perfilId, avisos]) => ({ perfilId, ids: [], avisos })),
  };
}

/** «Maria» — o primeiro nome, capitalizado. */
export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? capitalizar(p) : '';
}

/** Uma equipe que acabou de alcançar a meta do mês — `fn_push_metas_da_rodada`. */
export interface EquipeNaMeta {
  equipe_id: string;
  equipe_nome: string;
  mes: string;
  /** Quem lidera (sempre) e quem ligou a chave «meta da equipe». */
  destinatarios: string[];
}

/**
 * «Equipe alcançou a meta» — só para quem lidera (e o elite que ligou a chave).
 * SEM valores: a tela de bloqueio é pública.
 *
 *   Equipe Bryan alcançou a meta
 *   Parabéns! Meta do mês concluída.
 */
export function montarAvisosMetaEquipe(equipes: EquipeNaMeta[]): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const e of equipes) {
    for (const id of e.destinatarios ?? []) {
      saida.add(id, {
        titulo: `${e.equipe_nome} alcançou a meta`,
        corpo: 'Parabéns! Meta do mês concluída.',
        tag: `meta-equipe:${e.equipe_id}:${e.mes}`,
        url: `/#/m/equipe?equipe=${e.equipe_id}`,
        icone: 'equipe',
      });
    }
  }
  return saida.lista();
}

/** Um operador que acabou de alcançar faixa nova — `fn_push_metas_da_rodada`. */
export interface OperadorNaMeta {
  perfil_id: string;
  nome: string | null;
  mes: string;
  /** A MAIOR faixa alcançada agora (1 = 1ª meta). */
  faixa: number;
  /** A própria pessoa tem aparelho para receber. */
  proprio: boolean;
  /** As equipes dela, com quem recebe o aviso de meta de operador em cada uma. */
  equipes: { equipe_id: string; equipe_nome: string; destinatarios: string[] }[];
}

/**
 * Meta alcançada pelo operador — pedido de 30/09/2026:
 *   • a própria pessoa: na 1ª faixa, parabéns; da 2ª em diante, só o fato;
 *
 *       Parabéns, Maria                    Você alcançou a 2ª meta!
 *       Você alcançou a 1ª meta do mês.
 *
 *   • quem lidera a equipe (e o elite que ligou a chave):
 *
 *       Maria S. alcançou a 1ª meta
 *       Equipe Bryan
 *
 * SEM valores. Quem lidera duas equipes da pessoa recebe um aviso só.
 */
export function montarAvisosMetaOperador(ops: OperadorNaMeta[]): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const o of ops) {
    const k = Number(o.faixa) || 0;
    if (k <= 0) continue;
    if (o.proprio) {
      const nome = primeiroNome(o.nome);
      saida.add(o.perfil_id, k === 1
        ? {
            titulo: nome ? `Parabéns, ${nome}` : 'Parabéns!',
            corpo: 'Você alcançou a 1ª meta do mês.',
            tag: `meta:${o.perfil_id}:${o.mes}:${k}`, url: '/#/m', icone: 'meta',
          }
        : {
            titulo: `Você alcançou a ${k}ª meta!`,
            corpo: '',
            tag: `meta:${o.perfil_id}:${o.mes}:${k}`, url: '/#/m', icone: 'meta',
          });
    }
    const quem = abreviarCliente(o.nome);
    for (const e of o.equipes ?? []) {
      for (const id of e.destinatarios ?? []) {
        if (id === o.perfil_id) continue;
        saida.add(id, {
          titulo: `${quem} alcançou a ${k}ª meta`,
          corpo: e.equipe_nome,
          tag: `meta-op:${o.perfil_id}:${o.mes}:${k}`,
          url: `/#/m/equipe?equipe=${e.equipe_id}&aba=quartis`,
          icone: 'operador',
        });
      }
    }
  }
  return saida.lista();
}

/** O recebido de uma equipe desde o último resumo — `fn_push_resumo_equipes`. */
export interface ResumoEquipe {
  equipe_id: string;
  equipe_nome: string;
  /** Dia (São Paulo), `yyyy-MM-dd`. */
  dia: string;
  /** Quanto entrou desde o último resumo (bruto). */
  novo: number | string;
  /** Quantos pagamentos entraram (pode ser 0 quando só o valor mudou). */
  qtd_novos: number | string;
  /** Recebido da equipe hoje (bruto, como a aba Hoje). */
  hoje: number | string;
  /** Hora do resumo anterior de hoje; `null` = o primeiro do dia. */
  desde: string | null;
  ate: string;
  destinatarios: string[];
}

/** A hora cheia mais próxima, em São Paulo: «14h». */
export function horaCheia(iso: string): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const h = Number(p.find(x => x.type === 'hour')?.value ?? 0);
  const m = Number(p.find(x => x.type === 'minute')?.value ?? 0);
  return `${(h + (m >= 30 ? 1 : 0)) % 24}h`;
}

/**
 * O resumo por hora da equipe — «o líder recebe quanto a equipe dele recebeu
 * por horário». Só sai quando entrou pagamento.
 *
 *   Equipe Bryan · R$ 3.200,00
 *   8 pagamentos das 14h às 15h
 *   Recebido hoje: R$ 12.400,00
 */
export function montarResumosEquipe(itens: ResumoEquipe[]): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const r of itens) {
    const novo = Number(r.novo) || 0;
    if (novo <= 0) continue;
    const qtd = Number(r.qtd_novos) || 0;
    const ate = horaCheia(r.ate);
    const de = r.desde ? horaCheia(r.desde) : null;
    const janela = de && de !== ate ? `das ${de} às ${ate}` : `até as ${ate}`;
    const quantos = qtd === 1 ? '1 pagamento' : qtd > 1 ? `${qtd} pagamentos` : 'Recebido';
    const aviso: Aviso = {
      titulo: `${r.equipe_nome} · ${brl(novo)}`,
      corpo: `${quantos} ${janela}\nRecebido hoje: ${brl(Number(r.hoje) || 0)}`,
      tag: `resumo-equipe:${r.equipe_id}:${r.dia}:${ate}`,
      url: `/#/m/equipe?equipe=${r.equipe_id}&aba=hoje`,
      icone: 'resumo',
    };
    for (const id of new Set(r.destinatarios)) saida.add(id, aviso);
  }
  return saida.lista();
}
