/**
 * O rascunho de um evento enquanto o formulário está aberto — separado do
 * componente para o «Fast Refresh» do Vite continuar funcionando nele.
 */
import {
  HORARIO_BANCO_PADRAO, faltaNoHorarioBanco, lerHorarioBanco, textoDoBanco,
  type EventoCalendario, type HorarioBanco, type ModeloEvento, type TipoEvento,
} from '@/lib/calendarioSetor';

export interface RascunhoEvento {
  tipo: TipoEvento;
  titulo: string;
  /** O detalhe escrito à mão. No banco de horas quem manda é `banco`. */
  detalhe: string;
  /** O horário do banco de horas; `null` nos outros tipos. */
  banco: HorarioBanco | null;
  pessoa_id: string | null;
  destaque: boolean;
  modeloId: string | null;
}

export const RASCUNHO_VAZIO: RascunhoEvento = {
  tipo: 'banco_horas', titulo: 'Banco de horas', detalhe: '', banco: HORARIO_BANCO_PADRAO,
  pessoa_id: null, destaque: false, modeloId: 'banco_horas',
};

export function rascunhoDoModelo(m: ModeloEvento): RascunhoEvento {
  return {
    tipo: m.tipo, titulo: m.titulo, detalhe: m.detalhe ?? '',
    banco: m.tipo === 'banco_horas' ? HORARIO_BANCO_PADRAO : null,
    pessoa_id: null, destaque: m.destaque ?? false, modeloId: m.id,
  };
}

/** Um evento gravado, de volta no formulário para corrigir. */
export function rascunhoDoEvento(e: EventoCalendario): RascunhoEvento {
  return {
    tipo: e.tipo, titulo: e.titulo, detalhe: e.detalhe ?? '',
    banco: e.tipo === 'banco_horas' ? lerHorarioBanco(e.detalhe) : null,
    pessoa_id: e.pessoa_id, destaque: e.destaque, modeloId: null,
  };
}

/** Trocar o tipo: o banco de horas ganha um horário; os outros, não. */
export function comTipo(r: RascunhoEvento, tipo: TipoEvento): RascunhoEvento {
  return {
    ...r, tipo, modeloId: null,
    banco: tipo === 'banco_horas' ? (r.banco ?? lerHorarioBanco(r.detalhe)) : null,
  };
}

/** O detalhe que vai para o banco. */
export function detalheDoRascunho(r: RascunhoEvento): string | null {
  const texto = r.banco ? textoDoBanco(r.banco) : r.detalhe.trim();
  return texto || null;
}

/** O que falta para o rascunho poder ser salvo (`null` = pronto). */
export function faltaNoRascunho(r: RascunhoEvento): string | null {
  if (!r.titulo.trim()) return 'Dê um título ao evento.';
  if (r.titulo.trim().length > 80) return 'O título passa de 80 letras.';
  if (r.banco) {
    const falta = faltaNoHorarioBanco(r.banco);
    if (falta) return falta;
  }
  if ((detalheDoRascunho(r) ?? '').length > 120) return 'O detalhe passa de 120 letras.';
  return null;
}
