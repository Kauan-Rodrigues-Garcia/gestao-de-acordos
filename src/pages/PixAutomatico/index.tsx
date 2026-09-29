/**
 * Pix Automático — item próprio do menu desde o Mapa de Abas (29/09/2026).
 *
 * Era a quinta aba de Acordos e tinha virado um módulo inteiro escondido:
 * barra de setores, registro, meta Pix, sem registro, pedidos de NR,
 * premiações, saldo, comissão dobrada e ranking. A tela é a mesma
 * (`Acordos/PixAutomatico`), com a mesma chave `ver_pix_automatico`; mudou o
 * endereço. `/acordos?tab=pix` redireciona para cá.
 */
import { Zap } from 'lucide-react';
import { PixAutomatico } from '@/pages/Acordos/PixAutomatico';

export default function PaginaPixAutomatico() {
  return (
    <div className="p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Pix Automático</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Registros, pendências, meta e premiação do Pix Automático
            </p>
          </div>
        </div>
        <PixAutomatico />
      </div>
    </div>
  );
}
