/**
 * useTicketsAcesso — quem enxerga a aba de Tickets, e o que faz nela.
 *
 * Três perguntas diferentes, e vale não confundi-las:
 *
 *   • **podeVerAba** — o item aparece no menu e a rota abre. Quem administra,
 *     sempre; quem abre chamado, só depois que a chave da empresa for virada
 *     (`tickets_config`).
 *   • **podeAtender** — assume, muda estado, autoriza outros. Quem administra,
 *     mais quem estiver em `tickets_atendentes`.
 *   • **podeAbrir** — cria ticket.
 *
 * ## De onde as respostas vêm, desde 24/08/2026
 *
 * `tickets_administrar` e `tickets_abrir`, no painel de permissões. Antes eram
 * `isPerfilAdmin` e `isPerfilLider || isPerfilDiretoria` — listas de cargo
 * escritas aqui, que faziam deste o único módulo cujo acesso o painel não
 * governava. Liberar Tickets para mais um cargo exigia deploy.
 *
 * As três continuam sendo CONVENIÊNCIA de tela: quem decide de verdade é a RLS
 * da migration 20260819100000, que pergunta as mesmas chaves.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
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
  const { temPermissao } = useCargoPermissoes();
  const empresaId = empresa?.id ?? null;
  const meuId = perfil?.id ?? null;

  const [liberado, setLiberado] = useState(false);
  const [ehAtendente, setEhAtendente] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  /*
   * Quem administra a fila. Era `isPerfilAdmin(cargo)`.
   *
   * Tickets era o ÚNICO módulo cujo acesso ficava inteiramente fora do painel —
   * flag por empresa + cadastro de atendentes + cargo. `docs/
   * PERMISSOES-POR-ABA-PROJETO.md` §5.3 registrou isso como pendência
   * consciente: chave sem consumidor reprova no teste de contrato, então a
   * chave e o consumidor tinham de entrar juntos. Entraram em 24/08/2026.
   */
  const ehAdmin = temPermissao('tickets_administrar');

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

  // Quem abre chamado. Era `isPerfilLider || isPerfilDiretoria`.
  const ehLideranca = temPermissao('tickets_abrir');
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
