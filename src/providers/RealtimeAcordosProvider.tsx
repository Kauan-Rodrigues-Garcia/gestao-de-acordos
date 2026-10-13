/**
 * src/providers/RealtimeAcordosProvider.tsx — o tempo real de `acordos`
 *
 * ─── UM CANAL PARA O APP INTEIRO ──────────────────────────────────────────────
 *  Cada hook (useAcordos, useAnalytics, usePainelMetas, métricas do Dashboard)
 *  registra um callback aqui e recebe os eventos, sem abrir canal próprio
 *  (antes, quatro canais por aba derrubavam a conexão).
 *
 * ─── O AVISO COM OS IDS (09/10/2026, migration 20261009220000) ───────────────
 *  Até aqui era Postgres Changes: uma assinatura por aba (~215), e cada
 *  mudança conferida contra a RLS de cada uma — parte dos 22,6% do tempo do
 *  banco que o tempo real consumia quando a máquina ficou sem memória.
 *
 *  Agora o banco manda, por comando, SÓ os ids que mudaram:
 *    `acordos-op:<eu>`       os meus acordos — todo mundo ouve
 *    `acordos:<empresa>`     os da empresa — só quem tem escopo além de «os
 *                            meus» (`ouveAEmpresa`, espelho da policy)
 *  e a tela relê esses ids com a RLS de sempre. Ninguém recebe o conteúdo de
 *  um acordo que não pode ler: o aviso não leva conteúdo, e a releitura volta
 *  vazia para o que está fora do alcance.
 *
 *  Os dois tópicos podem avisar o mesmo id (o líder dono do acordo): os avisos
 *  se juntam por `AGRUPAR_MS` e cada id é relido uma vez.
 *
 * ─── O QUE OS OUVINTES RECEBEM (igual a antes) ───────────────────────────────
 *  INSERT  registro completo com joins (perfis, setores)
 *  UPDATE  registro completo — quem guarda a lista faz o merge
 *  DELETE  só o id
 *  Aviso grande demais (importação) chega como «recarregar»: as consultas de
 *  acordos são invalidadas e cada ouvinte recebe um UPDATE sem registro, que
 *  os de releitura (métricas, analytics, metas) tratam como «mudou».
 *
 * ─── TIPOS EXPORTADOS ────────────────────────────────────────────────────────
 *  RealtimeStatus      → 'off' | 'connecting' | 'connected' | 'error'
 *  AcordoRealtimeEvent → { eventType, newRecord?, oldRecord? }
 *  useRealtimeAcordos  → hook que expõe { status, subscribe, unsubscribe }
 */
import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, type Acordo } from '@/lib/supabase';
import { assinarTabela, type EstadoCanal } from '@/lib/realtime';
import { useAuth }    from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes, type PermissoesMap } from '@/hooks/useCargoPermissoes';
import { useNaRotaDoCelular } from '@/lib/mobile/rota';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type RealtimeStatus = 'off' | 'connecting' | 'connected' | 'error';

export interface AcordoRealtimeEvent {
  /** Tipo do evento */
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  /**
   * INSERT e UPDATE: registro completo com joins (perfis, setores), relido com
   * a RLS de quem ouve. Ausente no UPDATE de «recarregar».
   */
  newRecord?: Acordo;
  /** DELETE: apenas o id é garantido */
  oldRecord?: { id: string };
}

type Subscriber = (event: AcordoRealtimeEvent) => void;

/** Janela em que os avisos dos dois tópicos se juntam numa releitura. */
export const AGRUPAR_MS = 300;
/** Status «caído» só aparece se o canal não voltar neste tempo (troca de aba volta em ~1 s). */
export const TOLERANCIA_QUEDA_MS = 3_000;
/** Ids por `in(...)` na releitura: a lista vai na URL. */
const IDS_POR_LEITURA = 100;

const SELECT_COMPLETO = '*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)';
const ESCUTAS = [{ sinal: 'mudou' }];

interface RealtimeContextValue {
  /** Estado da conexão — use para indicador visual */
  status: RealtimeStatus;
  /**
   * Registra um subscriber para eventos de acordos.
   * Chame no mount do hook, passe um id único por instância.
   */
  subscribe: (id: string, cb: Subscriber) => void;
  /** Remove um subscriber — chame no cleanup do useEffect */
  unsubscribe: (id: string) => void;
}

// ── Context (safe default: no-op) ─────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextValue>({
  status:      'off',
  subscribe:   () => {},
  unsubscribe: () => {},
});

