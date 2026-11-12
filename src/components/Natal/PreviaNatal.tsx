import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { EVENTO_QUEBRA_NOZES_RESPOSTA, SEM_PALCO, chamarQuebraNozes } from './quebraNozes/chamada';
import type { Cidade as CidadeDosQuebraNozes } from './quebraNozes/elenco';
import { escolherPreviaNatal, esconderPresente, pularAbertura, reiniciarAbertura } from './previa';
import { EVENTO_FESTA, EVENTO_GLOBO, EVENTO_TRENO, type EstiloNatal } from './tema';
import { escolherVideoDaPrevia, lerVideoDaPrevia, type VideoDaCidade } from './abertura';

/**
 * O seletor da prévia do Natal, no canto de baixo à esquerda: desligar,
 * simples ou detalhado, e os botões que chamam o trenó e a festa na hora
 * (a vez deles de verdade é sorteada). Só existe enquanto o tema está sendo
 * desenhado — sai quando o Natal for para todos.
 *
 * Embaixo, os testes da abertura (Cleber, 04/11/2026): começar de novo,
 * esconder ou mostrar o presente da espera, e pular para o fim do vídeo ou
 * direto para o bilhete. Valem só neste navegador.
 *
 * O vídeo (09/11/2026): o da cidade do setor, ou o de Birigui ou de Marília à
 * força, para conferir os dois.
 */
const OPCOES: { valor: EstiloNatal | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Desligado' },
  { valor: 'simples', rotulo: 'Simples' },
  { valor: 'detalhado', rotulo: 'Detalhado' },
];

/** Por cima da abertura (`.np-abertura`), para os testes funcionarem com o vídeo na tela. */
const ACIMA_DA_ABERTURA = 2147483600;

const BOTAO = 'flex-1 rounded-md border border-border px-2 py-1 hover:bg-accent';

/**
 * Os quebra-nozes (12/11/2026): chama uma aparição, o boletim de quem mais
 * recebeu ou a chamada dos destaques na hora, na cidade do setor ou em uma à força. Cada clique sorteia outra. A
 * linha de baixo diz o que o sorteio escolheu (ou por que ninguém subiu).
 */
function TesteDosQuebraNozes() {
  const [cidade, setCidade] = useState<CidadeDosQuebraNozes | null>(null);
  const [resposta, setResposta] = useState('');
  useEffect(() => {
    const ouvir = (e: Event) => setResposta((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_QUEBRA_NOZES_RESPOSTA, ouvir);
    return () => window.removeEventListener(EVENTO_QUEBRA_NOZES_RESPOSTA, ouvir);
  }, []);
  const chamar = (tipo: 'aparicao' | 'parabens' | 'boletim') => {
    if (!chamarQuebraNozes({ tipo, cidade: cidade ?? undefined })) setResposta(SEM_PALCO);
  };
  return (
    <div className="space-y-1 border-t border-border pt-2">
      <p className="px-0.5 font-semibold text-foreground">Quebra-nozes</p>
      <div className="flex gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="Cidade dos quebra-nozes">
        {([[null, 'Do setor'], ['birigui', 'Birigui'], ['marilia', 'Marília']] as const).map(([v, rotulo]) => (
          <button
            key={rotulo}
            onClick={() => setCidade(v)}
            className={cn('flex-1 rounded-md px-2 py-1 font-medium transition-colors', cidade === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => chamar('aparicao')} className={BOTAO}>
          Aparição
        </button>
        <button onClick={() => chamar('boletim')} className={BOTAO} title="Sem líder de verdade, sobe um nome de exemplo">
          Quem mais recebeu
        </button>
        <button onClick={() => chamar('parabens')} className={BOTAO} title="Sem destaques de verdade, sobem nomes de exemplo">
          Chamada dos destaques
        </button>
      </div>
      {resposta && <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">{resposta}</p>}
    </div>
  );
}

export function PreviaNatal({ estilo, presenteAberto, presenteOculto, video }: {
  estilo: EstiloNatal | null;
  /** Esta pessoa já abriu o presente (o Natal está ligado por ele). */
  presenteAberto: boolean;
  presenteOculto: boolean;
  /** O vídeo que o presente vai tocar agora. */
  video: VideoDaCidade;
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

      {estilo && <TesteDosQuebraNozes />}

      <div className="space-y-1 border-t border-border pt-2">
        <p className="px-0.5 font-semibold text-foreground">
          Abertura<span className="font-normal text-muted-foreground">· {presenteAberto ? 'presente já aberto' : presenteOculto ? 'presente escondido' : 'presente esperando'}</span>
        </p>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="Vídeo da abertura">
          {([[null, 'Da cidade'], ['birigui', 'Birigui'], ['marilia', 'Marília']] as const).map(([v, rotulo]) => {
            const ativo = v === null ? lerVideoDaPrevia() === null : lerVideoDaPrevia() === v;
            return (
              <button
                key={rotulo}
                onClick={() => escolherVideoDaPrevia(v as VideoDaCidade | null)}
                className={cn('flex-1 rounded-md px-2 py-1 font-medium transition-colors', ativo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                title={v === null ? `Pela cidade do setor (agora: ${video === 'marilia' ? 'Marília' : 'Birigui'})` : undefined}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
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
