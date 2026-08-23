/**
 * useSolicitacoesWhatsapp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Estado da aba de Solicitações de WhatsApp (PaguePlay) — migration 20260730b.
 *
 * Dois hooks:
 *   useSolicitacoesWhatsapp — a lista, com status ao vivo e aviso de mensagem nova
 *   useChatSolicitacao      — a thread de um pedido, com leitura e "digitando"
 *
 * Os dois assinam o MESMO tópico de mensagens (`rt-sol-wpp-msg-{empresa}`) e o
 * `assinarTabela` deduplica: um canal só, dois consumidores. Cada um filtra o
 * que lhe interessa no handler.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import { logger } from '@/lib/logger';
import {
  buscarSolicitacoes, buscarMensagens, enviarMensagem, marcarConversaLida,
  buscarLeituras, buscarResponsaveis, buscarEventos, DIAS_HISTORICO_PADRAO,
  type SolicitacaoWhatsapp, type MensagemSolicitacao, type EventoSolicitacao,
  type PessoaResumo, type Leitura,
} from '@/services/solicitacoesWhatsapp.service';
import { contarNaoLidas } from '@/pages/SolicitacoesWhatsapp/leitura';

// ── Notificação do sistema operacional ───────────────────────────────────────

/**
 * Pede permissão de notificação do SO uma vez por sessão.
 *
 * Só é chamado quando a aba de solicitações abre — nunca no login. O pedido de
 * permissão é intrusivo; quem nunca usa a aba não deveria vê-lo.
 */
function pedirPermissaoNotificacao(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') void Notification.requestPermission();
}

function notificarSO(titulo: string, corpo: string, tag: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, { body: corpo, tag, icon: '/logo-pagueplay.png' });
  } catch {
    // Alguns navegadores exigem ServiceWorker para notificar; falhar aqui não
    // pode derrubar a chegada da mensagem.
  }
}

// ── Hook da lista ────────────────────────────────────────────────────────────

export interface FiltrosSolicitacoes {
  setorId?:  string | null;
  equipeId?: string | null;
  /**
   * Janela dos CONCLUÍDOS, em dias. `null` traz o histórico inteiro.
   * Pedido em aberto entra sempre — ver `buscarSolicitacoes`.
   */
  dias?:     number | null;
}

/**
 * Quantos ids cabem num `in(...)` por vez.
 *
 * O filtro vai na URL, e uma lista de UUIDs cresce rápido: 300 ids já dão ~11
 * kB de querystring. Acima disso servidores e proxies começam a recusar.
 */
const LOTE_IDS = 300;

/**
 * Responsáveis pelo atendimento — hook SEPARADO de propósito.
 *
 * Ser responsável dá visão geral, e a visão geral decide se os filtros de
 * setor/equipe valem. Se esta lista viesse de dentro de `useSolicitacoesWhatsapp`,
 * a página precisaria do resultado do hook para montar os argumentos do próprio
 * hook — circular. Carregando à parte, `souResponsavel` já é conhecido antes.
 */
