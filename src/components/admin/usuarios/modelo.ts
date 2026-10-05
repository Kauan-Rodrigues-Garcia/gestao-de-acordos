/**
 * modelo.ts — as contas da aba Usuários 2.0, sem React e sem banco.
 *
 * ## Marca não é regra
 *
 * BookPlay e PaguePlay estão na mesma lista (Cleber, 03-04/10/2026). A MARCA
 * de cada pessoa é a cidade do setor dela (`lib/marca.ts`): Birigui é BookPlay,
 * Marília é PaguePlay. Ela só pinta a etiqueta e a cor. O que muda o que a
 * pessoa faz ou vê é a REGRA DE NEGÓCIO do setor (`setores.regra`: Nosso
 * produto ou Cofen) e as permissões do cargo — nunca a marca, nem a empresa
 * pela qual se entrou. Ver CLAUDE.md, «Cofen não é PaguePlay».
 */
import { marcaDaCidade } from '@/lib/marca';
import { ehEscopoEmpresa } from '@/lib/index';
import type { Perfil, SituacaoUsuario } from '@/lib/supabase';

export type MarcaDaPessoa = 'bp' | 'pp';
export type RegraDoSetorLista = 'nosso_produto' | 'cofen';

export interface InfoDeSetor {
  marca: MarcaDaPessoa | null;
  regra: RegraDoSetorLista | null;
}

/** setor_id → marca (pela cidade) e regra. */
export function infoDosSetores(
  setores: readonly { id: string; cidade_id?: string | null; regra?: string | null }[],
  cidades: readonly { id: string; nome: string }[],
): Map<string, InfoDeSetor> {
  const nomeDaCidade = new Map(cidades.map(c => [c.id, c.nome]));
  const m = new Map<string, InfoDeSetor>();
  for (const s of setores) {
    const marca = marcaDaCidade(s.cidade_id ? nomeDaCidade.get(s.cidade_id) : null);
    m.set(s.id, {
      marca: marca ? (marca.nome === 'PaguePlay' ? 'pp' : 'bp') : null,
      regra: s.regra === 'cofen' ? 'cofen' : s.regra === 'nosso_produto' ? 'nosso_produto' : null,
    });
  }
  return m;
}

// ── O que precisa de alguém ──────────────────────────────────────────────────

export type ChavePendencia = 'sem_setor' | 'sem_equipe' | 'sem_meta' | 'senha';

export interface Pendencia {
  chave: ChavePendencia;
  titulo: string;
  porque: string;
  tom: 'ruim' | 'alerta' | 'info';
}

export const PENDENCIAS: readonly Pendencia[] = [
  { chave: 'sem_setor', titulo: 'sem setor', porque: 'some do Analítico e do Painel Líder', tom: 'ruim' },
  { chave: 'sem_equipe', titulo: 'sem equipe', porque: 'fora do card de equipe do Painel Líder', tom: 'alerta' },
  { chave: 'sem_meta', titulo: 'sem meta no mês', porque: 'ficam fora dos quartis', tom: 'alerta' },
  { chave: 'senha', titulo: 'com senha provisória', porque: 'ainda não trocaram a senha', tom: 'info' },
];

/** Cargos que recebem: os que têm meta individual e entram em equipe. */
const CARGOS_DA_OPERACAO = new Set(['operador', 'elite']);

export interface ContextoPendencia {
  /** As equipes de uma pessoa (membro ou líder), pela regra do sistema. */
  temEquipe: (u: Perfil) => boolean;
  /** Quem tem meta individual no mês corrente. */
  comMeta: ReadonlySet<string>;
}

const ehRobo = (u: Perfil) => (u as { robo?: boolean | null }).robo === true;

export function temPendencia(u: Perfil, chave: ChavePendencia, ctx: ContextoPendencia): boolean {
  const situacao = u.situacao ?? 'ativo';
  if (ehRobo(u)) return false;
  switch (chave) {
    case 'sem_setor': return !u.setor_id && !ehEscopoEmpresa(u.perfil);
    case 'sem_equipe': return !!u.setor_id && CARGOS_DA_OPERACAO.has(u.perfil) && situacao !== 'desligado' && !ctx.temEquipe(u);
    case 'sem_meta': return !!u.setor_id && CARGOS_DA_OPERACAO.has(u.perfil) && situacao === 'ativo' && !ctx.comMeta.has(u.id);
    case 'senha': return (u as { senha_alterada?: boolean | null }).senha_alterada === false && situacao !== 'desligado';
  }
}

// ── Os filtros ───────────────────────────────────────────────────────────────

export type FiltroSituacao = 'online' | SituacaoUsuario;

export interface Filtros {
  marca: MarcaDaPessoa | null;
  cargo: string | null;
  situacao: FiltroSituacao | null;
  pendencia: ChavePendencia | null;
}

export const FILTROS_VAZIOS: Filtros = { marca: null, cargo: null, situacao: null, pendencia: null };

export function passaNosFiltros(
  u: Perfil, f: Filtros,
  ctx: ContextoPendencia & { marcaDe: (u: Perfil) => MarcaDaPessoa | null; online: (id: string) => boolean },
): boolean {
  if (f.marca && ctx.marcaDe(u) !== f.marca) return false;
  if (f.cargo && u.perfil !== f.cargo) return false;
  if (f.situacao === 'online' && !ctx.online(u.id)) return false;
  if (f.situacao && f.situacao !== 'online' && (u.situacao ?? 'ativo') !== f.situacao) return false;
  if (f.pendencia && !temPendencia(u, f.pendencia, ctx)) return false;
  return true;
}

// ── Exportar ─────────────────────────────────────────────────────────────────

const campoCsv = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A lista como CSV (separador `;`, que o Excel em português abre direto). */
export function listaEmCsv(linhas: readonly {
  nome: string; login: string; email: string; cargo: string; setor: string; equipe: string; marca: string; situacao: string;
}[]): string {
  const cab = ['Nome', 'Login', 'E-mail', 'Cargo', 'Setor', 'Equipe', 'Marca', 'Situação'];
  const corpo = linhas.map(l => [l.nome, l.login, l.email, l.cargo, l.setor, l.equipe, l.marca, l.situacao].map(campoCsv).join(';'));
  // O BOM na frente faz o Excel ler os acentos como UTF-8.
  const bom = String.fromCharCode(0xFEFF);
  return bom + [cab.join(';'), ...corpo].join('\r\n');
}
