/**
 * useDiretoExtraNoRecorte — onde moram as equipes e as pessoas que têm a
 * lógica Direto e Extra ligada à parte, para o Dashboard decidir pelo RECORTE
 * na tela e não pelo perfil de quem olha (16/11/2026). Ver
 * `diretoExtraNoRecorte`.
 *
 * Lê só as linhas das configs LIGADAS de equipe e de pessoa (hoje um punhado),
 * e só quando essa lista muda. Linha que a RLS não entrega ou que foi apagada
 * simplesmente não conta.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { diretoExtraNoRecorte, type DiretoExtraConfig } from '@/services/direto_extra.service';

type Pessoa = { setorId: string | null; equipeId: string | null };

export function useDiretoExtraNoRecorte(configs: readonly DiretoExtraConfig[]) {
  const idsEquipes = useMemo(() => configs.filter(c => c.ativo && c.escopo === 'equipe').map(c => c.referencia_id).sort().join(','), [configs]);
  const idsPessoas = useMemo(() => configs.filter(c => c.ativo && c.escopo === 'usuario').map(c => c.referencia_id).sort().join(','), [configs]);
  const [equipes, setEquipes] = useState<Map<string, string | null>>(new Map());
  const [pessoas, setPessoas] = useState<Map<string, Pessoa>>(new Map());

  useEffect(() => {
    let cancelado = false;
    if (!idsEquipes) { setEquipes(new Map()); return; }
    void supabase.from('equipes').select('id, setor_id').in('id', idsEquipes.split(','))
      .then(({ data }) => {
        if (cancelado) return;
        setEquipes(new Map(((data ?? []) as { id: string; setor_id: string | null }[]).map(e => [e.id, e.setor_id])));
      });
    return () => { cancelado = true; };
  }, [idsEquipes]);

  useEffect(() => {
    let cancelado = false;
    if (!idsPessoas) { setPessoas(new Map()); return; }
    void supabase.from('perfis').select('id, setor_id, equipe_id').in('id', idsPessoas.split(','))
      .then(({ data }) => {
        if (cancelado) return;
        setPessoas(new Map(((data ?? []) as { id: string; setor_id: string | null; equipe_id: string | null }[])
          .map(p => [p.id, { setorId: p.setor_id, equipeId: p.equipe_id }])));
      });
    return () => { cancelado = true; };
  }, [idsPessoas]);

  /** `equipeSetor`: o setor da equipe em foco, quando a tela já sabe. */
  return useCallback((setorId: string | null, equipeId: string | null, equipeSetor?: string | null) => {
    const mapa = equipeId && equipeSetor !== undefined && !equipes.has(equipeId)
      ? new Map(equipes).set(equipeId, equipeSetor)
      : equipes;
    return diretoExtraNoRecorte({ configs, setorId, equipeId, equipes: mapa, pessoas });
  }, [configs, equipes, pessoas]);
}
