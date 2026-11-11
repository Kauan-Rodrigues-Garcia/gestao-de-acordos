/**
 * ranking.ts — o Ranking de quitação como a aba e a TV o leem (11/11/2026).
 *
 * O banco faz a conta uma vez só (`fn_ranking_quitacao_calcular`,
 * 20261111150500) e a entrega à aba (`fn_ranking_quitacao`) e ao Modo TV
 * (`fn_tv_numeros_calcular` → `quitacao`). Este módulo é o leitor ÚNICO do
 * pacote: a aba do Analítico e a cena da TV passam por `normalizarRanking`, e
 * por isso mostram a mesma ordem, os mesmos prêmios e os mesmos destaques.
 *
 * Aceita também o pacote de antes da migration (sem `disputas`, com `posicoes`
 * e 6 prêmios em valor), para a tela não quebrar enquanto ela não é aplicada.
 *
 * Puro: sem React, sem banco.
 */

export type Criterio = 'valor' | 'quantidade';
export type Disputa = 'setor' | 'equipe';
export type CategoriaId = 'mais_quitacoes' | 'maior_valor' | 'maior_quitacao' | 'equipe_campea';

/** A ordem em que os destaques aparecem na configuração. */
export const CATEGORIAS: { id: CategoriaId; titulo: string; descricao: string }[] = [
  { id: 'mais_quitacoes', titulo: 'Mais quitações', descricao: 'Quem fez mais quitações no mês' },
  { id: 'maior_valor', titulo: 'Maior valor quitado', descricao: 'Quem quitou mais em reais no mês' },
  { id: 'maior_quitacao', titulo: 'Maior quitação', descricao: 'A maior quitação do mês, sozinha' },
  { id: 'equipe_campea', titulo: 'Equipe campeã', descricao: 'A equipe que mais quitou, somando todo mundo' },
];

export const titulosDasCategorias: Record<CategoriaId, string> =
  Object.fromEntries(CATEGORIAS.map(c => [c.id, c.titulo])) as Record<CategoriaId, string>;

/** Até que posição, no máximo, um ranking paga prêmio. */
export const MAX_POSICOES_PREMIADAS = 10;
/** Quantas posições aparecem. */
export const POSICOES_NA_TELA = 10;

/** A premiação de outubro/2026, do 1º ao 6º lugar — o padrão de setor novo. */
export const PREMIOS_PADRAO = [350, 250, 180, 100, 70, 50] as const;

// ── A configuração do setor ─────────────────────────────────────────────────

export interface CategoriaConfig {
  id: CategoriaId;
  ativo: boolean;
  premio: number | null;
  premio_texto: string;
}

export interface ConfigRanking {
  criterio: Criterio;
  disputa: Disputa;
  equipes_fora: string[];
  minimo_quitacoes: number;
  /** O brinde de cada posição, ao lado do valor de `premios`. Mesmo tamanho. */
  premios_texto: string[];
  categorias: CategoriaConfig[];
}

export const CONFIG_PADRAO: ConfigRanking = {
  criterio: 'valor',
  disputa: 'setor',
  equipes_fora: [],
  minimo_quitacoes: 0,
  premios_texto: [],
  categorias: [],
};

const ehCategoria = (v: unknown): v is CategoriaId => CATEGORIAS.some(c => c.id === v);

/** O `config` como veio do banco (ou nada, antes da migration) → sempre completo. */
export function lerConfig(bruto: unknown): ConfigRanking {
  const c = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    criterio: c.criterio === 'quantidade' ? 'quantidade' : 'valor',
    disputa: c.disputa === 'equipe' ? 'equipe' : 'setor',
    equipes_fora: lista(c.equipes_fora).filter((x): x is string => typeof x === 'string'),
    minimo_quitacoes: Math.max(0, Math.trunc(num(c.minimo_quitacoes))),
    premios_texto: lista(c.premios_texto).map(x => (typeof x === 'string' ? x : '')),
    categorias: lista(c.categorias)
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && ehCategoria((x as { id?: unknown }).id))
      .map(x => ({
        id: x.id as CategoriaId,
        ativo: x.ativo !== false,
        premio: x.premio == null || num(x.premio) <= 0 ? null : num(x.premio),
        premio_texto: typeof x.premio_texto === 'string' ? x.premio_texto : '',
      })),
  };
}

/**
 * O `config` que vai para o banco: sem chave padrão à toa, brindes do tamanho
 * dos prêmios, sem espaço sobrando.
 */
