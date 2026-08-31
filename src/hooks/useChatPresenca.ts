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
 * Aqui o canal é do Supabase Realtime puro: `presence` para quem está de olho,
 * `broadcast` para a atividade. Nada disso sobrevive a um F5, e é essa a
 * intenção — informação que só vale agora não deve durar mais que agora.
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
import { useEmpresa } from '@/hooks/useEmpresa';

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

interface EstadoPresenca { perfil_id?: string }
interface Marca { quando: number; atividade: AtividadeChat }

export function useChatPresenca(ativo: boolean): UseChatPresenca {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const meuId = perfil?.id ?? null;

  const [online, setOnline] = useState<Set<string>>(new Set());
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
  const ultimoAviso = useRef<Record<AtividadeChat, number>>({ digitando: 0, gravando: 0 });

  /** Reprojeta os dois `Set` a partir do mapa. Fonte única, sem divergir. */
  const publicar = useCallback(() => {
    const d = new Set<string>();
    const g = new Set<string>();
    for (const [id, m] of marcas.current) (m.atividade === 'gravando' ? g : d).add(id);
    setDigitando(d);
    setGravando(g);
  }, []);

  useEffect(() => {
    if (!ativo || !empresa?.id || !meuId) return;

    // Copiada aqui de propósito: a limpeza roda depois, e ler `marcas.current`
    // lá dentro pegaria o Map de outro ciclo caso a empresa mudasse no meio.
    const marcasDoCiclo = marcas.current;

    const ch = supabase.channel(`presenca-chat-${empresa.id}`, {
      config: { presence: { key: meuId } },
    });
    canal.current = ch;

    ch.on('presence', { event: 'sync' }, () => {
      const estado = ch.presenceState<EstadoPresenca>();
      setOnline(new Set(Object.keys(estado)));
    });

    ch.on('broadcast', { event: 'digitando' }, ({ payload }) => {
      const p = payload as { de?: string; para?: string; atividade?: AtividadeChat };
      // Só me interessa quem está falando comigo: o canal é da empresa inteira,
      // e sem este recorte a tela mostraria pontinhos de conversa alheia.
      if (!p?.de || p.para !== meuId) return;
      // `atividade` ausente = versão antiga do app em outra aba. Digitando é a
      // leitura conservadora: é o que aquele cliente sabia mandar.
      const atividade: AtividadeChat = p.atividade === 'gravando' ? 'gravando' : 'digitando';
      marcas.current.set(p.de, { quando: Date.now(), atividade });
      publicar();
    });

    void ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ perfil_id: meuId });
    });

    // Varre as marcas velhas. É o que apaga a atividade de quem fechou a aba
    // sem avisar — não existe evento para isso.
    const faxina = setInterval(() => {
      const corte = Date.now() - VALIDADE_ATIVIDADE;
      let mudou = false;
      for (const [id, m] of marcas.current) {
        if (m.quando < corte) { marcas.current.delete(id); mudou = true; }
      }
      if (mudou) publicar();
    }, 1000);

    return () => {
      clearInterval(faxina);
      void ch.unsubscribe();
      canal.current = null;
      marcasDoCiclo.clear();
      setOnline(new Set());
      setDigitando(new Set());
      setGravando(new Set());
    };
  }, [ativo, empresa?.id, meuId, publicar]);

  const avisarAtividade = useCallback((paraId: string, atividade: AtividadeChat) => {
    const agora = Date.now();
    // Estrangula: uma tecla por milissegundo não pode virar um evento por
    // milissegundo. Reavisar mais rápido que a validade já mantém aceso.
    if (agora - ultimoAviso.current[atividade] < RITMO_AVISO) return;
    ultimoAviso.current[atividade] = agora;
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
