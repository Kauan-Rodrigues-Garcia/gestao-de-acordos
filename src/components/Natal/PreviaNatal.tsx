import { useState } from 'react';
import { cn } from '@/lib/utils';
import { escolherPreviaNatal, esconderPresente, pularAbertura, reiniciarAbertura } from './previa';
import { EVENTO_FESTA, EVENTO_GLOBO, EVENTO_TRENO, type EstiloNatal } from './tema';

/**
 * O seletor da prévia do Natal, no canto de baixo à esquerda: desligar,
 * simples ou detalhado, e os botões que chamam o trenó e a festa na hora
 * (a vez deles de verdade é sorteada). Só existe enquanto o tema está sendo
 * desenhado — sai quando o Natal for para todos.
 *
 * Embaixo, os testes da abertura (Cleber, 04/11/2026): começar de novo,
 * esconder ou mostrar o presente da espera, e pular para o fim do vídeo ou
 * direto para o bilhete. Valem só neste navegador.
 */
const OPCOES: { valor: EstiloNatal | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Desligado' },
  { valor: 'simples', rotulo: 'Simples' },
  { valor: 'detalhado', rotulo: 'Detalhado' },
];

/** Por cima da abertura (`.np-abertura`), para os testes funcionarem com o vídeo na tela. */
const ACIMA_DA_ABERTURA = 2147483600;

const BOTAO = 'flex-1 rounded-md border border-border px-2 py-1 hover:bg-accent';

export function PreviaNatal({ estilo, presenteAberto, presenteOculto }: {
  estilo: EstiloNatal | null;
  /** Esta pessoa já abriu o presente (o Natal está ligado por ele). */
  presenteAberto: boolean;
  presenteOculto: boolean;
}) {
  const [recolhida, setRecolhida] = useState(false);
  if (recolhida) {
    return (
      <button
        onClick={() => setRecolhida(false)}
        style={{ zIndex: ACIMA_DA_ABERTURA }} className="fixed bottom-4 left-4 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur"
      >
        Prévia do Natal
      </button>
    );
  }
  return (
    <div style={{ zIndex: ACIMA_DA_ABERTURA }} className="fixed bottom-4 left-4 flex w-[300px] flex-col gap-2 rounded-xl border border-border bg-card/95 p-2.5 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="font-semibold text-foreground">Prévia do Natal</span>
        <button onClick={() => setRecolhida(true)} className="text-muted-foreground hover:text-foreground" aria-label="Recolher a prévia">—</button>
      </div>
      {presenteAberto && (
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {OPCOES.map(o => (
            <button
              key={o.rotulo}
              onClick={() => escolherPreviaNatal(o.valor)}
              className={cn(
                'flex-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                estilo === o.valor ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
      {estilo && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => window.dispatchEvent(new Event(EVENTO_GLOBO))} className={BOTAO}>
            Mensagem no globo
          </button>
          <button onClick={() => window.dispatchEvent(new Event(EVENTO_FESTA))} className={BOTAO}>
            Festa do acordo
          </button>
          {estilo === 'detalhado' && (
            <button onClick={() => window.dispatchEvent(new Event(EVENTO_TRENO))} className={BOTAO}>
              Chamar o trenó
            </button>
          )}
        </div>
      )}

      <div className="space-y-1 border-t border-border pt-2">
        <p className="px-0.5 font-semibold text-foreground">
          Abertura <span className="font-normal text-muted-foreground">· {presenteAberto ? 'presente já aberto' : presenteOculto ? 'presente escondido' : 'presente esperando'}</span>
        </p>
        <div className="flex flex-wrap gap-1">
          <button onClick={reiniciarAbertura} className={cn(BOTAO, 'basis-full font-medium')}>
            Começar a abertura de novo
          </button>
          {!presenteAberto && (
            <button onClick={() => esconderPresente(!presenteOculto)} className={BOTAO}>
              {presenteOculto ? 'Mostrar o presente' : 'Esconder o presente'}
            </button>
          )}
          {!presenteAberto && !presenteOculto && (
            <>
              <button onClick={() => pularAbertura('fim-do-video')} className={BOTAO} title="No vídeo, vai para os últimos segundos; antes dele, pula direto para o presente voando">
                Fim do vídeo
              </button>
              <button onClick={() => pularAbertura('bilhete')} className={BOTAO}>
                Direto ao bilhete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