export function configParaGravar(c: ConfigRanking, posicoesPremiadas: number): Record<string, unknown> {
  const textos = Array.from({ length: posicoesPremiadas }, (_, i) => (c.premios_texto[i] ?? '').trim().slice(0, 40));
  return {
    criterio: c.criterio,
    disputa: c.disputa,
    equipes_fora: [...new Set(c.equipes_fora)],
    minimo_quitacoes: Math.max(0, Math.min(999, Math.trunc(c.minimo_quitacoes) || 0)),
    premios_texto: textos.some(Boolean) ? textos : [],
    categorias: c.categorias.map(k => ({
      id: k.id,
      ativo: k.ativo,
      premio: k.premio != null && k.premio > 0 ? Math.round(k.premio * 100) / 100 : null,
      premio_texto: k.premio_texto.trim().slice(0, 40),
    })),
  };
}

/** Uma linha para a lista de setores: «Cada equipe · por quantidade · 6 prêmios · 2 destaques». */
export function resumoDaConfig(c: ConfigRanking, posicoesPremiadas: number): string {
  const partes = [
    c.disputa === 'equipe' ? 'Cada equipe disputa' : 'Setor inteiro',
    c.criterio === 'quantidade' ? 'por quantidade' : 'por valor',
    posicoesPremiadas === 0 ? 'sem prêmio por posição' : `${posicoesPremiadas} ${posicoesPremiadas === 1 ? 'posição premiada' : 'posições premiadas'}`,
  ];
  const destaques = c.categorias.filter(k => k.ativo).length;
  if (destaques) partes.push(`${destaques} ${destaques === 1 ? 'destaque' : 'destaques'}`);
  if (c.minimo_quitacoes > 0) partes.push(`mínimo ${c.minimo_quitacoes}`);
  if (c.equipes_fora.length) partes.push(`${c.equipes_fora.length} ${c.equipes_fora.length === 1 ? 'equipe de fora' : 'equipes de fora'}`);
  return partes.join(' · ');
}

// ── O ranking ───────────────────────────────────────────────────────────────

export interface PosicaoRanking {
  posicao: number;
  operador_id: string;
  nome: string;
  foto_url: string | null;
  equipe_id: string | null;
  equipe_nome: string | null;
  quitacoes: number;
  valor: number;
  /** Prêmio em reais da posição; nulo sem prêmio (ou abaixo do mínimo). */
  premio: number | null;
  /** O brinde da posição («Troféu»). */
  premio_texto: string | null;
  /** Está numa posição premiada, mas não tem o mínimo de quitações. */
  abaixo_minimo: boolean;
}

export interface DisputaRanking {
  /** Nulo na disputa do setor inteiro. */
  equipe_id: string | null;
  nome: string | null;
  participantes: number;
  quitacoes_total: number;
  valor_total: number;
  posicoes: PosicaoRanking[];
}

export interface EquipeDoRanking {
  id: string;
  nome: string;
  quitacoes: number;
  valor: number;
  pessoas: number;
}

export interface VencedorCategoria {
  id: string;
  nome: string;
  foto_url: string | null;
  equipe_nome: string | null;
  quitacoes: number;
  valor: number;
  /** O vencedor é uma equipe (Equipe campeã). */
  equipe: boolean;
}

export interface CategoriaRanking {
  id: CategoriaId;
  titulo: string;
  premio: number | null;
  premio_texto: string | null;
  vencedor: VencedorCategoria | null;
}

export interface EuNoRanking {
  posicao: number;
  quitacoes: number;
  valor: number;
  equipe_id: string | null;
  premio: number | null;
  premio_texto: string | null;
  acima: { posicao: number; valor: number; quitacoes: number; nome: string | null } | null;
}

export interface RankingQuitacao {
  habilitado: boolean;
  criterio: Criterio;
  disputa: Disputa;
  minimo_quitacoes: number;
  premios: number[];
  premios_texto: string[];
  /** Quantas posições têm prêmio (valor ou brinde). */
  posicoes_premiadas: number;
  participantes: number;
  importado_em: string | null;
  disputas: DisputaRanking[];
  equipes: EquipeDoRanking[];
  categorias: CategoriaRanking[];
  eu: EuNoRanking | null;
}

