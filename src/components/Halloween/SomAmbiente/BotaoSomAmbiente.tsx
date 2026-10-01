/**
 * BotaoSomAmbiente — o fone ao lado do sino.
 *
 * Parte do tema de Halloween: o `Layout` só o monta quando o tema está
 * liberado para a pessoa (`useHalloween().disponivel`). Desmontado, o motor
 * para a música sozinho (`soltarSessao`).
 *
 * Fica no pacote de entrada só o botão e o motor (pequenos). O painel desce
 * quando alguém abre, e cada música só quando toca — ver
 * `pacoteDeEntrada.test.ts`.
 *
 * Tocando, o ícone vira três barrinhas de equalizador: dá para saber de longe
 * que o som é daqui, e não de outra aba.
 */
import { lazy, useEffect, useState } from 'react';
import { Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PainelSobDemanda } from '@/components/PainelSobDemanda';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { cn } from '@/lib/utils';
import { dentroDoPalco, iniciarSessao, soltarSessao, useSomAmbiente } from './motor';
import { Equalizador } from './Equalizador';

const carregarPainel = comNovaTentativa(() => import('./PainelSomAmbiente'));
const PainelSomAmbiente = lazy(() => carregarPainel().then(m => ({ default: m.PainelSomAmbiente })));

export function BotaoSomAmbiente({ perfilId }: { perfilId: string | null | undefined }) {
  const [aberto, setAberto] = useState(false);
  const { estado, silenciado } = useSomAmbiente();

  useEffect(() => {
    if (!perfilId) return;
    iniciarSessao(perfilId);
    return () => soltarSessao(perfilId);
  }, [perfilId]);

  const tocando = estado === 'tocando' && !silenciado;
  const esperando = estado === 'aguardando';

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'w-8 h-8 relative',
            tocando ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          title={tocando ? 'Som ambiente — tocando' : 'Som ambiente'}
          aria-label={tocando ? 'Som ambiente, tocando' : 'Som ambiente'}
          data-som-ambiente-botao
        >
          {tocando ? <Equalizador /> : <Headphones className="w-4 h-4" />}
          {esperando && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] max-w-[calc(100vw-16px)] p-0 overflow-hidden"
        // O player do Spotify/YouTube mora fora do painel (ver `motor.ts`):
        // clicar nele não pode fechar o painel.
        onInteractOutside={e => { if (dentroDoPalco(e.target)) e.preventDefault(); }}
      >
        <PainelSobDemanda aberto={aberto} nome="Som ambiente">
          <PainelSomAmbiente />
        </PainelSobDemanda>
      </PopoverContent>
    </Popover>
  );
}
