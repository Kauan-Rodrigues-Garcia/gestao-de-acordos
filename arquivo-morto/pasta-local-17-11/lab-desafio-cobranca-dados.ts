// Os números, as regras e os formatos do MODELO DE TESTE do Desafio Cobrança,
// lidos pela gaveta (`lab-desafio-cobranca.tsx`) e pela TV (`-tv.tsx`).
// Fictícios, sem banco.

// ── O desafio ────────────────────────────────────────────────────────────────

/** Segunda a quarta (16/11/2026: «não será mais até quinta»). */
export const DIAS = ['2026-11-16', '2026-11-17', '2026-11-18'];

/** A META GERAL, de todos os setores que somam: a padrão (16/11/2026). */
export const META_GERAL = 1_900_000;

export const DESAFIO = {
  titulo: 'Desafio Cobrança',
  subtitulo: 'para folgar mais cedo',
  dias: DIAS,
  metaGeral: META_GERAL,
  /** A parte de cada dia, para o ponteiro andar um terço por dia. */
  metaDia: Math.round(META_GERAL / DIAS.length / 1000) * 1000,
};

/** Onde o ponteiro precisa estar no fim do dia `i` (0 = segunda). */
export const esperadoAteODia = (i: number) =>
  i >= DIAS.length - 1 ? DESAFIO.metaGeral : DESAFIO.metaDia * (i + 1);

/**
 * O prêmio do desafio geral: batendo a meta, todo mundo sai às 14h. Ter banco
 * de horas é requisito — aparece como informação extra (16/11/2026).
 */
export const PREMIO = { dia: '2026-11-19', hora: '14:00', requisito: 'Precisa ter banco de horas' };

/**
 * A regra INDIVIDUAL (16/11/2026): o operador que fizer 4,5 médias dele nos 3
 * dias sai 1 hora mais cedo. Não é do desafio geral — não entra no relógio,
 * na meta nem na TV; no Gestão aparece só como aviso à parte.
 */
export const REGRA_OPERADOR = { medias: 4.5, premio: 'sai 1 hora mais cedo' };

/**
 * Quem está olhando, como operador (fictício): o recebido dele em novembro até
 * a véspera do desafio, e o de cada dia do desafio que já passou. A conta é a
 * de `src/lib/desafioMediaOperador.ts`.
 */
export const EU = {
  nome: 'Mariana Costa',
  recebidoAntes: 72_000,
  passados: [9_400, 11_200, 0],
  /** Os feriados do mês antes do desafio (Finados). */
  feriados: ['2026-11-02'],
};

// ── Os setores ───────────────────────────────────────────────────────────────

export interface SetorDoDesafio { id: string; nome: string; cidade: string; peso: number }

/** Os setores e o peso de cada um no recebimento (fictício). */
export const SETORES: SetorDoDesafio[] = [
  { id: 'play2', nome: 'Play 2', cidade: 'Birigui', peso: 0.25 },
  { id: 'receptivo', nome: 'Receptivo', cidade: 'Birigui', peso: 0.2 },
  { id: 'play3', nome: 'Play 3', cidade: 'Birigui', peso: 0.17 },
  { id: 'jornada', nome: 'Jornada', cidade: 'Birigui', peso: 0.13 },
  { id: 'marilia', nome: 'Cobrança Marília', cidade: 'Marília', peso: 0.25 },
];

/**
 * Por setor, duas escolhas separadas: se o recebimento SOMA no desafio e se a
 * equipe VÊ o desafio. Marília soma, mas ainda não vê (16/11/2026) — liga
 * depois, sem mexer no resto.
 */
export interface ConfigSetor { id: string; soma: boolean; ve: boolean }

export const CONFIG_INICIAL: ConfigSetor[] = SETORES.map((s) => ({ id: s.id, soma: true, ve: s.cidade !== 'Marília' }));

/** Quanto do recebimento total entra no desafio (a soma dos pesos marcados). */
export function fracaoQueSoma(cfg: readonly ConfigSetor[]): number {
  return SETORES.reduce((s, x) => s + (cfg.find((c) => c.id === x.id)?.soma ? x.peso : 0), 0);
}

/** O que todos os setores fizeram nos dias que já passaram (fictício, 100%). */
export const DIAS_PASSADOS = [652_400, 588_900, 0];

export interface Estado {
  hoje: number;
  /** O de hoje, já só dos setores que somam. */
  somadoHoje: number;
  /** Dos dias que passaram, já só dos setores que somam. */
  passados: number[];
  total: number;
}

// ── Formatos ─────────────────────────────────────────────────────────────────

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : v >= 1000 ? `R$ ${Math.floor(v / 1000).toLocaleString('pt-BR')} mil`
      : brl(v);
/** Cortado, não arredondado: 99,6% não vira 100%. */
export const pct = (v: number, meta: number) => (meta > 0 ? Math.min(Math.floor((v / meta) * 100), 100) : 0);
/** «4,5 médias», «1 média». */
export const medias = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n === 1 ? 'média' : 'médias'}`;

export function diaLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}
export const semana = (iso: string) => diaLocal(iso).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
export const semanaCurta = (iso: string) => semana(iso).slice(0, 3);
export const dataCurta = (iso: string) => diaLocal(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** «hoje e mais 2 dias», «hoje e amanhã», «último dia!». */
export function diasRestantes(hoje: number): string {
  const depois = DIAS.length - 1 - hoje;
  if (depois <= 0) return 'último dia!';
  if (depois === 1) return 'hoje e amanhã';
  return `hoje e mais ${depois} dias`;
}

export function hojeReal(): number {
  const hoje = new Date();
  const i = DIAS.findIndex((d) => {
    const x = diaLocal(d);
    return x.getFullYear() === hoje.getFullYear() && x.getMonth() === hoje.getMonth() && x.getDate() === hoje.getDate();
  });
  return i >= 0 ? i : 0;
}
