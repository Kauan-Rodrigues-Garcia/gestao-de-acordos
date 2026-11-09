/**
 * liberacao.ts — o Natal já foi liberado para todos?
 *
 * Uma linha em `natal_liberacao` (migration 20261109150000). O tema sobe
 * desligado; o super_admin libera pelo card de Configurações › Geral
 * (`fn_natal_liberar`) e pode recolher. Liberar ou recolher manda um sinal no
 * tópico `permissoes` de cada empresa, e quem está logado relê aqui.
 *
 * Um estado só para o app inteiro: o `Layout` e o card perguntam a mesma
 * coisa, e a resposta não pode divergir entre os dois. Mesmo molde do
 * Halloween (`arquivo-morto/halloween/.../liberacao.ts`).
 *
 * Tabela ausente (migration pendente) = não liberado: o tema fica no
 * super_admin e no `npm run dev`, como na prévia.
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
const tabela = () => (supabase.from as unknown as (t: string) => Consulta)('natal_liberacao');

/**
 * A resposta guardada no navegador, para não ler a tabela a cada página
 * (o Halloween a lia 5 mil vezes em 26 h antes disso). Diferente do
 * Halloween, liberado não é para sempre — dá para recolher —, então as duas
 * respostas vencem; enquanto a página está aberta, quem avisa é o sinal.
 */
const CHAVE_GUARDADA = 'natal:liberacao';
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

/** `true` quando o Natal foi liberado para todos. Escuta o sinal da empresa em que a pessoa está. */
export function useNatalLiberado(empresaId: string | null | undefined): boolean {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => liberadoEm,
  );

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    if (!empresaId) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'natal_liberacao') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    });
  }, [empresaId]);

  return valor !== null;
}

/** O botão do card. Só o super_admin passa no banco. `liberar = false` recolhe. */
export async function liberarNatal(liberar: boolean): Promise<{ erro: string | null }> {
  const { data, error } = await rpcSemTipo<string | null>('fn_natal_liberar', { p_liberar: liberar });
  if (error) return { erro: error.message };
  const novo = liberar ? (typeof data === 'string' ? data : new Date().toISOString()) : null;
  guardar(novo);
  trocar(novo);
  return { erro: null };
}
