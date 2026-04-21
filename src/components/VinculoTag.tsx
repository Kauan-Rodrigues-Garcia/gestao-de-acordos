/**
 * VinculoTag.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Tag única e exclusiva para sinalizar vínculo Direto/Extra em um acordo.
 *
 * Regra (2026-04-21 — conforme solicitação final do usuário):
 *   • SEMPRE exibir NO MÁXIMO UMA tag por acordo.
 *   • O vínculo "direto + extra" (pares deduplicados OU lado direto que tem
 *     um extra associado em outro operador) é SEMPRE representado por uma
 *     ÚNICA tag azul chamada "VÍNCULO".
 *   • O lado EXTRA isolado (quando o usuário enxerga só o Extra sem o Direto
 *     do par — típico de operador comum) exibe tag âmbar "EXTRA".
 *   • Nunca combinar as duas nem exibir "DIRETO+EXTRA".
 *
 * Prioridade de renderização (mutuamente exclusiva):
 *   1. Par deduplicado (`_vinculoDuplo`) ........................ tag azul "VÍNCULO"
 *   2. Acordo DIRETO que referencia um Extra (`vinculo_operador_nome` +
 *      `tipo_vinculo === 'direto'`) ............................. tag azul "VÍNCULO"
 *   3. Acordo EXTRA (`tipo_vinculo === 'extra'`) ................. tag âmbar "EXTRA"
 *   4. Nenhuma das anteriores .................................... null
 */
import { Link2 } from 'lucide-react';
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';

type Props = {
  acordo: Acordo | AcordoComVinculo;
  /** Tamanho opcional (default: xs). */
  size?: 'xs' | 'sm';
};

/** Classes comuns de tag, parametrizadas por cor. */
const TAG_BASE =
  'inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded uppercase border whitespace-nowrap';

export function VinculoTag({ acordo, size = 'xs' }: Props) {
  const sizeClasses =
    size === 'sm' ? 'text-[10px]' : 'text-[9px]';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  const a = acordo as AcordoComVinculo;

  // Caso 1 + 2: vínculo Direto/Extra consolidado → tag azul ÚNICA "VÍNCULO"
  const duplo = Boolean(a._vinculoDuplo);
  const diretoComVinculo =
    (a.tipo_vinculo ?? 'direto') === 'direto' && Boolean(a.vinculo_operador_nome);

  if (duplo || diretoComVinculo) {
    const nomeOutro =
      a._vinculoExtraOperadorNome ?? a.vinculo_operador_nome ?? 'outro operador';
    return (
      <span
        className={`${TAG_BASE} ${sizeClasses} bg-sky-500/15 text-sky-700 border-sky-500/30`}
        title={`Vínculo Direto + Extra com ${nomeOutro}`}
      >
        <Link2 className={iconSize} /> Vínculo
      </span>
    );
  }

  // Caso 3: acordo EXTRA isolado (operador comum ou par não-deduplicado)
  if (a.tipo_vinculo === 'extra') {
    const nomeDireto = a.vinculo_operador_nome;
    return (
      <span
        className={`${TAG_BASE} ${sizeClasses} bg-amber-500/15 text-amber-700 border-amber-500/30`}
        title={nomeDireto ? `Extra — Direto com ${nomeDireto}` : 'Acordo Extra'}
      >
        <Link2 className={iconSize} /> Extra
      </span>
    );
  }

  return null;
}

export default VinculoTag;
