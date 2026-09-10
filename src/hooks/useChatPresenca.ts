/**
 * useChatPresenca.ts — quem está online, e o que a pessoa está fazendo.
 *
 * ## Por que fora do `assinarTabela`
 *
 * O helper compartilhado cuida de `postgres_changes` e diz, no próprio
 * cabeçalho, que Presence tem `track`/heartbeat próprios e fica de fora. É
 * correto: presença não é linha de tabela. Gravar "fulano está digitando" no
 * banco seriam milhares de escritas por hora para mostrar três pontinhos, e
 * ainda deixaria lixo quando o navegador fechasse sem avisar.
 *
 * Aqui o canal é do Supabase Realtime puro, e só de `broadcast`: a atividade
 * («digitando», «gravando») nasce e morre no ar. Nada disso sobrevive a um F5,
 * e é essa a intenção — informação que só vale agora não deve durar mais que
 * agora.
 *
 * ## Quem está online NÃO é medido aqui
 *
 * Já foi. Este hook mantinha um `track()` próprio no canal `presenca-chat`, e
 * o `PresenceProvider` mantinha outro no canal da empresa — dois eventos de
 * presence por pessoa logada para responder a mesma pergunta.
 *
 * O orçamento de eventos de presence do Realtime é do TENANT, não do canal:
 * os dois canais dividiam o mesmo teto, e o log acusava 903
 * `PresenceRateLimitReached` por dia. Agora o `track` é um só, no
 * `PresenceProvider`, e aqui se lê o resultado.
 *
 * O conjunto lido é o GLOBAL, não o da empresa: o chat cruza empresas — 319
 * das 920 conversas têm participantes de empresas diferentes —, e o recorte
 * por empresa deixaria um terço dos contatos eternamente «offline».
 *
 * ## Duas atividades, uma marca por pessoa
 *
 * `digitando` e `gravando` são estados EXCLUSIVOS: ninguém digita e grava ao
 * mesmo tempo, e a marca mais recente ganha. Guardar as duas em um mapa só (com
 * a atividade dentro) é o que garante isso — dois `Set` paralelos deixariam a
 * pessoa aparecer como "digitando" e "gravando áudio" ao mesmo tempo assim que
 * uma das marcas expirasse antes da outra.
 *
 * ## A marca tem que se apagar sozinha
 *
 * Quem digita e fecha a aba não manda o aviso de parou. Por isso cada marca
 * carrega a hora, e some sozinha depois de `VALIDADE_ATIVIDADE` — o pior caso
 * vira três segundos de pontinhos a mais, e não um "digitando…" eterno que faz
 * a pessoa do outro lado esperar uma resposta que não vem.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineUsers } from '@/providers/PresenceProvider';

/** Depois disso a marca de atividade é considerada velha e some. */
const VALIDADE_ATIVIDADE = 3000;
/** Enquanto a pessoa escreve (ou grava), reavisa neste ritmo. */
const RITMO_AVISO = 1500;

export type AtividadeChat = 'digitando' | 'gravando';

export interface UseChatPresenca {
  /** Ids de quem está com o chat aberto agora. */
  online: Set<string>;
  /** Ids de quem está digitando PARA MIM agora. */
  digitando: Set<string>;
  /** Ids de quem está gravando um áudio PARA MIM agora. */
  gravando: Set<string>;
  /** Avisa o que estou fazendo nesta conversa. Chamar a cada tecla é barato. */
  avisarAtividade: (paraId: string, atividade: AtividadeChat) => void;
  /** Açúcar para o caso mais comum. Mantido: já havia chamadas assim. */
  avisarDigitando: (paraId: string) => void;
}

interface Marca { quando: number; atividade: AtividadeChat }

