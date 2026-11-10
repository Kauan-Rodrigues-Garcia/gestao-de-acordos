/**
 * useSenhaPedidos — a lista do canal «Senhas» do chat (05/11/2026).
 *
 * Mesmo desenho de `useTransferenciaPedidos`: sem assinatura de realtime nova.
 * A lista relê quando chega notificação com a rota `/senhas` (pedido novo para
 * o super admin, decisão para quem pediu), quando a aba volta a ficar visível
 * e — só super admin, só com pedido aberto — de minuto em minuto, para ver o
 * que OUTRO super admin decidiu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { listarPedidosSenha } from '@/services/senhaPedidos.service';
import { pedidoSenhaAberto, type PedidoSenha } from '@/lib/senhaPedidos';

export const ROTA_SENHAS = '/senhas';
const RELER_COM_PENDENCIA_MS = 60_000;

export interface EstadoSenhas {
  pedidos: PedidoSenha[];
  carregando: boolean;
  recarregar: () => void;
}

export function useSenhaPedidos(ativo: boolean, souSuperAdmin: boolean): EstadoSenhas {
  const [pedidos, setPedidos] = useState<PedidoSenha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    if (!ativo) { setPedidos([]); setCarregando(false); return; }
    const id = ++pedido.current;
    void listarPedidosSenha().then(lista => {
      if (id !== pedido.current) return;
      setPedidos(lista);
      setCarregando(false);
    });
  }, [ativo]);

  useEffect(() => { recarregar(); }, [recarregar]);

  const { notificacoes, cargaInicialConcluida } = useNotificacoes();
  const ultimaDoCanal = useMemo(
    () => notificacoes.find(n => n.rota === ROTA_SENHAS)?.id ?? null,
    [notificacoes],
  );
  // A base é o que já estava na lista quando a carga inicial voltou — inclusive
  // NADA. As notificações são apagadas toda madrugada (pg_cron 00:05), então a
  // primeira do canal no dia chega com a lista vazia: tratar "nenhuma vista
  // ainda" como "a primeira é antiga" engolia o primeiro pedido do dia, que só
  // aparecia recarregando a página (10/11/2026).
  const vista = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ativo || !cargaInicialConcluida) return;
    if (vista.current === undefined) { vista.current = ultimaDoCanal; return; }
    if (vista.current === ultimaDoCanal) return;
    vista.current = ultimaDoCanal;
    if (ultimaDoCanal) recarregar();
  }, [ativo, cargaInicialConcluida, ultimaDoCanal, recarregar]);

  useEffect(() => {
    if (!ativo) return;
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [ativo, recarregar]);

  const temAberto = pedidos.some(pedidoSenhaAberto);
  useEffect(() => {
    if (!ativo || !souSuperAdmin || !temAberto) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') recarregar();
    }, RELER_COM_PENDENCIA_MS);
    return () => clearInterval(t);
  }, [ativo, souSuperAdmin, temAberto, recarregar]);

  return { pedidos, carregando, recarregar };
}
