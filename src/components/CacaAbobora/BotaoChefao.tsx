/**
 * BotaoChefao.tsx — o X no meio da barra do topo: esconder ou mostrar o
 * chefão (o Rei do Pop zumbi) e a chefona (a Bruxa do Pântano).
 *
 * Pedido de 09/10/2026: «um botão de desativar o Michael Jackson caso a pessoa
 * não quiser ver» — e, na mesma tarde, que fosse um X no MEIO da barra do topo,
 * em cima da faixa, e que o mesmo X desfizesse com outro clique («mais
 * fácil»). Era um chapéu ao lado do botão de música, e um X no placar; ficou
 * um botão só.
 *
 * Aparece enquanto há um chefe — da contagem até o fim. Escondido, a pessoa
 * não vê a contagem, nem o chefe, nem o ranking, e não ouve nada dele; o X
 * fica, com «Mostrar o chefão», para ela voltar. A escolha fica guardada para
 * ela neste navegador (`chefao.ts`, «Não quero ver o chefão») e vale também
 * para o próximo — e, desde 15/10/2026, para a chefona das bruxas também.
 */
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { chefaoNaTela, desligarChefao, useChefao, useChefaoDesligado } from './chefao';
import { chefonaNaTela, useChefona } from './bruxas/chefona/banco';

export function BotaoChefao({ perfilId, className }: { perfilId: string | null | undefined; className?: string }) {
  const desligado = useChefaoDesligado(perfilId);
  const chefao = useChefao();
  const chefona = useChefona();
  const bruxa = chefonaNaTela(chefona, Date.now());
  if (!perfilId || (!chefaoNaTela(chefao, Date.now()) && !bruxa)) return null;
  const quem = bruxa ? 'a Bruxa do Pântano' : 'o Rei do Pop zumbi';

  function virar() {
    if (!perfilId) return;
    desligarChefao(perfilId, !desligado);
    toast(desligado ? (bruxa ? 'A chefona voltou para a sua tela 🧙' : 'O chefão voltou para a sua tela 🕺') : 'Chefão escondido', {
      description: desligado
        ? `Você vê ${quem}, ouve o som e entra no ranking.`
        : `Você não vê nem ouve ${quem}. Clique no X de novo para voltar.`,
    });
  }

  const rotulo = desligado ? 'Mostrar o chefão' : 'Esconder o chefão';
  return (
    <button
      type="button"
      onClick={virar}
      title={desligado ? 'O chefão está escondido para você — clique para mostrar' : `Esconder o chefão (${quem})`}
      aria-label={rotulo}
      aria-pressed={desligado}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        desligado
          ? 'border-dashed border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
          : 'border-pink-500/50 bg-pink-500/10 text-foreground hover:bg-pink-500/20',
        className,
      )}
    >
      {/* O X é o mesmo nos dois estados («clicando novamente no X»): muda o texto e a cor. */}
      <svg viewBox="0 0 10 10" width={10} height={10} shapeRendering="crispEdges" aria-hidden="true">
        <g fill="currentColor">
          {[0, 1, 2, 3, 4].map(i => <rect key={`a${i}`} x={i * 2} y={i * 2} width={2} height={2} />)}
          {[0, 1, 2, 3, 4].map(i => <rect key={`b${i}`} x={8 - i * 2} y={i * 2} width={2} height={2} />)}
        </g>
      </svg>
      <span className="hidden sm:inline">{rotulo}</span>
    </button>
  );
}