export function useChatPresenca(ativo: boolean): UseChatPresenca {
  const { perfil } = useAuth();
  const meuId = perfil?.id ?? null;

  // Vem do canal único da aplicação, não de um `track()` daqui — ver o
  // cabeçalho. O conjunto é o global: o chat cruza empresas.
  const { onlineIdsGlobal: online } = useOnlineUsers();
  const [digitando, setDigitando] = useState<Set<string>>(new Set());
  const [gravando, setGravando] = useState<Set<string>>(new Set());

  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null);
  /** quem → o que faz e desde quando. A hora é o que expira a marca sozinha. */
  const marcas = useRef<Map<string, Marca>>(new Map());
  /**
   * Um estrangulador POR ATIVIDADE.
   *
   * Com um só, trocar de digitar para gravar dentro da janela de 1,5 s comia o
   * primeiro aviso de «gravando» — e o outro lado seguia vendo "digitando…"
   * até o áudio ser enviado.
   */
  const ultimoAviso = useRef(new Map<string, number>());

  /** Reprojeta os dois `Set` a partir do mapa. Fonte única, sem divergir. */
  const publicar = useCallback(() => {
    const d = new Set<string>();
    const g = new Set<string>();
    for (const [id, m] of marcas.current) (m.atividade === 'gravando' ? g : d).add(id);
    setDigitando(d);
    setGravando(g);
  }, []);

  useEffect(() => {
    if (!ativo || !meuId) return;
    let vivo = true;
    let conectado = false;
    let tentativa = 0;
    let repetir: ReturnType<typeof setTimeout> | undefined;
    const marcasDoCiclo = marcas.current;
    const avisosDoCiclo = ultimoAviso.current;

    const limpar = () => {
      conectado = false;
      marcasDoCiclo.clear();
      publicar();
    };
    const conectar = () => {
      if (!vivo || !navigator.onLine) return;
      clearTimeout(repetir);
      const anterior = canal.current;
      canal.current = null;
      if (anterior) void supabase.removeChannel(anterior);
      // Canal de BROADCAST, não de presence: aqui trafega só «digitando» e
      // «gravando». Quem está online saiu daqui para o canal único da
      // aplicação (`presence-global`, no PresenceProvider) — ver o cabeçalho.
      //
      // O tópico segue o mesmo, e privado: a RLS de `realtime.messages`
      // autoriza somente perfis com acesso ao chat.
      const ch = supabase.channel('presenca-chat', {
        config: { private: true },
      });
      canal.current = ch;
      ch.on('broadcast', { event: 'digitando' }, ({ payload }) => {
        if (!vivo || canal.current !== ch || !conectado) return;
        const p = payload as { de?: string; para?: string; atividade?: AtividadeChat };
        if (!p?.de || p.para !== meuId || p.de === meuId) return;
        marcasDoCiclo.set(p.de, { quando: Date.now(), atividade: p.atividade === 'gravando' ? 'gravando' : 'digitando' });
        publicar();
      });
      ch.subscribe(status => {
        if (!vivo || canal.current !== ch) return;
        if (status === 'SUBSCRIBED') {
          conectado = true;
          tentativa = 0;
          clearTimeout(repetir);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          limpar();
          clearTimeout(repetir);
          repetir = setTimeout(conectar, Math.min(30_000, 1000 * 2 ** tentativa++) + Math.random() * 500);
        }
      });
    };
    const offline = () => {
      limpar();
      clearTimeout(repetir);
      const ch = canal.current;
      canal.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
    const retomar = () => {
      if (document.visibilityState === 'hidden') return;
      // Canal vivo NÃO é re-rastreado.
      //
      // `track()` é difundido para TODOS os membros do canal, e `presenca-chat`
      // é um só para a aplicação inteira. Re-rastrear a cada volta de foco fazia
      // cada alt-tab de cada pessoa virar um evento de presence para todo mundo,
      // e o Realtime respondia com
      //
      //     PresenceRateLimitReached: Too many presence events per second
      //
      // 865 vezes em 24 h no log de produção. A presença vive enquanto o socket
      // viver; quem cobre queda de rede é o `subscribe` abaixo, que reconecta em
      // CLOSED/CHANNEL_ERROR. É a mesma régua do `PresenceProvider`.
      if (conectado && canal.current) return;
      conectar();
    };
    conectar();
    window.addEventListener('online', retomar);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', retomar);
    const faxina = setInterval(() => {
      const corte = Date.now() - VALIDADE_ATIVIDADE;
      let mudou = false;
      for (const [id, m] of marcasDoCiclo) {
        if (m.quando < corte) { marcasDoCiclo.delete(id); mudou = true; }
      }
      if (mudou) publicar();
    }, 1000);
    return () => {
      vivo = false;
      clearInterval(faxina);
      clearTimeout(repetir);
      window.removeEventListener('online', retomar);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', retomar);
      const ch = canal.current;
      canal.current = null;
      if (ch) void supabase.removeChannel(ch);
      avisosDoCiclo.clear();
      limpar();
    };
  }, [ativo, meuId, publicar]);

  const avisarAtividade = useCallback((paraId: string, atividade: AtividadeChat) => {
    const agora = Date.now();
    // Estrangula: uma tecla por milissegundo não pode virar um evento por
    // milissegundo. Reavisar mais rápido que a validade já mantém aceso.
    const chave = `${paraId}:${atividade}`;
    if (agora - (ultimoAviso.current.get(chave) ?? 0) < RITMO_AVISO) return;
    ultimoAviso.current.set(chave, agora);
    void canal.current?.send({
      type: 'broadcast', event: 'digitando',
      payload: { de: meuId, para: paraId, atividade },
    });
  }, [meuId]);

  const avisarDigitando = useCallback(
    (paraId: string) => avisarAtividade(paraId, 'digitando'),
    [avisarAtividade],
  );

  return { online, digitando, gravando, avisarAtividade, avisarDigitando };
}
