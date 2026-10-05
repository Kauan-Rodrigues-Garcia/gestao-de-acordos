/**
 * RegistroAppInstalado — sem tela. Quando o gestão está aberto como app
 * instalado, registra (uma vez por dia) que a pessoa instalou. Ver
 * `lib/mobile/registroInstalacao.ts`.
 */
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getTodayISO } from '@/lib/index';
import { estaInstalado } from '@/lib/mobile/instalar';
import { registrarAberturaInstalada } from '@/lib/mobile/registroInstalacao';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';

export function RegistroAppInstalado(): null {
  const { perfil } = useAuth();
  const perfilId = perfil?.id ?? null;

  useEffect(() => {
    if (!perfilId || !estaInstalado() || getImpersonacaoAtiva()) return;
    void registrarAberturaInstalada(perfilId, getTodayISO()).catch((): void => undefined);
  }, [perfilId]);

  return null;
}
