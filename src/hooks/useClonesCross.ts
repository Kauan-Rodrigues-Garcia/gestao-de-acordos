/**
 * useClonesCross — os operadores que aparecem em DOIS setores.
 *
 * Um operador clonado numa equipe de OUTRO setor precisa aparecer também na
 * lista do setor destino, com a tag «clone de <setor de origem>». A resolução
 * disso — ler `equipe_operadores_clones`, descobrir o setor de cada equipe e
 * descartar o que não é cross-setor — estava escrita DUAS vezes, uma em
 * `AdminUsuarios` e outra em `AdminSetoresAba`, palavra por palavra.
 *
 * Duas cópias da mesma regra é uma regra que vai divergir. Agora é uma só.
 *
 * Só BookPlay tem clone: nos outros tenants o hook devolve lista vazia sem
 * tocar no banco.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/lib/tenant-config';

export interface CloneCross {
  operadorId: string;
  /** Setor da equipe em que a pessoa foi clonada — nunca o setor dela. */
  destinoSetorId: string;
}

export function useClonesCross(empresaId: string | null | undefined): CloneCross[] {
  const tenant = useTenant();
  const [clones, setClones] = useState<CloneCross[]>([]);

  useEffect(() => {
    if (!empresaId || tenant.slug !== 'bookplay') { setClones([]); return; }
    let cancel = false;
    void (async () => {
      const [clonesRes, equipesRes] = await Promise.all([
        supabase.from('equipe_operadores_clones')
          .select('operador_id, equipe_id').eq('empresa_id', empresaId),
        supabase.from('equipes')
          .select('id, setor_id').eq('empresa_id', empresaId),
      ]);
      if (cancel) return;

      const setorDaEquipe = new Map<string, string | null>();
      for (const e of (equipesRes.data as { id: string; setor_id: string | null }[]) ?? []) {
        setorDaEquipe.set(e.id, e.setor_id ?? null);
      }

      const out: CloneCross[] = [];
      const vistos = new Set<string>();
      for (const c of (clonesRes.data as { operador_id: string; equipe_id: string }[]) ?? []) {
        const destino = setorDaEquipe.get(c.equipe_id);
        if (!destino) continue;
        // A mesma pessoa pode ter duas equipes no mesmo setor destino; a lista
        // é por SETOR, então a segunda não acrescenta nada.
        const chave = `${c.operador_id}::${destino}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        out.push({ operadorId: c.operador_id, destinoSetorId: destino });
      }
      setClones(out);
    })();
    return () => { cancel = true; };
  }, [empresaId, tenant.slug]);

  return clones;
}
