/**
 * mudancasImportacao.ts — o que a importação do 59 mexeu no que já estava lá.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ## O pedido
 *
 * Entre uma importação do 59 e a seguinte um NR pode sumir, mudar de valor, ou
 * passar de um operador para outro. Até 29/09/2026 nada disso aparecia: o
 * analítico simplesmente mostrava o número novo, e quem tinha perdido um
 * recebimento descobria pela conta que não fechava — se descobrisse.
 *
 * O operador precisa ver o que saiu DELE. A liderança precisa ver o movimento
 * inteiro: de quem saiu, para quem foi, quanto era e quanto passou a ser.
 *
 * ## De onde vem o dado
 *
 * Não há tabela nova. `analitico_removidos` (migration 20260914021223) já
 * guarda a linha inteira, em `conteudo` jsonb, toda vez que a sincronização
 * apaga ou altera um registro — tanto no passo que remove
 * (`fn_mestre_sincronizar_analitico_aplicar`, passo 1) quanto no que atualiza
 * (passo 2, que grava a versão ANTIGA antes do update). O «depois» é o próprio
 * `analitico_recebimentos` de agora.
 *
 * A função `fn_analitico_mudancas_do_mes` (migration 20260929000000) cruza os
 * dois e devolve os pares antes/depois já no escopo de quem perguntou — um
 * operador não pode ler `analitico_removidos` direto, porque a RLS da tabela
 * libera a empresa inteira.
 *
 * ## Por que a classificação mora aqui, e não no SQL
 *
 * Porque é regra de leitura, muda com o texto da tela, e precisa de teste. O
 * SQL faz o que só ele pode fazer (juntar as duas tabelas e aplicar o escopo);
 * a leitura do que aquilo significa é deste arquivo.
 *
 * ## O que NÃO é notícia
 *
 * A sincronização grava o retrato antigo quando QUALQUER campo difere —
 * inclusive `nome_cliente`, `forma_detalhe` e `procedencia`, que mudam sozinhos
 * quando o 58 vira 59. Só entram aqui duas notícias: o NR saiu da pessoa, ou
 * foi para outra.
 *
 * «Valor alterado» existiu até 29/09/2026 e saiu: algumas leituras de valor
 * entre retratos estavam erradas, e a decisão foi retirar, não corrigir. E
 * desde o mesmo dia só conta o que estava há mais de 24 horas com a pessoa —
 * quem corta é o banco (migration 20260929020000).
 */
import { formatCurrency, formatDate } from '@/lib/index';

/** O par antes/depois de um NR numa data, como o banco devolve. */
export interface MudancaCrua {
  codigo: string;
  nome_cliente: string | null;
  data_pagamento: string;
  /** A importação que causou a mudança. */
  lote_id: string | null;
  /** Quando a mudança aconteceu (o `removido_em` do snapshot). */
  ocorrido_em: string;
  operador_antes_id: string | null;
  operador_antes_nome: string | null;
  valor_antes: number;
  /** Desde quando a linha estava com o operador de antes (`importado_em`). */
  com_ele_desde: string | null;
  /** Nulos quando o NR sumiu de vez. */
  operador_depois_id: string | null;
  operador_depois_nome: string | null;
  valor_depois: number | null;
}

export type TipoMudanca = 'removido' | 'transferido';

export interface Mudanca extends MudancaCrua {
  tipo: TipoMudanca;
  /** `valor_depois - valor_antes`. Em `removido`, é `-valor_antes`. */
  diferenca: number;
}

/**
 * O que houve com esta linha — ou `null` quando nada que interesse.
 *
 * Sumir vence trocar de dono. Mesmo dono com outro valor não é notícia: a
 * leitura de «valor alterado» saiu em 29/09/2026.
 */
export function classificar(c: MudancaCrua): TipoMudanca | null {
  if (c.valor_depois === null) return 'removido';
  if ((c.operador_depois_id ?? null) !== (c.operador_antes_id ?? null)) return 'transferido';
  return null;
}

/** As cruas viram mudanças, na ordem em que a tela mostra (mais nova primeiro). */
export function classificarTodas(cruas: readonly MudancaCrua[]): Mudanca[] {
  const out: Mudanca[] = [];
  for (const c of cruas) {
    const tipo = classificar(c);
    if (!tipo) continue;
    out.push({ ...c, tipo, diferenca: (c.valor_depois ?? 0) - c.valor_antes });
  }
  return out.sort((a, b) => b.ocorrido_em.localeCompare(a.ocorrido_em)
    || a.codigo.localeCompare(b.codigo));
}

/** «28/09/2026» a partir de um timestamp ISO. */
function dia(iso: string | null): string {
  return iso ? formatDate(iso.slice(0, 10)) : '—';
}

