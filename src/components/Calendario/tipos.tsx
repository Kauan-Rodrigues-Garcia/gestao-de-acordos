/**
 * O ícone de cada tipo de evento, na cor do tipo. A cor do banco de horas é a
 * do tema do mês (`--cal-acento`); os outros têm cor fixa, sempre misturada ao
 * fundo do tema pelo CSS — e, como texto, por `corTexto`, que acerta o
 * contraste no claro e no escuro.
 */
import { cn } from '@/lib/utils';
import type { TipoEvento } from '@/lib/calendarioSetor';
import { ICONE_TIPO, estiloDoTipo } from './estiloTipo';

export function IconeTipo({ tipo, className, tamanho = 'h-4 w-4' }: {
  tipo: TipoEvento; className?: string; tamanho?: string;
}) {
  const Icone = ICONE_TIPO[tipo];
  return (
    <span className={cn('cal-icone-tipo shrink-0', className)} style={estiloDoTipo(tipo)} aria-hidden>
      <Icone className={tamanho} />
    </span>
  );
}
