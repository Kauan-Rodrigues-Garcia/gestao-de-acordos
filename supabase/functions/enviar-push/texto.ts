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

export interface Aviso {
  titulo: string;
  corpo: string;
  tag?: string;
  url?: string;
  icone?: IconeAviso;
  /**
   * Foto de quem mandou (aviso de chat). O Android mostra no lugar do ícone; o
   * iPhone usa sempre o ícone do app (limite do sistema).
   */
  foto?: string;
}

export interface ItemFila {
  id: number;
  perfil_id: string;
  valor: number | string;
  /** H.O. do pagamento (a parte da regra Cofen). Ausente em fila antiga. */
  valor_ho?: number | string | null;
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

/**
 * Regra Cofen: todo aviso sai SÓ em H.O., dito com clareza («R$ 226,00 em
 * H.O.»), sem o bruto (Cleber, 06/10/2026). `emHO` vem do banco, pela regra
 * do setor da pessoa.
 */
export const naUnidade = (v: number, emHO: boolean) => `${brl(v)}${emHO ? ' em H.O.' : ''}`;

/** O valor do pagamento na unidade da pessoa: o H.O. no Cofen. */
function valorDoItem(i: Pick<ItemFila, 'valor' | 'valor_ho'>, emHO: boolean): number {
  return Number(emHO ? i.valor_ho : i.valor) || 0;
}

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
export function linhasDoPagamento(
  i: Pick<ItemFila, 'valor' | 'valor_ho' | 'forma_pagamento' | 'forma_detalhe' | 'nome_cliente' | 'codigo'>,
  emHO = false,
): string {
  const f = formaDoPagamento(i.forma_pagamento, i.forma_detalhe);
  return `${clienteENr(i.nome_cliente, i.codigo)}\n${f.rotulo} · ${naUnidade(valorDoItem(i, emHO), emHO)}`;
}

/** Quantas faixas estão batidas com `valor`. Degraus em ordem (1ª, 2ª…). */
export function faixasBatidas(valor: number, degraus: number[]): number {
  return degraus.filter(d => d > 0 && valor >= d).length;
}

/**
 * Os avisos de PAGAMENTO de um lote, por pessoa — spec §4:
 *   • até `corte` pagamentos: um aviso cada;
 *   • acima: um resumo com o total, as formas e o recebido do mês.
 * O valor do pagamento é o BRUTO (o que o cliente pagou) — na regra Cofen, só
 * o H.O. (06/10/2026). O «no mês» está na mesma unidade e vem pronto do banco.
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
    const emHO = pessoas[perfilId]?.em_ho === true;
    if (lista.length <= corte) {
      for (const i of lista) {
        avisos.push({
          titulo: 'Pagamento recebido',
          corpo: linhasDoPagamento(i, emHO),
          tag: `pgto:${i.id}`,
          url: '/#/m?novos=1',
          icone: 'pagamento',
        });
      }
    } else {
      const total = lista.reduce((s, i) => s + valorDoItem(i, emHO), 0);
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
      const noMes = p ? `\nNo mês: ${naUnidade(Number(p.depois) || 0, emHO)}` : '';
      avisos.push({
        titulo: `${lista.length} pagamentos recebidos`,
        corpo: `${naUnidade(total, emHO)} · ${formas}${noMes}`,
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
    const emHO = p?.em_ho === true;
    const hoje = p ? `\nRecebido hoje: ${naUnidade(Number(p.hoje) || 0, emHO)}` : '';
    const avisos: Aviso[] = [];
    if (lista.length <= corte) {
      for (const i of lista) {
        avisos.push({
          titulo: 'Pagamento retirado do recebimento',
          corpo: `${clienteENr(i.nome_cliente, i.codigo)} · ${naUnidade(valorDoItem(i, emHO), emHO)}${hoje}`,
          tag: `saida:${i.id}`,
          url: '/#/m',
          icone: 'saida',
        });
      }
    } else {
      const total = lista.reduce((s, i) => s + valorDoItem(i, emHO), 0);
      const noMes = p ? ` · no mês: ${naUnidade(Number(p.mes) || 0, emHO)}` : '';
      avisos.push({
        titulo: `${lista.length} pagamentos retirados do recebimento`,
        corpo: `${naUnidade(total, emHO)} no total${hoje}${noMes}`,
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
  /** Recebido da equipe hoje (bruto, como a aba Hoje; H.O. na regra Cofen). */
  hoje: number | string;
  /** Equipe de setor Cofen: `novo` e `hoje` já vêm em H.O. */
  em_ho?: boolean;
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
    const emHO = r.em_ho === true;
    const aviso: Aviso = {
      titulo: `${r.equipe_nome} · ${naUnidade(novo, emHO)}`,
      corpo: `${quantos} ${janela}\nRecebido hoje: ${naUnidade(Number(r.hoje) || 0, emHO)}`,
      tag: `resumo-equipe:${r.equipe_id}:${r.dia}:${ate}`,
      url: `/#/m/equipe?equipe=${r.equipe_id}&aba=hoje`,
      icone: 'resumo',
    };
    for (const id of new Set(r.destinatarios)) saida.add(id, aviso);
  }
  return saida.lista();
}