export const RANKING_DESLIGADO: RankingQuitacao = {
  habilitado: false, criterio: 'valor', disputa: 'setor', minimo_quitacoes: 0,
  premios: [], premios_texto: [], posicoes_premiadas: 0, participantes: 0, importado_em: null,
  disputas: [], equipes: [], categorias: [], eu: null,
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

/** Uma posição, com as chaves da aba (`operador_id`, `foto_url`) ou da TV (`id`, `foto`). */
function lerPosicao(bruto: unknown, premios: number[], textos: string[], antigo: boolean): PosicaoRanking {
  const p = obj(bruto);
  const posicao = Math.trunc(num(p.posicao));
  // O pacote antigo não traz o prêmio da linha: vem da tabela do setor.
  const premio = antigo
    ? (posicao >= 1 && posicao <= premios.length && premios[posicao - 1] > 0 ? premios[posicao - 1] : null)
    : (p.premio == null || num(p.premio) <= 0 ? null : num(p.premio));
  return {
    posicao,
    operador_id: String(p.operador_id ?? p.id ?? ''),
    nome: typeof p.nome === 'string' ? p.nome : '',
    foto_url: texto(p.foto_url ?? p.foto),
    equipe_id: texto(p.equipe_id),
    equipe_nome: texto(p.equipe_nome),
    quitacoes: Math.max(0, Math.trunc(num(p.quitacoes))),
    valor: num(p.valor),
    premio,
    premio_texto: antigo ? texto(textos[posicao - 1]) : texto(p.premio_texto),
    abaixo_minimo: p.abaixo_minimo === true,
  };
}

/**
 * Até que posição há prêmio de verdade (valor > 0 ou brinde). Posições vazias
 * no fim não contam: prêmios [0, 0, 0] = sem prêmio, e o ranking aparece sem
 * selo, sem «R$ 0» e sem a linha da zona de prêmio.
 */
export function posicoesComPremio(premios: number[], textos: string[]): number {
  for (let i = Math.max(premios.length, textos.length) - 1; i >= 0; i--) {
    if ((premios[i] ?? 0) > 0 || (textos[i] ?? '').trim()) return i + 1;
  }
  return 0;
}

/** O pacote do banco (aba ou TV, novo ou antigo) → o ranking completo. */
export function normalizarRanking(bruto: unknown): RankingQuitacao {
  const r = obj(bruto);
  if (r.habilitado !== true) return RANKING_DESLIGADO;
  const premios = (Array.isArray(r.premios) ? r.premios : []).map(num);
  const premiosTexto = (Array.isArray(r.premios_texto) ? r.premios_texto : []).map(x => (typeof x === 'string' ? x : ''));
  const antigo = !Array.isArray(r.disputas);
  const premiadas = posicoesComPremio(premios, premiosTexto);
  // Sem prêmio na posição, não há «abaixo do mínimo» para mostrar.
  const ordenar = (ps: PosicaoRanking[]) =>
    ps.filter(p => p.posicao >= 1 && p.posicao <= POSICOES_NA_TELA && p.operador_id)
      .map(p => (p.abaixo_minimo && p.posicao > premiadas ? { ...p, abaixo_minimo: false } : p))
      .sort((a, b) => a.posicao - b.posicao);

  const disputas: DisputaRanking[] = antigo
    ? [{
        equipe_id: null, nome: null,
        participantes: Math.trunc(num(r.participantes)),
        quitacoes_total: 0, valor_total: 0,
        posicoes: ordenar((Array.isArray(r.posicoes) ? r.posicoes : []).map(p => lerPosicao(p, premios, premiosTexto, true))),
      }]
    : (r.disputas as unknown[]).map(d => {
        const x = obj(d);
        return {
          equipe_id: texto(x.equipe_id),
          nome: texto(x.nome),
          participantes: Math.trunc(num(x.participantes)),
          quitacoes_total: Math.trunc(num(x.quitacoes_total)),
          valor_total: num(x.valor_total),
          posicoes: ordenar((Array.isArray(x.posicoes) ? x.posicoes : []).map(p => lerPosicao(p, premios, premiosTexto, false))),
        };
      });

  const eu = r.eu ? obj(r.eu) : null;
  return {
    habilitado: true,
    criterio: r.criterio === 'quantidade' ? 'quantidade' : 'valor',
    disputa: r.disputa === 'equipe' ? 'equipe' : 'setor',
    minimo_quitacoes: Math.max(0, Math.trunc(num(r.minimo_quitacoes))),
    premios,
    premios_texto: premiosTexto,
    posicoes_premiadas: premiadas,
    participantes: Math.trunc(num(r.participantes)),
    importado_em: typeof r.importado_em === 'string' ? r.importado_em : null,
    disputas,
    equipes: (Array.isArray(r.equipes) ? r.equipes : []).map(e => {
      const x = obj(e);
      return { id: String(x.id ?? ''), nome: String(x.nome ?? ''), quitacoes: Math.trunc(num(x.quitacoes)), valor: num(x.valor), pessoas: Math.trunc(num(x.pessoas)) };
    }).filter(e => e.id),
    categorias: (Array.isArray(r.categorias) ? r.categorias : []).map(c => {
      const x = obj(c);
      const v = x.vencedor ? obj(x.vencedor) : null;
      return {
        id: x.id as CategoriaId,
        titulo: titulosDasCategorias[x.id as CategoriaId] ?? String(x.id ?? ''),
        premio: x.premio == null || num(x.premio) <= 0 ? null : num(x.premio),
        premio_texto: texto(x.premio_texto),
        vencedor: v && (v.id || v.nome) ? {
          id: String(v.id ?? ''), nome: String(v.nome ?? ''), foto_url: texto(v.foto_url ?? v.foto),
          equipe_nome: texto(v.equipe_nome), quitacoes: Math.trunc(num(v.quitacoes)), valor: num(v.valor),
          equipe: v.equipe === true,
        } : null,
      };
    }).filter(c => ehCategoria(c.id)),
    eu: eu ? {
      posicao: Math.trunc(num(eu.posicao)),
      quitacoes: Math.trunc(num(eu.quitacoes)),
      valor: num(eu.valor),
      equipe_id: texto(eu.equipe_id),
      premio: eu.premio == null || num(eu.premio) <= 0 ? null : num(eu.premio),
      premio_texto: texto(eu.premio_texto),
      acima: eu.acima_posicao != null && eu.acima_valor != null
        ? { posicao: Math.trunc(num(eu.acima_posicao)), valor: num(eu.acima_valor), quitacoes: Math.trunc(num(eu.acima_quitacoes)), nome: texto(eu.acima_nome) }
        : null,
    } : null,
  };
}

/**
 * Qual disputa mostrar. Na disputa do setor, a única. Por equipe: a pedida;
 * senão a de quem está olhando; senão a primeira com gente.
 */
export function escolherDisputa(r: RankingQuitacao, equipeId: string | null | undefined): DisputaRanking | null {
  if (!r.disputas.length) return null;
  if (r.disputa === 'setor') return r.disputas[0];
  return r.disputas.find(d => d.equipe_id === equipeId)
    ?? (r.eu ? r.disputas.find(d => d.equipe_id === r.eu?.equipe_id) : undefined)
    ?? r.disputas[0];
}

/** Há prêmio na posição (valor ou brinde)? */
export const temPremio = (p: Pick<PosicaoRanking, 'premio' | 'premio_texto'>) => p.premio != null || !!p.premio_texto;

/**
 * Quanto falta para passar quem está logo acima. Por valor, passar é ficar 1
 * centavo acima (empatar não basta: o desempate é a quantidade). Por
 * quantidade, as quitações que faltam para empatar — com mais uma quitação o
 * valor sobe junto e desempata —, nunca menos de 1.
 */
export function faltaParaPassar(
  criterio: Criterio,
  acima: { valor: number; quitacoes: number },
  eu: { valor: number; quitacoes: number },
): number {
  if (criterio === 'quantidade') return Math.max(1, acima.quitacoes - eu.quitacoes);
  return Math.max(0.01, Math.round((acima.valor - eu.valor) * 100) / 100 + 0.01);
}

export const quitacoesTexto = (n: number) => `${n} ${n === 1 ? 'quitação' : 'quitações'}`;

/** Prêmio redondo sem centavos: «R$ 350» lê mais rápido que «R$ 350,00». */
export function reaisRedondos(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
  });
}

