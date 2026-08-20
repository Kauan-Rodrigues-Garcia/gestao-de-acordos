/**
 * useAutorizacaoPedidos — o estado da gaveta de autorizações.
 *
 * Uma lista só, alimentada por `autorizacoes_pedidos` e mantida viva por
 * realtime. Serve os dois papéis ao mesmo tempo, porque a RLS já separa:
 *
 *   • quem pode decidir recebe os pendentes do escopo dele;
 *   • quem solicitou recebe o próprio pedido, e é assim que a tela do operador
 *     descobre que foi aprovado sem uma segunda consulta.
 *
 * Cada evento reconcilia somente o pedido afetado. Uma releitura completa fica
 * reservada à reconexão, quando eventos podem ter sido perdidos.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { assinarTabela } from '@/lib/realtime';
import {
  listarPedidos, type PedidoAutorizacao,
} from '@/services/autorizacaoPedidos.service';

export interface EstadoAutorizacoes {
  pedidos: PedidoAutorizacao[];
  /** Só os pendentes e não expirados — o que o contador da gaveta mostra. */
  pendentes: PedidoAutorizacao[];
  carregando: boolean;
  recarregar: () => void;
}

export function useAutorizacaoPedidos(ativo: boolean): EstadoAutorizacoes {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const [pedidos, setPedidos] = useState<PedidoAutorizacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(() => {
    if (!ativo || !empresa?.id) { setPedidos([]); setCarregando(false); return; }
    void listarPedidos().then(lista => {
      setPedidos(lista);
      setCarregando(false);
    });
  }, [ativo, empresa?.id]);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!ativo || !empresa?.id || !perfil?.id) return;

    // O tópico leva a empresa porque o filtro leva. Dois tópicos com o mesmo
    // nome e escutas diferentes compartilhariam um canal só — ver `realtime.ts`.
    const desassinar = assinarTabela(
      {
        topico: `autorizacoes-${empresa.id}`,
        escutas: [{ tabela: 'autorizacoes_pedidos', filtro: `empresa_id=eq.${empresa.id}` }],
      },
      {
        onEvento: payload => {
          const bruto = (payload.eventType === 'DELETE' ? payload.old : payload.new) as unknown as
            (PedidoAutorizacao & { id?: string }) | null;
          const id = bruto?.id;
          if (!id) return;
          setPedidos(atual => {
            if (payload.eventType === 'DELETE') return atual.filter(p => p.id !== id);
            const indice = atual.findIndex(p => p.id === id);
            if (indice < 0) return [bruto, ...atual];
            const lista = [...atual];
            lista[indice] = { ...atual[indice], ...bruto };
            return lista;
          });
        },
        onReconectado: recarregar,
      },
    );

    return desassinar;
  }, [ativo, empresa?.id, perfil?.id, recarregar]);

  /**
   * Expirado não é pendente, mesmo que a coluna ainda diga que é.
   *
   * O status só vira 'cancelado' quando alguém tenta decidir — não há trabalho
   * agendado varrendo a tabela. Filtrar na leitura é o que impede a gaveta de
   * oferecer um botão que o servidor vai recusar.
   */
  const agora = Date.now();
  const pendentes = pedidos.filter(
    p => p.status === 'pendente' && new Date(p.expira_em).getTime() > agora,
  );

  return { pedidos, pendentes, carregando, recarregar };
}
