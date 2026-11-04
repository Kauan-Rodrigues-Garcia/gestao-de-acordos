/**
 * useCalendarioHoje — o pouco que o botão do topo precisa: se há calendário
 * para esta pessoa e o que está marcado para hoje no setor dela.
 *
 * Lê só o mês corrente do setor que o painel abriria primeiro (o próprio,
 * senão o primeiro alcançado), e relê quando o painel avisa que algo mudou
 * (`EVENTO_CALENDARIO_SETOR`). Se a leitura falha, o botão some — melhor
 * do que um botão que abre um painel com erro.
 *
 * Também relê quando a pessoa volta para a aba e já virou o dia, ou faz mais de
 * 10 minutos da última leitura: a aba aberta de um dia para o outro não fica com
 * o «hoje» de ontem, e quem foi transferido de setor passa a ver o dia do setor
 * novo sem F5 (o banco já responde pelo cadastro atual).
 */
import { useEffect, useRef, useState } from 'react';
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
  /** O tema escolhido na capa do mês (`null` = Automático), para o botão vestir o gibi do mês. */
  tema: string | null;
}

const NADA: CalendarioHoje = { temSetor: false, eventosHoje: [], rascunhoParaPublicar: false, tema: null };

/** Na volta à aba, só relê se a última leitura passou disto (ou se virou o dia). */
const RELER_NO_FOCO_MS = 10 * 60 * 1000;

export function useCalendarioHoje(
  empresaId: string | null | undefined,
  meuSetorId: string | null,
  ativo: boolean,
): CalendarioHoje {
  const [estado, setEstado] = useState<CalendarioHoje>(NADA);
  const [versao, setVersao] = useState(0);
  const ultimaLeitura = useRef<{ dia: string; em: number } | null>(null);

  useEffect(() => {
    const aoMudar = () => setVersao(v => v + 1);
    const aoVoltar = () => {
      const ultima = ultimaLeitura.current;
      if (document.visibilityState !== 'visible' || !ultima) return;
      if (ultima.dia !== getTodayISO() || Date.now() - ultima.em > RELER_NO_FOCO_MS) aoMudar();
    };
    window.addEventListener(EVENTO_CALENDARIO_SETOR, aoMudar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.removeEventListener(EVENTO_CALENDARIO_SETOR, aoMudar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  useEffect(() => {
    if (!ativo || !empresaId) { setEstado(NADA); return; }
    let vivo = true;
    const hoje = getTodayISO();
    ultimaLeitura.current = { dia: hoje, em: Date.now() };
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
        tema: mes.capa?.tema ?? null,
      });
    })().catch(() => { if (vivo) setEstado(NADA); });
    return () => { vivo = false; };
  }, [empresaId, meuSetorId, ativo, versao]);

  return estado;
}
