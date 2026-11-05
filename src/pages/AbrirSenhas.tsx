/**
 * AbrirSenhas — a rota `/senhas`, destino das notificações de pedido de reset
 * de senha (05/11/2026).
 *
 * Não é uma tela: os pedidos moram no chat, no canal «Senhas». Igual a
 * `AbrirTransferencias`: pede ao chat para abrir lá e devolve a pessoa para
 * onde estava.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { abrirSenhasNoChat } from '@/components/Chat/abrirSenhas';
import { temTelaAnterior } from '@/hooks/useVoltar';

export default function AbrirSenhas(): null {
  const navigate = useNavigate();
  useEffect(() => {
    abrirSenhasNoChat();
    if (temTelaAnterior()) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);
  return null;
}
