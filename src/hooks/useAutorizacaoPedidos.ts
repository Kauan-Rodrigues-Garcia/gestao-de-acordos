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
 * ## Por que reler em vez de aplicar o evento
 *
 * O payload do Realtime traz a linha crua, e `DELETE` traz só a replica
 * identity. Aplicar patches na lista daria três caminhos para o mesmo estado
 * (insert, update, releitura) e um deles ficaria errado. A tabela é pequena —
 * dezenas de linhas por dia, no máximo — e reler é uma consulta indexada.
 *
 * O debounce existe porque aprovar dispara `UPDATE` no pedido e `INSERT` em
 * `notificacoes` quase juntos; sem ele seriam duas releituras para um evento.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { assinarTabela } from '@/lib/realtime';
import {
  listarPedidos, type PedidoAutorizacao,
} from '@/services/autorizacaoPedidos.service';

/** Janela de agrupamento das releituras disparadas pelo realtime. */
const DEBOUNCE_MS = 250;

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const agendar = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(recarregar, DEBOUNCE_MS);
    };

    // O tópico leva a empresa porque o filtro leva. Dois tópicos com o mesmo
    // nome e escutas diferentes compartilhariam um canal só — ver `realtime.ts`.
    const desassinar = assinarTabela(
      {
        topico: `autorizacoes-${empresa.id}`,
        escutas: [{ tabela: 'autorizacoes_pedidos', filtro: `empresa_id=eq.${empresa.id}` }],
      },
      { onEvento: agendar, onReconectado: recarregar },
    );

    return () => {
      if (timer.current) clearTimeout(timer.current);
      desassinar();
    };
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
