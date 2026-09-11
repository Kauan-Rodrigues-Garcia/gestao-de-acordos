/**
 * metricas.ts — as contas do Dashboard – ADM, sem React e sem banco.
 *
 * Módulo puro pelo mesmo motivo de `numerosRegras.ts`: o que a tela promete
 * («tantos voltaram banidos», «metade aquece em até X dias») precisa ser
 * testável sem montar gráfico — e o `ResponsiveContainer` mede 0×0 em jsdom.
 *
 * ## De onde vem cada número
 *
 *   o ACERVO (hoje) ........ `numeros_whatsapp`, a foto do momento;
 *   o FLUXO (no período) ... `numeros_movimentacoes`, a trilha. Cada fato do
 *                            caminho de um número tem uma linha lá, com a data
 *                            do fato — é o único lugar de onde sai «quantos por
 *                            dia» sem inventar nada.
 *
 * Os dias são do fuso de quem olha, e não UTC: o Núcleo trabalha em Brasília, e
 * um cadastro às 22h não pode cair no dia seguinte.
 */
import type { MovimentacaoResumoRow, NumeroRow } from '@/services/numeros/numeros.service';
import { MOTIVOS_RETORNO, type MotivoRetorno } from '@/services/numeros/numerosRegras';

/** Os períodos que a tela oferece. Presets, e não calendário: é o que se usa. */
export const PERIODOS = [7, 30, 90] as const;
export type Periodo = typeof PERIODOS[number];

const UM_DIA = 86_400_000;

/** A meia-noite de `dias - 1` dias atrás: o período inclui hoje. */
export function inicioDoPeriodo(dias: number, hoje: Date = new Date()): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  d.setDate(d.getDate() - (dias - 1));
  return d;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

function chaveDoDia(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

// ── O fluxo, dia a dia ──────────────────────────────────────────────────────

export interface PontoDoFluxo {
  /** `AAAA-MM-DD`, no fuso local. */
  chave: string;
  /** `DD/MM`, para o eixo. */
  rotulo: string;
  cadastrados: number;
  liberados: number;
  retornos: number;
  ativados: number;
  banidos: number;
}

export type TotaisDoFluxo = Omit<PontoDoFluxo, 'chave' | 'rotulo'>;

/**
 * Um ponto por dia do período — inclusive os dias sem nada.
 *
 * O dia zerado entra no eixo: a sequência é o que dá a leitura de ritmo, e um
 * eixo que pula os dias parados faria uma semana fraca parecer contínua.
 *
 *   cadastrados .. `cadastro`
 *   liberados .... `liberado_ao_setor`
 *   retornos ..... `relancado_ao_nucleo` — o setor devolveu ao Núcleo
 *   ativados ..... `situacao_alterada` para ativo
 *   banidos ...... `situacao_alterada` para banido. Relançar como banido também
 *                  grava essa linha (migration 20260910210000), então o banido
 *                  que veio do setor conta aqui, e uma vez só.
 */
export function serieDoFluxo(
  movs: readonly MovimentacaoResumoRow[], dias: number, hoje: Date = new Date(),
): PontoDoFluxo[] {
  const inicio = inicioDoPeriodo(dias, hoje);
  const pontos: PontoDoFluxo[] = [];
  const porChave = new Map<string, PontoDoFluxo>();

  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    const ponto: PontoDoFluxo = {
      chave: chaveDoDia(d),
      rotulo: `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`,
      cadastrados: 0, liberados: 0, retornos: 0, ativados: 0, banidos: 0,
    };
    pontos.push(ponto);
    porChave.set(ponto.chave, ponto);
  }

  for (const m of movs) {
    const ponto = porChave.get(chaveDoDia(new Date(m.criado_em)));
    if (!ponto) continue;
    switch (m.tipo) {
      case 'cadastro':            ponto.cadastrados++; break;
      case 'liberado_ao_setor':   ponto.liberados++;   break;
      case 'relancado_ao_nucleo': ponto.retornos++;    break;
      case 'situacao_alterada':
        if (m.situacao_nova === 'ativo') ponto.ativados++;
        else if (m.situacao_nova === 'banido') ponto.banidos++;
        break;
    }
  }
  return pontos;
}

