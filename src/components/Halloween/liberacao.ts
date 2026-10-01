/**
 * liberacao.ts — o Halloween já foi liberado para todos?
 *
 * Uma linha em `halloween_liberacao` (migration 20261001140000). O tema sobe
 * desligado; o super_admin libera pelo botão da primeira aba de Configurações
 * (`fn_halloween_liberar`). Liberar manda um sinal no tópico `permissoes` de
 * cada empresa, e quem está logado relê aqui e recebe a mensagem na hora.
 *
 * Um estado só para o app inteiro: o `Layout` e o cartão de Configurações
 * perguntam a mesma coisa, e a resposta não pode divergir entre os dois.
 *
 * Tabela ausente (migration pendente) = não liberado: o tema fica no
 * super_admin, que é o comportamento de antes.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
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
const tabela = () => (supabase.from as unknown as (t: string) => Consulta)('halloween_liberacao');

async function ler(): Promise<void> {
  const { data, error } = await tabela().select('liberado_em').limit(1).maybeSingle();
  const novo = error ? null : (data?.liberado_em ?? null);
  if (novo !== liberadoEm) { liberadoEm = novo; avisar(); }
}

function carregar(forcar = false): Promise<void> {
  if (!carregando || forcar) carregando = ler().catch((): void => undefined);
  return carregando;
}

/**
 * `true` quando o tema foi liberado para todos. Escuta o sinal da empresa em
 * que a pessoa está — o banco avisa todas as empresas ao liberar.
 */
export function useHalloweenLiberado(empresaId: string | null | undefined): boolean {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => liberadoEm,
  );

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    if (!empresaId) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'halloween_liberacao') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    });
  }, [empresaId]);

  return valor !== null;
}

/** O botão de Configurações. Só o super_admin passa no banco. */
export async function liberarHalloween(): Promise<{ erro: string | null }> {
  const cliente = supabase as unknown as {
    rpc: (n: string) => PromiseLike<{ data: string | null; error: { message: string } | null }>;
  };
  const { data, error } = await cliente.rpc('fn_halloween_liberar');
  if (error) return { erro: error.message };
  if (data && data !== liberadoEm) { liberadoEm = data; avisar(); }
  return { erro: null };
}
