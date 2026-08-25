/**
 * useChat.ts — o estado do chat, e o que o mantém vivo.
 *
 * ## Duas fontes, de propósito
 *
 * O que PERSISTE (conversa, mensagem, leitura) chega por `postgres_changes`,
 * pelo canal compartilhado. O que é EFÊMERO (online, digitando) não passa por
 * aqui: vive em `useChatPresenca`, e não toca o banco.
 *
 * ## Por que a lista se refaz em vez de aplicar o evento
 *
 * A linha da lista é um agregado — última mensagem, não lidas, foto do outro,
 * leitura do outro. Aplicar um INSERT de mensagem sobre esse agregado exigiria
 * repetir no cliente as regras que a consulta já resolve, e o primeiro caso a
 * divergir seria a conversa que APARECE quando alguém responde um disparo: o
 * evento é um UPDATE em `chat_participantes` que só significa alguma coisa
 * quando cruzado com a conversa inteira.
 *
 * Refazer é uma consulta por evento, com espera curta para não repetir quando
 * três mensagens chegam juntas. A lista de conversas de uma pessoa é pequena.
 *
 * As MENSAGENS da conversa aberta são o contrário: chegam uma a uma e entram
 * na lista direto, porque ali o evento é o dado, e reler a conversa a cada
 * mensagem faria a rolagem pular.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { assinarTabela } from '@/lib/realtime';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  listarConversas, listarMensagens, listarDisparos, buscarConversa,
  marcarLido, enviarMensagem as enviarNoBanco, abrirConversa,
  type ConversaChat, type MensagemChat, type DisparoChat, type AnexoChat,
} from '@/services/chat/chat.service';

/** Espera antes de refazer a lista. Junta a rajada de eventos numa consulta só. */
const ESPERA_REFAZER = 250;

export interface UseChat {
  conversas:      ConversaChat[];
  disparos:       DisparoChat[];
  mensagens:      MensagemChat[];
  conversaAberta: string | null;
  /**
   * A conversa aberta, venha ela da lista ou não.
   *
   * Conversa recém-criada ainda não tem mensagem, e por isso não aparece em
   * `conversas` — ver `listarConversas`. A tela precisa dela mesmo assim, senão
   * abre em branco.
   */
  aberta:         ConversaChat | null;
  carregando:     boolean;
  naoLidasTotal:  number;
  abrir:          (conversaId: string | null) => void;
  abrirCom:       (pessoaId: string) => Promise<string | null>;
  enviar:         (texto: string, anexos?: AnexoChat[]) => Promise<string | null>;
  recarregar:     () => void;
}

