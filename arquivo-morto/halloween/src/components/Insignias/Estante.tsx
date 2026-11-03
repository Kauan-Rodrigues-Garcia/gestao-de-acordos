/**
 * As medalhas penduradas no topo — o pedaço que baixa logo que o app abre.
 * Traz só o desenho das medalhas (`Medalha.tsx`, `arte.ts`).
 *
 * A placa do hover (`Placas.tsx`: os bonecos animados, a placa do Minecraft,
 * as fontes) é outro pedaço, bem mais pesado, que só baixa quando o mouse
 * chega perto das medalhas — antes ele vinha junto e atrasava as medalhas
 * (19/10/2026). A lista do pessoal é outro ainda (`Pessoal.tsx`).
 */
import { lazy, Suspense } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { INSIGNIAS, type Album, type IdInsignia, type Insignia, type Conquista } from './insignias';
import { Medalha } from './Medalha';
import { carregarPlacas, prepararPlacas } from './placasSobDemanda';

const PlacaDaInsignia = lazy(() => carregarPlacas().then(m => ({ default: m.PlacaDaInsignia })));

/** O instante entre o hover e a placa baixar (quase nunca visto: ver `prepararPlacas`). */
function PlacaCarregando() {
  return <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">Carregando…</div>;
}
/** O hover sem a caixa do tooltip: a placa é a caixa. */
const SEM_CAIXA = 'overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none';

export function MedalhaComPlaca({
  insignia, conquista, tam, pendurada, nova, aoVer,
}: {
  insignia: Insignia;
  conquista: Conquista | undefined;
  tam: number;
  pendurada?: boolean;
  nova?: boolean;
  aoVer?: (id: IdInsignia) => void;
}) {
  return (
    <Tooltip onOpenChange={aberto => { if (aberto) aoVer?.(insignia.id); }}>
      <TooltipTrigger asChild>
        <Medalha
          insignia={insignia}
          conquista={conquista}
          tam={tam}
          pendurada={pendurada}
          nova={nova}
          tabIndex={pendurada ? 0 : undefined}
          role="img"
          aria-label={`${insignia.nome}: ${conquista ? 'conquistada' : 'ainda não conquistada'}`}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={6} collisionPadding={12} className={SEM_CAIXA}>
        <Suspense fallback={<PlacaCarregando />}>
          <PlacaDaInsignia insignia={insignia} conquista={conquista} />
        </Suspense>
      </TooltipContent>
    </Tooltip>
  );
}

// ── As do topo ──────────────────────────────────────────────────────────────
//
// Só as que a pessoa TEM (quem não participou de uma gincana não vê a medalha
// dela). As «?» da próxima gincana saíram em 29/10/2026: não vem outra.

interface EstanteProps {
  album: Album | null;
  novas: readonly IdInsignia[];
  aoVer: (id: IdInsignia) => void;
}

export function Estante({ album, novas, aoVer }: EstanteProps) {
  return (
    // `disableHoverableContent`: a placa não tem nada para clicar. Com ela
    // «alcançável», o Radix mantinha a primeira aberta enquanto o mouse ia
    // para a medalha do lado (o caminho até a placa cobre as vizinhas) e a
    // placa não trocava (19/10/2026).
    <TooltipProvider delayDuration={120} skipDelayDuration={400} disableHoverableContent>
      <div className="ins-fileira" onPointerEnter={prepararPlacas} onFocus={prepararPlacas}>
        {INSIGNIAS.filter(ins => album?.conquistas[ins.id]).map(ins => (
          <MedalhaComPlaca
            key={ins.id}
            insignia={ins}
            conquista={album?.conquistas[ins.id]}
            tam={24}
            pendurada
            nova={novas.includes(ins.id)}
            aoVer={aoVer}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
