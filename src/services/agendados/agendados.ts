/**
 * agendados.ts — as contas da aba «Agendados» do Painel Líder (23/11/2026).
 *
 * A pergunta da aba: «o que a minha gente tem para receber, e quando?». É a
 * agenda dos acordos por VENCIMENTO, pessoa a pessoa — o que vence hoje, amanhã
 * e nos próximos dias, e como foi o que já venceu.
 *
 * Puro e sem React, como `lib/desempenhoDia.ts`: as regras precisam ser as
 * mesmas em toda tela e poder ser testadas sem montar componente.
 *
 * ## As regras que esta aba herda, e de onde
 *
 * - **Estados**: `estadoDoAcordo` do Desempenho do Dia. «A verificar» é estado
 *   próprio, não falha — a taxa antiga que somava os dois mostrava 37% num dia
 *   sem nada errado.
 * - **Conversão**: `pagos ÷ (pagos + não pagos)`, sobre o que já tem desfecho;
 *   `null` quando nada tem. Cortada, não arredondada: 99,6% não é 100%.
 * - **Quem conta em qual setor**: `setoresDoOperador` (clones inclusos), a fonte
 *   única de todo painel.
 * - **Direto/Extra**: cada pessoa vê os seus, o EXTRA incluso. Na soma de um
 *   grupo, o EXTRA cujo DIRETO também está no grupo sai — o mesmo acordo não
 *   conta duas vezes (é o `extra_absorvido` da mesa de Acordos).
 * - **Regra do setor** (CLAUDE.md, «Cofen não é PaguePlay»): carteira diferente
 *   não se soma. Quem separa é a tela, pela regra de cada grupo.
 *
 * ## A fonte
 *
 * `acordos`, o que foi tabulado aqui. NÃO é o recebido do relatório: a maior
 * parte do que o ERP recebe nunca vira acordo neste sistema (ver o cabeçalho de
 * `lib/desempenhoDia.ts`). A tela diz isso com todas as letras.
 */
