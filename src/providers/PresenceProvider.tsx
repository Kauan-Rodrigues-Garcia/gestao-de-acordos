/**
 * src/providers/PresenceProvider.tsx
 *
 * Quem está online, para a aplicação inteira — uma fonte só, lida por Context.
 *
 * ── Na hora, sem o Presence do Realtime (05/10/2026) ─────────────────────────
 * Até 05/10 era o canal `presence-global` do Supabase Presence, e o log seguia
 * acusando `PresenceRateLimitReached` em todo deploy. O Presence tem o teto
 * mais baixo do Realtime (Pro: 50 mensagens por segundo) e avisa cada entrada
 * a todo o canal; recarregar 150 abas estourava.
 *
 * Agora são duas peças (migrations 20261005150000 e 20261005170000):
 *
 *   A batida   `fn_presenca_bater` a cada `BATIDA_MS`: grava «estou aqui» e
 *              devolve quem está online — só quando a lista mudou desde a
 *              versão que a aba já tem. É a VERDADE, e é o que corrige um
 *              aviso perdido ou quem caiu sem avisar (some em até 150 s).
 *   O aviso    o banco manda «entrou»/«saiu» no tópico `presenca:global`
 *              (Broadcast, privado) no instante em que acontece. É o que faz o
 *              online ser na hora. Mensagem comum, não Presence: outro teto
 *              (Pro: 500/s), e renovação de batida não gera aviso nenhum.
 *
 * A regra que junta as duas está em `presencaAoVivo.ts`.
 *
 * ── Recarregar não custa nada (05/10/2026, migration 20261005200000) ─────────
 * `fn_presenca_sair` (no `pagehide`) só MARCA a saída. Se a pessoa volta em
 * até 15 s — F5, deploy, ou a outra aba dela bate — a marca some e ninguém é
 * avisado: zero mensagens. Se não volta, o agendador do banco apaga a linha e
 * avisa «saiu». Quem caiu sem avisar (150 s sem batida) também sai por ele.
 * Do lado de cá, `GRACA_SAIDA_MS` só cobre a corrida entre esse «saiu» e uma
 * volta no mesmo instante.
 *
 * Duas abas da mesma pessoa: a que fecha avisa a irmã (`BroadcastChannel`),
 * e a irmã bate logo em seguida, apagando a marca de saída.
 *
 * ── Os dois conjuntos ────────────────────────────────────────────────────────
 *   `onlineIds`       — a empresa de quem olha (todas, para super_admin). É o
 *                       que o contador de `UsuariosOnline` mostra e o que as
 *                       telas de admin consultam.
 *   `onlineIdsGlobal` — a aplicação inteira. É o que o chat lê, porque o chat
 *                       cruza empresas (319 das 920 conversas).
 *
 * ── Aba escondida ────────────────────────────────────────────────────────────
 * Continua batendo: a pessoa está logada, só olhando outra janela. O navegador
 * espaça timers de aba escondida para até um por minuto, e a janela de 150 s
 * do banco cobre isso. Ao voltar para a aba, bate na hora.
 */
import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { criarMapaOnline, lerAviso, type MapaOnline } from './presencaAoVivo';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * A resposta de `fn_presenca_bater`: a versão da lista, a hora do banco e, só
 * quando a lista mudou desde a versão que a aba mandou, a lista — pares
 * [pessoa, empresa].
 */
interface RespostaBatida {
  versao: string;
  agora?: number;
  online?: [string, string | null][];
}

