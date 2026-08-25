/**
 * useChatPresenca.ts — quem está online, e quem está digitando.
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
 * `broadcast` para o «digitando». Nada disso sobrevive a um F5, e é essa a
 * intenção — informação que só vale agora não deve durar mais que agora.
 *
 * ## O «digitando» tem que se apagar sozinho
 *
 * Quem digita e fecha a aba não manda o aviso de parou. Por isso cada marca
 * carrega a hora, e some sozinha depois de `VALIDADE_DIGITANDO` — o pior caso
 * vira três segundos de pontinhos a mais, e não um "digitando…" eterno que faz
 * a pessoa do outro lado esperar uma resposta que não vem.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

/** Depois disso a marca de «digitando» é considerada velha e some. */
const VALIDADE_DIGITANDO = 3000;
/** Enquanto a pessoa escreve, reavisa neste ritmo. Menor que a validade. */
const RITMO_AVISO = 1500;

export interface UseChatPresenca {
  /** Ids de quem está com o chat aberto agora. */
  online: Set<string>;
  /** Ids de quem está digitando PARA MIM agora. */
  digitando: Set<string>;
  /** Avisa que estou digitando nesta conversa. Chamar a cada tecla é barato. */
  avisarDigitando: (paraId: string) => void;
}

interface EstadoPresenca { perfil_id?: string }

export function useChatPresenca(ativo: boolean): UseChatPresenca {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const meuId = perfil?.id ?? null;

  const [online, setOnline] = useState<Set<string>>(new Set());
  const [digitando, setDigitando] = useState<Set<string>>(new Set());

  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null);
  /** quem → quando avisou. A hora é o que permite a marca expirar sozinha. */
  const marcas = useRef<Map<string, number>>(new Map());
  const ultimoAviso = useRef(0);

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
      const p = payload as { de?: string; para?: string };
      // Só me interessa quem está digitando PARA MIM: o canal é da empresa
      // inteira, e sem este recorte a tela mostraria pontinhos de conversa
      // alheia.
      if (!p?.de || p.para !== meuId) return;
      marcas.current.set(p.de, Date.now());
      setDigitando(new Set(marcas.current.keys()));
    });

    void ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ perfil_id: meuId });
    });

    // Varre as marcas velhas. É o que apaga o «digitando» de quem fechou a aba
    // sem avisar — não existe evento para isso.
    const faxina = setInterval(() => {
      const corte = Date.now() - VALIDADE_DIGITANDO;
      let mudou = false;
      for (const [id, quando] of marcas.current) {
        if (quando < corte) { marcas.current.delete(id); mudou = true; }
      }
      if (mudou) setDigitando(new Set(marcas.current.keys()));
    }, 1000);

    return () => {
      clearInterval(faxina);
      void ch.unsubscribe();
      canal.current = null;
      marcasDoCiclo.clear();
      setOnline(new Set());
      setDigitando(new Set());
    };
  }, [ativo, empresa?.id, meuId]);

  const avisarDigitando = useCallback((paraId: string) => {
    const agora = Date.now();
    // Estrangula: uma tecla por milissegundo não pode virar um evento por
    // milissegundo. Reavisar mais rápido que a validade já mantém aceso.
    if (agora - ultimoAviso.current < RITMO_AVISO) return;
    ultimoAviso.current = agora;
    void canal.current?.send({
      type: 'broadcast', event: 'digitando',
      payload: { de: meuId, para: paraId },
    });
  }, [meuId]);

  return { online, digitando, avisarDigitando };
}