// ── Avisos da GERÊNCIA (20261007120000) ─────────────────────────────────────
//
// O gerente acompanha o setor que cuida. Quatro avisos, cada um com interruptor
// (começam ligados); tocar abre a tela do setor (`/m/setor`). Na regra Cofen,
// valores só em H.O.

/** O gerente do setor de uma equipe — `fn_push_gerentes_das_equipes`. */
export interface GerenteDaEquipe {
  equipe_id: string;
  setor_id: string;
  setor_nome: string;
  perfil_id: string;
}

/** Um setor que acabou de alcançar a meta do mês — `fn_push_rodada_setores`. */
export interface SetorNaMeta {
  setor_id: string;
  setor_nome: string;
  mes: string;
  /** Regra Cofen: `total` em H.O. */
  em_ho: boolean;
  total: number | string;
  destinatarios: string[];
}

/** O recebido de um setor desde o último resumo — `fn_push_rodada_setores`. */
export interface ResumoSetor {
  setor_id: string;
  setor_nome: string;
  dia: string;
  /** Regra Cofen: `novo` e `hoje` em H.O. (relatório de conciliação). */
  em_ho: boolean;
  novo: number | string;
  qtd_novos: number | string;
  hoje: number | string;
  /** Hora do resumo anterior de hoje; `null` = o primeiro do dia. */
  desde: string | null;
  ate: string;
  destinatarios: string[];
}

/** Uma etiqueta curta e estável para um conjunto (a etiqueta do aviso). */
function etiquetaCurta(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 *   Play 1 alcançou a meta do mês
 *   Parabéns! R$ 420.312,00 no mês.
 */
export function montarAvisosMetaSetor(setores: SetorNaMeta[]): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const s of setores) {
    const aviso: Aviso = {
      titulo: `${s.setor_nome} alcançou a meta do mês`,
      corpo: `Parabéns! ${naUnidade(Number(s.total) || 0, s.em_ho === true)} no mês.`,
      tag: `meta-setor:${s.setor_id}:${s.mes}`,
      url: '/#/m/setor',
      icone: 'meta',
    };
    for (const id of new Set(s.destinatarios ?? [])) saida.add(id, aviso);
  }
  return saida.lista();
}

/**
 * A equipe do setor que alcançou a meta, para o gerente:
 *
 *   Equipe Bryan alcançou a meta
 *   Play 1 · meta do mês concluída
 */
export function montarAvisosMetaEquipeGerencia(
  equipes: EquipeNaMeta[], gerentes: GerenteDaEquipe[],
): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const e of equipes) {
    for (const g of gerentes) {
      if (g.equipe_id !== e.equipe_id) continue;
      saida.add(g.perfil_id, {
        titulo: `${e.equipe_nome} alcançou a meta`,
        corpo: `${g.setor_nome} · meta do mês concluída`,
        tag: `meta-equipe-g:${e.equipe_id}:${e.mes}`,
        url: '/#/m/setor',
        icone: 'equipe',
      });
    }
  }
  return saida.lista();
}