export function somarFluxo(serie: readonly PontoDoFluxo[]): TotaisDoFluxo {
  return serie.reduce<TotaisDoFluxo>((t, p) => ({
    cadastrados: t.cadastrados + p.cadastrados,
    liberados:   t.liberados + p.liberados,
    retornos:    t.retornos + p.retornos,
    ativados:    t.ativados + p.ativados,
    banidos:     t.banidos + p.banidos,
  }), { cadastrados: 0, liberados: 0, retornos: 0, ativados: 0, banidos: 0 });
}

// ── Qualidade ───────────────────────────────────────────────────────────────

export interface BanimentoDoSetor {
  setorId: string;
  /** Números que o Núcleo liberou a este setor no período. */
  liberados: number;
  /** Números que este setor devolveu ao Núcleo como banidos, no período. */
  voltaramBanidos: number;
  /**
   * `voltaramBanidos / liberados`, limitado a 1. `null` sem liberação no
   * período — um setor pode devolver banido o que recebeu no mês passado, e
   * dividir por zero não diz nada a ninguém.
   */
  taxa: number | null;
}

/** Quanto do que cada setor recebeu voltou banido. Os que mais devolvem vêm antes. */
export function banimentoPorSetor(movs: readonly MovimentacaoResumoRow[]): BanimentoDoSetor[] {
  const mapa = new Map<string, BanimentoDoSetor>();
  const doSetor = (setorId: string) => {
    let s = mapa.get(setorId);
    if (!s) { s = { setorId, liberados: 0, voltaramBanidos: 0, taxa: null }; mapa.set(setorId, s); }
    return s;
  };

  for (const m of movs) {
    if (m.tipo === 'liberado_ao_setor' && m.setor_destino_id) doSetor(m.setor_destino_id).liberados++;
    if (m.tipo === 'relancado_ao_nucleo' && m.motivo === 'banido' && m.setor_origem_id) {
      doSetor(m.setor_origem_id).voltaramBanidos++;
    }
  }

  return [...mapa.values()]
    .map(s => ({ ...s, taxa: s.liberados > 0 ? Math.min(1, s.voltaramBanidos / s.liberados) : null }))
    .sort((a, b) => b.voltaramBanidos - a.voltaramBanidos || b.liberados - a.liberados);
}

/** Por que os números voltaram ao Núcleo no período, do motivo mais comum ao menos. */
export function motivosDeRetorno(
  movs: readonly MovimentacaoResumoRow[],
): { motivo: MotivoRetorno; quantos: number }[] {
  const contagem = new Map<MotivoRetorno, number>();
  for (const m of movs) {
    if (m.tipo !== 'relancado_ao_nucleo') continue;
    const motivo = MOTIVOS_RETORNO.find(x => x === m.motivo);
    if (motivo) contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
  }
  return [...contagem].map(([motivo, quantos]) => ({ motivo, quantos }))
    .sort((a, b) => b.quantos - a.quantos);
}

/**
 * Quanto tempo um número leva do cadastro à primeira ativação — a mediana.
 *
 * Mediana, e não média: um chip esquecido três semanas no aquecimento puxaria a
 * média para um valor que não descreve número nenhum.
 *
 * Só entram os números CADASTRADOS no período. Um número antigo que foi banido e
 * reativado hoje teria «semanas de aquecimento» sem ter aquecido nada.
 */
