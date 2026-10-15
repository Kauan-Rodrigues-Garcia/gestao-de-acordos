/**
 * AbrirAutorizacoes — a rota `/autorizacoes`, destino da notificação de pedido
 * de autorização (15/10/2026).
 *
 * Não é uma tela: as autorizações moram no chat, na conversa fixa do setor.
 * Esta rota pede ao chat para abrir nela e devolve a pessoa para onde estava —
 * o clique na notificação não deve tirá-la da tela em que trabalhava. Quem
 * chega sem página anterior (o link aberto direto) cai no início.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { abrirAutorizacoesNoChat } from '@/components/Autorizacoes/abrirNoChat';

export default function AbrirAutorizacoes(): null {
  const navigate = useNavigate();
  useEffect(() => {
    abrirAutorizacoesNoChat();
    const temAnterior = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
    if (temAnterior) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);
  return null;
}