const MAX_NOMES = 6;

/**
 * Quem do setor alcançou meta, para o gerente — várias pessoas na mesma rodada
 * viram UM aviso (sem enxurrada):
 *
 *   Maria S. alcançou a 2ª meta          3 pessoas do Play 1 alcançaram metas
 *   Equipe Bryan · Play 1                Maria S. (2ª), João P. (1ª), Ana L. (1ª)
 *
 * SEM valores, como o aviso do líder. Quem está em duas equipes do mesmo setor
 * entra uma vez só.
 */
export function montarAvisosMetaOperadorGerencia(
  ops: OperadorNaMeta[], gerentes: GerenteDaEquipe[],
): AvisosDaPessoa[] {
  type Alcance = { perfilId: string; nome: string; faixa: number; equipe: string };
  const grupos = new Map<string, { gerente: string; setorId: string; setor: string; mes: string; quem: Map<string, Alcance> }>();
  for (const o of ops) {
    const k = Number(o.faixa) || 0;
    if (k <= 0) continue;
    for (const e of o.equipes ?? []) {
      for (const g of gerentes) {
        if (g.equipe_id !== e.equipe_id || g.perfil_id === o.perfil_id) continue;
        const chave = `${g.perfil_id}|${g.setor_id}`;
        const grupo = grupos.get(chave)
          ?? { gerente: g.perfil_id, setorId: g.setor_id, setor: g.setor_nome, mes: o.mes, quem: new Map() };
        const atual = grupo.quem.get(o.perfil_id);
        if (!atual || k > atual.faixa) {
          grupo.quem.set(o.perfil_id, { perfilId: o.perfil_id, nome: abreviarCliente(o.nome), faixa: k, equipe: e.equipe_nome });
        }
        grupos.set(chave, grupo);
      }
    }
  }

  const saida = porPessoa();
  for (const g of grupos.values()) {
    const lista = [...g.quem.values()].sort((a, b) => b.faixa - a.faixa || a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!lista.length) continue;
    const marca = etiquetaCurta(lista.map(a => `${a.perfilId}:${a.faixa}`).sort().join(','));
    const base = { tag: `metas-op-g:${g.setorId}:${g.mes}:${marca}`, url: '/#/m/setor?aba=quartis', icone: 'operador' as const };
    if (lista.length === 1) {
      const a = lista[0];
      saida.add(g.gerente, { ...base, titulo: `${a.nome} alcançou a ${a.faixa}ª meta`, corpo: `${a.equipe} · ${g.setor}` });
    } else {
      const nomes = lista.slice(0, MAX_NOMES).map(a => `${a.nome} (${a.faixa}ª)`).join(', ');
      const resto = lista.length > MAX_NOMES ? ` e mais ${lista.length - MAX_NOMES}` : '';
      saida.add(g.gerente, { ...base, titulo: `${lista.length} pessoas do ${g.setor} alcançaram metas`, corpo: `${nomes}${resto}` });
    }
  }
  return saida.lista();
}

/** Minutos entre dois instantes ISO. */
function minutosEntre(de: string, ate: string): number {
  return (new Date(ate).getTime() - new Date(de).getTime()) / 60_000;
}

/**
 * O resumo do setor no minuto 10 de cada hora — «o setor recebeu tanto em uma
 * hora» (Cleber, 06/10/2026). Só sai quando entrou dinheiro.
 *
 *   Play 1 recebeu R$ 12.400,00
 *   8 pagamentos na última hora
 *   Hoje: R$ 38.540,00
 *
 * Se a hora anterior não teve nada, a janela diz desde quando («desde as 11h»).
 */