export function useResponsaveisAtendimento(empresaId: string | null, habilitado = true) {
  const [responsaveis, setResponsaveis] = useState<PessoaResumo[]>([]);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const recarregar = useCallback(async () => {
    if (!empresaId || !habilitado) return;
    const lista = await buscarResponsaveis(empresaId);
    if (montadoRef.current) setResponsaveis(lista);
  }, [empresaId, habilitado]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { responsaveis, recarregarResponsaveis: recarregar };
}

export function useSolicitacoesWhatsapp(
  empresaId:   string | null,
  usuarioId:   string | null,
  filtros:     FiltrosSolicitacoes,
  /** false enquanto a aba não está visível — evita buscar e assinar à toa. */
  habilitado = true,
) {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoWhatsapp[]>([]);
  const [loading, setLoading]           = useState(true);
  const [dbAtiva, setDbAtiva]           = useState(true);
  const [erro, setErro]                 = useState<string | null>(null);
  /** solicitacao_id → nº de mensagens não lidas de outra pessoa. */
  const [naoLidas, setNaoLidas]         = useState<Record<string, number>>({});
  /** solicitacao_id → total de mensagens da thread (histórico anexado). */
  const [totaisMensagens, setTotaisMensagens] = useState<Record<string, number>>({});

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const setorId  = filtros.setorId  ?? null;
  const equipeId = filtros.equipeId ?? null;
  const dias     = filtros.dias === undefined ? DIAS_HISTORICO_PADRAO : filtros.dias;

  const recarregar = useCallback(async () => {
    if (!empresaId || !habilitado) { setLoading(false); return; }
    const res = await buscarSolicitacoes({ empresaId, setorId, equipeId, dias });
    if (!montadoRef.current) return;
    // Cada mensagem nova relia a lista inteira e trocava todos os cartoes por
    // objetos novos — inclusive o que estava aberto. Reconciliar mantem a
    // identidade de quem nao mudou. Ver `lib/dadosVivos`.
    setSolicitacoes(atual => reconciliarLista(atual, res.data, {
      chave: s => s.id, iguais: iguaisProfundo,
    }));
    setDbAtiva(res.dbAtiva);
    setErro(res.erro);
    setLoading(false);
  }, [empresaId, habilitado, setorId, equipeId, dias]);

  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => { setLoading(true); void recarregar(); }, [recarregar]);

  useEffect(() => { if (habilitado) pedirPermissaoNotificacao(); }, [habilitado]);

  // ── Realtime dos pedidos: status ao vivo ───────────────────────────────────
  useEffect(() => {
    if (!empresaId || !habilitado || !dbAtiva) return;
    return assinarTabela(
      {
        topico:  `rt-sol-wpp-${empresaId}`,
        escutas: [{ tabela: 'solicitacoes_whatsapp', filtro: `empresa_id=eq.${empresaId}` }],
      },
      {
        onEvento:      () => { void recarregarRef.current(); },
        onReconectado: () => { void recarregarRef.current(); },
      },
    );
  }, [empresaId, habilitado, dbAtiva]);

  // ── Contagens: total da thread e não lidas ─────────────────────────────────
  // O total mostra que existe histórico anexado sem precisar abrir a conversa;
  // as não lidas alimentam o badge.
  //
  // As não lidas saem do MEU cursor de leitura (migration 20260731d), não mais
  // do carimbo `lida_em` da mensagem. Aquele era um só para a thread inteira, e
  // por isso a bolinha sumia da tela de todos quando qualquer um — um líder,
  // por exemplo — abria a conversa.
  /**
   * Os pedidos que estão de fato na tela, como chave estável.
   *
   * As contagens são recortadas por esta lista em vez de varrerem a empresa
   * inteira: elas alimentam badges, e badge de pedido que não está na tela é
   * trabalho jogado fora — trabalho que cresceria junto com o histórico.
   */
  const idsChave = useMemo(() => solicitacoes.map(s => s.id).join(','), [solicitacoes]);

  const recarregarContagens = useCallback(async () => {
    if (!empresaId || !usuarioId || !habilitado) return;
    const ids = idsChave ? idsChave.split(',') : [];
    if (!ids.length) {
      if (montadoRef.current) { setTotaisMensagens({}); setNaoLidas({}); }
      return;
    }

    // Em lotes: o `in(...)` viaja na URL, e uma lista longa de UUIDs estoura o
    // tamanho aceito antes de estourar qualquer limite do banco.
    const mensagens: { solicitacao_id: string; autor_id: string; criado_em: string }[] = [];
    for (let i = 0; i < ids.length; i += LOTE_IDS) {
      const fatia = ids.slice(i, i + LOTE_IDS);
      const { data, error } = await supabase
        .from('solicitacoes_whatsapp_mensagens')
        .select('solicitacao_id, autor_id, criado_em')
        .eq('empresa_id', empresaId)
        .in('solicitacao_id', fatia);
      if (error) return;
      mensagens.push(...((data ?? []) as typeof mensagens));
    }

    const leituras = await buscarLeituras(empresaId, ids);
    if (!montadoRef.current) return;

    const totais: Record<string, number> = {};
    for (const m of mensagens) {
      totais[m.solicitacao_id] = (totais[m.solicitacao_id] ?? 0) + 1;
    }
    setTotaisMensagens(totais);
    setNaoLidas(contarNaoLidas(mensagens, leituras, usuarioId));
  }, [empresaId, usuarioId, habilitado, idsChave]);

  const recarregarContagensRef = useRef(recarregarContagens);
  recarregarContagensRef.current = recarregarContagens;

  useEffect(() => { void recarregarContagens(); }, [recarregarContagens]);

  // Lida pelo handler de realtime sem virar dependência do efeito.
  const solicitacoesRef = useRef(solicitacoes);
  solicitacoesRef.current = solicitacoes;

  /**
   * A janela do navegador está atrás de outra coisa?
   *
   * É a única situação em que a notificação do SO ainda faz sentido. Desde a
   * migration 20260731a a mensagem do chat vira linha em `notificacoes`, então
   * com a janela à frente o usuário já recebe o card no canto e o sino — um
   * aviso do sistema operacional em cima disso seria o terceiro da MESMA
   * mensagem.
   *
   * Com a conversa aberta na tela nada dispara: janela à frente já barra aqui.
   */
  const janelaAtras = useCallback(() => {
    return typeof document !== 'undefined' && document.hidden;
  }, []);

  // ── Realtime das mensagens: badge + notificação do SO ──────────────────────
  // A RLS do realtime já filtra: só chega mensagem de thread que o usuário pode
  // ver. Mesmo tópico do useChatSolicitacao — o assinarTabela deduplica.
  useEffect(() => {
    if (!empresaId || !usuarioId || !habilitado || !dbAtiva) return;
    return assinarTabela(
      {
        topico:  `rt-sol-wpp-msg-${empresaId}`,
        escutas: [{
          tabela: 'solicitacoes_whatsapp_mensagens',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento: (payload) => {
          if (!montadoRef.current) return;

          if (payload.eventType === 'INSERT') {
            const nova = payload.new as unknown as MensagemSolicitacao;

            // O total conta TODA mensagem, inclusive a minha: é o tamanho do
            // histórico anexado ao atendimento, não um contador de pendências.
            setTotaisMensagens(prev => ({
              ...prev,
              [nova.solicitacao_id]: (prev[nova.solicitacao_id] ?? 0) + 1,
            }));

            if (nova.autor_id === usuarioId) return;   // eco do próprio envio

            setNaoLidas(prev => ({
              ...prev,
              [nova.solicitacao_id]: (prev[nova.solicitacao_id] ?? 0) + 1,
            }));

            // Com a janela à frente quem avisa é o card + sino (ver janelaAtras).
            if (!janelaAtras()) return;

            // O nome do autor não vem no payload do realtime (é join); a lista
            // já tem o pedido, então usamos o cliente para dar contexto.
            const pedido = solicitacoesRef.current.find(s => s.id === nova.solicitacao_id);
            const quem   = pedido?.nome_cliente ?? pedido?.codigo_cliente ?? 'Solicitação';
            notificarSO(
              `Nova mensagem — ${quem}`,
              nova.conteudo.slice(0, 120),
              `sol-wpp-${nova.solicitacao_id}`,
            );
            return;
          }

          // UPDATE/DELETE de mensagem é raro (correção manual); reler é barato.
          void recarregarContagensRef.current();
        },
        onReconectado: () => { void recarregarContagensRef.current(); },
      },
    );
  }, [empresaId, usuarioId, habilitado, dbAtiva, janelaAtras]);

  // ── Realtime dos cursores de leitura ───────────────────────────────────────
  // Tópico próprio: `assinarTabela` avisa em DEV quando o mesmo tópico é
  // reutilizado com escutas diferentes, e este ouve outra tabela.
  //
  // O que chega aqui é quase sempre a leitura de OUTRA pessoa. Recontar mesmo
  // assim é o que mantém o badge honesto quando eu abro a conversa numa segunda
  // aba: o cursor anda no banco e as duas telas acompanham.
  useEffect(() => {
    if (!empresaId || !usuarioId || !habilitado || !dbAtiva) return;
    return assinarTabela(
      {
        topico:  `rt-sol-wpp-leitura-${empresaId}`,
        escutas: [{
          tabela: 'solicitacoes_whatsapp_leitura',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento:      () => { void recarregarContagensRef.current(); },
        onReconectado: () => { void recarregarContagensRef.current(); },
      },
    );
  }, [empresaId, usuarioId, habilitado, dbAtiva]);

  /**
   * Zera o badge local ao abrir a thread.
   *
   * Adianta o que o banco confirma logo em seguida (o chat grava o cursor).
   * Sem isto a bolinha ficaria acesa pelo tempo de ida e volta da gravação.
   */
  const limparNaoLidas = useCallback((solicitacaoId: string) => {
    setNaoLidas(prev => (prev[solicitacaoId] ? { ...prev, [solicitacaoId]: 0 } : prev));
  }, []);

  return {
    solicitacoes, loading, dbAtiva, erro, naoLidas, totaisMensagens,
    recarregar, limparNaoLidas,
  };
}

// ── Hook do chat ─────────────────────────────────────────────────────────────

export interface UseChatSolicitacao {
  mensagens: MensagemSolicitacao[];
  eventos:   EventoSolicitacao[];
  loading:   boolean;
  enviando:  boolean;
  /** Nome de quem está digitando do outro lado (null = ninguém). */
  digitando: string | null;
  enviar:    (conteudo: string) => Promise<boolean>;
  /** Avisa o outro lado que estou digitando. Chame a cada tecla. */
  avisarDigitando: () => void;
  /** Cursores de leitura desta conversa — alimentam o ✓✓ das minhas mensagens. */
  leituras:  Leitura[];
}

/** Silêncio após o qual o "digitando" some sozinho. */
const DIGITANDO_TIMEOUT_MS = 3_000;

export function useChatSolicitacao(params: {
  empresaId:     string | null;
  solicitacaoId: string | null;
  usuarioId:     string | null;
  usuarioNome:   string | null;
}): UseChatSolicitacao {
  const { empresaId, solicitacaoId, usuarioId, usuarioNome } = params;

  const [mensagens, setMensagens] = useState<MensagemSolicitacao[]>([]);
  const [eventos, setEventos]     = useState<EventoSolicitacao[]>([]);
  const [leituras, setLeituras]   = useState<Leitura[]>([]);
  const [loading, setLoading]     = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [digitando, setDigitando] = useState<string | null>(null);

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // ── Carga da thread ────────────────────────────────────────────────────────
  const recarregar = useCallback(async () => {
    if (!solicitacaoId || !empresaId) {
      setMensagens([]); setEventos([]); setLeituras([]);
      return;
    }
    // Só os cursores desta conversa: o ✓✓ pergunta sobre esta thread, e o
    // recorte agora vai no banco em vez de descartar o resto aqui.
    const [msgs, evts, lidos] = await Promise.all([
      buscarMensagens(solicitacaoId, empresaId),
      buscarEventos(solicitacaoId, empresaId),
      buscarLeituras(empresaId, [solicitacaoId]),
    ]);
    if (!montadoRef.current) return;
    setMensagens(msgs);
    setEventos(evts);
    setLeituras(lidos);
    setLoading(false);
  }, [solicitacaoId, empresaId]);

  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => {
    if (!solicitacaoId) return;
    setLoading(true);
    void recarregar();
  }, [solicitacaoId, recarregar]);

  // ── Avança o MEU cursor ao abrir e a cada mensagem nova ────────────────────
  // Marca só o meu (a policy exige `usuario_id = auth.uid()`), então abrir a
  // conversa não apaga mais o aviso de ninguém.
  //
  // A guarda evita gravar à toa: sem ela, todo render da thread bateria no
  // banco. Só grava quando existe mensagem de outra pessoa depois de onde eu
  // parei — que é justamente quando o cursor precisa andar.
  useEffect(() => {
    if (!solicitacaoId || !usuarioId || !empresaId || loading) return;
    const naoLidas = contarNaoLidas(mensagens, leituras, usuarioId);
    if (!naoLidas[solicitacaoId]) return;
    void marcarConversaLida({ empresaId, solicitacaoId, usuarioId });
  }, [solicitacaoId, usuarioId, empresaId, mensagens, leituras, loading]);

  // ── Realtime das mensagens (mesmo tópico da lista — deduplica) ─────────────
  useEffect(() => {
    if (!empresaId || !solicitacaoId) return;
    return assinarTabela(
      {
        topico:  `rt-sol-wpp-msg-${empresaId}`,
        escutas: [{
          tabela: 'solicitacoes_whatsapp_mensagens',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento: (payload) => {
          if (!montadoRef.current) return;
          const linha = (payload.new ?? payload.old) as unknown as
            { solicitacao_id?: string } | null;
          // O canal é da empresa toda; aqui só interessa esta thread.
          if (linha?.solicitacao_id !== solicitacaoId) return;
          // Relê em vez de aplicar o payload: precisamos do join do autor
          // (nome e foto), que o realtime não manda.
          void recarregarRef.current();
        },
        onReconectado: () => { void recarregarRef.current(); },
      },
    );
  }, [empresaId, solicitacaoId]);

  // ── Realtime dos cursores: o ✓✓ acende quando o outro lê ───────────────────
  // Mesmo tópico da lista, que o `assinarTabela` deduplica em um canal só.
  useEffect(() => {
    if (!empresaId || !solicitacaoId) return;
    return assinarTabela(
      {
        topico:  `rt-sol-wpp-leitura-${empresaId}`,
        escutas: [{
          tabela: 'solicitacoes_whatsapp_leitura',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento: (payload) => {
          if (!montadoRef.current) return;
          const linha = (payload.new ?? payload.old) as unknown as
            { solicitacao_id?: string } | null;
          if (linha?.solicitacao_id !== solicitacaoId) return;
          void recarregarRef.current();
        },
        onReconectado: () => { void recarregarRef.current(); },
      },
    );
  }, [empresaId, solicitacaoId]);

  // ── "Digitando" via broadcast ──────────────────────────────────────────────
  // Efêmero de propósito: não é dado, é sinal. Vai por broadcast e não por
  // tabela — nada a persistir, nada a reler depois. Por isso NÃO passa pelo
  // `assinarTabela`, que cuida só de postgres_changes.
  const canalDigitandoRef = useRef<RealtimeChannel | null>(null);
  const timerDigitandoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoAvisoRef    = useRef(0);

  useEffect(() => {
    if (!solicitacaoId || !usuarioId) return;

    const canal = supabase.channel(`wpp-digitando-${solicitacaoId}`, {
      config: { broadcast: { self: false } },
    });

    canal
      .on('broadcast', { event: 'digitando' }, ({ payload }) => {
        const p = payload as { usuarioId?: string; nome?: string } | undefined;
        if (!montadoRef.current || !p?.usuarioId || p.usuarioId === usuarioId) return;
        setDigitando(p.nome ?? 'Alguém');
        if (timerDigitandoRef.current) clearTimeout(timerDigitandoRef.current);
        timerDigitandoRef.current = setTimeout(() => {
          if (montadoRef.current) setDigitando(null);
        }, DIGITANDO_TIMEOUT_MS);
      })
      .subscribe();

    canalDigitandoRef.current = canal;

    return () => {
      if (timerDigitandoRef.current) { clearTimeout(timerDigitandoRef.current); timerDigitandoRef.current = null; }
      setDigitando(null);
      canalDigitandoRef.current = null;
      void supabase.removeChannel(canal);
    };
  }, [solicitacaoId, usuarioId]);

  const avisarDigitando = useCallback(() => {
    const canal = canalDigitandoRef.current;
    if (!canal || !usuarioId) return;
    // Throttle: uma tecla por caractere geraria dezenas de eventos por segundo.
    const agora = Date.now();
    if (agora - ultimoAvisoRef.current < 1_200) return;
    ultimoAvisoRef.current = agora;
    void canal.send({
      type:    'broadcast',
      event:   'digitando',
      payload: { usuarioId, nome: (usuarioNome ?? '').split(' ')[0] || 'Alguém' },
    });
  }, [usuarioId, usuarioNome]);

  // ── Envio ──────────────────────────────────────────────────────────────────
  const enviar = useCallback(async (conteudo: string): Promise<boolean> => {
    if (!empresaId || !solicitacaoId || !usuarioId) return false;
    setEnviando(true);
    try {
      const { ok, erro } = await enviarMensagem({
        empresaId, solicitacaoId, autorId: usuarioId, conteudo,
      });
      if (!ok) {
        logger.warn('[useChatSolicitacao] falha ao enviar:', erro);
        return false;
      }
      // O realtime traz a mensagem de volta com o join do autor; recarregar aqui
      // evita depender do eco quando o canal está reconectando.
      await recarregarRef.current();
      return true;
    } finally {
      if (montadoRef.current) setEnviando(false);
    }
  }, [empresaId, solicitacaoId, usuarioId]);

  return useMemo(
    () => ({ mensagens, eventos, leituras, loading, enviando, digitando, enviar, avisarDigitando }),
    [mensagens, eventos, leituras, loading, enviando, digitando, enviar, avisarDigitando],
  );
}
