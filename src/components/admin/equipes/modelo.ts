/**
 * modelo.ts — a lógica da aba Equipes, sem tela e sem banco.
 *
 * A aba é um quadro: de um lado quem está sem equipe, do outro as equipes do
 * setor. Mexer nele é sempre a mesma operação — levar uma ou mais pessoas para
 * um DESTINO (uma equipe, um subgrupo dela, ou «sem equipe») — venha ela de um
 * arrastar, do «Mover para…» da pessoa ou da barra de seleção. Por isso o plano
 * do movimento mora aqui, testado, e as três entradas da tela só o chamam.
 */

export interface SetorEq {
  id: string;
  nome: string;
}

export interface EquipeEq {
  id: string;
  nome: string;
  setor_id: string;
  empresa_id: string;
  /** Equipe de treinamento: dias úteis contam a partir de treinamento_inicio. */
  treinamento?: boolean;
  treinamento_inicio?: string | null;
}

export interface PessoaEq {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  setor_id: string | null;
  equipe_id: string | null;
  empresa_id: string;
  /** Subgrupo dentro da equipe. `null`/ausente = conta direto na equipe. */
  subgrupo_id?: string | null;
  situacao?: string | null;
  ferias_ate?: string | null;
  foto_url?: string | null;
}

export interface SubgrupoEq {
  id: string;
  equipe_id: string;
  nome: string;
}

/** Para onde uma pessoa pode ir. `equipeId: null` = sem equipe. */
export interface Destino {
  equipeId: string | null;
  subgrupoId: string | null;
}

export interface OpcaoDeDestino extends Destino {
  chave: string;
  rotulo: string;
  /** Nome da equipe, quando o destino é um subgrupo dela. */
  equipeNome?: string;
  qtd: number;
}

/** Onde a pessoa está antes e depois do movimento. */
export interface Mudanca {
  id: string;
  nome: string;
  de: Destino;
  para: Destino;
}

// ── Texto ────────────────────────────────────────────────────────────────────

/** Sem acento e em minúsculas: «Marília» acha «marilia». */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function casaBusca(nome: string, busca: string): boolean {
  const b = normalizar(busca);
  return !b || normalizar(nome).includes(b);
}

