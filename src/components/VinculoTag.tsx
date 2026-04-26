/**
 * VinculoTag.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Tag única e exclusiva para sinalizar vínculo Direto/Extra em um acordo.
 */
import { Link2 } from 'lucide-react';
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';

type Props = {
  acordo: Acordo | AcordoComVinculo;
  size?: 'xs' | 'sm';
};

const TAG_BASE =
  'inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded uppercase border whitespace-nowrap';

export function VinculoTag({ acordo, size = 'xs' }: Props) {
  const sizeClasses = size === 'sm' ? 'text-[10px]' : 'text-[9px]';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-2.5 h-2.5';
  
  const a = acordo as any;
  
  // 1. Lógica de Vínculo (Direto + Extra)
  // Aparece se:
  // - For um par deduplicado (_vinculoDuplo)
  // - OU for um acordo Direto que possui um operador vinculado (vinculo_operador_id)
  const isDireto = (a.tipo_vinculo === 'direto' || !a.tipo_vinculo);
  const temVinculoExtra = Boolean(a.vinculo_operador_id) || Boolean(a._vinculoExtraOperadorId);
  
  if (a._vinculoDuplo || (isDireto && temVinculoExtra)) {
    const nomeOutro = a._vinculoExtraOperadorNome || a.vinculo_operador_nome || 'outro operador';
    return (
      <span
        className={`${TAG_BASE} ${sizeClasses} bg-sky-500/15 text-sky-700 border-sky-500/30`}
        title={`Vínculo Direto + Extra com ${nomeOutro}`}
      >
        <Link2 className={iconSize} /> Vínculo
      </span>
    );
  }

  // 2. Lógica de Extra isolado
  if (a.tipo_vinculo === 'extra') {
    return (
      <span
        className={`${TAG_BASE} ${sizeClasses} bg-amber-500/15 text-amber-700 border-amber-500/30`}
        title="Acordo Extra"
      >
        <Link2 className={iconSize} /> Extra
      </span>
    );
  }

  return null;
}

export default VinculoTag;