import { estadoDoAcordo } from '@/lib/desempenhoDia';
import {
  setoresDoOperador, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** O mínimo de um acordo que a agenda precisa para contar. */
export interface LinhaAgenda {
  id: string;
  operador_id: string | null;
  setor_id: string | null;
  /** `yyyy-MM-dd`. */
  vencimento: string;
  valor: number | string | null;
  status: string | null;
  tipo_vinculo: string | null;
  /** A outra metade do par DIRETO/EXTRA. Ausente antes da 20261030235500. */
  par_acordo_id?: string | null;
}

export interface Soma { qtd: number; valor: number }

export interface ResumoAgenda {
  /** Tudo com vencimento no período. */
  total: Soma;
  pago: Soma;
  aVerificar: Soma;
  naoPago: Soma;
  /** «A verificar» que já venceu: falta dar baixa (pago ou não pago). */
  vencidoSemBaixa: Soma;
  /** Quantos do total são EXTRA (NR com DIRETO de outra pessoa). */
  extra: Soma;
  /** A agenda à frente — vale no mês corrente e pode passar da virada do mês. */
  hoje: Soma;
  hojePago: Soma;
  amanha: Soma;
  /** De depois de amanhã até `proximosAte`. */
  proximos: Soma;
  /** `pagos ÷ (pagos + não pagos)` em pontos inteiros, cortado. */
  conversao: number | null;
}

export interface JanelaAgenda {
  hoje: string;
  amanha: string;
  /** Primeiro dia de «próximos dias» (depois de amanhã). */
  proximosDe: string;
  /** Último dia de «próximos dias»: hoje + 7. */
  proximosAte: string;
}

export interface DiaAgenda {
  dia: string;
  total: Soma;
  pago: Soma;
  aVerificar: Soma;
  naoPago: Soma;
}

// ─── Datas ───────────────────────────────────────────────────────────────────

/** `iso` + `n` dias, sem fuso: a conta é de calendário, não de relógio. */
export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Quantos dias à frente a agenda olha. Uma semana: o que dá para ligar antes. */
export const DIAS_A_FRENTE = 7;

export function janelaDe(hoje: string): JanelaAgenda {
  return {
    hoje,
    amanha: somarDias(hoje, 1),
    proximosDe: somarDias(hoje, 2),
    proximosAte: somarDias(hoje, DIAS_A_FRENTE),
  };
}

/**
 * O intervalo que a consulta lê.
 *
 * No mês corrente ele estica até `hoje + 7`: no dia 28, «próximos dias» cai
 * quase todo no mês seguinte, e cortar no fim do mês esconderia justamente a
 * agenda que o líder quer ver. As somas do MÊS continuam presas ao mês.
 */
export function intervaloDaConsulta(p: {
  inicio: string; fim: string; hoje: string; mesCorrente: boolean;
}): { de: string; ate: string } {
  if (!p.mesCorrente) return { de: p.inicio, ate: p.fim };
  const limite = somarDias(p.hoje, DIAS_A_FRENTE);
  return { de: p.inicio, ate: limite > p.fim ? limite : p.fim };
}

// ─── Somas ───────────────────────────────────────────────────────────────────

const vazio = (): Soma => ({ qtd: 0, valor: 0 });

function soma(s: Soma, valor: number): void {
  s.qtd += 1;
  s.valor += valor;
}

function valorDe(l: Pick<LinhaAgenda, 'valor'>): number {
  const n = Number(l.valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * O EXTRA que sai da soma de um grupo: o DIRETO dele está no mesmo grupo.
 *
 * O EXTRA cujo DIRETO é de alguém de FORA do grupo continua: ali ele é a única
 * linha daquele acordo, e tirá-lo apagaria o trabalho de quem está olhando.
 */
export function extrasAbsorvidos(linhas: readonly LinhaAgenda[]): Set<string> {
  const ids = new Set(linhas.map(l => l.id));
  const fora = new Set<string>();
  for (const l of linhas) {
    if (l.tipo_vinculo === 'extra' && l.par_acordo_id && ids.has(l.par_acordo_id)) fora.add(l.id);
  }
  return fora;
}

/** Corta, não arredonda: 99,6% de conversão não é 100%. */
export function conversaoDe(pago: number, naoPago: number): number | null {
  const base = pago + naoPago;
  return base > 0 ? Math.floor((pago / base) * 100) : null;
}

/**
 * Resume um conjunto de linhas.
 *
 * `inicio`/`fim` recortam as somas do período (o mês, ou um dia escolhido no
 * calendário). Hoje/amanhã/próximos olham todas as linhas recebidas — a consulta
 * já veio esticada até `hoje + 7` (ver `intervaloDaConsulta`).
 *
 * `semExtraDoPar` é para a soma de GRUPO (equipe, setor, carteira). Na linha de
 * uma pessoa fica desligado: o EXTRA dela é dela.
 */
export function resumir(
  linhas: readonly LinhaAgenda[],
  p: { inicio: string; fim: string; hoje: string; semExtraDoPar?: boolean },
): ResumoAgenda {
  const j = janelaDe(p.hoje);
  const fora = p.semExtraDoPar ? extrasAbsorvidos(linhas) : null;
  const r: ResumoAgenda = {
    total: vazio(), pago: vazio(), aVerificar: vazio(), naoPago: vazio(),
    vencidoSemBaixa: vazio(), extra: vazio(),
    hoje: vazio(), hojePago: vazio(), amanha: vazio(), proximos: vazio(),
    conversao: null,
  };

  for (const l of linhas) {
    if (fora?.has(l.id)) continue;
    const v = valorDe(l);
    const estado = estadoDoAcordo(l.status);
    const d = l.vencimento;

    if (d === j.hoje) {
      soma(r.hoje, v);
      if (estado === 'pago') soma(r.hojePago, v);
    } else if (d === j.amanha) {
      soma(r.amanha, v);
    } else if (d >= j.proximosDe && d <= j.proximosAte) {
      soma(r.proximos, v);
    }

    if (d < p.inicio || d > p.fim) continue;
    soma(r.total, v);
    if (l.tipo_vinculo === 'extra') soma(r.extra, v);
    if (estado === 'pago') soma(r.pago, v);
    else if (estado === 'nao_pago') soma(r.naoPago, v);
    else {
      soma(r.aVerificar, v);
      if (d < p.hoje) soma(r.vencidoSemBaixa, v);
    }
  }

  r.conversao = conversaoDe(r.pago.qtd, r.naoPago.qtd);
  return r;
}

/** Um dia por coluna do calendário, do primeiro ao último dia do mês. */
export function porDia(
  linhas: readonly LinhaAgenda[],
  p: { inicio: string; fim: string; semExtraDoPar?: boolean },
): DiaAgenda[] {
  const fora = p.semExtraDoPar ? extrasAbsorvidos(linhas) : null;
  const mapa = new Map<string, DiaAgenda>();
  for (let d = p.inicio; d <= p.fim; d = somarDias(d, 1)) {
    mapa.set(d, { dia: d, total: vazio(), pago: vazio(), aVerificar: vazio(), naoPago: vazio() });
  }
  for (const l of linhas) {
    if (fora?.has(l.id)) continue;
    const dia = mapa.get(l.vencimento);
    if (!dia) continue;
    const v = valorDe(l);
    soma(dia.total, v);
    const e = estadoDoAcordo(l.status);
    soma(e === 'pago' ? dia.pago : e === 'nao_pago' ? dia.naoPago : dia.aVerificar, v);
  }
  return [...mapa.values()];
}

// ─── Pessoas e setores ───────────────────────────────────────────────────────

export interface OperadorBase {
  id: string;
  nome: string | null;
  email?: string | null;
  foto_url?: string | null;
  setor_id?: string | null;
}

export interface PessoaAgenda {
  id: string;
  nome: string;
  foto: string | null;
  equipeNome: string | null;
  /** O setor da pessoa (o da composição; o do cadastro se ela não tem equipe). */
  setorPrincipal: string | null;
  /** Todos os setores em que ela conta — o próprio e os de onde é clone. */
  setores: string[];
}

export interface FontesAgenda {
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  setorDaEquipe: Map<string, string>;
}

/**
 * As pessoas do recorte do painel.
 *
 * Mesma escada das outras abas: equipe manda sobre setor (é o recorte mais
 * estreito), setor vale pelos setores em que a pessoa CONTA, e sem filtro é todo
 * mundo que o painel já carregou — a RLS e o escopo do Painel Líder já
 * decidiram quem está nessa lista.
 */
export function pessoasNoEscopo(p: {
  operadores: readonly OperadorBase[];
  fontes: FontesAgenda;
  setorIds: readonly string[];
  equipeIds: readonly string[];
}): PessoaAgenda[] {
  const { fontes } = p;
  const out: PessoaAgenda[] = [];
  for (const o of p.operadores) {
    const info = fontes.operadorEquipeMap[o.id];
    const setores = setoresDoOperador(
      o.id, fontes.operadorEquipeMap, fontes.equipesExtrasPorOperador, fontes.setorDaEquipe,
    );
    const principal = info?.setor_id ?? o.setor_id ?? null;
    if (principal) setores.add(principal);

    if (p.equipeIds.length) {
      const naEquipe = (info?.equipe_id != null && p.equipeIds.includes(info.equipe_id))
        || (fontes.equipesExtrasPorOperador[o.id] ?? []).some(e => p.equipeIds.includes(e));
      if (!naEquipe) continue;
    } else if (p.setorIds.length) {
      if (![...setores].some(s => p.setorIds.includes(s))) continue;
    }

    out.push({
      id: o.id,
      nome: o.nome?.trim() || o.email || 'Sem nome',
      foto: o.foto_url ?? null,
      equipeNome: info?.equipe_nome?.trim() || null,
      setorPrincipal: principal,
      setores: [...setores],
    });
  }
  return out;
}

export interface GrupoSetor {
  setorId: string | null;
  pessoas: { pessoa: PessoaAgenda; linhas: LinhaAgenda[] }[];
  /** Todas as linhas do grupo, para a soma (que tira o EXTRA do par). */
  linhas: LinhaAgenda[];
}

/**
 * Separa as pessoas (e os acordos delas) por setor.
 *
 * Sem filtro de setor cada pessoa aparece UMA vez, no setor dela: a lista da
 * empresa inteira repetindo o clone em dois setores somaria o acordo duas vezes.
 *
 * Com setores marcados, a pessoa aparece em cada setor marcado em que conta. Se
 * ela estiver em mais de um, o acordo vai para o setor que ele carrega
 * (`acordos.setor_id`); o que não carrega nenhum deles fica no setor dela.
 */
export function distribuirPorSetor(p: {
  pessoas: readonly PessoaAgenda[];
  linhas: readonly LinhaAgenda[];
  setorIds: readonly string[];
}): GrupoSetor[] {
  const porOperador = new Map<string, LinhaAgenda[]>();
  for (const l of p.linhas) {
    if (!l.operador_id) continue;
    const lista = porOperador.get(l.operador_id);
    if (lista) lista.push(l); else porOperador.set(l.operador_id, [l]);
  }

  const grupos = new Map<string | null, GrupoSetor>();
  const grupo = (sid: string | null): GrupoSetor => {
    let g = grupos.get(sid);
    if (!g) { g = { setorId: sid, pessoas: [], linhas: [] }; grupos.set(sid, g); }
    return g;
  };

  for (const pessoa of p.pessoas) {
    const marcados = p.setorIds.length
      ? pessoa.setores.filter(s => p.setorIds.includes(s))
      : [];
    const destinos: (string | null)[] = marcados.length ? marcados : [pessoa.setorPrincipal];
    const minhas = porOperador.get(pessoa.id) ?? [];

    const porDestino = new Map<string | null, LinhaAgenda[]>(
      destinos.map((d): [string | null, LinhaAgenda[]] => [d, []]));
    for (const l of minhas) {
      let alvo: string | null;
      if (destinos.length === 1) alvo = destinos[0];
      else if (l.setor_id && destinos.includes(l.setor_id)) alvo = l.setor_id;
      else alvo = destinos.includes(pessoa.setorPrincipal) ? pessoa.setorPrincipal : destinos[0];
      porDestino.get(alvo)!.push(l);
    }

    for (const [sid, linhas] of porDestino) {
      const g = grupo(sid);
      g.pessoas.push({ pessoa, linhas });
      g.linhas.push(...linhas);
    }
  }
  return [...grupos.values()];
}

// ─── Ordenação ───────────────────────────────────────────────────────────────

export type OrdemAgenda = 'hoje' | 'agendado' | 'nao_pago' | 'conversao' | 'nome';

/**
 * Ordena as pessoas de um grupo. Desempate pelo nome, sempre: a lista não pode
 * trocar de ordem sozinha entre uma leitura e outra.
 */
export function ordenarPessoas<T extends { pessoa: PessoaAgenda; resumo: ResumoAgenda }>(
  itens: readonly T[],
  ordem: OrdemAgenda,
): T[] {
  const porNome = (a: T, b: T) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR');
  const chave = (x: T): number => {
    switch (ordem) {
      case 'hoje':      return -x.resumo.hoje.valor;
      case 'agendado':  return -x.resumo.total.valor;
      case 'nao_pago':  return -x.resumo.naoPago.valor;
      // Quem não tem desfecho vai para o fim: «sem conversão» não é a pior.
      case 'conversao': return x.resumo.conversao ?? Number.POSITIVE_INFINITY;
      default:          return 0;
    }
  };
  return [...itens].sort((a, b) => (chave(a) - chave(b)) || porNome(a, b));
}

/**
 * Agenda vazia à frente: nada para hoje em aberto, nada amanhã nem nos próximos
 * dias. É o sinal de quem precisa formalizar — o mais útil da aba para o líder.
 */
export function agendaVazia(r: ResumoAgenda): boolean {
  const abertoHoje = r.hoje.qtd - r.hojePago.qtd;
  return abertoHoje <= 0 && r.amanha.qtd === 0 && r.proximos.qtd === 0;
}
