/**
 * chipsPainel.ts — as contas da Meus Chips 2.0, sem banco nem tela.
 *
 * A visão de gestão agrupa por SETOR ou por EQUIPE; cada grupo tem as pessoas,
 * e cada pessoa os chips dela. A agenda junta tempos de status e lembretes em
 * ordem de fim. Tudo aqui é puro para poder ser testado sem React.
 */
import { marcaDaCidade } from '@/lib/marca';
import {
  estadoDoLembrete, estadoDoTempo, type StatusChip,
} from './chipsFisicosRegras';

export interface ChipDoPainel {
  id: string;
  operador_id: string;
  numero: string;
  status: StatusChip;
  status_desde: string;
  prazo_ate: string | null;
  etiquetas?: readonly string[] | null;
  lembrete_texto?: string | null;
  lembrete_ate?: string | null;
}

export interface PessoaDoPainel {
  id: string;
  nome: string;
  foto_url: string | null;
  setor_id: string | null;
  equipe_id?: string | null;
  ativo: boolean;
}

export interface Contagem {
  total: number;
  ativo: number;
  recuperar: number;
  restricao: number;
  banido: number;
  movimentando: number;
}

export const CONTAGEM_ZERO: Contagem = {
  total: 0, ativo: 0, recuperar: 0, restricao: 0, banido: 0, movimentando: 0,
};

export function contar(chips: readonly ChipDoPainel[]): Contagem {
  const c = { ...CONTAGEM_ZERO };
  for (const x of chips) {
    c.total += 1;
    c[x.status] += 1;
    if (x.etiquetas?.includes('movimentando')) c.movimentando += 1;
  }
  return c;
}

/** % de ativos, 0–100. */
export function saude(c: Pick<Contagem, 'total' | 'ativo'>): number {
  return c.total > 0 ? Math.round((c.ativo / c.total) * 100) : 0;
}

/** Peso de atenção: banido > restrição > recuperar. */
export function peso(c: Contagem): number {
  return c.banido * 100 + c.restricao * 10 + c.recuperar;
}

export interface LinhaPessoa<C extends ChipDoPainel = ChipDoPainel> {
  pessoa: PessoaDoPainel;
  chips: C[];
  contagem: Contagem;
}

export interface GrupoPainel<C extends ChipDoPainel = ChipDoPainel> {
  id: string;
  nome: string;
  /** «Play 1 · BookPlay» para equipe; marca para setor. */
  detalhe: string | null;
  contagem: Contagem;
  pessoas: LinhaPessoa<C>[];
  /** Pessoas ativas do grupo sem chip nenhum. */
  semChip: PessoaDoPainel[];
}

export type ModoGrupo = 'setor' | 'equipe';

export interface SetorDoPainel { id: string; nome: string; cidade: string | null }
export interface EquipeDoPainel { id: string; nome: string; setor_id: string | null }

const SEM = '__sem__';

/**
 * Os grupos da visão de gestão. Pessoa que a tela não conhece cai em
 * «Sem setor»/«Sem equipe». Grupos e pessoas vêm por atenção (quem tem banido
 * primeiro) e, no empate, por nome.
 */