interface PresenceContextValue {
  /**
   * Quem está online DENTRO do recorte de quem olha: a própria empresa, ou
   * todas para o super_admin. É o que o contador de `UsuariosOnline` mostra e
   * o que as telas de admin consultam.
   */
  onlineIds: Set<string>;
  /**
   * Quem está online na aplicação INTEIRA, sem recorte. Existe para o chat,
   * que cruza empresas.
   */
  onlineIdsGlobal: Set<string>;
  /** true enquanto a primeira batida não voltou. */
  loading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PresenceContext = createContext<PresenceContextValue>({
  onlineIds: new Set(),
  onlineIdsGlobal: new Set(),
  loading: true,
});

/**
 * De quanto em quanto tempo a aba confirma que está aqui e confere a lista.
 * Não é o atraso de quem entra — esse é o do aviso, na hora.
 */
const BATIDA_MS = 60_000;

/**
 * Quanto um «saiu» espera antes de tirar a pessoa. Curto: o banco só avisa
 * depois de 15 s sem a pessoa voltar — o F5 já ficou para trás.
 */
const GRACA_SAIDA_MS = 3_000;

/**
 * Sorteio da primeira batida da página: num deploy as abas recarregam juntas,
 * e cada primeira batida é um «entrou» para todo mundo. Curto, porque é o
 * tempo de a pessoa voltar depois de um F5 — e precisa caber folgado nos 15 s
 * em que a saída fica só marcada no banco.
 */
const ESPALHAMENTO_INICIAL_MS = 3_000;

/** Voltar para a aba bate na hora, a não ser que a última batida seja recente. */
const RETOMADA_MINIMA_MS = 15_000;

/** A aba irmã que avisou que fechou: bater depois que o `sair` dela chegou. */
const ESPERA_APOS_IRMA_MS = 1_500;

const CANAL_ENTRE_ABAS = 'gestao-presenca-abas';

/** Dois conjuntos com os mesmos ids? Evita re-render do app inteiro à toa. */
function mesmosIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Cliente sem tipo: as funções ainda não estão em `database.types.ts`. */
function rpc<T>(nome: string, args?: Record<string, unknown>) {
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string } | null }>;
  };
  return cliente.rpc(nome, args);
}

/**
 * Sai da lista de online ao fechar a aba. `fetch` com `keepalive` porque o
 * navegador cancela requisição comum quando a página some; o token vem guardado
 * da última batida, porque no `pagehide` não dá tempo de esperar promessa.
 */
function sairSemEsperar(token: string | null): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!token || !url || !chave) return;
  try {
    void fetch(`${url}/rest/v1/rpc/fn_presenca_sair`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: chave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch((): void => undefined);
  } catch { /* a linha expira sozinha em 150 s */ }
}

