/**
 * placar.ts — as contas do placar da Visão geral (Painel Diretoria 3.0), sem
 * React e sem banco.
 *
 * Nenhuma conta é nova. O ritmo é `calcularProjecao` (a do Painel Líder e do
 * Painel de Metas: meta ÷ dias úteis × decorridos). O quartil de cada pessoa
 * é `montarLinhasQuartil` (a aba Quartis). A equipe é `montarEquipe` (o card
 * do Painel Líder, o mesmo que o celular usa). Aqui só se junta e resume.
 *
 * A meta de um setor é a DO SETOR, cadastrada na aba Metas (Cleber,
 * 04/10/2026: «a do setor sempre»). Setor sem meta fica sem ritmo — igual ao
 * Painel de Metas, que deixou de somar as individuais em 02/10/2026.
 */
import { diasUteisDecorridos, diasUteisDoMes } from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { metaNaUnidade } from '@/lib/unidadeValor';
import type { QuartilConfig } from '@/lib/supabase';
import { mapaSetorDaEquipe } from '@/services/analitico/analitico.service';
import type { CofenDoMes } from '@/services/mestre/diretoriaCidades.service';
import type { FontesDoPainel } from '@/services/mestre/diretoriaPlacar.service';
import type { MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { montarLinhasQuartil, type LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import { montarEquipe, type EquipeNaTela } from '@/pages/Mobile/equipe/montarEquipe';
import type { InfoDoSetor, MarcaVisual, ModoCofen, VisaoMontada } from './modelo';

// ── O calendário do corte ───────────────────────────────────────────────────

export interface Calendario {
  ano: number;
  mes: number;
  /** O dia do corte, como data: é o «hoje» das contas. */
  hojeISO: string;
  totalUteis: number;
  decorridos: number;
  /** Os dias do mês que são úteis (sem fim de semana nem feriado). */
  uteis: ReadonlySet<number>;
}

/** O dia de «hoje» de um mês: hoje no mês corrente; o último dia num mês que já fechou. */
export function diaDeHoje(mes: string, hojeISO: string, diasNoMes: number): number {
  const atual = hojeISO.slice(0, 7);
  if (mes === atual) return Math.min(diasNoMes, Number(hojeISO.slice(8, 10)));
  return mes < atual ? diasNoMes : 1;
}

export function calendarioDoMes(
  mes: string, diaCorte: number, diasNoMes: number, feriados: readonly string[], contarHoje: boolean,
): Calendario {
  const [ano, m] = mes.split('-').map(Number);
  const hojeISO = `${mes}-${String(diaCorte).padStart(2, '0')}`;
  const fer = [...feriados];
  const totalUteis = diasUteisDoMes(ano, m, fer);
  const decorridos = diaCorte >= diasNoMes
    ? totalUteis
    : Math.max(1, diasUteisDecorridos(ano, m, fer, hojeISO, undefined, contarHoje));
  const feriadoSet = new Set(feriados);
  const uteis = new Set<number>();
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    const semana = new Date(ano, m - 1, d).getDay();
    if (semana !== 0 && semana !== 6 && !feriadoSet.has(iso)) uteis.add(d);
  }
  return { ano, mes: m, hojeISO, totalUteis, decorridos, uteis };
}

// ── O ritmo contra a meta ───────────────────────────────────────────────────

export interface Ritmo {
  meta: number;
  /** O que deveria ter entrado até o corte. */
  esperado: number;
  /** `recebido − esperado`: positivo é sobra. */
  diferenca: number;
  /** % do esperado (o «ritmo» da projeção). */
  pct: number;
  /** % da meta do mês já alcançada. */
  pctMeta: number;
  /** Onde fecha mantendo o ritmo dos dias úteis. */
  fecha: number;
  /** Quanto falta para a meta (zero se já passou). */
  falta: number;
  /** Quanto precisa entrar por dia útil que resta. */
  porDiaUtil: number;
}

export function ritmoDe(recebido: number, meta: number | null | undefined, cal: Calendario): Ritmo | null {
  if (!meta || meta <= 0) return null;
  const p = calcularProjecao({ meta, recebido, totalUteis: cal.totalUteis, decorridos: cal.decorridos, quartis: [] });
  if (!p) return null;
  const falta = Math.max(0, meta - recebido);
  const restam = Math.max(0, cal.totalUteis - cal.decorridos);
  return {
    meta,
    esperado: p.esperado,
    diferenca: p.diferenca,
    pct: p.esperado > 0 ? (recebido / p.esperado) * 100 : 0,
    pctMeta: (recebido / meta) * 100,
    fecha: cal.decorridos > 0 ? (recebido / cal.decorridos) * cal.totalUteis : recebido,
    falta,
    porDiaUtil: restam > 0 ? falta / restam : falta,
  };
}

/** A cor do ritmo: as faixas do quartil padrão (100 / 80 / 50). */
export function tomDoRitmo(pct: number): 'q1' | 'q2' | 'q3' | 'q4' {
  return pct >= 100 ? 'q1' : pct >= 80 ? 'q2' : pct >= 50 ? 'q3' : 'q4';
}

export function rotuloDoRitmo(pct: number): string {
  return pct >= 100 ? 'acima do ritmo' : pct >= 90 ? 'no ritmo' : pct >= 70 ? 'abaixo do ritmo' : 'muito abaixo';
}

// ── Os quartis ──────────────────────────────────────────────────────────────

export interface FatiaQuartil {
  quartil: number;
  qtd: number;
  /** % das pessoas com meta: quanto este quartil representa. */
  pct: number;
  /** A média da projeção (%) de quem está nele. */
  mediaProjecao: number | null;
  recebidoMedio: number | null;
}

export interface ResumoQuartis { total: number; fatias: FatiaQuartil[] }

export function resumirQuartis(linhas: readonly LinhaQuartil[], quartis: readonly QuartilConfig[]): ResumoQuartis {
  const ordem = [...quartis].sort((a, b) => a.quartil - b.quartil);
  const grupos = new Map<number, LinhaQuartil[]>(ordem.map((q): [number, LinhaQuartil[]] => [q.quartil, []]));
  let total = 0;
  for (const l of linhas) {
    if (!l.quartil) continue;
    grupos.get(l.quartil.quartil)?.push(l);
    total++;
  }
  return {
    total,
    fatias: ordem.map(q => {
      const g = grupos.get(q.quartil) ?? [];
      const proj = g.filter(l => l.projecao !== null);
      return {
        quartil: q.quartil,
        qtd: g.length,
        pct: total ? (g.length / total) * 100 : 0,
        mediaProjecao: proj.length ? proj.reduce((a, l) => a + (l.projecao ?? 0), 0) / proj.length : null,
        recebidoMedio: g.length ? g.reduce((a, l) => a + l.recebido, 0) / g.length : null,
      };
    }),
  };
}

/**
 * As pessoas de uma empresa, com quartil, agrupadas pelo setor de cada uma.
 *
 * O quartil é do MÊS (Cleber, 04/10/2026): `cal` aqui é o de hoje, nunca o do
 * corte escolhido no filtro de período — igual à aba Quartis do Painel Líder.
 * O recebimento indireto entra para quem tem meta indireta (regra Cofen).
 */
export function pessoasDaEmpresa(
  fontes: FontesDoPainel, cal: Calendario, emHO: boolean, ho: number, indiretoMap: MapaRecebimentoIndireto = {},
): Map<string, LinhaQuartil[]> {
  const [anoNum, mesNum] = fontes.mes.split('-').map(Number);
  return montarLinhasQuartil({
    anoNum, mesNum, mes: fontes.mes, hojeISO: cal.hojeISO,
    feriados: fontes.feriados, contarHoje: fontes.contarHoje, quartis: fontes.quartis,
    resumos: fontes.resumos, operadores: fontes.operadores,
    metasOp: fontes.metasOperador, metasIndiretas: fontes.metasIndiretas, indiretoMap,
    emHO, ho, setorIds: [], equipeIds: [],
    operadorEquipeMap: fontes.operadorEquipeMap,
    equipesExtrasPorOperador: fontes.equipesExtrasPorOperador,
    setorDaEquipe: mapaSetorDaEquipe(fontes.equipes),
    nomeDaEquipe: new Map(fontes.equipes.map(e => [e.id, e.nome] as const)),
    treinoMap: fontes.treinoMap,
  }).porSetor;
}

/** As equipes do gestão de um setor, com a conta do card do Painel Líder. */
export function equipesDoSetor(
  fontes: FontesDoPainel, setorId: string, cal: Calendario, emHO: boolean, ho: number,
  indiretoMap: MapaRecebimentoIndireto = {},
): EquipeNaTela[] {
  const f = { ...fontes, hojeISO: cal.hojeISO, emHO, ho, indiretoMap };
  return fontes.equipes
    .filter(e => e.setor_id === setorId)
    .map(e => montarEquipe(f, e.id))
    .filter((e): e is EquipeNaTela => !!e)
    .sort((a, b) => b.acumulado - a.acumulado);
}

// ── Os setores do placar ────────────────────────────────────────────────────

export interface SetorDoPlacar {
  /** `setorId`, ou `cofen` para a carteira Cofen. */
  chave: string;
  setorId: string | null;
  nome: string;
  cidadeId: string | null;
  cidadeNome: string;
  marca: MarcaVisual;
  cofen: boolean;
  /** Recebido no modo (Cofen em H.O. ou bruto). */
  valor: number;
  valorAnterior: number;
  temAnterior: boolean;
  operadores: number;
  ritmo: Ritmo | null;
}

/**
 * Um cartão por setor que conta: os de Nosso produto de cada cidade (os da
 * grade do 59), os que têm meta e ainda não receberam, e a carteira Cofen.
 */
export function setoresDoPlacar(params: {
  visao: VisaoMontada; setores: readonly InfoDoSetor[]; metas: Record<string, number>;
  cofen: CofenDoMes | null; modo: ModoCofen; cal: Calendario;
}): SetorDoPlacar[] {
  const { visao, setores, metas, cofen, modo, cal } = params;
  const out: SetorDoPlacar[] = [];
  for (const c of visao.cidades) {
    const presentes = new Set(c.setores.map(s => s.setorId));
    for (const s of c.setores) {
      out.push({
        chave: s.setorId, setorId: s.setorId, nome: s.nome, cidadeId: c.cidadeId, cidadeNome: c.nome, marca: c.marca,
        cofen: false, valor: s.valor, valorAnterior: s.valorAnterior, temAnterior: s.temAnterior,
        operadores: s.operadores, ritmo: ritmoDe(s.valor, metas[s.setorId], cal),
      });
    }
    // Setor com meta que ainda não recebeu nada no mês: aparece zerado — é
    // justamente o que a diretoria precisa ver.
    for (const s of setores) {
      if (s.cidadeId !== c.cidadeId || s.regra === 'cofen' || presentes.has(s.id) || !(metas[s.id] > 0)) continue;
      out.push({
        chave: s.id, setorId: s.id, nome: s.nome, cidadeId: c.cidadeId, cidadeNome: c.nome, marca: c.marca,
        cofen: false, valor: 0, valorAnterior: 0, temAnterior: false, operadores: 0, ritmo: ritmoDe(0, metas[s.id], cal),
      });
    }
    if (c.cofen && cofen) {
      const meta = modo === 'ho' ? metaNaUnidade(cofen.meta, 'ho') : cofen.meta;
      out.push({
        chave: 'cofen', setorId: c.cofen.setorId, nome: c.cofen.nome, cidadeId: c.cidadeId, cidadeNome: c.nome, marca: c.marca,
        cofen: true, valor: c.cofen.valor, valorAnterior: c.cofen.valorAnterior, temAnterior: c.cofen.valorAnterior > 0,
        operadores: c.cofen.operadores, ritmo: ritmoDe(c.cofen.valor, meta, cal),
      });
    }
  }
  return out;
}

/** A meta de um conjunto de setores: a soma das metas dos setores (os sem meta não entram). */
export function metaDoConjunto(lista: readonly SetorDoPlacar[]): { meta: number; semMeta: number } {
  let meta = 0, semMeta = 0;
  for (const s of lista) { if (s.ritmo) meta += s.ritmo.meta; else semMeta++; }
  return { meta, semMeta };
}

export type OrdemDoPlacar = 'ritmo' | 'valor' | 'az';

/** Pior ritmo primeiro; quem não tem meta vai para o fim. */
export function ordenarPlacar(lista: readonly SetorDoPlacar[], ordem: OrdemDoPlacar): SetorDoPlacar[] {
  const r = [...lista];
  if (ordem === 'az') return r.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (ordem === 'valor') return r.sort((a, b) => b.valor - a.valor);
  return r.sort((a, b) => {
    if (!a.ritmo || !b.ritmo) return a.ritmo ? -1 : b.ritmo ? 1 : b.valor - a.valor;
    return a.ritmo.pct - b.ritmo.pct;
  });
}

// ── O que pede atenção ──────────────────────────────────────────────────────

export type TomDoSinal = 'ruim' | 'alerta' | 'bom' | 'q4';

export interface SinalDoPlacar {
  chave: string;
  tom: TomDoSinal;
  marca: string;
  titulo: string;
  sub: string;
  /** A aba do detalhe que o clique abre. */
  aba: 'equipes' | 'pessoas';
}

/**
 * No máximo quatro sinais, e só os que mudam uma decisão: o pior ritmo, a
 * maior falta em reais, quem lidera e quantas pessoas estão no último quartil.
 */
export function sinaisDoPlacar(
  setores: readonly SetorDoPlacar[],
  q4: { qtd: number; maisEm: SetorDoPlacar | null } | null,
  fmt: (v: number) => string,
): SinalDoPlacar[] {
  const comMeta = setores.filter((s): s is SetorDoPlacar & { ritmo: Ritmo } => !!s.ritmo);
  const out: SinalDoPlacar[] = [];
  const pct = (v: number) => `${Math.round(v)}%`;
  const pior = [...comMeta].sort((a, b) => a.ritmo.pct - b.ritmo.pct)[0];
  if (pior && pior.ritmo.pct < 80) {
    out.push({ chave: pior.chave, tom: 'ruim', marca: '!', aba: 'equipes',
      titulo: `${pior.nome} está em ${pct(pior.ritmo.pct)} do ritmo`,
      sub: `falta ${fmt(-pior.ritmo.diferenca)} para o que deveria ter hoje` });
  }
  const buraco = [...comMeta].filter(s => s !== pior && s.ritmo.diferenca < 0)
    .sort((a, b) => a.ritmo.diferenca - b.ritmo.diferenca)[0];
  if (buraco) {
    out.push({ chave: buraco.chave, tom: 'alerta', marca: '↓', aba: 'equipes',
      titulo: `${buraco.nome} tem a maior falta em reais`,
      sub: `${fmt(-buraco.ritmo.diferenca)} abaixo do esperado · ${pct(buraco.ritmo.pct)} do ritmo` });
  }
  const lider = [...comMeta].sort((a, b) => b.ritmo.pct - a.ritmo.pct)[0];
  if (lider && lider.ritmo.pct >= 100) {
    out.push({ chave: lider.chave, tom: 'bom', marca: '↑', aba: 'equipes',
      titulo: `${lider.nome} lidera: ${pct(lider.ritmo.pct)} do ritmo`,
      sub: `fecha em ${fmt(lider.ritmo.fecha)} se mantiver` });
  }
  if (q4 && q4.qtd > 0 && q4.maisEm) {
    out.push({ chave: q4.maisEm.chave, tom: 'q4', marca: 'Q4', aba: 'pessoas',
      titulo: `${q4.qtd} ${q4.qtd === 1 ? 'pessoa' : 'pessoas'} no quartil 4`,
      sub: `abaixo de 50% do ritmo · mais em ${q4.maisEm.nome}` });
  }
  return out;
}
