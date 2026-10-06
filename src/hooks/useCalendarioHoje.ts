/**
 * useCalendarioHoje — o pouco que o botão do topo precisa: se há calendário
 * para esta pessoa e o que está marcado para hoje no setor dela.
 *
 * Lê só o mês corrente do setor que o painel abriria primeiro (o próprio,
 * senão o primeiro alcançado), e relê quando o painel avisa que algo mudou
 * (`EVENTO_CALENDARIO_SETOR`). Se a leitura falha, o botão some — melhor
 * do que um botão que abre um painel com erro.
 */
import { useEffect, useState } from 'react';
import { getTodayISO } from '@/lib/index';
import type { EventoCalendario } from '@/lib/calendarioSetor';
import {
  EVENTO_CALENDARIO_SETOR, buscarMes, listarSetoresDoCalendario,
} from '@/services/calendario/calendario.service';

export interface CalendarioHoje {
  /** A pessoa alcança algum setor. Sem setor, o botão não aparece. */
  temSetor: boolean;
  eventosHoje: EventoCalendario[];
  /** O mês corrente está em rascunho e esta pessoa monta o calendário. */
  rascunhoParaPublicar: boolean;
}

const NADA: CalendarioHoje = { temSetor: false, eventosHoje: [], rascunhoParaPublicar: false };

export function useCalendarioHoje(
  empresaId: string | null | undefined,
  meuSetorId: string | null,
  ativo: boolean,
): CalendarioHoje {
  const [estado, setEstado] = useState<CalendarioHoje>(NADA);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const aoMudar = () => setVersao(v => v + 1);
    window.addEventListener(EVENTO_CALENDARIO_SETOR, aoMudar);
    return () => window.removeEventListener(EVENTO_CALENDARIO_SETOR, aoMudar);
  }, []);

  useEffect(() => {
    if (!ativo || !empresaId) { setEstado(NADA); return; }
    let vivo = true;
    const hoje = getTodayISO();
    (async () => {
      const setores = await listarSetoresDoCalendario(empresaId);
      const setor = setores.find(s => s.id === meuSetorId) ?? setores[0];
      if (!setor) { if (vivo) setEstado(NADA); return; }
      const mes = await buscarMes(empresaId, setor.id, hoje.slice(0, 7));
      if (!vivo) return;
      setEstado({
        temSetor: true,
        eventosHoje: mes.publicado || setor.pode_editar ? mes.eventos.filter(e => e.dia === hoje) : [],
        rascunhoParaPublicar: setor.pode_editar && mes.temPublicacao && !mes.publicado && mes.eventos.length > 0,
      });
    })().catch(() => { if (vivo) setEstado(NADA); });
    return () => { vivo = false; };
  }, [empresaId, meuSetorId, ativo, versao]);

  return estado;
}
