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
  esbocoDeConversa, souParte, subirAnexo,
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
  carregandoMensagens: boolean;
  erroMensagens: string | null;
  reenviar: (id: string) => Promise<string | null>;
  verAnteriores:  () => void;
  abrir:          (conversaId: string | null) => void;
  /**
   * Abre a conversa com uma pessoa. `contato` é o que a tela já sabe dela —
   * com ele a conversa nova pinta na hora, sem depender de uma segunda leitura.
   */
  abrirCom:       (pessoaId: string, contato?: ContatoEscolhido) => Promise<string | null>;
  enviar: (texto: string, anexos?: AnexoChat[], respondendoId?: string | null, arquivos?: File[]) => Promise<string | null>;
  recarregar:     () => void;
}

export function useChat(
  ativo: boolean,
  conversaVisivel = true,
  aoMensagemRecebida?: (mensagem: MensagemChat) => void,
  aoCurtiremMinhaMensagem?: (mensagem: MensagemChat) => void,
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

  const visivelRef = useRef(conversaVisivel);
  visivelRef.current = conversaVisivel;
  const aoReceberRef = useRef(aoMensagemRecebida);
  aoReceberRef.current = aoMensagemRecebida;
  const aoCurtidaRef = useRef(aoCurtiremMinhaMensagem);
  aoCurtidaRef.current = aoCurtiremMinhaMensagem;

  /*
   * Curtidas já anunciadas, por `id da mensagem + carimbo`.
   *
   * O mesmo UPDATE volta pelo Realtime mais de uma vez — reconexão, e o
   * `onReconectado` que relê a conversa — e sem esta marca o autor levaria o
   * mesmo «fulano curtiu» duas vezes. O carimbo entra na chave porque uma
   * segunda curtida na MESMA mensagem é um aviso novo, e só o `curtida_em`
   * distingue as duas.
   */
  const curtidasAvisadas = useRef(new Set<string>());

  const cache = useRef(new Map<string, { mensagens: MensagemChat[]; temMais: boolean }>());
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [erroMensagens, setErroMensagens] = useState<string | null>(null);
  const pedido = useRef(0);
  const sessao = useRef(0);
  const fila = useRef(new Map<string, {
    mensagem: MensagemChat; empresaId: string; arquivos: File[];
    anexos: AnexoChat[]; enviados: Map<number, AnexoChat>; emCurso: boolean;
  }>());
  const previasLocais = useRef(new Set<string>());

  const publicarMensagens = useCallback((id: string, atualizar: (atuais: MensagemChat[]) => MensagemChat[]) => {
    const anterior = cache.current.get(id);
    const novas = atualizar(anterior?.mensagens ?? []);
    cache.current.set(id, { mensagens: novas, temMais: anterior?.temMais ?? false });
    if (abertaRef.current === id) setMensagens(novas);
  }, []);

  // Cache e anexos locais pertencem à sessão, nunca à próxima conta.
  useEffect(() => {
    sessao.current++;
    pedido.current++;
    cache.current.clear();
    fila.current.clear();
    curtidasAvisadas.current.clear();
    abertaRef.current = null;
    setConversaAberta(null);
    setMensagens([]);
    setConversas([]);
    setDisparos([]);
    setAvulsa(null);
    setTemMais(false);
    setCarregandoMais(false);
    setCarregandoMensagens(false);
    setErroMensagens(null);
    const urls = previasLocais.current;
    const geracao = sessao;
    return () => {
      geracao.current++;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [meuId, ativo]);

  const carregarMensagens = useCallback(async (id: string) => {
    const numero = ++pedido.current;
    const ciclo = sessao.current;
    const inicio = new Map((cache.current.get(id)?.mensagens ?? []).map(m => [m.id, m]));
    setCarregandoMais(false);
    setCarregandoMensagens(true);
    setErroMensagens(null);
    try {
      const r = await listarMensagens(id);
      if (ciclo !== sessao.current || numero !== pedido.current) return;
      if (r.erro) { setErroMensagens(r.erro); return; }
      for (const m of r.mensagens) {
        if (m.curtida_em) curtidasAvisadas.current.add(`${m.id}:${m.curtida_em}`);
      }
      publicarMensagens(id, atuais => {
        const unicas = new Map(atuais.map(m => [m.id, m]));
        for (const m of r.mensagens) {
          const atual = unicas.get(m.id);
          // Realtime/envio que chegou durante a leitura é mais recente.
          if (!atual || atual === inicio.get(m.id)) unicas.set(m.id, m);
        }
        return [...unicas.values()].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
      });
      const anterior = cache.current.get(id)!;
      const temMaisAtual = inicio.size > r.mensagens.length ? anterior.temMais : r.temMais;
      cache.current.set(id, { ...anterior, temMais: temMaisAtual });
      setTemMais(temMaisAtual);
    } catch {
      if (ciclo === sessao.current && numero === pedido.current) setErroMensagens('Não foi possível carregar as mensagens. Tente novamente.');
    } finally {
      if (ciclo === sessao.current && numero === pedido.current) setCarregandoMensagens(false);
    }
  }, [publicarMensagens]);

  const recarregar = useCallback(async () => {
    if (!meuId || !ativo) return;
    const ciclo = sessao.current;
    const [c, d] = await Promise.all([listarConversas(), listarDisparos()]);
    if (ciclo !== sessao.current) return;
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

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [meuId, ativo]);

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

  useEffect(() => () => { if (timerLido.current) clearTimeout(timerLido.current); }, [meuId, ativo]);

  // ── Tempo real ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ativo || !empresa?.id || !meuId) return;
    const ciclo = sessao.current;

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
          if (ciclo !== sessao.current) return;
          const linha = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;

          if (payload.table === 'chat_mensagens') {
            const msg = linha as unknown as MensagemChat;
            const normalizada = {
              ...msg,
              anexos: Array.isArray(msg.anexos) ? msg.anexos : [],
            };
            /*
             * O segundo check só nasce quando o cliente do destinatário
             * recebeu de fato o INSERT pelo Realtime.
             *
             * `souParte` é a trava contra um vazamento de AVISO. A RLS deixa
             * quem monitora LER a conversa alheia — é o objetivo da monitoria —
             * e o Realtime respeita a RLS, então o INSERT de uma conversa de
             * que eu não participo chega aqui. Ler é o certo; ser notificado
             * não é. Sem esta pergunta, a conta de super admin (que alcança
             * todo mundo) tocava som e piscava aviso de grupos do play 3 em que
             * ela nunca esteve.
             *
             * Vale também para `marcarEntregue`: carimbar entrega numa conversa
             * que não é minha é escrever a passagem do monitor onde o operador
             * a veria.
             */
            if (payload.eventType === 'INSERT' && msg.autor_id !== meuId) {
              void souParte(msg.conversa_id).then(sou => {
                if (!sou || ciclo !== sessao.current) return;
                void marcarEntregue(msg.conversa_id, meuId);
                aoReceberRef.current?.(normalizada);
              });
            }
            // Mensagem da conversa aberta entra direto: aqui o evento é o dado.
            if (payload.eventType === 'INSERT') {
              if (cache.current.has(msg.conversa_id) || msg.conversa_id === abertaRef.current) {
                publicarMensagens(msg.conversa_id, atual => {
                  const confirmada: MensagemChat = { ...normalizada, status_envio: undefined, erro_envio: undefined };
                  return atual.some(m => m.id === msg.id)
                    ? atual.map(m => m.id === msg.id ? confirmada : m)
                    : [...atual, confirmada];
                });
              }
              // Selecionada não significa visível: ao minimizar a janela ela
              // continua selecionada, mas mensagem nova não pode virar lida.
              if (msg.conversa_id === abertaRef.current && msg.autor_id !== meuId && visivelRef.current) agendarLido(msg.conversa_id);
            }
            // O expurgo de CPF reescreve o texto: sem isto a mensagem
            // continuaria legível na tela de quem está com ela aberta.
            if (cache.current.has(msg.conversa_id) && payload.eventType === 'UPDATE') {
              publicarMensagens(msg.conversa_id, atual => atual.map(m => (m.id === msg.id ? { ...m, ...msg, status_envio: undefined, erro_envio: undefined } : m)));
            }
            /*
             * Curtiram a MINHA mensagem.
             *
             * `fn_chat_curtir` carimba `curtida_em` e grava em `curtida_por`
             * quem curtiu, e esse UPDATE já viajava pelo Realtime para acordar
             * o selo do coração. O aviso pega carona nele: nenhuma consulta a
             * mais, nenhuma tabela a mais.
             *
             * As três condições são todas necessárias. `autor_id === meuId`
             * porque o aviso é do autor. `curtida_por` preenchido porque
             * descurtir zera o campo, e ninguém quer «fulano curtiu» quando
             * fulano acabou de descurtir. E `!== meuId` porque curtir a própria
             * mensagem é uma coisa que se faz de propósito, olhando para a tela.
             */
            if (payload.eventType === 'UPDATE'
                && msg.autor_id === meuId
                && msg.curtida_por
                && msg.curtida_por !== meuId
                && msg.curtida_em
                && (payload.old as Partial<MensagemChat>)?.curtida_em !== msg.curtida_em) {
              const marca = `${msg.id}:${msg.curtida_em ?? ''}`;
              if (!curtidasAvisadas.current.has(marca)) {
                curtidasAvisadas.current.add(marca);
                aoCurtidaRef.current?.(normalizada);
              }
            }
            agendarRefazer();
            return;
          }

          // `chat_participantes`: leitura do outro, conversa revelada, apagada.
          agendarRefazer();
        },
        onReconectado: () => {
          if (ciclo !== sessao.current) return;
          void recarregar();
          const aberta = abertaRef.current;
          if (aberta) void carregarMensagens(aberta);
        },
      },
    );
  }, [ativo, empresa?.id, meuId, agendarRefazer, agendarLido, recarregar, carregarMensagens, publicarMensagens]);

  // ── Abrir / fechar ─────────────────────────────────────────────────────────
  const abrir = useCallback((conversaId: string | null, esboco?: ConversaChat) => {
    pedido.current++;
    abertaRef.current = conversaId;
    setConversaAberta(conversaId);
    setAvulsa(esboco ?? null);
    setCarregandoMais(false);
    setErroMensagens(null);
    const guardada = conversaId ? cache.current.get(conversaId) : undefined;
    setMensagens(guardada?.mensagens ?? []);
    setTemMais(guardada?.temMais ?? false);
    setCarregandoMensagens(!!conversaId);
    if (!conversaId) return;
    void carregarMensagens(conversaId);
    const numero = pedido.current;
    if (meuId) {
      void marcarLido(conversaId, meuId).then(() => agendarRefazer());
      void buscarConversa(conversaId).then(c => {
        if (c && abertaRef.current === conversaId && pedido.current === numero) setAvulsa(c);
      });
    }
  }, [meuId, agendarRefazer, carregarMensagens]);

  const verAnteriores = useCallback(async () => {
    const id = abertaRef.current;
    const maisAntiga = mensagens.find(m => !m.status_envio)?.criado_em;
    if (!id || !maisAntiga || carregandoMais) return;
    const numero = pedido.current;
    const ciclo = sessao.current;
    setCarregandoMais(true);
    try {
      const r = await listarMensagens(id, maisAntiga);
      if (numero !== pedido.current || ciclo !== sessao.current) return;
      if (r.erro) { setErroMensagens(r.erro); return; }
      publicarMensagens(id, atuais => {
        const unicas = new Map(r.mensagens.map(m => [m.id, m]));
        for (const m of atuais) unicas.set(m.id, m);
        return [...unicas.values()];
      });
      cache.current.set(id, { mensagens: cache.current.get(id)!.mensagens, temMais: r.temMais });
      setTemMais(r.temMais);
    } catch {
      if (numero === pedido.current && ciclo === sessao.current) setErroMensagens('Não foi possível carregar as mensagens anteriores.');
    } finally {
      if (numero === pedido.current && ciclo === sessao.current) setCarregandoMais(false);
    }
  }, [mensagens, carregandoMais, publicarMensagens]);

  const abrirCom = useCallback(async (pessoaId: string, contato?: ContatoEscolhido) => {
    const { id, erro } = await abrirConversa(pessoaId);
    if (erro || !id) return null;
    abrir(id, contato ? esbocoDeConversa(id, contato) : undefined);
    return id;
  }, [abrir]);

  const reenviar = useCallback(async (id: string): Promise<string | null> => {
    const item = fila.current.get(id);
    if (!item || item.emCurso) return null;
    const ciclo = sessao.current;
    item.emCurso = true;
    const conversaId = item.mensagem.conversa_id;
    const liberarPrevias = () => {
      for (const anexo of item.mensagem.anexos) {
        if (previasLocais.current.delete(anexo.url)) URL.revokeObjectURL(anexo.url);
      }
    };
    publicarMensagens(conversaId, atuais => atuais.map(m => m.id === id ? { ...m, status_envio: 'pendente', erro_envio: undefined } : m));
    try {
      // Os arquivos são preparados em paralelo; a prévia já está no balão.
      const uploads = await Promise.allSettled(item.arquivos.map(async (arquivo, i) => {
        if (item.enviados.has(i)) return;
        const r = await subirAnexo(arquivo, conversaId);
        if (r.erro || !r.anexo) throw new Error(r.erro || 'Não foi possível enviar o anexo.');
        item.enviados.set(i, r.anexo);
      }));
      const falhaUpload = uploads.find(r => r.status === 'rejected');
      if (falhaUpload?.status === 'rejected') throw falhaUpload.reason;
      if (ciclo !== sessao.current) return null;
      const anexos = [...item.anexos, ...item.arquivos.map((_, i) => item.enviados.get(i)!)];
      const r = await enviarNoBanco({ id, conversaId, empresaId: item.empresaId,
        autorId: item.mensagem.autor_id!, texto: item.mensagem.texto ?? '', anexos,
        respondendoId: item.mensagem.respondendo_id });
      if (ciclo !== sessao.current) return null;
      if (r.erro) throw new Error(r.erro);
      publicarMensagens(conversaId, atuais => atuais.map(m => m.id === id && m.status_envio
        ? { ...m, ...r.mensagem, anexos, status_envio: undefined, erro_envio: undefined } : m));
      fila.current.delete(id);
      liberarPrevias();
      agendarRefazer();
      return null;
    } catch (e) {
      if (ciclo !== sessao.current) return null;
      const confirmada = cache.current.get(conversaId)?.mensagens.find(m => m.id === id && !m.status_envio);
      if (confirmada) { fila.current.delete(id); liberarPrevias(); return null; }
      const erro = e instanceof Error ? e.message : 'Não foi possível enviar. Tente novamente.';
      publicarMensagens(conversaId, atuais => atuais.map(m => m.id === id ? { ...m, status_envio: 'erro', erro_envio: erro } : m));
      return erro;
    } finally {
      item.emCurso = false;
    }
  }, [publicarMensagens, agendarRefazer]);

  const enviar = useCallback(async (
    texto: string, anexos: AnexoChat[] = [], respondendoId?: string | null, arquivos: File[] = [],
  ) => {
    const conversaId = abertaRef.current;
    if (!conversaId || !empresa?.id || !meuId || !ativo) return 'Conversa não está aberta.';
    if (!texto.trim() && !anexos.length && !arquivos.length) return 'Escreva alguma coisa.';
    const locais = arquivos.map(arquivo => {
      const url = URL.createObjectURL(arquivo);
      previasLocais.current.add(url);
      return { url, nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size };
    });
    const mensagem: MensagemChat = {
      id: crypto.randomUUID(), conversa_id: conversaId, autor_id: meuId,
      texto: texto.trim() || null, anexos: [...anexos, ...locais], criado_em: new Date().toISOString(),
      disparo_id: null, expurgado_em: null, respondendo_id: respondendoId ?? null,
      curtida_em: null, curtida_por: null, sistema: null, sistema_dados: null, status_envio: 'pendente',
    };
    fila.current.set(mensagem.id, { mensagem, empresaId: empresa.id, arquivos, anexos, enviados: new Map(), emCurso: false });
    publicarMensagens(conversaId, atuais => [...atuais, mensagem]);
    return reenviar(mensagem.id);
  }, [empresa?.id, meuId, ativo, publicarMensagens, reenviar]);

  const naoLidasTotal = conversas.reduce((s, c) => s + c.nao_lidas, 0);

  // A da lista manda: ela traz não lidas e leitura do outro, que a avulsa não
  // tem. A avulsa só cobre o intervalo em que a conversa ainda não existe lá.
  const aberta = conversaAberta
    ? (conversas.find(c => c.id === conversaAberta) ?? (avulsa?.id === conversaAberta ? avulsa : null))
    : null;

  return {
    conversas, disparos, mensagens, conversaAberta, aberta, carregando,
    temMais, carregandoMais, verAnteriores, carregandoMensagens, erroMensagens, reenviar,
    naoLidasTotal, abrir, abrirCom, enviar, recarregar,
  };
}
