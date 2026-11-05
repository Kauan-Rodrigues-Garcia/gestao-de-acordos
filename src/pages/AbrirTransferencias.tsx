/**
 * AbrirTransferencias — a rota `/transferencias`, destino das notificações de
 * pedido de transferência (03/11/2026).
 *
 * Não é uma tela: os pedidos moram no chat, no canal «Transferências». Igual
 * a `AbrirAutorizacoes`: pede ao chat para abrir lá e devolve a pessoa para
 * onde estava.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { abrirTransferenciasNoChat } from '@/components/Chat/abrirTransferencias';
import { temTelaAnterior } from '@/hooks/useVoltar';

export default function AbrirTransferencias(): null {
  const navigate = useNavigate();
  useEffect(() => {
    abrirTransferenciasNoChat();
    if (temTelaAnterior()) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);
  return null;
}