export function montarResumosSetor(itens: ResumoSetor[]): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const r of itens) {
    const novo = Number(r.novo) || 0;
    if (novo <= 0) continue;
    const emHO = r.em_ho === true;
    const qtd = Number(r.qtd_novos) || 0;
    const ate = horaCheia(r.ate);
    const janela = !r.desde
      ? `até as ${ate}`
      : minutosEntre(r.desde, r.ate) <= 75 ? 'na última hora' : `desde as ${horaCheia(r.desde)}`;
    const linha = qtd === 1 ? `1 pagamento ${janela}`
      : qtd > 1 ? `${qtd} pagamentos ${janela}`
      : janela.charAt(0).toLocaleUpperCase('pt-BR') + janela.slice(1);
    const aviso: Aviso = {
      titulo: `${r.setor_nome} recebeu ${naUnidade(novo, emHO)}`,
      corpo: `${linha}\nHoje: ${naUnidade(Number(r.hoje) || 0, emHO)}`,
      tag: `resumo-setor:${r.setor_id}:${r.dia}:${ate}`,
      url: '/#/m/setor?aba=hoje',
      icone: 'resumo',
    };
    for (const id of new Set(r.destinatarios ?? [])) saida.add(id, aviso);
  }
  return saida.lista();
}

// ── Chat ────────────────────────────────────────────────────────────────────

/**
 * Uma conversa com mensagem nova para uma pessoa — `fn_push_chat_pegar`
 * (migration 20261005235000). A última mensagem e quantas a pessoa ainda não
 * leu na conversa.
 */
export interface ItemChat {
  perfil_id: string;
  conversa_id: string;
  conversa_tipo: string | null;
  conversa_nome: string | null;
  autor_nome: string | null;
  autor_foto: string | null;
  /** `null` quando a mensagem tem CPF (ou é só anexo). */
  texto: string | null;
  tem_cpf: boolean;
  anexos: { tipo?: string | null; nome?: string | null }[] | null;
  nao_lidas: number | string;
}

const LIMITE_PREVIA = 120;

/** O que a mensagem diz, para o aviso: o texto cortado, ou o tipo do anexo. */
export function previaDoChat(item: Pick<ItemChat, 'texto' | 'tem_cpf' | 'anexos'>): string {
  // CPF é dado sensível no chat: não vai para a tela de bloqueio do celular.
  if (item.tem_cpf) return 'Nova mensagem';
  const texto = String(item.texto ?? '').replace(/\s+/g, ' ').trim();
  if (texto) return texto.length > LIMITE_PREVIA ? `${texto.slice(0, LIMITE_PREVIA - 1).trimEnd()}…` : texto;
  const anexos = item.anexos ?? [];
  if (anexos.length > 1) return `${anexos.length} arquivos`;
  const a = anexos[0];
  if (!a) return 'Nova mensagem';
  const tipo = String(a.tipo ?? '');
  if (tipo.startsWith('image/')) return 'Foto';
  if (tipo.startsWith('video/')) return 'Vídeo';
  if (tipo.startsWith('audio/')) return 'Áudio';
  return a.nome ? `Arquivo: ${a.nome}` : 'Arquivo';
}

/**
 * Um aviso por pessoa e conversa, com a etiqueta da conversa: o aviso novo
 * SUBSTITUI o anterior (o service worker usa `tag` + `renotify`), como no
 * WhatsApp. Grupo: «Fulano · Nome do grupo».
 */
export function montarAvisosChat(itens: ItemChat[]): AvisosDaPessoa[] {
  const saida = porPessoa();
  for (const it of itens) {
    const autor = String(it.autor_nome ?? '').trim() || 'Alguém';
    const grupo = it.conversa_tipo === 'grupo' && it.conversa_nome?.trim();
    const naoLidas = Number(it.nao_lidas) || 0;
    const previa = previaDoChat(it);
    saida.add(it.perfil_id, {
      titulo: grupo ? `${primeiroNome(autor) || autor} · ${grupo}` : autor,
      corpo: naoLidas > 1 ? `${previa}\n${naoLidas} mensagens não lidas` : previa,
      tag: `chat:${it.conversa_id}`,
      url: `/#/m?chat=${it.conversa_id}`,
      ...(it.autor_foto && /^https:\/\//.test(it.autor_foto) ? { foto: it.autor_foto } : {}),
    });
  }
  return saida.lista();
}
