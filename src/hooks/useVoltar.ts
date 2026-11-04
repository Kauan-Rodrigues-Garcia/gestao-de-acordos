/**
 * useVoltar — o botão «Voltar» que sempre leva a algum lugar.
 *
 * `navigate(-1)` sozinho não faz nada quando a página foi aberta direto (link
 * colado, nova aba, favorito): não há tela anterior DENTRO do app, e o clique
 * morria ou tirava a pessoa do sistema. Com histórico, volta; sem histórico,
 * vai para `alternativa`. É a mesma régua de `pages/AbrirAutorizacoes`.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** O router grava `idx` no `history.state`: 0 é a primeira tela da aba. */
export function temTelaAnterior(): boolean {
  return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
}

export function useVoltar(alternativa: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (temTelaAnterior()) navigate(-1);
    else navigate(alternativa, { replace: true });
  }, [navigate, alternativa]);
}
