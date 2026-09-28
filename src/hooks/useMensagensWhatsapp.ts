/**
 * useMensagensWhatsapp — as mensagens de WhatsApp da pessoa logada.
 *
 * Carrega uma vez por pessoa; salvar regrava a lista inteira e relê do banco,
 * para a tela mostrar o que ficou gravado e não o rascunho. Ver
 * `mensagensWhatsapp.service.ts`.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MensagemWhatsapp } from '@/lib/mensagensWhatsapp';
import {
  listarMensagensWhatsapp, salvarMensagensWhatsapp, type MensagemEditada,
} from '@/services/mensagensWhatsapp.service';

export function useMensagensWhatsapp(usuarioId: string | null | undefined) {
  const [mensagens, setMensagens] = useState<MensagemWhatsapp[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!usuarioId) { setMensagens([]); return; }
    setCarregando(true);
    const r = await listarMensagensWhatsapp(usuarioId);
    setMensagens(r.mensagens);
    setDisponivel(r.disponivel);
    setCarregando(false);
  }, [usuarioId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const salvar = useCallback(async (editadas: MensagemEditada[]): Promise<{ erro: string | null }> => {
    if (!usuarioId) return { erro: 'Sessão sem usuário.' };
    const r = await salvarMensagensWhatsapp(usuarioId, mensagens, editadas);
    await recarregar();
    return r;
  }, [usuarioId, mensagens, recarregar]);

  return { mensagens, disponivel, carregando, salvar, recarregar };
}
