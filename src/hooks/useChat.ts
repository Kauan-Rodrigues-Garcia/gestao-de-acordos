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
  marcarEntregue, marcarLido, enviarMensagem as enviarNoBanco, abrirConversa,
  esbocoDeConversa,
  type ConversaChat, type MensagemChat, type DisparoChat, type AnexoChat,
  type ContatoEscolhido,
} from '@/services/chat/chat.service';

/** Espera antes de refazer a lista. Junta a rajada de eventos numa consulta só. */
const ESPERA_REFAZER = 250;

/** A classificação do banco usa esta mesma zona. */
function diaDoChat(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

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
  /** Existe página anterior para carregar? */
  temMais:        boolean;
  carregandoMais: boolean;
  verAnteriores:  () => void;
  abrir:          (conversaId: string | null) => void;
  /**
   * Abre a conversa com uma pessoa. `contato` é o que a tela já sabe dela —
   * com ele a conversa nova pinta na hora, sem depender de uma segunda leitura.
   */
  abrirCom:       (pessoaId: string, contato?: ContatoEscolhido) => Promise<string | null>;
  enviar: (texto: string, anexos?: AnexoChat[], respondendoId?: string | null) => Promise<string | null>;
  recarregar:     () => void;
}

export function useChat(
  ativo: boolean,
  conversaVisivel = true,
  aoMensagemRecebida?: (mensagem: MensagemChat) => void,
): UseChat {
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
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  // A conversa aberta lida de dentro do ouvinte do realtime, que é criado uma
  // vez: sem a ref, ele veria para sempre o valor da primeira renderização.
  const abertaRef = useRef<string | null>(null);
  abertaRef.current = conversaAberta;
  const visivelRef = useRef(conversaVisivel);
  visivelRef.current = conversaVisivel;
  const aoReceberRef = useRef(aoMensagemRecebida);
  aoReceberRef.current = aoMensagemRecebida;

  const recarregar = useCallback(async () => {
    if (!meuId || !ativo) return;
    const [c, d] = await Promise.all([listarConversas(), listarDisparos()]);
    setConversas(c);
    setDisparos(d);
    setCarregando(false);

    // Abrir o chat já baixa a lista. Se a última mensagem veio do outro lado,
    // isso é uma entrega real mesmo que ela tenha chegado enquanto eu estava
    // offline. O corte impede UPDATEs repetidos e um ciclo de eventos realtime.
    for (const conversa of c) {
      if (conversa.ultimo_autor_id !== meuId
          && conversa.ultima_mensagem_em
          && (!conversa.entrega_minha
              || conversa.ultima_mensagem_em > conversa.entrega_minha)) {
        void marcarEntregue(conversa.id, meuId);
      }
    }
  }, [meuId, ativo]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /*
   * Se a janela atravessar a meia-noite, refaz a consulta uma única vez na
   * virada. Não é cron e não consulta o banco a cada intervalo: o relógio só
   * compara a chave local do dia; a RPC é chamada apenas quando ela muda.
   * Quem abrir o chat depois da virada já recebe a classificação correta na
   * carga inicial acima.
   */
  useEffect(() => {
    if (!ativo || !meuId) return;
    let dia = diaDoChat();
    const relogio = window.setInterval(() => {
      const atual = diaDoChat();
      if (atual === dia) return;
      dia = atual;
      void recarregar();
    }, 15_000);
    return () => window.clearInterval(relogio);
  }, [ativo, meuId, recarregar]);

  // ── Refazer a lista, sem repetir na rajada ─────────────────────────────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarRefazer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void recarregar(); }, ESPERA_REFAZER);
  }, [recarregar]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /*
   * Marcar lido, agrupado.
   *
   * Antes era um UPDATE por mensagem recebida. Numa rajada — alguém mandando
   * cinco linhas seguidas, ou um disparo chegando — são cinco escritas para
   * gravar o mesmo instante, e cada uma volta como evento de tempo real para
   * os dois lados, que então refazem a lista. Uma só, no fim da rajada, diz
   * exatamente a mesma coisa.
   */
  const timerLido = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarLido = useCallback((conversaId: string) => {
    if (!meuId) return;
    if (timerLido.current) clearTimeout(timerLido.current);
    timerLido.current = setTimeout(() => {
      void marcarLido(conversaId, meuId).then(() => agendarRefazer());
    }, 400);
  }, [meuId, agendarRefazer]);

  useEffect(() => () => { if (timerLido.current) clearTimeout(timerLido.current); }, []);

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
            const normalizada = {
              ...msg,
              anexos: Array.isArray(msg.anexos) ? msg.anexos : [],
            };
            // O segundo check só nasce quando o cliente do destinatário
            // recebeu de fato o INSERT pelo Realtime.
            if (payload.eventType === 'INSERT' && msg.autor_id !== meuId) {
              void marcarEntregue(msg.conversa_id, meuId);
              aoReceberRef.current?.(normalizada);
            }
            // Mensagem da conversa aberta entra direto: aqui o evento é o dado.
            if (msg.conversa_id === abertaRef.current && payload.eventType === 'INSERT') {
              setMensagens(atual => atual.some(m => m.id === msg.id)
                ? atual
                : [...atual, normalizada]);
              // Selecionada não significa visível: ao minimizar a janela ela
              // continua selecionada, mas mensagem nova não pode virar lida.
              if (msg.autor_id !== meuId && visivelRef.current) agendarLido(msg.conversa_id);
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
          if (aberta) {
            void listarMensagens(aberta).then(r => {
              setMensagens(r.mensagens);
              setTemMais(r.temMais);
            });
          }
        },
      },
    );
  }, [ativo, empresa?.id, meuId, agendarRefazer, agendarLido, recarregar]);

  // ── Abrir / fechar ─────────────────────────────────────────────────────────
  const abrir = useCallback((conversaId: string | null, esboco?: ConversaChat) => {
    setConversaAberta(conversaId);
    if (!conversaId) { setMensagens([]); setAvulsa(null); setTemMais(false); return; }
    // O esboço primeiro: a conversa nova aparece no mesmo quadro do clique.
    if (esboco) setAvulsa(esboco);
    void listarMensagens(conversaId).then(r => {
      setMensagens(r.mensagens);
      setTemMais(r.temMais);
    });
    if (meuId) {
      void marcarLido(conversaId, meuId).then(() => agendarRefazer());
      // Busca sempre, e não só quando falta na lista: no clique a lista pode
      // estar de uma leitura anterior, e decidir por ela erraria justamente no
      // caso que este código existe para cobrir.
      //
      // `if (c)`, e não `.then(setAvulsa)`: a versão anterior gravava o `null`
      // de uma leitura que falhou POR CIMA do que a tela tinha, e a janela
      // ficava sem conversa nenhuma — o «a conversa nova não abre». Resposta
      // que não veio não é resposta vazia; é resposta que não veio.
      void buscarConversa(conversaId).then(c => { if (c) setAvulsa(c); });
    }
  }, [meuId, agendarRefazer]);

  /**
   * Carrega a página anterior, para cima.
   *
   * A tela guarda a altura antes e depois para a rolagem não pular — sem isso,
   * inserir 60 mensagens acima empurraria o que a pessoa está lendo para fora
   * do campo de visão, que é o oposto do que ela pediu ao clicar.
   */
  const verAnteriores = useCallback(async () => {
    const aberta = abertaRef.current;
    const maisAntiga = mensagens[0]?.criado_em;
    if (!aberta || !maisAntiga || carregandoMais) return;

    setCarregandoMais(true);
    const r = await listarMensagens(aberta, maisAntiga);
    setCarregandoMais(false);
    setTemMais(r.temMais);
    if (r.mensagens.length) setMensagens(atual => [...r.mensagens, ...atual]);
  }, [mensagens, carregandoMais]);

  const abrirCom = useCallback(async (pessoaId: string, contato?: ContatoEscolhido) => {
    const { id, erro } = await abrirConversa(pessoaId);
    if (erro || !id) return null;
    abrir(id, contato ? esbocoDeConversa(id, contato) : undefined);
    return id;
  }, [abrir]);

  const enviar = useCallback(async (
    texto: string, anexos: AnexoChat[] = [], respondendoId?: string | null,
  ) => {
    if (!conversaAberta || !empresa?.id || !meuId) return 'Conversa não está aberta.';
    const { erro } = await enviarNoBanco({
      conversaId: conversaAberta, empresaId: empresa.id, autorId: meuId, texto, anexos,
      respondendoId,
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
    temMais, carregandoMais, verAnteriores,
    naoLidasTotal, abrir, abrirCom, enviar, recarregar,
  };
}
