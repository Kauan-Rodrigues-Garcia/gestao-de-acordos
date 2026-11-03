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
 *
 * ## Abrir de novo é instantâneo
 *
 * O que já foi lido fica guardado na memória da aba (`CACHE`), e o painel
 * reaberto nasce com ele — sem esqueleto e sem a tela trocando de tamanho no
 * meio da animação. A leitura de novo acontece por baixo e só troca o que
 * mudou. Recarregar depois de salvar também não apaga nada da tela no meio.
 *
 * ## O setor é o de agora, não o da memória (03/11/2026)
 *
 * Quem decide os setores é o banco, na hora (`fn_calendario_setores` olha o
 * cadastro atual). A memória só serve para a tela nascer pronta: a lista é
 * relida a cada abertura, e o mês só é pedido depois que ela volta. Quem foi
 * transferido do Play 2 para o Play 3 abre o calendário e cai no Play 3 — mesmo
 * com o perfil da aba ainda velho (`useAuth` só relê o perfil no foco, de 5 em
 * 5 minutos). O que estava guardado de um setor que saiu da lista é jogado
 * fora, e o botão do topo é avisado para reler o dia.
 *
 * A memória é por pessoa: o «Entrar como» na mesma aba não herda o que a
 * pessoa anterior via (o rascunho que só a liderança enxerga, por exemplo).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { partesDoMes } from '@/lib/mesReferencia';
import { ehDiaUtil as ehSegundaASexta } from '@/lib/diasUteis';
import { CALENDARIO_PADRAO, ehDiaUtilComercial, type CalendarioDoMes } from '@/lib/vendasCalendario';
import type { Produto } from '@/lib/produto';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { diasUteisDoSetor, type FonteDiasUteis } from '@/lib/diasUteisDoSetor';
import { buscarCalendario } from '@/services/vendas/calendarioVendas.service';
import {
  buscarMes, listarSetoresDoCalendario, EVENTO_CALENDARIO_SETOR,
  type MesDoCalendario, type SetorDoCalendario,
} from '@/services/calendario/calendario.service';

const MES_VAZIO: MesDoCalendario = {
  capa: null, eventos: [], publicado: false, publicadoEm: null, temPublicacao: true,
};

/** Sempre o mesmo array: quem compara por referência (os `useMemo`) não refaz à toa. */
const SEM_FERIADOS: string[] = [];

/**
 * O que já se leu nesta aba do navegador. Some no F5 — e é o que se quer.
 * `setores` e `meses` têm a pessoa na chave (`pessoa|empresa…`): o que o banco
 * devolve depende de quem pergunta.
 */
const CACHE = {
  setores: new Map<string, SetorDoCalendario[]>(),
  meses: new Map<string, MesDoCalendario>(),
  /** A config do mês inteira: o feriado que vale depende do setor aberto. */
  metas: new Map<string, FonteDiasUteis>(),
  vendas: new Map<string, CalendarioDoMes>(),
};

export interface CalendarioSetor {
  setores: SetorDoCalendario[];
  setorId: string | null;
  setSetorId: (id: string) => void;
  setor: SetorDoCalendario | null;
  dados: MesDoCalendario;
  /**
   * Já há um mês lido deste setor na tela (o atual ou, trocando de mês, o
   * anterior, até o novo chegar). As faixas de rascunho/lançado só somem
   * quando isso é falso — e não a cada recarga.
   */
  mesPronto: boolean;
  /** Feriados que a META conta (Metas ou Vendas), em ISO. */
  feriadosOficiais: string[];
  ehDiaUtil: (iso: string) => boolean;
  carregandoSetores: boolean;
  carregandoMes: boolean;
  erro: string | null;
  recarregar: () => void;
}

/** Joga fora os meses guardados de setores que a pessoa não alcança mais. */
function esquecerSetoresQueSairam(base: string, antes: SetorDoCalendario[], agora: SetorDoCalendario[]): boolean {
  const ficam = new Set(agora.map(s => s.id));
  const sairam = antes.filter(s => !ficam.has(s.id)).map(s => `${base}|${s.id}|`);
  if (sairam.length === 0) return antes.length !== agora.length;
  for (const chave of [...CACHE.meses.keys()]) {
    if (sairam.some(p => chave.startsWith(p))) CACHE.meses.delete(chave);
  }
  return true;
}