/** «R$ 350 + Troféu», «Troféu», «R$ 350». Vazio sem prêmio. */
export function premioTexto(p: { premio: number | null; premio_texto: string | null }): string {
  return [p.premio != null ? reaisRedondos(p.premio) : '', p.premio_texto ?? ''].filter(Boolean).join(' + ');
}

/** O valor que ordena, como texto: «R$ 1.234,56» ou «12 quitações». */
export function falaDoCriterio(criterio: Criterio, falta: number, formatarReais: (v: number) => string): string {
  return criterio === 'quantidade' ? quitacoesTexto(falta) : formatarReais(falta);
}

// ── Subiu / desceu desde a última importação vista ─────────────────────────

export interface Retrato { importado_em: string; posicoes: Record<string, number> }
export interface Lembranca { atual: Retrato | null; anterior: Retrato | null }

/**
 * Quem subiu ou desceu desde a importação anterior que ESTA pessoa viu. A
 * lembrança troca só quando chega relatório novo: recarregar a página não
 * apaga as setas.
 */
export function atualizarLembranca(l: Lembranca, importadoEm: string | null, posicoes: PosicaoRanking[]): Lembranca {
  if (!importadoEm) return l;
  const agora: Retrato = { importado_em: importadoEm, posicoes: Object.fromEntries(posicoes.map(p => [p.operador_id, p.posicao])) };
  if (!l.atual) return { atual: agora, anterior: null };
  if (l.atual.importado_em === importadoEm) return { atual: agora, anterior: l.anterior };
  return { atual: agora, anterior: l.atual };
}

/** +2 subiu dois, −1 desceu um, `'novo'` entrou no top, nulo sem comparação. */
export function variacao(l: Lembranca, p: PosicaoRanking): number | 'novo' | null {
  if (!l.anterior) return null;
  const antes = l.anterior.posicoes[p.operador_id];
  if (antes == null) return 'novo';
  return antes - p.posicao;
}