function abrirCanalEntreAbas(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CANAL_ENTRE_ABAS) : null;
  } catch {
    return null;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [onlineIds, setOnlineIds]             = useState<Set<string>>(new Set());
  const [onlineIdsGlobal, setOnlineIdsGlobal] = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(true);

  /** O token da última batida — o `pagehide` não espera `getSession()`. */
  const tokenRef = useRef<string | null>(null);
  /** O mapa do ciclo atual (pessoa + empresa). Os avisos do Realtime caem nele. */
  const mapaRef = useRef<MapaOnline | null>(null);
  /** Pede uma batida ao ciclo atual — para a reconexão e a aba irmã. */
  const pedirBatidaRef = useRef<((ms: number) => void) | null>(null);

  const extrairConjuntos = useCallback(
    (linhas: readonly [string, string | null][]) => {
      const todos     = new Set<string>();
      const daEmpresa = new Set<string>();
      const souSuperAdmin = perfil?.perfil === 'super_admin';
      const minhaEmpresa  = empresa?.id;
      for (const [pessoa, daEmpresaDela] of linhas) {
        if (!pessoa) continue;
        todos.add(pessoa);
        // O super_admin atravessa as empresas: para ele os dois são o mesmo.
        if (souSuperAdmin || daEmpresaDela === minhaEmpresa) daEmpresa.add(pessoa);
      }
      return { todos, daEmpresa };
    },
    [perfil?.perfil, empresa?.id],
  );

  // ── A batida e o mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    const userId    = perfil?.id;
    const empresaId = empresa?.id;
    if (!userId || !empresaId) return;

    /** Este ciclo do efeito. Resposta de um ciclo anterior é ignorada. */
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ultimaBatida = 0;
    let batendo = false;
    let avisouErro = false;
    /** A versão da lista que esta aba já tem. Ciclo novo começa sem nenhuma. */
    let versao: string | null = null;

    const publicar = () => {
      if (!vivo) return;
      const { todos, daEmpresa } = extrairConjuntos(mapa.linhas());
      setOnlineIdsGlobal(prev => (mesmosIds(prev, todos)     ? prev : todos));
      setOnlineIds     (prev => (mesmosIds(prev, daEmpresa) ? prev : daEmpresa));
    };
    const mapa = criarMapaOnline({ graca: GRACA_SAIDA_MS, aoMudar: publicar });
    mapaRef.current = mapa;

    const agendar = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void bater(); }, ms);
    };
    pedirBatidaRef.current = agendar;

    const bater = async () => {
      if (!vivo || batendo) return;
      batendo = true;
      ultimaBatida = Date.now();
      try {
        const { data, error } = await rpc<RespostaBatida | null>('fn_presenca_bater', { p_empresa: empresaId, p_versao: versao });
        if (!vivo) return;
        if (error) {
          // Um aviso por ciclo: a próxima batida tenta de novo, e a tela segue
          // com o último conjunto que conhecia.
          if (!avisouErro) { avisouErro = true; console.warn('[Presença] batida falhou:', error.message); }
        } else {
          avisouErro = false;
          // Sem `online`: a lista é a mesma da versão que já se tem.
          if (data?.online) mapa.aplicarLista(data.online, Number(data.agora) || 0);
          versao = data?.versao ?? null;
          setLoading(false);
        }
        const { data: sessao } = await supabase.auth.getSession();
        tokenRef.current = sessao.session?.access_token ?? null;
      } catch (e) {
        if (vivo && !avisouErro) { avisouErro = true; console.warn('[Presença] batida falhou:', e); }
      } finally {
        batendo = false;
        if (vivo) agendar(BATIDA_MS);
      }
    };

    // Voltou para a aba, a rede voltou ou a página saiu do cache de navegação:
    // bate já, para a pessoa reaparecer e ver a lista de agora.
    const retomar = () => {
      if (!vivo || document.visibilityState === 'hidden') return;
      if (Date.now() - ultimaBatida < RETOMADA_MINIMA_MS) return;
      agendar(0);
    };
    const aoMostrar = (e: PageTransitionEvent) => { if (e.persisted) retomar(); };

    document.addEventListener('visibilitychange', retomar);
    window.addEventListener('online', retomar);
    window.addEventListener('pageshow', aoMostrar);

    agendar(Math.random() * ESPALHAMENTO_INICIAL_MS);

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      mapa.encerrar();
      if (mapaRef.current === mapa) mapaRef.current = null;
      if (pedirBatidaRef.current === agendar) pedirBatidaRef.current = null;
      document.removeEventListener('visibilitychange', retomar);
      window.removeEventListener('online', retomar);
      window.removeEventListener('pageshow', aoMostrar);
    };
  }, [perfil?.id, empresa?.id, extrairConjuntos]);

  // ── O aviso na hora, a aba irmã e a saída ──────────────────────────────────
  // À parte da batida: trocar de empresa não derruba o canal do Realtime.
  const userId = perfil?.id;
  useEffect(() => {
    if (!userId) return;

    const cancelarAviso = assinarTabela(
      { topico: 'presenca:global', escutas: [{ sinal: 'presenca' }] },
      {
        onSinal: payload => {
          const aviso = lerAviso(payload);
          if (aviso) mapaRef.current?.aplicarAviso(aviso);
        },
        // Avisos do intervalo se perderam: a batida traz a lista de agora.
        onReconectado: () => pedirBatidaRef.current?.(0),
      },
    );

    const irmas = abrirCanalEntreAbas();
    if (irmas) {
      irmas.onmessage = (e: MessageEvent) => {
        const m = e.data as { tipo?: string; pessoa?: string } | null;
        if (m?.tipo === 'saindo' && m.pessoa === userId) pedirBatidaRef.current?.(ESPERA_APOS_IRMA_MS);
      };
    }

    const aoEsconderPagina = () => {
      try { irmas?.postMessage({ tipo: 'saindo', pessoa: userId }); } catch { /* sem irmãs */ }
      sairSemEsperar(tokenRef.current);
    };
    window.addEventListener('pagehide', aoEsconderPagina);

    return () => {
      window.removeEventListener('pagehide', aoEsconderPagina);
      cancelarAviso();
      irmas?.close();
      // Logout (ou troca de pessoa): sai da lista com o token que ainda se tem.
      sairSemEsperar(tokenRef.current);
      tokenRef.current = null;
      setOnlineIds(new Set());
      setOnlineIdsGlobal(new Set());
      setLoading(true);
    };
  }, [userId]);

  return (
    <PresenceContext.Provider value={{ onlineIds, onlineIdsGlobal, loading }}>
      {children}
    </PresenceContext.Provider>
  );
}

// ── Hook consumidor ───────────────────────────────────────────────────────────

/**
 * Retorna os IDs dos usuários online.
 * Deve ser usado dentro de <PresenceProvider>.
 */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useOnlineUsers(): PresenceContextValue {
  return useContext(PresenceContext);
}