export function useCalendarioSetor(
  pessoaId: string | null | undefined,
  empresaId: string | null | undefined,
  produto: Produto | null,
  meuSetorId: string | null,
  mes: string,
): CalendarioSetor {
  const base = empresaId ? `${pessoaId ?? ''}|${empresaId}` : null;
  const [setores, setSetores] = useState<SetorDoCalendario[]>(() => (base && CACHE.setores.get(base)) || []);
  /** A lista que está na tela já veio do banco nesta abertura (e não só da memória). */
  const [setoresConfirmados, setSetoresConfirmados] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [carregandoSetores, setCarregandoSetores] = useState(() => !(base && CACHE.setores.has(base)));
  const [lido, setLido] = useState<{ chave: string; dados: MesDoCalendario } | null>(null);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [, setFeriadosLidos] = useState(0);

  // 1. Os setores. Relidos a cada abertura e quando o perfil troca de setor.
  useEffect(() => {
    if (!empresaId || !base) { setSetores([]); setCarregandoSetores(false); return; }
    let vivo = true;
    const guardados = CACHE.setores.get(base);
    setSetores(guardados ?? []);
    setCarregandoSetores(!guardados);
    listarSetoresDoCalendario(empresaId)
      .then(l => {
        if (!vivo) return;
        CACHE.setores.set(base, l);
        setSetores(l);
        setSetoresConfirmados(base);
        // Saiu ou entrou setor (transferência): o botão do topo relê o dia.
        if (guardados && esquecerSetoresQueSairam(base, guardados, l)) {
          window.dispatchEvent(new Event(EVENTO_CALENDARIO_SETOR));
        }
      })
      .catch(e => {
        if (!vivo) return;
        // Sem a lista do banco, a da memória continua valendo — e o mês segue.
        setSetoresConfirmados(base);
        if (!guardados) {
          setSetores([]);
          setErro(e instanceof Error ? e.message : 'Não foi possível carregar os setores.');
        }
      })
      .finally(() => { if (vivo) setCarregandoSetores(false); });
    return () => { vivo = false; };
  }, [empresaId, base, meuSetorId]);

  // O setor aberto: o escolhido, senão o próprio, senão o primeiro da lista.
  const setorId = useMemo(() => {
    if (escolhido && setores.some(s => s.id === escolhido)) return escolhido;
    if (meuSetorId && setores.some(s => s.id === meuSetorId)) return meuSetorId;
    return setores[0]?.id ?? null;
  }, [escolhido, setores, meuSetorId]);

  // 2. O mês do setor — só depois que o banco confirmou a lista: com a lista da
  // memória, o setor aberto pode ser um de onde a pessoa já saiu.
  const chaveMes = base && setorId ? `${base}|${setorId}|${mes}` : null;
  const podeLerMes = setoresConfirmados === base;
  useEffect(() => {
    if (!empresaId || !setorId || !chaveMes || !podeLerMes) return;
    let vivo = true;
    setCarregandoMes(true);
    setErro(null);
    buscarMes(empresaId, setorId, mes)
      .then(d => { if (vivo) { CACHE.meses.set(chaveMes, d); setLido({ chave: chaveMes, dados: d }); } })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar o calendário.'); })
      .finally(() => { if (vivo) setCarregandoMes(false); });
    return () => { vivo = false; };
  }, [empresaId, setorId, mes, chaveMes, podeLerMes, versao]);

  // O mês na tela: o lido agora, senão o guardado, senão o último deste setor.
  const doCache = chaveMes ? CACHE.meses.get(chaveMes) : undefined;
  const mesmoSetor = !!lido && !!setorId && lido.chave.startsWith(`${base}|${setorId}|`);
  const dados = lido?.chave === chaveMes ? lido.dados : doCache ?? (mesmoSetor ? lido!.dados : MES_VAZIO);
  const mesPronto = lido?.chave === chaveMes || !!doCache || mesmoSetor;

  // 3. O dia útil oficial.
  const { ano, mes: m } = partesDoMes(mes);
  const chaveFeriados = `${empresaId}|${ano}-${m}`;
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    const lidos = () => { if (vivo) setFeriadosLidos(v => v + 1); };
    if (produto === 'comercial') {
      void buscarCalendario(empresaId, ano, m)
        .then(c => CACHE.vendas.set(chaveFeriados, c))
        .catch(() => { if (!CACHE.vendas.has(chaveFeriados)) CACHE.vendas.set(chaveFeriados, CALENDARIO_PADRAO); })
        .finally(lidos);
    } else {
      void getMetasConfig(empresaId, m, ano)
        .then(r => CACHE.metas.set(chaveFeriados, r))
        .catch(() => { if (!CACHE.metas.has(chaveFeriados)) CACHE.metas.set(chaveFeriados, { data: null }); })
        .finally(lidos);
    }
    return () => { vivo = false; };
  }, [empresaId, produto, ano, m, chaveFeriados, versao]);

  const calVendas = CACHE.vendas.get(chaveFeriados) ?? CALENDARIO_PADRAO;
  // Os feriados DO SETOR aberto: a exceção dele, se tiver; senão os gerais.
  const fonteMetas = CACHE.metas.get(chaveFeriados);
  const feriadosMetas = useMemo(
    () => (fonteMetas ? diasUteisDoSetor(fonteMetas, setorId).feriados : undefined),
    [fonteMetas, setorId],
  );
  const feriadosOficiais = produto === 'comercial' ? calVendas.feriados : (feriadosMetas ?? SEM_FERIADOS);
  const ehDiaUtil = useCallback((iso: string) => {
    if (produto === 'comercial') return ehDiaUtilComercial(iso, calVendas);
    return ehSegundaASexta(iso) && !(feriadosMetas ?? SEM_FERIADOS).includes(iso);
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
    mesPronto,
    feriadosOficiais,
    ehDiaUtil,
    carregandoSetores,
    carregandoMes,
    erro,
    recarregar,
  };
}