// ── Hook público ──────────────────────────────────────────────────────────────

/** Acessa o canal Realtime centralizado. Disponível dentro de RealtimeAcordosProvider. */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useRealtimeAcordos(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

// ── O aviso do banco ──────────────────────────────────────────────────────────

interface Pendentes {
  inseridos:  Set<string>;
  alterados:  Set<string>;
  apagados:   Set<string>;
  recarregar: boolean;
}

function novosPendentes(): Pendentes {
  return { inseridos: new Set(), alterados: new Set(), apagados: new Set(), recarregar: false };
}

/** Junta um aviso (`{ operacao, ids }` ou `{ recarregar }`) ao que está pendente. */
// eslint-disable-next-line react-refresh/only-export-components -- pura, exportada para teste.
export function juntarAviso(p: Pendentes, aviso: Record<string, unknown>): void {
  if (aviso.recarregar === true) { p.recarregar = true; return; }
  const ids = Array.isArray(aviso.ids) ? aviso.ids.filter((x): x is string => typeof x === 'string') : [];
  const destino = aviso.operacao === 'DELETE' ? p.apagados
    : aviso.operacao === 'INSERT' ? p.inseridos
    : p.alterados;
  for (const id of ids) destino.add(id);
}

/**
 * As abas que leem `acordos` e o interruptor de cada uma — as mesmas de
 * `fn_user_escopo_acordos()` (migration 20260823010000). Dashboard não tem
 * interruptor.
 */
const ABAS_DE_ACORDOS: ReadonlyArray<readonly [aba: string, chave: string | null]> = [
  ['dashboard',        null],
  ['acordos',          'ver_acordos'],
  ['lixeira',          'ver_lixeira'],
  ['pix',              'ver_pix_automatico'],
  ['painel_lider',     'ver_painel_lider'],
  ['painel_diretoria', 'ver_painel_diretoria'],
];
const NIVEIS_ALEM_DOS_MEUS = ['equipe', 'setor', 'todos_setores'] as const;

/**
 * A pessoa passa na policy `acordos_sinal_empresa`? Espelho, em memória, de
 * `fn_user_escopo_acordos() >= 1 OR fn_user_is_super_admin()`.
 *
 * Lê as permissões do CARGO, sem as exceções da pessoa — é o que a função do
 * banco lê. Assinar sem passar não traz nada: o servidor recusa o join e loga
 * um ERROR (13/10/2026: era a maior parte do vermelho do Realtime).
 */
// eslint-disable-next-line react-refresh/only-export-components -- pura, exportada para teste.
export function ouveAEmpresa(cargo: string | null | undefined, permissoesDoCargo: PermissoesMap): boolean {
  if (cargo === 'super_admin') return true;
  return ABAS_DE_ACORDOS.some(([aba, chave]) =>
    (chave === null || permissoesDoCargo[chave] === true)
    && NIVEIS_ALEM_DOS_MEUS.some(nivel => permissoesDoCargo[`${aba}_escopo_${nivel}`] === true));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function RealtimeAcordosProvider({ children }: { children: ReactNode }) {
  const { perfil }    = useAuth();
  const { empresa }   = useEmpresa();
  const queryClient   = useQueryClient();
  // As telas do celular (`/m`, `/m/equipe`) não mostram acordo nenhum: lá o
  // canal só gastaria bateria, dados e uma assinatura no servidor por aparelho.
  // Sair para a versão completa religa (30/09/2026).
  const naRotaDoCelular = useNaRotaDoCelular();

  const [status, setStatus] = useState<RealtimeStatus>('off');

  // Registry: id → callback
  const subscribersRef = useRef<Map<string, Subscriber>>(new Map());
  const mountedRef     = useRef(true);
  /** Onde os avisos do tópico da empresa entram — o agrupamento do tópico do dono. */
  const receptorRef    = useRef<{
    aoAviso:      (payload: Record<string, unknown>) => void;
    aoReconectar: () => void;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // subscribe/unsubscribe são estáveis — não causam re-renders nos subscribers
  const subscribe = useCallback((id: string, cb: Subscriber) => {
    subscribersRef.current.set(id, cb);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const perfilId  = perfil?.id ?? null;
  // Enquanto as permissões carregam vale «não»: o tópico entra quando chegarem.
  const { permissoes: permissoesDoCargo } = useCargoPermissoes();
  const ouveEmpresa = ouveAEmpresa(perfil?.perfil, permissoesDoCargo);

  useEffect(() => {
    if (!empresaId || !perfilId) return;
    if (naRotaDoCelular) { setStatus('off'); return; }

    let vivo = true;
    let pendentes = novosPendentes();
    let timerAgrupar: ReturnType<typeof setTimeout> | null = null;
    let timerQueda:   ReturnType<typeof setTimeout> | null = null;

    const avisar = (event: AcordoRealtimeEvent) => {
      subscribersRef.current.forEach(cb => cb(event));
    };

    const processar = async () => {
      timerAgrupar = null;
      const p = pendentes;
      pendentes = novosPendentes();
      if (!vivo || !mountedRef.current) return;

      if (p.recarregar) {
        void queryClient.invalidateQueries({ queryKey: ['acordos'] });
        avisar({ eventType: 'UPDATE' });
      }

      for (const id of p.apagados) avisar({ eventType: 'DELETE', oldRecord: { id } });

      // Sem tela ouvindo, a releitura com joins iria para ninguém — quem montar
      // a lista depois lê do banco.
      const reler = [...new Set([...p.inseridos, ...p.alterados])].filter(id => !p.apagados.has(id));
      if (!reler.length || subscribersRef.current.size === 0) return;

      for (let i = 0; i < reler.length; i += IDS_POR_LEITURA) {
        const pedaco = reler.slice(i, i + IDS_POR_LEITURA);
        const { data, error } = await supabase.from('acordos').select(SELECT_COMPLETO).in('id', pedaco);
        if (error || !data || !vivo || !mountedRef.current) continue;
        // O que não voltou está fora do alcance de quem ouve (ou já saiu): nada a avisar.
        for (const linha of data as Acordo[]) {
          avisar({ eventType: p.inseridos.has(linha.id) ? 'INSERT' : 'UPDATE', newRecord: linha });
        }
      }
    };

    const aoAviso = (payload: Record<string, unknown>) => {
      juntarAviso(pendentes, payload);
      if (!timerAgrupar) timerAgrupar = setTimeout(() => { void processar(); }, AGRUPAR_MS);
    };

    // Avisos perdidos durante a queda: relê o que estiver na tela.
    const aoReconectar = () => {
      void queryClient.invalidateQueries({ queryKey: ['acordos'] });
      avisar({ eventType: 'UPDATE' });
    };

    // O indicador segue o tópico do dono — todo mundo o ouve. O da empresa
    // ainda pode ser recusado (permissão mudou e o mapa não chegou), e isso não
    // é queda.
    const aoEstado = (estado: EstadoCanal) => {
      if (!vivo || !mountedRef.current) return;
      if (estado === 'conectado') {
        if (timerQueda) { clearTimeout(timerQueda); timerQueda = null; }
        setStatus('connected');
        return;
      }
      if (estado === 'barrado') { setStatus('off'); return; }
      if (timerQueda) return;
      timerQueda = setTimeout(() => {
        timerQueda = null;
        if (vivo && mountedRef.current) setStatus('error');
      }, TOLERANCIA_QUEDA_MS);
    };

    setStatus('connecting');
    const sairDono = assinarTabela(
      { topico: `acordos-op:${perfilId}`, escutas: ESCUTAS },
      { onSinal: aoAviso, onReconectado: aoReconectar, onEstado: aoEstado },
    );
    receptorRef.current = { aoAviso, aoReconectar };

    return () => {
      vivo = false;
      receptorRef.current = null;
      if (timerAgrupar) clearTimeout(timerAgrupar);
      if (timerQueda) clearTimeout(timerQueda);
      sairDono();
    };
  }, [empresaId, perfilId, queryClient, naRotaDoCelular]);

  // O tópico da empresa em efeito próprio: as permissões chegam depois do
  // perfil, e ligar este não pode derrubar e refazer o do dono. Os avisos caem
  // no mesmo agrupamento do efeito de cima (declarado antes, roda antes).
  useEffect(() => {
    if (!empresaId || !perfilId || naRotaDoCelular || !ouveEmpresa) return;
    return assinarTabela(
      { topico: `acordos:${empresaId}`, escutas: ESCUTAS },
      {
        onSinal:       (payload) => receptorRef.current?.aoAviso(payload),
        onReconectado: () => receptorRef.current?.aoReconectar(),
      },
    );
  }, [empresaId, perfilId, ouveEmpresa, naRotaDoCelular]);

  return (
    <RealtimeContext.Provider value={{ status, subscribe, unsubscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
