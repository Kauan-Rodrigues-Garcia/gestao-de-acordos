/**
 * useCargos — o cadastro de cargos, lido de `public.cargos`.
 *
 * Começa com o espelho estático de `lib/cargos.ts` e troca pelo do banco quando
 * ele chega. Se a leitura falhar, ou a tabela ainda não existir num ambiente,
 * fica o espelho: o cadastro é o mesmo nos dois lugares (o teste de paridade
 * garante), e uma tela sem rótulo de cargo seria pior que uma tela com o
 * rótulo da última versão do código.
 *
 * Fase 2 da reorganização: ninguém chama ainda. A fase 3 troca as listas de
 * `lib/index.ts` pelo `derivados` daqui.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { lerComCache } from '@/lib/cacheCurto';
import { CARGOS, derivar, type Cargo } from '@/lib/cargos';

const CHAVE_CACHE = 'cargos:cadastro';
/** O cadastro muda por decisão de super_admin, não ao longo do dia. */
const VALIDADE_MS = 10 * 60 * 1000;

async function buscarCargos(): Promise<Cargo[] | null> {
  const { data, error } = await supabase
    .from('cargos')
    .select('slug, nome, nivel, ordem, pertence_a_setor, exige_tipo_setor, acesso_total, conta_no_recebimento, lidera_equipe, ativo')
    .order('ordem');
  if (error || !data?.length) return null;
  return data as Cargo[];
}

export function useCargos() {
  const [cargos, setCargos] = useState<readonly Cargo[]>(CARGOS);

  useEffect(() => {
    let vivo = true;
    lerComCache(CHAVE_CACHE, VALIDADE_MS, buscarCargos, { guardarSe: v => v !== null })
      .then(lidos => { if (vivo && lidos) setCargos(lidos); })
      .catch(() => { /* fica o espelho estático */ });
    return () => { vivo = false; };
  }, []);

  const derivados = useMemo(() => derivar(cargos), [cargos]);
  return { cargos, derivados };
}
