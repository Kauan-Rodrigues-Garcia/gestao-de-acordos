/**
 * useCantina — o estado da aba Cantina do colaborador.
 *
 * ## Leve de propósito
 *
 *   - O cardápio vem do cache curto (5 min). Ele muda poucas vezes por dia e
 *     não tem tempo real: quem abre a aba de novo lê o atual.
 *   - Tempo real SÓ com pedido em andamento hoje. Sem pedido na fila, a aba não
 *     abre canal nenhum. Com pedido, um tópico privado da pessoa
 *     (`cantina-pessoa:<id>`) que traz só ids — a tela relê os próprios pedidos.
 *   - «Pedido pronto» chega também pelo sino do sistema, em qualquer tela: a
 *     linha em `notificacoes` é gravada pelo banco.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { assinarTabela } from '@/lib/realtime';
import { espiarCache, invalidarCache, lerComCache } from '@/lib/cacheCurto';
import {
  carrinhoReducer, emAndamento, relogioSP, totalDoCarrinho,
  type Cardapio, type PedidoCantina,
} from '@/lib/cantina';
import { buscarCardapio, cancelarPedido, fazerPedido, meusPedidos } from '@/services/cantina/cantina.service';

const CHAVE_CARDAPIO = 'cantina:cardapio';
const VALIDADE_CARDAPIO_MS = 5 * 60_000;
/** O relógio da tela anda de 20 em 20 s: o bastante para faixa e cadeado. */
const TIQUE_MS = 20_000;

export function useCantina() {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const [cardapio, setCardapio] = useState<Cardapio | null>(
    () => espiarCache<Cardapio>(CHAVE_CARDAPIO, VALIDADE_CARDAPIO_MS) ?? null,
  );
  const [erroCardapio, setErroCardapio] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCantina[]>([]);
  const [carregandoPedidos, setCarregandoPedidos] = useState(true);
  const [carrinho, despachar] = useReducer(carrinhoReducer, []);
  const [enviando, setEnviando] = useState(false);
  /** Muda a cada aviso de mensagem nova: a conversa aberta relê. */
  const [versaoConversa, setVersaoConversa] = useState(0);

  // Diferença entre o relógio do servidor e o do computador.
  const derivaRef = useRef(0);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());

  const carregarCardapio = useCallback(async (forcar = false) => {
    if (forcar) invalidarCache(CHAVE_CARDAPIO);
    try {
      const c = await lerComCache(CHAVE_CARDAPIO, VALIDADE_CARDAPIO_MS, buscarCardapio);
      derivaRef.current = Date.parse(c.agora) - Date.now();
      setAgoraMs(Date.now() + derivaRef.current);
      setCardapio(c);
      setErroCardapio(null);
    } catch (e) {
      setErroCardapio(e instanceof Error ? e.message : 'Não foi possível abrir o cardápio.');
    }
  }, []);

  const recarregarPedidos = useCallback(async () => {
    try {
      setPedidos(await meusPedidos());
    } catch (e) {
      console.error('[Cantina] meus pedidos:', e);
    } finally {
      setCarregandoPedidos(false);
    }
  }, []);

  useEffect(() => { void carregarCardapio(); void recarregarPedidos(); }, [carregarCardapio, recarregarPedidos]);

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now() + derivaRef.current), TIQUE_MS);
    return () => clearInterval(t);
  }, []);

  const relogio = useMemo(() => relogioSP(agoraMs), [agoraMs]);

  const hoje = useMemo(() => pedidos.filter(p => p.dia === relogio.dia), [pedidos, relogio.dia]);
  const temAndamento = hoje.some(p => emAndamento(p.status));

  // Tempo real só enquanto há o que acompanhar.
  useEffect(() => {
    if (!uid || !temAndamento) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void recarregarPedidos(); }, 250);
    };
    const parar = assinarTabela(
      { topico: `cantina-pessoa:${uid}`, escutas: [{ sinal: 'mudou' }] },
      {
        onSinal: (payload) => {
          if (payload.mensagem) setVersaoConversa(v => v + 1);
          reler();
        },
        onReconectado: () => { setVersaoConversa(v => v + 1); reler(); },
      },
    );
    return () => { if (timer) clearTimeout(timer); parar(); };
  }, [uid, temAndamento, recarregarPedidos]);

  const total = useMemo(() => totalDoCarrinho(carrinho), [carrinho]);

  const confirmar = useCallback(async (hora: string, observacao: string): Promise<PedidoCantina | null> => {
    if (carrinho.length === 0) return null;
    setEnviando(true);
    try {
      const novo = await fazerPedido(
        carrinho.map(l => ({
          item_id: l.item.id, quantidade: l.quantidade, opcao: l.opcao,
          observacao: l.observacao.trim() || null,
        })),
        hora,
        observacao.trim() || null,
      );
      despachar({ tipo: 'esvaziar' });
      setPedidos(ps => [novo, ...ps.filter(p => p.id !== novo.id)]);
      return novo;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível fazer o pedido.';
      toast.error(msg);
      // O cardápio pode ter mudado (item saiu, preço, horário): relê.
      if (/cardápio|só pode ser pedido|recebendo/i.test(msg)) void carregarCardapio(true);
      return null;
    } finally {
      setEnviando(false);
    }
  }, [carrinho, carregarCardapio]);

  const cancelar = useCallback(async (id: string) => {
    try {
      const p = await cancelarPedido(id, 'cliente');
      setPedidos(ps => ps.map(x => (x.id === p.id ? p : x)));
      toast.success(`Pedido #${p.numero} cancelado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível cancelar.');
      void recarregarPedidos();
    }
  }, [recarregarPedidos]);

  return {
    cardapio, erroCardapio, recarregarCardapio: () => carregarCardapio(true),
    pedidos, hoje, carregandoPedidos, recarregarPedidos,
    carrinho, despachar, total, enviando, confirmar, cancelar,
    agoraMs, relogio, versaoConversa,
  };
}

export type EstadoCantina = ReturnType<typeof useCantina>;
