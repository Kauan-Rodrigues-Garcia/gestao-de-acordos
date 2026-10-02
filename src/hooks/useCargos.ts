/**
 * useCargos — o cadastro de cargos, lido de `public.cargos`.
 *
 * Começa com o espelho estático de `lib/cargos.ts` e troca pelo do banco quando
 * ele chega. Se a leitura falhar, ou a tabela ainda não existir num ambiente,
 * fica o espelho: uma tela sem rótulo de cargo seria pior que uma tela com o
 * rótulo da última versão do código.
 *
 * O que vem do banco é aplicado nas listas de `lib/index.ts` e companhia
 * (`aplicarCadastro`), porque desde a tela de Cargos o cadastro muda pelo
 * painel. O `Layout` monta este hook uma vez; as telas que mostram a lista de
 * cargos usam `useCadastroDeCargos` para re-renderizar quando ela muda.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidarCache, lerComCache } from '@/lib/cacheCurto';
import {
  aplicarCadastro, assinarCadastro, cargosAtuais, derivar, versaoDoCadastro,
  type Cargo,
} from '@/lib/cargos';

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

/** Lê o cadastro (do cache curto, se houver) e aplica nas listas. */
export async function carregarCadastroDeCargos(forcar = false): Promise<void> {
  if (forcar) invalidarCache(CHAVE_CACHE);
  const lidos = await lerComCache(CHAVE_CACHE, VALIDADE_MS, buscarCargos, { guardarSe: v => v !== null });
  if (lidos) aplicarCadastro(lidos);
}

/** O cadastro em uso, re-renderizando quando ele muda. */
export function useCadastroDeCargos(): readonly Cargo[] {
  useSyncExternalStore(assinarCadastro, versaoDoCadastro, versaoDoCadastro);
  return cargosAtuais();
}

export function useCargos() {
  const cargos = useCadastroDeCargos();

  useEffect(() => {
    carregarCadastroDeCargos().catch(() => { /* fica o espelho estático */ });
  }, []);

  const recarregar = useCallback(() => carregarCadastroDeCargos(true), []);
  const derivados = useMemo(() => derivar(cargos), [cargos]);
  return { cargos, derivados, recarregar };
}
