/**
 * O ícone e as variáveis de cor de cada tipo de evento. O banco de horas não
 * tem cor própria: veste a do tema do mês (`--cal-acento`).
 *
 * Arquivo `.ts`, e não junto do componente, para o «Fast Refresh» do Vite
 * continuar funcionando em `tipos.tsx`.
 */
import type { CSSProperties } from 'react';
import {
  AlarmClock, Cake, CalendarCheck, Clock, Coffee, Megaphone, TreePalm, type LucideIcon,
} from 'lucide-react';
import { corTexto } from '@/lib/temas';
import { INFO_TIPO, type TipoEvento } from '@/lib/calendarioSetor';

export const ICONE_TIPO: Record<TipoEvento, LucideIcon> = {
  banco_horas: Clock,
  feriado:     TreePalm,
  aniversario: Cake,
  evento:      CalendarCheck,
  aviso:       Megaphone,
  folga:       Coffee,
  horario:     AlarmClock,
};

export function estiloDoTipo(tipo: TipoEvento): CSSProperties {
  const cor = INFO_TIPO[tipo].cor;
  if (!cor) return {};
  return { '--tipo': cor, '--tipo-texto': corTexto(cor) } as CSSProperties;
}
