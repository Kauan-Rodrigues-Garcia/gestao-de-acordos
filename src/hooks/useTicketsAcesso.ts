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
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { isPerfilAdmin, isPerfilDiretoria, isPerfilLider } from '@/lib/index';
import { lerLiberacaoDaAba, listarAtendentes } from '@/services/tickets.service';

export interface AcessoTickets {
  carregando: boolean;
  podeVerAba: boolean;
  podeAtender: boolean;
  podeAbrir: boolean;
  /** Estado da chave — o botão de liberar precisa saber para se desenhar. */
  liberadoParaLideranca: boolean;
  /** Recarrega depois de virar a chave ou mexer na lista de atendentes. */
  recarregar: () => void;
}

export function useTicketsAcesso(): AcessoTickets {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;
  const cargo = perfil?.perfil ?? '';
  const meuId = perfil?.id ?? null;

  const [liberado, setLiberado] = useState(false);
  const [ehAtendente, setEhAtendente] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  const ehAdmin = isPerfilAdmin(cargo);

  useEffect(() => {
    if (!empresaId) { setCarregando(false); return; }
    let vivo = true;
    setCarregando(true);
    (async () => {
      const [flag, atendentes] = await Promise.all([
        lerLiberacaoDaAba(empresaId),
        // Admin já atende por cargo; poupar a consulta é o caso mais comum.
        ehAdmin ? Promise.resolve([]) : listarAtendentes(empresaId),
      ]);
      if (!vivo) return;
      setLiberado(flag);
      setEhAtendente(ehAdmin || atendentes.some(a => a.perfilId === meuId));
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [empresaId, meuId, ehAdmin, versao]);

  const ehLideranca = isPerfilLider(cargo) || isPerfilDiretoria(cargo);
  const podeAbrir   = ehAdmin || ehLideranca;
  // Atendente autorizado enxerga a aba mesmo com a chave fechada: sem isso,
  // autorizar alguém no dia do teste não teria efeito nenhum até a liberação.
  const podeVerAba  = ehAdmin || ehAtendente || (liberado && ehLideranca);

  return {
    carregando,
    podeVerAba,
    podeAtender: ehAtendente,
    podeAbrir,
    liberadoParaLideranca: liberado,
    recarregar: () => setVersao(v => v + 1),
  };
}
