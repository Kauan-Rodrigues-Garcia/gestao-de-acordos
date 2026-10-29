/**
 * modoLeveZerado.ts — o super admin desliga o modo leve de todos os
 * computadores de uma vez (29/10/2026, migration 20261029200000).
 *
 * O modo leve é por computador (`modoLeve.ts`, no `localStorage`). Não dá para
 * apagar o `localStorage` dos outros; o que dá é cada tela perguntar ao banco
 * «quando o administrador zerou?» e, se o modo leve DESTE computador foi ligado
 * antes disso, desligar. Quem ligar de novo depois fica com o modo ligado.
 *
 * Quando foi ligado: `modoLeveLigadoEm`. Ligado antes de 29/10 não tem a hora,
 * e conta como «antes» — é justamente o caso que o botão veio resolver.
 *
 * O aviso chega pelo sinal `permissoes` (o caminho do jumpscare): quem está com
 * o app aberto é desligado na hora.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { assinarSinal } from '@/lib/sinais';
import { definirModoLeve, modoLeveLigado, modoLeveLigadoEm } from '@/lib/modoLeve';

type Rpc = (n: string, a?: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { message: string } | null;
}>;
const rpc: Rpc = (n, a) => (supabase.rpc as unknown as Rpc)(n, a);

export interface ModoLeveZerado { zeradoEm: string | null; zeradoPorNome: string | null }

function ler(data: unknown): ModoLeveZerado {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    zeradoEm: typeof d.zerado_em === 'string' ? d.zerado_em : null,
    zeradoPorNome: typeof d.zerado_por_nome === 'string' ? d.zerado_por_nome : null,
  };
}

/** Desliga o modo leve deste computador se ele foi ligado antes de `zeradoEm`. Puro o bastante para testar. */
export function deveDesligar(zeradoEm: string | null, ligado: boolean, ligadoEm: number | null): boolean {
  if (!zeradoEm || !ligado) return false;
  const zerado = new Date(zeradoEm).getTime();
  if (!Number.isFinite(zerado)) return false;
  return ligadoEm === null || ligadoEm < zerado;
}

async function conferir(): Promise<void> {
  const { data, error } = await rpc('fn_modo_leve_ler');
  if (error) return; // sem a migration: nada a fazer
  const { zeradoEm } = ler(data);
  if (!deveDesligar(zeradoEm, modoLeveLigado(), modoLeveLigadoEm())) return;
  definirModoLeve(false);
  toast.info('O modo leve foi desligado', {
    description: 'O administrador desligou o modo leve de todos. Se o computador ficar lento, ligue de novo no menu de tema.',
    duration: 12_000,
  });
}

/** Montado no `Layout`: confere ao abrir e quando o administrador zera. */
export function useModoLeveZeradoPeloAdmin(empresaId: string | null | undefined): void {
  useEffect(() => { void conferir(); }, []);
  useEffect(() => {
    if (!empresaId) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'modo_leve') void conferir(); },
      onReconectado: () => { void conferir(); },
    });
  }, [empresaId]);
}

// ── O cartão de Configurações (só o super_admin passa no banco) ──────────────

export async function lerModoLeveZerado(): Promise<{ valor: ModoLeveZerado | null; erro: string | null }> {
  const { data, error } = await rpc('fn_modo_leve_ler');
  if (error) return { valor: null, erro: error.message };
  return { valor: ler(data), erro: null };
}

export async function zerarModoLeveDeTodos(): Promise<{ valor: ModoLeveZerado | null; erro: string | null }> {
  const { data, error } = await rpc('fn_modo_leve_zerar');
  if (error) return { valor: null, erro: error.message };
  return { valor: ler(data), erro: null };
}
