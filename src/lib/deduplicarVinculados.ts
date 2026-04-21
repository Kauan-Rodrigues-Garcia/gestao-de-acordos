/**
 * deduplicarVinculados.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Dedup de acordos com vínculo Direto + Extra.
 *
 * Regra (conforme solicitado pelo usuário em 2026-04-21):
 *   Quando o usuário visualiza acordos de MAIS de um operador (líder, elite,
 *   admin, super_admin, gerência, diretoria), acordos que compartilham o
 *   mesmo par (empresa, campoChave, valorChave) entre dois operadores,
 *   onde um é DIRETO e o outro é EXTRA, devem aparecer apenas UMA vez.
 *
 *   A entrada mantida é o acordo DIRETO (fonte de verdade). Para facilitar
 *   a UI, anexamos metadados:
 *     - `_vinculoDuplo`: true
 *     - `_vinculoExtraOperadorId` / `_vinculoExtraOperadorNome`: identidade
 *       do operador que possui o lado EXTRA do vínculo.
 *     - `_acordoExtraId`: id do acordo EXTRA que foi "absorvido".
 *
 * Para operadores comuns (que só veem seus próprios acordos) a função NÃO
 * deve ser chamada — eles precisam continuar vendo seu Direto OU seu Extra
 * isoladamente.
 */
import type { Acordo } from '@/lib/supabase';

/** Versão estendida de Acordo com metadados do vínculo consolidado. */
export type AcordoComVinculo = Acordo & {
  _vinculoDuplo?: boolean;
  _vinculoExtraOperadorId?: string | null;
  _vinculoExtraOperadorNome?: string | null;
  _acordoExtraId?: string | null;
};

export type PerfilView =
  | 'operador' | 'lider' | 'administrador' | 'super_admin'
  | 'elite' | 'gerencia' | 'diretoria' | string | null | undefined;

/** Perfis que, por padrão, enxergam acordos de outros operadores. */
const PERFIS_VISAO_AMPLA = new Set<string>([
  'lider', 'administrador', 'super_admin',
  'elite', 'gerencia', 'diretoria',
]);

export function temVisaoAmpla(perfil: PerfilView): boolean {
  return !!perfil && PERFIS_VISAO_AMPLA.has(String(perfil).toLowerCase());
}

/**
 * Dedup de acordos com vínculo Direto+Extra.
 *
 * @param acordos  Lista crua da consulta (sem dedup).
 * @param isPP     true se empresa PaguePlay (chave = `instituicao`); false se Bookplay (chave = `nr_cliente`).
 * @returns        Lista deduplicada com metadados `_vinculoDuplo`.
 */
export function deduplicarVinculados(
  acordos: Acordo[],
  isPP: boolean,
): AcordoComVinculo[] {
  if (!acordos?.length) return [];

  const campoChave: 'instituicao' | 'nr_cliente' = isPP ? 'instituicao' : 'nr_cliente';

  // Agrupa por chave composta (empresa_id + valorChave). Ignora acordos sem chave.
  const grupos = new Map<string, Acordo[]>();
  const semChave: Acordo[] = [];

  for (const a of acordos) {
    const valor = (a[campoChave] as string | null | undefined) ?? '';
    if (!valor.trim()) { semChave.push(a); continue; }
    const k = `${a.empresa_id}::${valor.trim()}`;
    const arr = grupos.get(k) ?? [];
    arr.push(a);
    grupos.set(k, arr);
  }

  const saida: AcordoComVinculo[] = [...semChave];

  for (const [, grupo] of grupos) {
    if (grupo.length === 1) {
      saida.push(grupo[0]);
      continue;
    }

    // Se houver um par Direto + Extra (mesmo cliente/NR), consolidar.
    const direto = grupo.find(g => (g.tipo_vinculo ?? 'direto') === 'direto');
    const extra  = grupo.find(g => g.tipo_vinculo === 'extra');

    if (direto && extra && direto.operador_id !== extra.operador_id) {
      saida.push({
        ...direto,
        _vinculoDuplo:             true,
        _vinculoExtraOperadorId:   extra.operador_id,
        _vinculoExtraOperadorNome: extra.vinculo_operador_nome
          ?? (extra as Acordo & { perfis?: { nome?: string } }).perfis?.nome
          ?? null,
        _acordoExtraId:            extra.id,
      });

      // Se houver mais de 2 itens no grupo (caso raro: parcelas), anexa os demais.
      for (const outro of grupo) {
        if (outro.id !== direto.id && outro.id !== extra.id) saida.push(outro);
      }
    } else {
      // Sem par completo → manter todos (por exemplo, 2 "direto" por lapso de dados).
      for (const g of grupo) saida.push(g);
    }
  }

  return saida;
}
