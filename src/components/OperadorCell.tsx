/**
 * OperadorCell.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Célula "Operador" com suporte a vínculo Direto+Extra.
 *
 * Regra (2026-04-21):
 *   • Acordo normal (sem vínculo) → nome do operador apenas.
 *   • Acordo DIRETO com vínculo EXTRA em outro operador (ou par deduplicado):
 *     mostra AMBOS os nomes em duas linhas — primeiro o Direto, depois o Extra.
 *     Isso só é visível para líderes/elites/diretoria (dedup ativa).
 */
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';

type Props = {
  acordo: Acordo | AcordoComVinculo;
  /** Map id→nome dos operadores (já carregado na página). */
  operadoresMap: Record<string, string>;
};

export function OperadorCell({ acordo, operadoresMap }: Props) {
  const a = acordo as AcordoComVinculo;

  const nomeDireto = a.operador_id ? (operadoresMap[a.operador_id] || '...') : '—';

  // Quando é par deduplicado, temos o outro operador no metadado.
  const temParDuplo =
    Boolean(a._vinculoDuplo) &&
    Boolean(a._vinculoExtraOperadorId) &&
    a._vinculoExtraOperadorId !== a.operador_id;

  // Fallback: acordo direto que referencia um extra em outro operador
  // (sem ter sido deduplicado — exibição para perfis com visão parcial).
  const temVinculoDireto =
    !temParDuplo &&
    (a.tipo_vinculo ?? 'direto') === 'direto' &&
    Boolean(a.vinculo_operador_id) &&
    Boolean(a.vinculo_operador_nome) &&
    a.vinculo_operador_id !== a.operador_id;

  if (temParDuplo) {
    const nomeExtra =
      (a._vinculoExtraOperadorId && operadoresMap[a._vinculoExtraOperadorId]) ||
      a._vinculoExtraOperadorNome ||
      '...';
    return (
      <div className="flex flex-col leading-tight">
        <span className="text-xs">{nomeDireto}</span>
        <span className="text-[10px] text-muted-foreground/80" title="Operador com vínculo EXTRA">
          + {nomeExtra}
        </span>
      </div>
    );
  }

  if (temVinculoDireto) {
    return (
      <div className="flex flex-col leading-tight">
        <span className="text-xs">{nomeDireto}</span>
        <span className="text-[10px] text-muted-foreground/80" title="Operador com vínculo EXTRA">
          + {a.vinculo_operador_nome}
        </span>
      </div>
    );
  }

  return <span className="text-xs">{nomeDireto}</span>;
}

export default OperadorCell;
