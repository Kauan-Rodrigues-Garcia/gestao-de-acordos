/**
 * useFilaCantina — a fila do dia no painel da cantina.
 *
 * Um tópico só (`cantina-fila:hoje`), privado, que traz ids: pedido novo,
 * mudança de status e mensagem do cliente. A tela relê a fila do dia inteira —
 * são dezenas de pedidos, uma leitura só. Pedido novo toca o som e conta no
 * título da aba, para quem está com o painel em segundo plano.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { assinarTabela } from '@/lib/realtime';
import { tocarSomNotificacao } from '@/lib/som-notificacao';
import { relogioSP, type PedidoCantina, type StatusPedido } from '@/lib/cantina';
import { cancelarPedido, filaDoDia, mudarStatus } from '@/services/cantina/cantina.service';

const TIQUE_MS = 20_000;

export function useFilaCantina() {
  const [pedidos, setPedidos] = useState<PedidoCantina[]>([]);
  const [dia, setDia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Ids que acabaram de chegar: o card pulsa até alguém mexer. */
  const [recentes, setRecentes] = useState<Set<string>>(new Set());
  const [versaoConversa, setVersaoConversa] = useState(0);
  const [mudando, setMudando] = useState<string | null>(null);

  const derivaRef = useRef(0);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());

  const recarregar = useCallback(async () => {
    try {
      const f = await filaDoDia();
      derivaRef.current = Date.parse(f.agora) - Date.now();
      setAgoraMs(Date.now() + derivaRef.current);
      setPedidos(f.pedidos);
      setDia(f.dia);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a fila.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now() + derivaRef.current), TIQUE_MS);
    return () => clearInterval(t);
  }, []);

  // Virou o dia com o painel aberto: a fila é outra.
  const hoje = relogioSP(agoraMs).dia;
  useEffect(() => {
    if (dia && dia !== hoje) void recarregar();
  }, [dia, hoje, recarregar]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void recarregar(); }, 300);
    };
    const parar = assinarTabela(
      { topico: 'cantina-fila:hoje', escutas: [{ sinal: 'mudou' }] },
      {
        onSinal: (payload) => {
          const ids = Array.isArray(payload.ids) ? payload.ids.filter((x): x is string => typeof x === 'string') : [];
          if (payload.novo) {
            tocarSomNotificacao('critica');
            setRecentes(r => new Set([...r, ...ids]));
            toast.success(ids.length > 1 ? `${ids.length} pedidos novos!` : 'Pedido novo na fila!');
          }
          if (payload.mensagem) {
            tocarSomNotificacao('atencao');
            setVersaoConversa(v => v + 1);
          }
          reler();
        },
        onReconectado: () => { setVersaoConversa(v => v + 1); reler(); },
      },
    );
    return () => { if (timer) clearTimeout(timer); parar(); };
  }, [recarregar]);

  // Título da aba: «(3) Painel da Cantina» enquanto houver pedido novo.
  const novos = useMemo(() => pedidos.filter(p => p.status === 'novo').length, [pedidos]);
  useEffect(() => {
    const original = document.title;
    if (novos > 0) document.title = `(${novos}) Pedidos na cantina`;
    return () => { document.title = original; };
  }, [novos]);

  const visto = useCallback((id: string) => {
    setRecentes(r => { if (!r.has(id)) return r; const n = new Set(r); n.delete(id); return n; });
  }, []);

  const trocar = useCallback(async (id: string, status: StatusPedido) => {
    setMudando(id);
    visto(id);
    try {
      const p = await mudarStatus(id, status);
      setPedidos(ps => ps.map(x => (x.id === p.id ? p : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível mudar o pedido.');
      void recarregar();
    } finally {
      setMudando(null);
    }
  }, [recarregar, visto]);

  const cancelar = useCallback(async (id: string, motivo: string) => {
    try {
      const p = await cancelarPedido(id, 'cantina', motivo);
      setPedidos(ps => ps.map(x => (x.id === p.id ? p : x)));
      toast.success(`Pedido #${p.numero} cancelado. Quem pediu foi avisado.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível cancelar.');
      return false;
    }
  }, []);

  return {
    pedidos, dia, carregando, erro, recarregar, agoraMs,
    recentes, visto, versaoConversa, trocar, cancelar, mudando,
  };
}
