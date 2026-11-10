/**
 * liberacao.ts — a troca da senha inicial já foi liberada?
 *
 * Auditoria de segurança de 10/11/2026: 236 contas ativas ainda entravam com a
 * senha inicial, igual para todo mundo. A migration 20261110120000 marca essas
 * contas (`perfis.senha_inicial_pendente`), mas NÃO as trava: quem decide a
 * hora é o super admin, pelo card de Configurações › Geral
 * (`fn_senha_inicial_liberar`). Liberado, quem está marcado encontra o card
 * «Uma senha só sua» por cima de tudo e só usa o sistema depois de criar a
 * senha nova. Dá para recolher.
 *
 * É uma campanha com fim: zerou a lista de pendentes, este arquivo, o card e a
 * coluna podem sair. Conta nova e senha resetada NÃO passam por aqui — elas
 * usam a trava de sempre (`perfis.senha_troca_obrigatoria`).
 *
 * Mesmo molde de `Natal/liberacao.ts`: uma linha em `senha_inicial_liberacao`,
 * um sinal no tópico `permissoes` de cada empresa, e a resposta guardada no
 * navegador para não ler a tabela a cada página. Tabela ausente (migration
 * pendente) = não liberado.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { assinarSinal } from '@/lib/sinais';

let liberadoEm: string | null = null;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function avisar() { for (const o of ouvintes) o(); }

/** Cliente sem tipo: a tabela ainda não está em `database.types.ts`. */
interface Consulta extends PromiseLike<{ data: { liberado_em: string } | null; error: { message: string } | null }> {
  select(colunas: string): Consulta;
  limit(n: number): Consulta;
  maybeSingle(): Consulta;
}
const tabela = () => (supabase.from as unknown as (t: string) => Consulta)('senha_inicial_liberacao');

const CHAVE_GUARDADA = 'senha-inicial:liberacao';
const VALIDADE_LIBERADO_MS = 30 * 60_000;
const VALIDADE_NAO_LIBERADO_MS = 5 * 60_000;

function lerGuardada(): { liberadoEm: string | null; em: number } | null {
  try {
    const bruto = localStorage.getItem(CHAVE_GUARDADA);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as { liberadoEm?: unknown; em?: unknown };
    return { liberadoEm: typeof v.liberadoEm === 'string' ? v.liberadoEm : null, em: Number(v.em) || 0 };
  } catch { return null; }
}

function guardar(valor: string | null): void {
  try { localStorage.setItem(CHAVE_GUARDADA, JSON.stringify({ liberadoEm: valor, em: Date.now() })); } catch { /* sem armazenamento */ }
}

/** A guardada ainda vale? Exportada para os testes. */
export function guardadaVale(g: { liberadoEm: string | null; em: number } | null, agora = Date.now()): boolean {
  if (!g) return false;
  return agora - g.em < (g.liberadoEm ? VALIDADE_LIBERADO_MS : VALIDADE_NAO_LIBERADO_MS);
}

function trocar(novo: string | null) {
  if (novo !== liberadoEm) { liberadoEm = novo; avisar(); }
}

async function ler(forcar: boolean): Promise<void> {
  const guardada = forcar ? null : lerGuardada();
  if (guardada && guardadaVale(guardada)) { trocar(guardada.liberadoEm); return; }
  const { data, error } = await tabela().select('liberado_em').limit(1).maybeSingle();
  if (error) return;
  const novo = data?.liberado_em ?? null;
  guardar(novo);
  trocar(novo);
}

function carregar(forcar = false): Promise<void> {
  if (!carregando || forcar) carregando = ler(forcar).catch((): void => undefined);
  return carregando;
}

/**
 * `true` quando a troca da senha inicial foi liberada. `ativo = false` não lê
 * nada: só quem está marcado (e o card de Configurações) precisa da resposta.
 */
export function useSenhaInicialLiberada(empresaId: string | null | undefined, ativo = true): boolean {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => liberadoEm,
  );

  useEffect(() => { if (ativo) void carregar(); }, [ativo]);

  useEffect(() => {
    if (!empresaId || !ativo) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'senha_inicial_liberacao') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    });
  }, [empresaId, ativo]);

  return ativo && valor !== null;
}

/** O botão do card. Só o super_admin passa no banco. `liberar = false` recolhe. */
export async function liberarSenhaInicial(liberar: boolean): Promise<{ erro: string | null }> {
  const { data, error } = await rpcSemTipo<string | null>('fn_senha_inicial_liberar', { p_liberar: liberar });
  if (error) return { erro: error.message };
  const novo = liberar ? (typeof data === 'string' ? data : new Date().toISOString()) : null;
  guardar(novo);
  trocar(novo);
  return { erro: null };
}

export interface PainelSenhaInicial {
  liberado_em: string | null;
  liberado_por_nome: string | null;
  /** Ativos que ainda não criaram a senha. */
  pendentes: number;
  /** Quem já criou desde a marcação. */
  trocaram: number;
  /** Onde estão os pendentes, do setor com mais gente para o com menos. */
  por_setor: { setor: string; pendentes: number }[];
}

/** O andamento da campanha. Só o super_admin (o banco confere). */
export async function lerPainelSenhaInicial(): Promise<PainelSenhaInicial> {
  const { data, error } = await rpcSemTipo<PainelSenhaInicial>('fn_senha_inicial_painel', {});
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<PainelSenhaInicial>;
  return {
    liberado_em: d.liberado_em ?? null,
    liberado_por_nome: d.liberado_por_nome ?? null,
    pendentes: Number(d.pendentes) || 0,
    trocaram: Number(d.trocaram) || 0,
    por_setor: Array.isArray(d.por_setor) ? d.por_setor : [],
  };
}

export type Portao = 'inicial' | 'pedido' | null;

/**
 * Qual portão de senha a pessoa encontra.
 *
 *   'pedido'   a trava de sempre: senha resetada ou conta nova
 *              (`senha_troca_obrigatoria`). Vence a campanha.
 *   'inicial'  a campanha: marcada com a senha inicial E já liberada.
 *   null       entra normalmente.
 */
export function qualPortao(
  perfil: { senha_troca_obrigatoria?: boolean | null; senha_inicial_pendente?: boolean | null } | null | undefined,
  liberada: boolean,
): Portao {
  if (!perfil) return null;
  if (perfil.senha_troca_obrigatoria === true) return 'pedido';
  if (perfil.senha_inicial_pendente === true && liberada) return 'inicial';
  return null;
}
