import { useState } from 'react';
import { cn } from '@/lib/utils';
import { escolherPreviaNatal } from './previa';
import { EVENTO_FESTA, EVENTO_GLOBO, EVENTO_TRENO, type EstiloNatal } from './tema';

/**
 * O seletor da prévia do Natal, no canto de baixo à esquerda: desligar,
 * simples ou detalhado, e os dois botões que chamam o trenó e a festa na hora
 * (a vez deles de verdade é sorteada). Só existe enquanto o tema está sendo
 * desenhado — sai quando o Natal for para todos.
 */
const OPCOES: { valor: EstiloNatal | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Desligado' },
  { valor: 'simples', rotulo: 'Simples' },
  { valor: 'detalhado', rotulo: 'Detalhado' },
];

export function PreviaNatal({ estilo }: { estilo: EstiloNatal | null }) {
  const [recolhida, setRecolhida] = useState(false);
  if (recolhida) {
    return (
      <button
        onClick={() => setRecolhida(false)}
        className="fixed bottom-4 left-4 z-50 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur"
      >
        Prévia do Natal
      </button>
    );
  }
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 rounded-xl border border-border bg-card/95 p-2.5 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="font-semibold text-foreground">Prévia do Natal</span>
        <button onClick={() => setRecolhida(true)} className="text-muted-foreground hover:text-foreground" aria-label="Recolher a prévia">—</button>
      </div>
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {OPCOES.map(o => (
          <button
            key={o.rotulo}
            onClick={() => escolherPreviaNatal(o.valor)}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              estilo === o.valor ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {estilo && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => window.dispatchEvent(new Event(EVENTO_GLOBO))} className="flex-1 rounded-md border border-border px-2 py-1 hover:bg-accent">
            Mensagem no globo
          </button>
          <button onClick={() => window.dispatchEvent(new Event(EVENTO_FESTA))} className="flex-1 rounded-md border border-border px-2 py-1 hover:bg-accent">
            Festa do acordo
          </button>
          {estilo === 'detalhado' && (
            <button onClick={() => window.dispatchEvent(new Event(EVENTO_TRENO))} className="flex-1 rounded-md border border-border px-2 py-1 hover:bg-accent">
              Chamar o trenó
            </button>
          )}
        </div>
      )}
    </div>
  );
}