export function useChat(ativo: boolean): UseChat {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const meuId = perfil?.id ?? null;

  const [conversas, setConversas] = useState<ConversaChat[]>([]);
  const [disparos,  setDisparos]  = useState<DisparoChat[]>([]);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [conversaAberta, setConversaAberta] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Preenchida quando a conversa aberta ainda não está na lista. */
  const [avulsa, setAvulsa] = useState<ConversaChat | null>(null);

  // A conversa aberta lida de dentro do ouvinte do realtime, que é criado uma
  // vez: sem a ref, ele veria para sempre o valor da primeira renderização.
  const abertaRef = useRef<string | null>(null);
  abertaRef.current = conversaAberta;

  const recarregar = useCallback(async () => {
    if (!meuId || !ativo) return;
    const [c, d] = await Promise.all([listarConversas(meuId), listarDisparos()]);
    setConversas(c);
    setDisparos(d);
    setCarregando(false);
  }, [meuId, ativo]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  // ── Refazer a lista, sem repetir na rajada ─────────────────────────────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarRefazer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void recarregar(); }, ESPERA_REFAZER);
  }, [recarregar]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // ── Tempo real ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ativo || !empresa?.id || !meuId) return;

    return assinarTabela(
      {
        topico: `rt-chat-${empresa.id}`,
        escutas: [
          /*
           * SEM filtro de empresa, desde 25/08/2026.
           *
           * O chat é um só: quem tem multiempresa conversa com as duas
           * operações, e um `empresa_id=eq.<atual>` cortaria exatamente as
           * mensagens de quem está do outro lado — a conversa apareceria na
           * lista e ficaria muda até um F5.
           *
           * A RLS já recorta o que chega. O filtro aqui só economizaria
           * eventos, e economizava os errados.
           */
          { tabela: 'chat_mensagens' },
          // Sem filtro: é por aqui que a conversa APARECE na lista quando
          // alguém responde um disparo (o UPDATE que zera `oculta_em`), e a
          // tabela não tem `empresa_id` para filtrar. A RLS já recorta o que
          // chega, e o ouvinte descarta o que não é meu.
          { tabela: 'chat_participantes' },
        ],
      },
      {
        onEvento: (payload) => {
          const linha = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;

          if (payload.table === 'chat_mensagens') {
            const msg = linha as unknown as MensagemChat;
            // Mensagem da conversa aberta entra direto: aqui o evento é o dado.
            if (msg.conversa_id === abertaRef.current && payload.eventType === 'INSERT') {
              setMensagens(atual => atual.some(m => m.id === msg.id)
                ? atual
                : [...atual, { ...msg, anexos: Array.isArray(msg.anexos) ? msg.anexos : [] }]);
              if (msg.autor_id !== meuId) void marcarLido(msg.conversa_id, meuId);
            }
            // O expurgo de CPF reescreve o texto: sem isto a mensagem
            // continuaria legível na tela de quem está com ela aberta.
            if (msg.conversa_id === abertaRef.current && payload.eventType === 'UPDATE') {
              setMensagens(atual => atual.map(m => (m.id === msg.id ? { ...m, ...msg } : m)));
            }
            agendarRefazer();
            return;
          }

          // `chat_participantes`: leitura do outro, conversa revelada, apagada.
          agendarRefazer();
        },
        onReconectado: () => {
          void recarregar();
          const aberta = abertaRef.current;
          if (aberta) void listarMensagens(aberta).then(setMensagens);
        },
      },
    );
  }, [ativo, empresa?.id, meuId, agendarRefazer, recarregar]);

  // ── Abrir / fechar ─────────────────────────────────────────────────────────
  const abrir = useCallback((conversaId: string | null) => {
    setConversaAberta(conversaId);
    if (!conversaId) { setMensagens([]); setAvulsa(null); return; }
    void listarMensagens(conversaId).then(setMensagens);
    if (meuId) {
      void marcarLido(conversaId, meuId).then(() => agendarRefazer());
      // Busca sempre, e não só quando falta na lista: no clique a lista pode
      // estar de uma leitura anterior, e decidir por ela erraria justamente no
      // caso que este código existe para cobrir.
      void buscarConversa(conversaId, meuId).then(setAvulsa);
    }
  }, [meuId, agendarRefazer]);

  const abrirCom = useCallback(async (pessoaId: string) => {
    const { id, erro } = await abrirConversa(pessoaId);
    if (erro || !id) return null;
    abrir(id);
    return id;
  }, [abrir]);

  const enviar = useCallback(async (texto: string, anexos: AnexoChat[] = []) => {
    if (!conversaAberta || !empresa?.id || !meuId) return 'Conversa não está aberta.';
    const { erro } = await enviarNoBanco({
      conversaId: conversaAberta, empresaId: empresa.id, autorId: meuId, texto, anexos,
    });
    if (!erro) agendarRefazer();
    return erro;
  }, [conversaAberta, empresa?.id, meuId, agendarRefazer]);

  const naoLidasTotal = conversas.reduce((s, c) => s + c.nao_lidas, 0);

  // A da lista manda: ela traz não lidas e leitura do outro, que a avulsa não
  // tem. A avulsa só cobre o intervalo em que a conversa ainda não existe lá.
  const aberta = conversaAberta
    ? (conversas.find(c => c.id === conversaAberta) ?? avulsa)
    : null;

  return {
    conversas, disparos, mensagens, conversaAberta, aberta, carregando,
    naoLidasTotal, abrir, abrirCom, enviar, recarregar,
  };
}
