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
import { logger } from '@/lib/logger';
import {
  buscarSolicitacoes, buscarMensagens, enviarMensagem, marcarMensagensLidas,
  buscarResponsaveis, buscarEventos,
  type SolicitacaoWhatsapp, type MensagemSolicitacao, type EventoSolicitacao,
  type PessoaResumo,
} from '@/services/solicitacoesWhatsapp.service';

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
}

export function useSolicitacoesWhatsapp(
  empresaId:   string | null,
  usuarioId:   string | null,
  filtros:     FiltrosSolicitacoes,
  /** false enquanto a aba não está visível — evita buscar e assinar à toa. */
  habilitado = true,
) {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoWhatsapp[]>([]);
  const [responsaveis, setResponsaveis] = useState<PessoaResumo[]>([]);
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

  const recarregar = useCallback(async () => {
    if (!empresaId || !habilitado) { setLoading(false); return; }
    const res = await buscarSolicitacoes({ empresaId, setorId, equipeId });
    if (!montadoRef.current) return;
    setSolicitacoes(res.data);
    setDbAtiva(res.dbAtiva);
    setErro(res.erro);
    setLoading(false);
  }, [empresaId, habilitado, setorId, equipeId]);

  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => { setLoading(true); void recarregar(); }, [recarregar]);

  // Responsáveis (muda pouco; recarrega junto com a lista).
  const recarregarResponsaveis = useCallback(async () => {
    if (!empresaId || !habilitado) return;
    const lista = await buscarResponsaveis(empresaId);
    if (montadoRef.current) setResponsaveis(lista);
  }, [empresaId, habilitado]);

  useEffect(() => { void recarregarResponsaveis(); }, [recarregarResponsaveis]);

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
  // Uma query só devolve as duas: o total mostra que existe histórico anexado
  // sem precisar abrir a conversa, e as não lidas alimentam o badge.
  const recarregarContagens = useCallback(async () => {
    if (!empresaId || !usuarioId || !habilitado) return;
    const { data, error } = await supabase
      .from('solicitacoes_whatsapp_mensagens')
      .select('solicitacao_id, autor_id, lida_em')
      .eq('empresa_id', empresaId);
    if (error || !montadoRef.current) return;

    const totais: Record<string, number> = {};
    const naoLidasMapa: Record<string, number> = {};
    for (const m of (data ?? []) as { solicitacao_id: string; autor_id: string; lida_em: string | null }[]) {
      totais[m.solicitacao_id] = (totais[m.solicitacao_id] ?? 0) + 1;
      // Não lida = de outra pessoa e sem carimbo. A própria mensagem nunca conta.
      if (m.autor_id !== usuarioId && !m.lida_em) {
        naoLidasMapa[m.solicitacao_id] = (naoLidasMapa[m.solicitacao_id] ?? 0) + 1;
      }
    }
    setTotaisMensagens(totais);
    setNaoLidas(naoLidasMapa);
  }, [empresaId, usuarioId, habilitado]);

  const recarregarContagensRef = useRef(recarregarContagens);
  recarregarContagensRef.current = recarregarContagens;

  useEffect(() => { void recarregarContagens(); }, [recarregarContagens]);

  // Lida pelo handler de realtime sem virar dependência do efeito.
  const solicitacoesRef = useRef(solicitacoes);
  solicitacoesRef.current = solicitacoes;

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

          // UPDATE = carimbo de leitura; a contagem precisa ser refeita.
          void recarregarContagensRef.current();
        },
        onReconectado: () => { void recarregarContagensRef.current(); },
      },
    );
  }, [empresaId, usuarioId, habilitado, dbAtiva]);

  /** Zera o badge local ao abrir a thread (o banco é carimbado pelo chat). */
  const limparNaoLidas = useCallback((solicitacaoId: string) => {
    setNaoLidas(prev => (prev[solicitacaoId] ? { ...prev, [solicitacaoId]: 0 } : prev));
  }, []);

  return {
    solicitacoes, responsaveis, loading, dbAtiva, erro, naoLidas, totaisMensagens,
    recarregar, recarregarResponsaveis, limparNaoLidas,
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
    if (!solicitacaoId) { setMensagens([]); setEventos([]); return; }
    const [msgs, evts] = await Promise.all([
      buscarMensagens(solicitacaoId),
      buscarEventos(solicitacaoId),
    ]);
    if (!montadoRef.current) return;
    setMensagens(msgs);
    setEventos(evts);
    setLoading(false);
  }, [solicitacaoId]);

  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => {
    if (!solicitacaoId) return;
    setLoading(true);
    void recarregar();
  }, [solicitacaoId, recarregar]);

  // ── Marcar como lidas ao abrir e a cada mensagem nova ──────────────────────
  useEffect(() => {
    if (!solicitacaoId || !usuarioId || loading) return;
    const temNaoLidaDeOutro = mensagens.some(m => m.autor_id !== usuarioId && !m.lida_em);
    if (!temNaoLidaDeOutro) return;
    void marcarMensagensLidas({ solicitacaoId, usuarioId });
  }, [solicitacaoId, usuarioId, mensagens, loading]);

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
    () => ({ mensagens, eventos, loading, enviando, digitando, enviar, avisarDigitando }),
    [mensagens, eventos, loading, enviando, digitando, enviar, avisarDigitando],
  );
}