export function agruparGestao<C extends ChipDoPainel>(
  chips: readonly C[],
  pessoas: ReadonlyMap<string, PessoaDoPainel>,
  setores: readonly SetorDoPainel[],
  equipes: readonly EquipeDoPainel[],
  modo: ModoGrupo,
  incluirSemChip: boolean,
): GrupoPainel<C>[] {
  const setorPorId = new Map(setores.map(s => [s.id, s]));
  const equipePorId = new Map(equipes.map(e => [e.id, e]));

  const chaveDe = (p: PessoaDoPainel | undefined): string => {
    if (!p) return SEM;
    if (modo === 'setor') return p.setor_id ?? SEM;
    return p.equipe_id && equipePorId.has(p.equipe_id) ? p.equipe_id : SEM;
  };

  const porPessoa = new Map<string, C[]>();
  for (const c of chips) {
    const l = porPessoa.get(c.operador_id) ?? [];
    l.push(c);
    porPessoa.set(c.operador_id, l);
  }

  const grupos = new Map<string, GrupoPainel<C>>();
  const grupo = (chave: string): GrupoPainel<C> => {
    let g = grupos.get(chave);
    if (!g) {
      let nome: string;
      let detalhe: string | null = null;
      if (chave === SEM) {
        nome = modo === 'setor' ? 'Sem setor' : 'Sem equipe';
      } else if (modo === 'setor') {
        const s = setorPorId.get(chave);
        nome = s?.nome ?? 'Setor removido';
        detalhe = marcaDaCidade(s?.cidade)?.nome ?? s?.cidade ?? null;
      } else {
        const e = equipePorId.get(chave)!;
        nome = e.nome;
        const s = e.setor_id ? setorPorId.get(e.setor_id) : undefined;
        const marca = marcaDaCidade(s?.cidade)?.nome;
        detalhe = [s?.nome, marca].filter(Boolean).join(' · ') || null;
      }
      g = { id: chave, nome, detalhe, contagem: { ...CONTAGEM_ZERO }, pessoas: [], semChip: [] };
      grupos.set(chave, g);
    }
    return g;
  };

  for (const [operadorId, lista] of porPessoa) {
    const p = pessoas.get(operadorId) ?? {
      id: operadorId, nome: 'Pessoa não encontrada', foto_url: null, setor_id: null, ativo: false,
    };
    const g = grupo(chaveDe(pessoas.get(operadorId)));
    const contagem = contar(lista);
    g.pessoas.push({ pessoa: p, chips: lista, contagem });
    for (const k of Object.keys(contagem) as (keyof Contagem)[]) g.contagem[k] += contagem[k];
  }

  if (incluirSemChip) {
    for (const p of pessoas.values()) {
      if (!p.ativo || porPessoa.has(p.id)) continue;
      // Só entra em grupo que existe por chip OU por cadastro conhecido.
      const chave = chaveDe(p);
      if (chave === SEM && !grupos.has(SEM)) continue;
      grupo(chave).semChip.push(p);
    }
  }

  const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
  for (const g of grupos.values()) {
    g.pessoas.sort((a, b) => peso(b.contagem) - peso(a.contagem) || porNome(a.pessoa.nome, b.pessoa.nome));
    g.semChip.sort((a, b) => porNome(a.nome, b.nome));
  }
  return [...grupos.values()].sort((a, b) =>
    (a.id === SEM ? 1 : 0) - (b.id === SEM ? 1 : 0)
    || peso(b.contagem) - peso(a.contagem)
    || porNome(a.nome, b.nome));
}

// ── Agenda: o que vai acabar ────────────────────────────────────────────────

export interface ItemAgenda<C extends ChipDoPainel = ChipDoPainel> {
  chave: string;
  chip: C;
  tipo: 'tempo' | 'lembrete';
  /** Texto do lembrete; nulo no tempo de status. */
  texto: string | null;
  fim: number;
  vencido: boolean;
}

/** Tempos de status e lembretes, vencidos primeiro, depois pelo fim mais perto. */
export function montarAgenda<C extends ChipDoPainel>(chips: readonly C[], agora: number): ItemAgenda<C>[] {
  const itens: ItemAgenda<C>[] = [];
  for (const c of chips) {
    const t = estadoDoTempo(c, agora);
    if (t.tipo !== 'sem_tempo' && c.prazo_ate) {
      itens.push({
        chave: `${c.id}:t`, chip: c, tipo: 'tempo', texto: null,
        fim: new Date(c.prazo_ate).getTime(), vencido: t.tipo === 'encerrado',
      });
    }
    const l = estadoDoLembrete(c, agora);
    if (l.tipo !== 'sem_lembrete' && c.lembrete_ate) {
      itens.push({
        chave: `${c.id}:l`, chip: c, tipo: 'lembrete', texto: l.texto,
        fim: new Date(c.lembrete_ate).getTime(), vencido: l.tipo === 'vencido',
      });
    }
  }
  return itens.sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.fim - b.fim);
}

/** Pessoas com chip e NENHUM ativo — sem como trabalhar. */
export function pessoasSemAtivo<C extends ChipDoPainel>(grupos: readonly GrupoPainel<C>[]): LinhaPessoa<C>[] {
  return grupos.flatMap(g => g.pessoas).filter(l => l.contagem.total > 0 && l.contagem.ativo === 0);
}
