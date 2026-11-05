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

  const { notificacoes } = useNotificacoes();
  const ultimaDoCanal = useMemo(
    () => notificacoes.find(n => n.rota === ROTA_SENHAS)?.id ?? null,
    [notificacoes],
  );
  const vista = useRef<string | null>(null);
  useEffect(() => {
    if (!ativo || !ultimaDoCanal || vista.current === ultimaDoCanal) return;
    const primeira = vista.current === null;
    vista.current = ultimaDoCanal;
    if (!primeira) recarregar();
  }, [ativo, ultimaDoCanal, recarregar]);

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
