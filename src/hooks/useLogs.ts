/**
 * src/hooks/useLogs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Estado da tela de Logs: filtros, período, paginação, agregados e tempo real.
 *
 * ## Decisões que a tela depende
 *
 * **Período é sempre explícito.** A versão 1.0 pedia "as últimas 200 linhas" sem
 * recorte de tempo: numa base ativa, isso é "a última meia hora", e a tela
 * parecia vazia de história. Aqui o padrão é 7 dias, e o período escolhido
 * governa tudo — lista, números e gráfico.
 *
 * **Tempo real é opt-in.** Auditoria é leitura investigativa: linha nova
 * empurrando a lista para baixo enquanto se examina um evento atrapalha. Com
 * "ao vivo" desligado (padrão), as chegadas são contadas e mostradas num botão
 * — quem quiser vê-las, clica.
 *
 * **Números vêm do banco.** `fetchResumoLogs` agrega o filtro inteiro; a lista
 * é só a página visível. Contar no navegador descreveria 50 linhas e chamaria o
 * resultado de total.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LogSistema } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  fetchLogs,
  fetchResumoLogs,
  fetchOpcoesFiltro,
  LOGS_POR_PAGINA,
  RESUMO_VAZIO,
  type FiltrosLogs,
  type ResumoLogs,
  type OpcoesFiltro,
} from '@/services/logs.service';

// ═══════════════════════════════════════════════════════════════════════════
// Período
// ═══════════════════════════════════════════════════════════════════════════
export type PeriodoPreset = 'hoje' | '24h' | '7d' | '30d' | '90d' | 'tudo' | 'custom';

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  hoje:   'Hoje',
  '24h':  'Últimas 24h',
  '7d':   '7 dias',
  '30d':  '30 dias',
  '90d':  '90 dias',
  tudo:   'Tudo',
  custom: 'Personalizado',
};

/**
 * Converte o preset em intervalo ISO.
 *
 * "Hoje" começa à meia-noite LOCAL, não 24h atrás: quem pergunta "o que
 * aconteceu hoje" às 9h da manhã não quer os eventos de ontem à tarde.
 */
