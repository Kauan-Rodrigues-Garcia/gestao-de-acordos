/**
 * useClonesCross — os operadores que aparecem em DOIS setores.
 *
 * Um operador clonado numa equipe de OUTRO setor precisa aparecer também na
 * lista do setor destino, com a tag «clone de <setor de origem>». A resolução
 * disso — achar os clones, descobrir o setor de cada equipe e descartar o que
 * não é cross-setor — estava escrita DUAS vezes, uma em `AdminUsuarios` e
 * outra em `AdminSetoresAba`, palavra por palavra. Agora é uma só.
 *
 * ## Desde 04/10/2026
 *
 * - Lê `equipe_membros` (papel `clone`) pela porta única
 *   (`services/equipes/equipeMembros.ts`), e não mais `equipe_operadores_clones`
 *   direto: é a tabela que a fase 7 vai manter. Sem ela no banco, a porta
 *   monta as mesmas linhas das tabelas antigas.
 * - Vale para QUALQUER empresa. Até aqui só a BookPlay tinha clone na tela —
 *   uma diferença por marca, e marca não é regra de negócio (CLAUDE.md, «Cofen
 *   não é PaguePlay»). Clone é de equipe, e equipe existe em todo setor.
 * - Aceita várias empresas: a lista de Usuários da cobrança junta BookPlay e
 *   PaguePlay.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buscarEquipeMembros } from '@/services/equipes/equipeMembros';

export interface CloneCross {
  operadorId: string;
  /** Setor da equipe em que a pessoa foi clonada — nunca o setor dela. */
  destinoSetorId: string;
}

export function useClonesCross(empresas: string | readonly string[] | null | undefined): CloneCross[] {
  const ids = (Array.isArray(empresas) ? empresas : empresas ? [empresas] : []) as readonly string[];
  const chave = [...ids].sort().join(',');
  const [clones, setClones] = useState<CloneCross[]>([]);

  useEffect(() => {
    const lista = chave ? chave.split(',') : [];
    if (!lista.length) { setClones([]); return; }
    let cancel = false;
    void (async () => {
      const [vinculos, equipesRes] = await Promise.all([
        Promise.all(lista.map(empresaId => buscarEquipeMembros({ empresaId, papel: 'clone' }))).then(v => v.flat()),
        supabase.from('equipes').select('id, setor_id').in('empresa_id', lista),
      ]);
      if (cancel) return;

      const setorDaEquipe = new Map<string, string | null>();
      for (const e of (equipesRes.data as { id: string; setor_id: string | null }[]) ?? []) {
        setorDaEquipe.set(e.id, e.setor_id ?? null);
      }

      const out: CloneCross[] = [];
      const vistos = new Set<string>();
      for (const c of vinculos) {
        const destino = setorDaEquipe.get(c.equipe_id);
        if (!destino) continue;
        // A mesma pessoa pode ter duas equipes no mesmo setor destino; a lista
        // é por SETOR, então a segunda não acrescenta nada.
        const k = `${c.pessoa_id}::${destino}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        out.push({ operadorId: c.pessoa_id, destinoSetorId: destino });
      }
      setClones(out);
    })();
    return () => { cancel = true; };
  }, [chave]);

  return clones;
}
