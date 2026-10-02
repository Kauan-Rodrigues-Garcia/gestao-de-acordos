/**
 * useCalendarioVendas — o calendário do mês do Comercial, pronto para contar.
 *
 * Toda tela do Comercial que divide meta por dia útil passa por aqui, para
 * que nenhuma volte a contar segunda a sexta sozinha. Ver
 * `@/lib/vendasCalendario`.
 */
import { useEffect, useMemo, useState } from 'react';
import { partesDoMes } from '@/lib/mesReferencia';
import {
  CALENDARIO_PADRAO, diasUteisComercial, diasUteisDecorridosComercial,
  type CalendarioDoMes,
} from '@/lib/vendasCalendario';
import { buscarCalendario, EVENTO_CALENDARIO } from '@/services/vendas/calendarioVendas.service';

export interface CalendarioVendas {
  calendario: CalendarioDoMes;
  /** Dias úteis do mês inteiro. */
  uteis: number;
  /** Dias úteis até `ateISO`, inclusive. */
  decorridos: (ateISO: string) => number;
}

export function useCalendarioVendas(empresaId: string | null | undefined, mes: string): CalendarioVendas {
  const { ano, mes: m } = partesDoMes(mes);
  const [calendario, setCalendario] = useState<CalendarioDoMes>(CALENDARIO_PADRAO);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const aoMudar = () => setVersao(v => v + 1);
    window.addEventListener(EVENTO_CALENDARIO, aoMudar);
    return () => window.removeEventListener(EVENTO_CALENDARIO, aoMudar);
  }, []);

  useEffect(() => {
    if (!empresaId) { setCalendario(CALENDARIO_PADRAO); return; }
    let vivo = true;
    void buscarCalendario(empresaId, ano, m).then(c => { if (vivo) setCalendario(c); });
    return () => { vivo = false; };
  }, [empresaId, ano, m, versao]);

  return useMemo(() => ({
    calendario,
    uteis: diasUteisComercial(ano, m, calendario),
    decorridos: (ateISO: string) => diasUteisDecorridosComercial(ano, m, ateISO, calendario),
  }), [calendario, ano, m]);
}
