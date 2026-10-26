/**
 * useSetoresDaEmpresa — os setores que podem ter permissões próprias, e o
 * rótulo «Operador - Manutenção» de quem está num setor com mapa próprio
 * (`cargos_permissoes_setor`, migration 20261026120000).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import type { CargoSetorPermissaoRow } from '@/hooks/useCargoPermissoes';

export interface SetorResumo {
  id: string;
  nome: string;
}

export function useSetoresDaEmpresa(empresaId: string | null | undefined) {
  const [setores, setSetores] = useState<SetorResumo[]>([]);

  useEffect(() => {
    let cancelado = false;
    if (!empresaId) { setSetores([]); return; }

    void supabase
      .from('setores')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) console.warn('[useSetoresDaEmpresa]', error.message);
        setSetores(error ? [] : ((data as SetorResumo[]) ?? []));
      });

    return () => { cancelado = true; };
  }, [empresaId]);

  return setores;
}

/** «Operador - Manutenção»: o nome do cargo com o do setor. */
export function rotuloNoSetor(cargo: string, setorNome: string): string {
  return `${PERFIL_LABELS[cargo] ?? cargo} - ${setorNome}`;
}

/**
 * O rótulo do cargo de uma pessoa: com o setor quando ele tem mapa próprio para
 * o cargo dela, e só o cargo quando não tem.
 */
export function rotuloDaPessoa(
  cargo: string,
  setorId: string | null,
  mapasDeSetor: readonly CargoSetorPermissaoRow[],
  setores: readonly SetorResumo[],
): string {
  const temMapa = !!setorId && mapasDeSetor.some(m => m.cargo === cargo && m.setor_id === setorId);
  const nome = temMapa ? setores.find(s => s.id === setorId)?.nome : undefined;
  return nome ? rotuloNoSetor(cargo, nome) : (PERFIL_LABELS[cargo] ?? cargo);
}
