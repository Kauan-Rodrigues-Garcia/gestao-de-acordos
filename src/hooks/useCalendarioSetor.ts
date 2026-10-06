/**
 * useCalendarioSetor — o estado da aba Calendário.
 *
 * Junta três leituras independentes:
 *
 *   1. os setores que a pessoa enxerga (`fn_calendario_setores`), e qual está
 *      aberto — o próprio, quando ela é de um deles;
 *   2. a capa e os eventos do setor no mês (`fn_calendario_mes`);
 *   3. o dia útil OFICIAL do mês: os feriados das Metas na cobrança, o
 *      calendário de Vendas no Comercial. É o mesmo que a meta diária conta —
 *      o calendário nunca inventa um terceiro.
 *
 * Uma leitura que falha não derruba as outras: sem os feriados oficiais, vale
 * segunda a sexta, e a tela continua mostrando o que a liderança lançou.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { partesDoMes } from '@/lib/mesReferencia';
import { ehDiaUtil as ehSegundaASexta } from '@/lib/diasUteis';
import { CALENDARIO_PADRAO, ehDiaUtilComercial, type CalendarioDoMes } from '@/lib/vendasCalendario';
import type { Produto } from '@/lib/produto';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { buscarCalendario } from '@/services/vendas/calendarioVendas.service';
import {
  buscarMes, listarSetoresDoCalendario, EVENTO_CALENDARIO_SETOR,
  type MesDoCalendario, type SetorDoCalendario,
} from '@/services/calendario/calendario.service';

const MES_VAZIO: MesDoCalendario = {
  capa: null, eventos: [], publicado: false, publicadoEm: null, temPublicacao: true,
};

export interface CalendarioSetor {
  setores: SetorDoCalendario[];
  setorId: string | null;
  setSetorId: (id: string) => void;
  setor: SetorDoCalendario | null;
  dados: MesDoCalendario;
  /** Feriados que a META conta (Metas ou Vendas), em ISO. */
  feriadosOficiais: string[];
  ehDiaUtil: (iso: string) => boolean;
  carregandoSetores: boolean;
  carregandoMes: boolean;
  erro: string | null;
  recarregar: () => void;
}

export function useCalendarioSetor(
  empresaId: string | null | undefined,
  produto: Produto | null,
  meuSetorId: string | null,
  mes: string,
): CalendarioSetor {
  const [setores, setSetores] = useState<SetorDoCalendario[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [carregandoSetores, setCarregandoSetores] = useState(true);
  const [dados, setDados] = useState<MesDoCalendario>(MES_VAZIO);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [feriadosMetas, setFeriadosMetas] = useState<string[]>([]);
  const [calVendas, setCalVendas] = useState<CalendarioDoMes>(CALENDARIO_PADRAO);

  // 1. Os setores.
  useEffect(() => {
    if (!empresaId) { setSetores([]); setCarregandoSetores(false); return; }
    let vivo = true;
    setCarregandoSetores(true);
    listarSetoresDoCalendario(empresaId)
      .then(l => { if (vivo) setSetores(l); })
      .catch(e => { if (vivo) { setSetores([]); setErro(e instanceof Error ? e.message : 'Não foi possível carregar os setores.'); } })
      .finally(() => { if (vivo) setCarregandoSetores(false); });
    return () => { vivo = false; };
  }, [empresaId]);

  // O setor aberto: o escolhido, senão o próprio, senão o primeiro da lista.
  const setorId = useMemo(() => {
    if (escolhido && setores.some(s => s.id === escolhido)) return escolhido;
    if (meuSetorId && setores.some(s => s.id === meuSetorId)) return meuSetorId;
    return setores[0]?.id ?? null;
  }, [escolhido, setores, meuSetorId]);

  // 2. O mês do setor.
  useEffect(() => {
    if (!empresaId || !setorId) { setDados(MES_VAZIO); return; }
    let vivo = true;
    setCarregandoMes(true);
    setErro(null);
    buscarMes(empresaId, setorId, mes)
      .then(d => { if (vivo) setDados(d); })
      .catch(e => { if (vivo) { setDados(MES_VAZIO); setErro(e instanceof Error ? e.message : 'Não foi possível carregar o calendário.'); } })
      .finally(() => { if (vivo) setCarregandoMes(false); });
    return () => { vivo = false; };
  }, [empresaId, setorId, mes, versao]);

  // 3. O dia útil oficial.
  const { ano, mes: m } = partesDoMes(mes);
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    if (produto === 'comercial') {
      void buscarCalendario(empresaId, ano, m)
        .then(c => { if (vivo) setCalVendas(c); })
        .catch(() => { if (vivo) setCalVendas(CALENDARIO_PADRAO); });
    } else {
      void getMetasConfig(empresaId, m, ano)
        .then(r => { if (vivo) setFeriadosMetas(r.data?.feriados ?? []); })
        .catch(() => { if (vivo) setFeriadosMetas([]); });
    }
    return () => { vivo = false; };
  }, [empresaId, produto, ano, m]);

  const feriadosOficiais = produto === 'comercial' ? calVendas.feriados : feriadosMetas;
  const ehDiaUtil = useCallback((iso: string) => {
    if (produto === 'comercial') return ehDiaUtilComercial(iso, calVendas);
    return ehSegundaASexta(iso) && !feriadosMetas.includes(iso);
  }, [produto, calVendas, feriadosMetas]);

  const recarregar = useCallback(() => {
    setVersao(v => v + 1);
    window.dispatchEvent(new Event(EVENTO_CALENDARIO_SETOR));
  }, []);

  return {
    setores,
    setorId,
    setSetorId: setEscolhido,
    setor: setores.find(s => s.id === setorId) ?? null,
    dados,
    feriadosOficiais,
    ehDiaUtil,
    carregandoSetores,
    carregandoMes,
    erro,
    recarregar,
  };
}
