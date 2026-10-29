/**
 * modoLeveZerado.ts — a limpeza do modo leve de todos os computadores
 * (29/10/2026, migration 20261029200000).
 *
 * Pedido do Kauan: «apenas aplique para meio que limpar, e depois eles podem
 * voltar normalmente». Sem cartão nem botão: a migration grava, UMA vez, a hora
 * da limpeza (`modo_leve_zerado.zerado_em`).
 *
 * O modo leve é por computador (`modoLeve.ts`, no `localStorage`). Não dá para
 * apagar o `localStorage` dos outros; o que dá é cada tela perguntar ao banco
 * «quando foi a limpeza?» e, se o modo leve DESTE computador foi ligado antes
 * disso, desligar. Quem ligar de novo depois fica com o modo ligado.
 *
 * Quando foi ligado: `modoLeveLigadoEm`. Ligado antes de 29/10 não tem a hora,
 * e conta como «antes» — é justamente o caso que a limpeza veio resolver.
 *
 * O aviso chega pelo sinal `permissoes` (o caminho do jumpscare): quem está com
 * o app aberto na hora da migration é desligado na hora.
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

function zeradoEm(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  return typeof d.zerado_em === 'string' ? d.zerado_em : null;
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
  if (!deveDesligar(zeradoEm(data), modoLeveLigado(), modoLeveLigadoEm())) return;
  definirModoLeve(false);
  toast.info('O modo leve foi desligado', {
    description: 'O modo leve foi desligado em todos os computadores. Se o seu ficar lento, ligue de novo no menu de tema.',
    duration: 12_000,
  });
}

/** Montado no `Layout`: confere ao abrir e quando a limpeza é gravada. */
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
