/**
 * O desafio do dia na barra superior: a pílula de cada desafio de hoje em que a
 * pessoa está, e a gaveta com o placar completo.
 *
 * Gate por `analitico_sub_desafios` (quem chama passa `ativo`): é a mesma chave
 * da aba Desafios e do campo do menu lateral — uma pílula para quem não pode
 * abrir a aba seria uma porta que não abre. Quais desafios: a RLS
 * (`desafios_escopo_*`). Se está no alvo: o placar (`participo`).
 *
 * A gaveta é baixada no primeiro clique (`import()`): a barra carrega com o
 * Layout em toda página, e o placar completo só interessa a quem abre.
 */
import { lazy, Suspense, useState } from 'react';
import { useDesafiosDoDiaNaBarra } from '@/hooks/useDesafioDoDia';
import type { Desafio } from '@/services/desafios/types';
import { PilulaDesafioDoDia } from './PilulaDesafioDoDia';

const GavetaDesafioDoDia = lazy(() => import('./GavetaDesafioDoDia').then(m => ({ default: m.GavetaDesafioDoDia })));

/** Duas pílulas no máximo: a barra é de todo mundo, e não do desafio. */
const MAXIMO_NA_BARRA = 2;

export function BarraDesafioDoDia({ ativo }: { ativo: boolean }) {
  const { desafios, previas } = useDesafiosDoDiaNaBarra(ativo);
  const [aberto, setAberto] = useState<Desafio | null>(null);
  const [jaAbriu, setJaAbriu] = useState(false);

  if (!ativo || desafios.length === 0) return null;

  const abrir = (d: Desafio) => { setJaAbriu(true); setAberto(d); };

  return (
    <>
      <div className="flex items-center gap-2">
        {desafios.slice(0, MAXIMO_NA_BARRA).map((d, i) => (
          // No celular, uma pílula só: a barra não tem largura para duas.
          <PilulaDesafioDoDia
            key={d.id} desafio={d} previa={previas.has(d.id)} onAbrir={abrir}
            className={i > 0 ? 'hidden sm:block' : undefined}
          />
        ))}
      </div>
      {jaAbriu && (
        <Suspense fallback={null}>
          <GavetaDesafioDoDia desafio={aberto} onClose={() => setAberto(null)} />
        </Suspense>
      )}
    </>
  );
}
