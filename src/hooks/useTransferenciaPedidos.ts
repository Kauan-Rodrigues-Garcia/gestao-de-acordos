/**
 * useTransferenciaPedidos — a lista do canal «Transferências» do chat.
 *
 * O banco recorta: super admin recebe todos os pedidos, quem pediu recebe só
 * os seus (`fn_transferencia_pedidos_listar`).
 *
 * ## Quando reler
 *
 * Sem assinatura de realtime nova (a auditoria de custo de 05/10 pesou cada
 * uma). O banco já avisa quem precisa saber, por notificação — e a
 * notificação chega na hora pelo canal pessoal que já existe:
 *
 *   • pedido novo → notificação para cada super admin;
 *   • pedido decidido → notificação para quem pediu.
 *
 * Então a lista relê quando chega notificação com a rota `/transferencias`,
 * quando a aba volta a ficar visível, e — só para o super admin, só enquanto
 * houver pedido aberto — de minuto em minuto, para ver o que OUTRO super admin
 * decidiu (ele não recebe notificação da decisão do colega).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { listarPedidos } from '@/services/admin/transferenciaPedidos.service';
import { pedidoAberto, type PedidoTransferencia } from '@/lib/transferenciaPedidos';

export const ROTA_TRANSFERENCIAS = '/transferencias';
const RELER_COM_PENDENCIA_MS = 60_000;

export interface EstadoTransferencias {
  pedidos: PedidoTransferencia[];
  carregando: boolean;
  recarregar: () => void;
}

export function useTransferenciaPedidos(ativo: boolean, souSuperAdmin: boolean): EstadoTransferencias {
  const [pedidos, setPedidos] = useState<PedidoTransferencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    if (!ativo) { setPedidos([]); setCarregando(false); return; }
    const id = ++pedido.current;
    void listarPedidos().then(lista => {
      if (id !== pedido.current) return;
      setPedidos(lista);
      setCarregando(false);
    });
  }, [ativo]);

  useEffect(() => { recarregar(); }, [recarregar]);

  // A notificação do banco é o sinal. Só a mais nova com a rota interessa.
  const { notificacoes } = useNotificacoes();
  const ultimaDoCanal = useMemo(
    () => notificacoes.find(n => n.rota === ROTA_TRANSFERENCIAS)?.id ?? null,
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

  const temAberto = pedidos.some(pedidoAberto);
  useEffect(() => {
    if (!ativo || !souSuperAdmin || !temAberto) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') recarregar();
    }, RELER_COM_PENDENCIA_MS);
    return () => clearInterval(t);
  }, [ativo, souSuperAdmin, temAberto, recarregar]);

  return { pedidos, carregando, recarregar };
}