/** Duas letras para o círculo da pessoa: primeiro e último nome. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

// ── Leitura do quadro ────────────────────────────────────────────────────────

/** Subgrupos de uma equipe, em ordem alfabética. */
export function subgruposDaEquipe(subgrupos: readonly SubgrupoEq[], equipeId: string): SubgrupoEq[] {
  return subgrupos
    .filter(s => s.equipe_id === equipeId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Os membros da equipe repartidos: uma lista por subgrupo, mais os que não
 * estão em nenhum.
 *
 * Um subgrupo cujo id não existe mais (apagado em outra aba) cai em «sem
 * subgrupo» em vez de sumir — a pessoa continua na equipe, e escondê-la faria
 * o contador do cartão discordar do que está listado embaixo.
 */
export function repartirPorSubgrupo<T extends { subgrupo_id?: string | null }>(
  membros: readonly T[], grupos: readonly SubgrupoEq[],
): { porGrupo: Map<string, T[]>; soltos: T[] } {
  const porGrupo = new Map<string, T[]>(grupos.map((g): [string, T[]] => [g.id, []]));
  const soltos: T[] = [];
  for (const m of membros) {
    const lista = m.subgrupo_id ? porGrupo.get(m.subgrupo_id) : undefined;
    if (lista) lista.push(m);
    else soltos.push(m);
  }
  return { porGrupo, soltos };
}

export interface ResumoDoSetor {
  pessoas: number;
  emEquipe: number;
  semEquipe: number;
  equipes: number;
  /** % das pessoas que já estão numa equipe (0 a 100). */
  alocados: number;
}

export function resumoDoSetor(pessoas: readonly PessoaEq[], equipes: readonly EquipeEq[]): ResumoDoSetor {
  const emEquipe = pessoas.filter(p => p.equipe_id).length;
  return {
    pessoas: pessoas.length,
    emEquipe,
    semEquipe: pessoas.length - emEquipe,
    equipes: equipes.length,
    alocados: pessoas.length ? Math.round((emEquipe / pessoas.length) * 100) : 0,
  };
}

/**
 * Todos os destinos do setor, na ordem em que a tela os mostra: «sem equipe»
 * primeiro, depois cada equipe seguida dos subgrupos dela.
 */
export function destinosDoSetor(
  equipes: readonly EquipeEq[], subgrupos: readonly SubgrupoEq[], pessoas: readonly PessoaEq[],
): OpcaoDeDestino[] {
  const naEquipe = (id: string) => pessoas.filter(p => p.equipe_id === id).length;
  const noGrupo = (id: string) => pessoas.filter(p => p.subgrupo_id === id).length;
  const saida: OpcaoDeDestino[] = [{
    chave: 'sem', equipeId: null, subgrupoId: null, rotulo: 'Sem equipe',
    qtd: pessoas.filter(p => !p.equipe_id).length,
  }];
  for (const e of equipes) {
    saida.push({ chave: e.id, equipeId: e.id, subgrupoId: null, rotulo: e.nome, qtd: naEquipe(e.id) });
    for (const g of subgruposDaEquipe(subgrupos, e.id)) {
      saida.push({
        chave: `${e.id}:${g.id}`, equipeId: e.id, subgrupoId: g.id,
        rotulo: g.nome, equipeNome: e.nome, qtd: noGrupo(g.id),
      });
    }
  }
  return saida;
}

export function mesmoDestino(a: Destino, b: Destino): boolean {
  return a.equipeId === b.equipeId && (a.subgrupoId ?? null) === (b.subgrupoId ?? null);
}

export function ondeEsta(p: Pick<PessoaEq, 'equipe_id' | 'subgrupo_id'>): Destino {
  return { equipeId: p.equipe_id, subgrupoId: p.equipe_id ? p.subgrupo_id ?? null : null };
}

// ── O movimento ──────────────────────────────────────────────────────────────

/**
 * O que muda ao levar `ids` para `destino`.
 *
 * Fica de fora quem já está lá (nada a gravar) e quem não está na lista — um
 * transferido do mês, por exemplo, aparece no quadro mas não é pessoa da
 * equipe e não tem para onde ir. Sem equipe não há subgrupo.
 */
export function planejarMovimento(
  pessoas: readonly PessoaEq[], ids: Iterable<string>, destino: Destino,
): Mudanca[] {
  const para: Destino = destino.equipeId
    ? { equipeId: destino.equipeId, subgrupoId: destino.subgrupoId ?? null }
    : { equipeId: null, subgrupoId: null };
  const porId = new Map(pessoas.map(p => [p.id, p]));
  const saida: Mudanca[] = [];
  const vistos = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const p = porId.get(id);
    if (!p) continue;
    const de = ondeEsta(p);
    if (mesmoDestino(de, para)) continue;
    saida.push({ id: p.id, nome: p.nome, de, para });
  }
  return saida;
}

/** O caminho de volta: cada pessoa para onde estava. */
export function desfazer(mudancas: readonly Mudanca[]): Mudanca[] {
  return mudancas.map(m => ({ id: m.id, nome: m.nome, de: m.para, para: m.de }));
}

/**
 * As mudanças juntadas por destino: uma escrita no banco por grupo, e não uma
 * por pessoa. Mover oito pessoas para a mesma equipe é um UPDATE só.
 */
export function agruparPorDestino(mudancas: readonly Mudanca[]): { destino: Destino; ids: string[] }[] {
  const grupos = new Map<string, { destino: Destino; ids: string[] }>();
  for (const m of mudancas) {
    const chave = `${m.para.equipeId ?? ''}|${m.para.subgrupoId ?? ''}`;
    const g = grupos.get(chave) ?? { destino: m.para, ids: [] };
    g.ids.push(m.id);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

/** Aplica as mudanças numa lista (atualização otimista e o desfazer local). */
export function aplicarMudancas<T extends PessoaEq>(pessoas: readonly T[], mudancas: readonly Mudanca[]): T[] {
  const para = new Map(mudancas.map(m => [m.id, m.para]));
  return pessoas.map(p => {
    const d = para.get(p.id);
    return d ? { ...p, equipe_id: d.equipeId, subgrupo_id: d.subgrupoId } : p;
  });
}

/** A frase do aviso: «Ana → Equipe Alfa» ou «3 pessoas → Equipe Alfa · Manhã». */
export function fraseDoMovimento(mudancas: readonly Mudanca[], nomeDoDestino: string | null): string {
  const quem = mudancas.length === 1 ? mudancas[0].nome : plural(mudancas.length, 'pessoa', 'pessoas');
  return nomeDoDestino ? `${quem} → ${nomeDoDestino}` : `${quem} ${mudancas.length === 1 ? 'saiu' : 'saíram'} da equipe`;
}