export function aquecimentoMediano(
  numeros: readonly Pick<NumeroRow, 'id' | 'criado_em'>[],
  movs: readonly MovimentacaoResumoRow[],
  inicio: Date,
): { dias: number | null; amostra: number } {
  const criadoEm = new Map<string, number>();
  for (const n of numeros) {
    const t = new Date(n.criado_em).getTime();
    if (t >= inicio.getTime()) criadoEm.set(n.id, t);
  }

  const primeiraAtivacao = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== 'situacao_alterada' || m.situacao_nova !== 'ativo') continue;
    if (!criadoEm.has(m.numero_id)) continue;
    const t = new Date(m.criado_em).getTime();
    const anterior = primeiraAtivacao.get(m.numero_id);
    if (anterior === undefined || t < anterior) primeiraAtivacao.set(m.numero_id, t);
  }

  const duracoes = [...primeiraAtivacao]
    .map(([id, t]) => (t - (criadoEm.get(id) as number)) / UM_DIA)
    .filter(d => d >= 0)
    .sort((a, b) => a - b);

  if (duracoes.length === 0) return { dias: null, amostra: 0 };
  const meio = Math.floor(duracoes.length / 2);
  const dias = duracoes.length % 2 === 1
    ? duracoes[meio]
    : (duracoes[meio - 1] + duracoes[meio]) / 2;
  return { dias, amostra: duracoes.length };
}

// ── O acervo, hoje ──────────────────────────────────────────────────────────

export interface RetratoDoAcervo {
  total: number;
  ativos: number;
  aquecendo: number;
  banidos: number;
  noNucleo: number;
  nosSetores: number;
  /** Ativo, no Núcleo e sem tratamento em aberto — a conta de `podeLiberarAoSetor`. */
  prontos: number;
  /** Voltou de um setor e ninguém pegou. */
  esperando: number;
  /** Voltou e o Núcleo está tratando. */
  tratando: number;
  /** Aguardando 12 ou 24 horas. */
  aguardando: number;
  /** Em restrição temporária. */
  emRestricao: number;
  /** Movimentando no proxy. */
  noProxy: number;
}

export function retratoDoAcervo(numeros: readonly NumeroRow[]): RetratoDoAcervo {
  const r: RetratoDoAcervo = {
    total: numeros.length, ativos: 0, aquecendo: 0, banidos: 0,
    noNucleo: 0, nosSetores: 0, prontos: 0, esperando: 0, tratando: 0,
    aguardando: 0, emRestricao: 0, noProxy: 0,
  };
  for (const n of numeros) {
    if (n.situacao === 'ativo') r.ativos++;
    if (n.situacao === 'em_aquecimento') r.aquecendo++;
    if (n.situacao === 'banido') r.banidos++;
    if (n.situacao === 'aguardando_12h' || n.situacao === 'aguardando_24h') r.aguardando++;
    if (n.situacao === 'em_restricao') r.emRestricao++;
    if (n.situacao === 'movimentando_proxy') r.noProxy++;
    if (n.posse === 'nucleo') {
      r.noNucleo++;
      if (n.situacao === 'ativo' && n.tratamento === null) r.prontos++;
    } else {
      r.nosSetores++;
    }
    if (n.tratamento === 'pendente') r.esperando++;
    if (n.tratamento === 'em_andamento') r.tratando++;
  }
  return r;
}

export interface DistribuicaoDoSetor {
  setorId: string;
  total: number;
  /** Em uso: lançado a alguém e não banido. */
  comOperador: number;
  /** Na liderança, esperando ser lançado. */
  aguardando: number;
  /** Banido e ainda no setor — é o que o setor precisa relançar. */
  banidos: number;
}

/** Quem está com quantos, dos setores com mais números aos com menos. */
export function distribuicaoPorSetor(numeros: readonly NumeroRow[]): DistribuicaoDoSetor[] {
  const mapa = new Map<string, DistribuicaoDoSetor>();
  for (const n of numeros) {
    if (n.posse !== 'setor') continue;
    let s = mapa.get(n.setor_id);
    if (!s) {
      s = { setorId: n.setor_id, total: 0, comOperador: 0, aguardando: 0, banidos: 0 };
      mapa.set(n.setor_id, s);
    }
    s.total++;
    if (n.situacao === 'banido') s.banidos++;
    else if (n.operador_id !== null) s.comOperador++;
    else s.aguardando++;
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
