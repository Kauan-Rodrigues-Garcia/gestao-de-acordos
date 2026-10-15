/**
 * EscudoAutorizacoes — o «avatar» da conversa Autorizações: escudo num
 * círculo, âmbar e pulsando enquanto há pedido esperando.
 *
 * Arquivo próprio porque aparece em dois pedaços do chat: na janela (lista e
 * painel) e no aviso de pedido novo, que vive na bolha fechada e não pode
 * puxar a janela inteira para desenhar um ícone.
 */
import { ShieldCheck } from 'lucide-react';

export function EscudoAutorizacoes({ tamanho, alerta }: { tamanho: number; alerta: boolean }) {
  return (
    <span className="relative flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: tamanho, height: tamanho,
        background: alerta
          ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
          : 'linear-gradient(135deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 70%, #000) 100%)',
      }}>
      {alerta && (
        <span aria-hidden="true" className="absolute -inset-1 animate-ping rounded-full border-2 border-amber-500/60" />
      )}
      <ShieldCheck style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} />
    </span>
  );
}