/** «28/09/2026 às 11:07», no fuso de São Paulo. */
export function momento(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const data = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d);
  return `${data} às ${hora}`;
}

/** O nome de quem está do outro lado, quando o banco não soube dizer. */
const SEM_DONO = 'ninguém (sem operador)';

function nome(n: string | null): string {
  return n?.trim() || SEM_DONO;
}

/**
 * A frase para o OPERADOR — a carteira dele, na segunda pessoa.
 *
 * Só faz sentido para uma mudança em que ele é uma das pontas; quem decide
 * isso é `separarPorLado`.
 */
export function fraseParaOperador(m: Mudanca, euSouId: string): string {
  const desde = m.com_ele_desde ? ` (com você desde ${dia(m.com_ele_desde)})` : '';
  const quando = momento(m.ocorrido_em);
  const saiuDeMim = m.operador_antes_id === euSouId;

  if (m.tipo === 'removido') {
    return `O NR ${m.codigo}, de ${formatDate(m.data_pagamento)}${desde}, `
      + `foi removido do seu analítico na importação de ${quando}. `
      + `Eram ${formatCurrency(m.valor_antes)}. `
      + 'Se precisar entender o motivo, fale com a liderança.';
  }

  // Transferência: a frase depende de que lado da troca a pessoa está.
  if (saiuDeMim) {
    return `O NR ${m.codigo}, de ${formatDate(m.data_pagamento)}${desde}, `
      + `saiu dos seus recebimentos na importação de ${quando} `
      + `e agora consta com ${nome(m.operador_depois_nome)}. `
      + `Eram ${formatCurrency(m.valor_antes)}.`;
  }

  return `O NR ${m.codigo}, de ${formatDate(m.data_pagamento)}, `
    + `entrou nos seus recebimentos na importação de ${quando}, `
    + `vindo de ${nome(m.operador_antes_nome)}. `
    + `${formatCurrency(m.valor_depois ?? 0)}.`;
}

/** A frase para LIDERANÇA — nomes dos dois lados, sem «você». */
export function fraseParaLideranca(m: Mudanca): string {
  const desde = m.com_ele_desde ? `, desde ${dia(m.com_ele_desde)}` : '';

  if (m.tipo === 'removido') {
    return `NR ${m.codigo} (${formatDate(m.data_pagamento)}) saiu do relatório. `
      + `Estava com ${nome(m.operador_antes_nome)}${desde}, `
      + `${formatCurrency(m.valor_antes)}.`;
  }

  return `NR ${m.codigo} (${formatDate(m.data_pagamento)}) passou de `
    + `${nome(m.operador_antes_nome)}${desde} para ${nome(m.operador_depois_nome)}. `
    + `${formatCurrency(m.valor_antes)}.`;
}

/**
 * As mudanças que tocam esta pessoa: as que saíram dela e as que chegaram nela.
 *
 * O operador vê as duas coisas — «sumiu um acordo meu» e «entrou um que era de
 * outro». A liderança usa a lista inteira, sem este filtro.
 */
export function minhasMudancas(ms: readonly Mudanca[], euSouId: string): Mudanca[] {
  return ms.filter(m => m.operador_antes_id === euSouId || m.operador_depois_id === euSouId);
}

export interface ResumoMudancas {
  removidos: number;
  transferidos: number;
  /** Quanto o conjunto tirou (negativo) ou somou ao total. */
  saldo: number;
  total: number;
}

/** O cabeçalho do card: quantas e quanto. */
export function resumir(ms: readonly Mudanca[]): ResumoMudancas {
  const r: ResumoMudancas = {
    removidos: 0, transferidos: 0, saldo: 0, total: ms.length,
  };
  for (const m of ms) {
    if (m.tipo === 'removido') r.removidos += 1;
    else r.transferidos += 1;
    r.saldo += m.diferenca;
  }
  r.saldo = Math.round(r.saldo * 100) / 100;
  return r;
}

/**
 * O saldo do ponto de vista de UMA pessoa.
 *
 * Diferente de `resumir`: numa transferência o valor não some do mundo, mas
 * some da carteira de quem perdeu. Para o operador, o que conta é o próprio
 * bolso — sair é negativo, chegar é positivo.
 */
export function saldoDoOperador(ms: readonly Mudanca[], euSouId: string): number {
  let saldo = 0;
  for (const m of ms) {
    if (m.operador_antes_id === euSouId) saldo -= m.valor_antes;
    if (m.operador_depois_id === euSouId) saldo += m.valor_depois ?? 0;
  }
  return Math.round(saldo * 100) / 100;
}

export const ROTULO_TIPO: Record<TipoMudanca, string> = {
  removido:    'Removido',
  transferido: 'Transferido',
};