export function intervaloDoPeriodo(
  periodo: PeriodoPreset,
  customDe?: string | null,
  customAte?: string | null,
): { de: string | null; ate: string | null } {
  const agora = new Date();

  switch (periodo) {
    case 'hoje': {
      const inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      return { de: inicio.toISOString(), ate: null };
    }
    case '24h':
      return { de: new Date(agora.getTime() - 24 * 3600_000).toISOString(), ate: null };
    case '7d':
      return { de: new Date(agora.getTime() - 7 * 86_400_000).toISOString(), ate: null };
    case '30d':
      return { de: new Date(agora.getTime() - 30 * 86_400_000).toISOString(), ate: null };
    case '90d':
      return { de: new Date(agora.getTime() - 90 * 86_400_000).toISOString(), ate: null };
    case 'tudo':
      return { de: null, ate: null };
    case 'custom': {
      // <input type="date"> devolve "2026-08-12". Interpretado direto pelo
      // `Date`, isso é meia-noite UTC — 21h do dia anterior em São Paulo, e o
      // filtro traria um dia a mais no começo e cortaria o fim.
      const de = customDe ? new Date(`${customDe}T00:00:00`).toISOString() : null;
      const ate = customAte ? new Date(`${customAte}T23:59:59.999`).toISOString() : null;
      return { de, ate };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════
export interface FiltrosTela {
  periodo: PeriodoPreset;
  customDe: string | null;
  customAte: string | null;
  categoria: string | null;
  severidade: string | null;
  acao: string | null;
  usuarioId: string | null;
  tabela: string | null;
  origem: string | null;
  campo: string | null;
  busca: string;
  empresaId: string | null;
}

export const FILTROS_INICIAIS: FiltrosTela = {
  periodo: '7d',
  customDe: null,
  customAte: null,
  categoria: null,
  severidade: null,
  acao: null,
  usuarioId: null,
  tabela: null,
  origem: null,
  campo: null,
  busca: '',
  empresaId: null,
};

interface UseLogsReturn {
  logs: LogSistema[];
  resumo: ResumoLogs;
  opcoes: OpcoesFiltro;
  total: number;
  temMais: boolean;
  carregando: boolean;
  carregandoMais: boolean;
  carregandoResumo: boolean;
  filtros: FiltrosTela;
  filtrosAtivos: number;
  setFiltro: <K extends keyof FiltrosTela>(chave: K, valor: FiltrosTela[K]) => void;
  limparFiltros: () => void;
  carregarMais: () => void;
  recarregar: () => void;
  aoVivo: boolean;
  setAoVivo: (v: boolean) => void;
  novosDesdeCarga: number;
  /** `null` até o primeiro carregamento terminar. */
  atualizadoEm: Date | null;
  /** Filtros no formato do serviço — a exportação usa o mesmo recorte da tela. */
  filtrosServico: FiltrosLogs;
}

export function useLogs(): UseLogsReturn {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const isSuperAdmin = perfil?.perfil === 'super_admin';

  const [filtros, setFiltros] = useState<FiltrosTela>(FILTROS_INICIAIS);
  const [logs, setLogs] = useState<LogSistema[]>([]);
  const [resumo, setResumo] = useState<ResumoLogs>(RESUMO_VAZIO);
  const [opcoes, setOpcoes] = useState<OpcoesFiltro>({ usuarios: [], acoes: [], tabelas: [] });
  const [total, setTotal] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [aoVivo, setAoVivo] = useState(false);
  const [novosDesdeCarga, setNovosDesdeCarga] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [gatilho, setGatilho] = useState(0);

  // Empresa efetiva: super_admin escolhe; os demais ficam na própria, e o
  // seletor de empresa nem aparece na tela.
  const empresaEfetiva = isSuperAdmin ? filtros.empresaId : (empresa?.id ?? null);

  const filtrosServico = useMemo<FiltrosLogs>(() => {
    const { de, ate } = intervaloDoPeriodo(filtros.periodo, filtros.customDe, filtros.customAte);
    return {
      empresaId: empresaEfetiva,
      de,
      ate,
      categoria: filtros.categoria,
      severidade: filtros.severidade,
      acao: filtros.acao,
      usuarioId: filtros.usuarioId,
      tabela: filtros.tabela,
      origem: filtros.origem,
      campo: filtros.campo,
      busca: filtros.busca,
    };
  }, [
    empresaEfetiva, filtros.periodo, filtros.customDe, filtros.customAte,
    filtros.categoria, filtros.severidade, filtros.acao, filtros.usuarioId,
    filtros.tabela, filtros.origem, filtros.campo, filtros.busca,
  ]);

  // A busca livre entra no filtro com atraso: sem isso, "joão" dispara cinco
  // consultas (j, jo, joa, joã, joão) e a última a responder nem sempre é a
  // última digitada.
  const [buscaDebounced, setBuscaDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(filtros.busca.trim()), 350);
    return () => clearTimeout(t);
  }, [filtros.busca]);

  const filtrosEfetivos = useMemo<FiltrosLogs>(
    () => ({ ...filtrosServico, busca: buscaDebounced || null }),
    [filtrosServico, buscaDebounced],
  );

  // Chave estável do filtro: dispara recarga quando qualquer critério muda, sem
  // depender da identidade do objeto (que muda a cada render).
  const chaveFiltro = JSON.stringify(filtrosEfetivos);

  // ── Página 0 + agregados ──────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setCarregandoResumo(true);
    setPagina(0);
    setNovosDesdeCarga(0);

    (async () => {
      const [pag, res] = await Promise.all([
        fetchLogs(filtrosEfetivos, 0),
        fetchResumoLogs(filtrosEfetivos),
      ]);
      if (!vivo) return;
      setLogs(pag.logs);
      setTotal(pag.total);
      setTemMais(pag.temMais);
      setResumo(res);
      setCarregando(false);
      setCarregandoResumo(false);
      setAtualizadoEm(new Date());
    })();

    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chaveFiltro serializa filtrosEfetivos; incluir o objeto recarregaria a cada render.
  }, [chaveFiltro, gatilho]);

  // ── Opções dos seletores ──────────────────────────────────────────────────
  // Sem os filtros de recorte (categoria, ação, autor): a lista de autores tem
  // de continuar oferecendo os outros autores depois de escolher um, senão o
  // seletor fica com uma única opção — a que já está escolhida.
  useEffect(() => {
    let vivo = true;
    const { de } = intervaloDoPeriodo(filtros.periodo, filtros.customDe, filtros.customAte);
    fetchOpcoesFiltro(empresaEfetiva, de).then((o) => { if (vivo) setOpcoes(o); });
    return () => { vivo = false; };
  }, [empresaEfetiva, filtros.periodo, filtros.customDe, filtros.customAte]);

  // ── Tempo real ────────────────────────────────────────────────────────────
  // Um canal só, ligado enquanto a tela vive. Com "ao vivo" ligado a linha nova
  // entra no topo; desligado, só o contador sobe.
  const filtrosRef = useRef(filtrosEfetivos);
  filtrosRef.current = filtrosEfetivos;
  const aoVivoRef = useRef(aoVivo);
  aoVivoRef.current = aoVivo;

  useEffect(() => {
    if (!empresaEfetiva && !isSuperAdmin) return;

    const canal = supabase
      .channel(`logs-sistema-${empresaEfetiva ?? 'todas'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'logs_sistema' },
        (payload) => {
          const novo = payload.new as LogSistema;

          // O realtime não aplica os filtros da tela — só o RLS. Uma linha de
          // outra empresa ou fora do recorte não pode entrar na lista.
          if (empresaEfetiva && novo.empresa_id !== empresaEfetiva) return;
          if (!combinaComFiltro(novo, filtrosRef.current)) return;

          setNovosDesdeCarga((n) => n + 1);

          if (aoVivoRef.current) {
            setLogs((atuais) => {
              if (atuais.some((l) => l.id === novo.id)) return atuais;
              // Mantém o tamanho da página: a lista não cresce sem limite numa
              // aba aberta a manhã inteira.
              return [novo, ...atuais].slice(0, Math.max(LOGS_POR_PAGINA, atuais.length));
            });
            setTotal((t) => t + 1);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [empresaEfetiva, isSuperAdmin]);

  // ── Ações ─────────────────────────────────────────────────────────────────
  const setFiltro = useCallback(
    <K extends keyof FiltrosTela>(chave: K, valor: FiltrosTela[K]) => {
      setFiltros((f) => ({ ...f, [chave]: valor }));
    },
    [],
  );

  const limparFiltros = useCallback(() => {
    setFiltros((f) => ({ ...FILTROS_INICIAIS, empresaId: f.empresaId }));
  }, []);

  const carregarMais = useCallback(async () => {
    if (carregandoMais || !temMais) return;
    setCarregandoMais(true);
    const proxima = pagina + 1;
    const pag = await fetchLogs(filtrosRef.current, proxima);
    setLogs((atuais) => {
      // Filtra ids já presentes: entre uma página e outra pode ter entrado linha
      // nova, o que empurra o offset e repetiria registros na emenda.
      const vistos = new Set(atuais.map((l) => l.id));
      return [...atuais, ...pag.logs.filter((l) => !vistos.has(l.id))];
    });
    setTotal(pag.total);
    setTemMais(pag.temMais);
    setPagina(proxima);
    setCarregandoMais(false);
  }, [carregandoMais, temMais, pagina]);

  const recarregar = useCallback(() => setGatilho((g) => g + 1), []);

  const filtrosAtivos = useMemo(() => {
    let n = 0;
    if (filtros.categoria) n++;
    if (filtros.severidade) n++;
    if (filtros.acao) n++;
    if (filtros.usuarioId) n++;
    if (filtros.tabela) n++;
    if (filtros.origem) n++;
    if (filtros.campo) n++;
    if (filtros.busca.trim()) n++;
    if (filtros.periodo !== FILTROS_INICIAIS.periodo) n++;
    return n;
  }, [filtros]);

  return {
    logs, resumo, opcoes, total, temMais,
    carregando, carregandoMais, carregandoResumo,
    filtros, filtrosAtivos, setFiltro, limparFiltros,
    carregarMais, recarregar,
    aoVivo, setAoVivo, novosDesdeCarga, atualizadoEm,
    filtrosServico: filtrosEfetivos,
  };
}

/**
 * A linha que chegou pelo realtime pertence ao recorte da tela?
 *
 * Repete no cliente o `WHERE` que o serviço manda ao banco. Só os critérios
 * baratos: a busca livre por texto fica de fora de propósito — reimplementar
 * `ILIKE` aqui daria resultado diferente do banco em acento e caixa, e uma
 * lista que discorda do seu próprio filtro é pior do que uma que espera o
 * próximo recarregamento.
 */
export function combinaComFiltro(log: LogSistema, f: FiltrosLogs): boolean {
  if (f.categoria && log.categoria !== f.categoria) return false;
  if (f.severidade && log.severidade !== f.severidade) return false;
  if (f.acao && log.acao !== f.acao) return false;
  if (f.usuarioId && log.usuario_id !== f.usuarioId) return false;
  if (f.tabela && log.tabela !== f.tabela) return false;
  if (f.origem && log.origem !== f.origem) return false;
  if (f.campo && !(log.campos ?? []).includes(f.campo)) return false;
  if (f.de && new Date(log.criado_em) < new Date(f.de)) return false;
  if (f.ate && new Date(log.criado_em) > new Date(f.ate)) return false;
  if (f.busca?.trim()) return false;
  return true;
}
