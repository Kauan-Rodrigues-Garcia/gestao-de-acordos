/**
 * src/providers/PresenceProvider.tsx
 *
 * Quem está online, para a aplicação inteira — uma fonte só, lida por Context.
 *
 * ── Batida no banco, e não Presence do Realtime (05/10/2026) ─────────────────
 * Até aqui era o canal `presence-global` do Supabase Realtime. Um mês de
 * remendos (sem re-track, entrada sorteada, espera depois do limite, recarga
 * do deploy só na troca de tela) baixou os erros, mas não os tirou: o log de
 * 05/10 ainda tinha 25 `PresenceRateLimitReached` numa manhã. No Presence, cada
 * entrada de uma pessoa é avisada a TODAS as outras do canal — o custo cresce
 * com o quadrado de quem está logado, e o teto é do projeto inteiro.
 *
 * Agora cada aba chama `fn_presenca_bater` a cada `BATIDA_MS` (15 s). A mesma
 * chamada grava «estou aqui» e diz quem bateu nos últimos 150 s (migration
 * 20261005150000). É uma requisição HTTP comum: não passa pelo Realtime e não
 * tem limite de eventos para estourar.
 *
 * A lista só viaja quando muda: a aba manda a `versao` que já tem e, se ela
 * ainda vale, volta só a versão. 150 pessoas = 10 chamadas por segundo de uns
 * 50 bytes; a lista inteira a cada 15 s seriam gigabytes por dia.
 *
 * O que muda para quem olha: alguém que ENTRA aparece online em até 15 s
 * (antes, na hora). Quem fecha a aba sai na batida seguinte de cada um —
 * `fn_presenca_sair` no `pagehide` — e, se nem isso chegar (máquina desligada
 * no botão), some sozinho em 150 s.
 *
 * ── Os dois conjuntos ────────────────────────────────────────────────────────
 *   `onlineIds`       — a empresa de quem olha (todas, para super_admin). É o
 *                       que o contador de `UsuariosOnline` mostra e o que as
 *                       telas de admin consultam.
 *   `onlineIdsGlobal` — a aplicação inteira. É o que o chat lê, porque o chat
 *                       cruza empresas (319 das 920 conversas).
 *
 * Os dois saem da MESMA resposta, numa passada só.
 *
 * ── Aba escondida ────────────────────────────────────────────────────────────
 * Continua batendo: a pessoa está logada, só olhando outra janela — como era no
 * Presence, que mantinha a presença enquanto o socket vivesse. O navegador
 * espaça timers de aba escondida para até um por minuto; a janela de 150 s do
 * banco cobre duas batidas atrasadas. Ao voltar para a aba, bate na hora. É só
 * para isso e para a queda sem aviso que a janela é longa: ela não atrasa a
 * entrada de ninguém, quem decide isso é a batida de 15 s.
 */
import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * A resposta de `fn_presenca_bater`: a versão da lista e, só quando ela mudou
 * desde a versão que a aba mandou, a lista — pares [pessoa, empresa].
 */
interface RespostaBatida {
  versao: string;
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
 * De quanto em quanto tempo a aba avisa que está aqui e relê quem está. É o
 * atraso máximo para alguém que entra aparecer para os outros.
 */
const BATIDA_MS = 15_000;

/**
 * Sorteio da primeira batida da página. Não é por limite — o banco aguenta a
 * onda de um deploy —, é para as 150 abas recarregando juntas não caírem no
 * mesmo segundo.
 */
const ESPALHAMENTO_INICIAL_MS = 3_000;

/** Voltar para a aba bate na hora, a não ser que a última batida seja recente. */
const RETOMADA_MINIMA_MS = 5_000;

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

// ── Provider ──────────────────────────────────────────────────────────────────

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [onlineIds, setOnlineIds]             = useState<Set<string>>(new Set());
  const [onlineIdsGlobal, setOnlineIdsGlobal] = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(true);

  /** O token da última batida — o `pagehide` não espera `getSession()`. */
  const tokenRef = useRef<string | null>(null);

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

    const agendar = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void bater(); }, ms);
    };

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
          if (data?.online) {
            const { todos, daEmpresa } = extrairConjuntos(data.online);
            setOnlineIdsGlobal(prev => (mesmosIds(prev, todos)     ? prev : todos));
            setOnlineIds     (prev => (mesmosIds(prev, daEmpresa) ? prev : daEmpresa));
          }
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
    const aoEsconderPagina = () => sairSemEsperar(tokenRef.current);

    document.addEventListener('visibilitychange', retomar);
    window.addEventListener('online', retomar);
    window.addEventListener('pageshow', aoMostrar);
    window.addEventListener('pagehide', aoEsconderPagina);

    agendar(Math.random() * ESPALHAMENTO_INICIAL_MS);

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', retomar);
      window.removeEventListener('online', retomar);
      window.removeEventListener('pageshow', aoMostrar);
      window.removeEventListener('pagehide', aoEsconderPagina);
    };
  }, [perfil?.id, empresa?.id, extrairConjuntos]);

  // Logout: sai da lista com o token que ainda se tem. Trocar de empresa não
  // passa por aqui — a próxima batida já grava a empresa nova.
  const userId = perfil?.id;
  useEffect(() => {
    if (!userId) return;
    return () => {
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
