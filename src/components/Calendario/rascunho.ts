/**
 * O rascunho de um evento enquanto o formulário está aberto — separado do
 * componente para o «Fast Refresh» do Vite continuar funcionando nele.
 */
import type { ModeloEvento, TipoEvento } from '@/lib/calendarioSetor';

export interface RascunhoEvento {
  tipo: TipoEvento;
  titulo: string;
  detalhe: string;
  pessoa_id: string | null;
  destaque: boolean;
  modeloId: string | null;
}

export const RASCUNHO_VAZIO: RascunhoEvento = {
  tipo: 'banco_horas', titulo: 'Banco de horas', detalhe: '', pessoa_id: null, destaque: false, modeloId: null,
};

export function rascunhoDoModelo(m: ModeloEvento): RascunhoEvento {
  return {
    tipo: m.tipo, titulo: m.titulo, detalhe: m.detalhe ?? '', pessoa_id: null,
    destaque: m.destaque ?? false, modeloId: m.id,
  };
}

/** O que falta para o rascunho poder ser salvo (`null` = pronto). */
export function faltaNoRascunho(r: RascunhoEvento): string | null {
  if (!r.titulo.trim()) return 'Dê um título ao evento.';
  if (r.titulo.trim().length > 80) return 'O título passa de 80 letras.';
  if (r.detalhe.trim().length > 120) return 'O detalhe passa de 120 letras.';
  return null;
}
