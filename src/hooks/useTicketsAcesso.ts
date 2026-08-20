/**
 * useTicketsAcesso — quem enxerga a aba de Tickets, e o que faz nela.
 *
 * Três perguntas diferentes, e vale não confundi-las:
 *
 *   • **podeVerAba** — o item aparece no menu e a rota abre. Administrador
 *     sempre; a liderança só depois que a chave for virada (`tickets_config`).
 *     Operador nunca: o pedido dele passa pelo líder, que tem o contexto.
 *   • **podeAtender** — assume, muda estado, autoriza outros. Administrador por
 *     padrão, mais quem estiver em `tickets_atendentes`.
 *   • **podeAbrir** — cria ticket. Toda a liderança para cima.
 *
 * As três são CONVENIÊNCIA de tela. Quem decide de verdade é a RLS da migration
 * 20260819100000 — esconder um botão não protege nada, e é por isso que o banco
 * repete cada uma dessas regras por conta própria.
 */
import { useEffect, useState } from 'react';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { lerLiberacaoDaAba } from '@/services/tickets.service';

export interface AcessoTickets {
  carregando: boolean;
  podeVerAba: boolean;
  podeAtender: boolean;
  podeAbrir: boolean;
  podeGerenciar: boolean;
  /** Estado da chave — o botão de liberar precisa saber para se desenhar. */
  liberadoParaLideranca: boolean;
  /** Recarrega depois de virar a chave ou mexer na lista de atendentes. */
  recarregar: () => void;
}

export function useTicketsAcesso(): AcessoTickets {
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;
  const { temPermissao, loading: permissoesLoading } = useCargoPermissoes();

  const [liberado, setLiberado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!empresaId) { setCarregando(false); return; }
    let vivo = true;
    setCarregando(true);
    (async () => {
      const flag = await lerLiberacaoDaAba(empresaId);
      if (!vivo) return;
      setLiberado(flag);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [empresaId, versao]);

  return {
    carregando: carregando || permissoesLoading,
    podeVerAba: temPermissao('ver_tickets'),
    podeAtender: temPermissao('atender_tickets'),
    podeAbrir: temPermissao('abrir_tickets'),
    podeGerenciar: temPermissao('gerenciar_tickets'),
    liberadoParaLideranca: liberado,
    recarregar: () => setVersao(v => v + 1),
  };
}
