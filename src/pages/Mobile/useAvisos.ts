/** Estado e ações do aviso de pagamento na tela mínima — ver `Avisos.tsx`. */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ativarPush, desativarPush, estadoPush, lerAmbientePush, type EstadoPush,
} from '@/lib/mobile/push';

export function useAvisos(empresaId: string | null) {
  const [estado, setEstado] = useState<EstadoPush>('desligado');
  const [ocupado, setOcupado] = useState(false);

  const reler = useCallback(async () => {
    setEstado(estadoPush(await lerAmbientePush()));
  }, []);
  useEffect(() => { void reler(); }, [reler]);

  const ativar = useCallback(async () => {
    if (!empresaId || ocupado) return;
    setOcupado(true);
    try {
      await ativarPush(empresaId);
      toast.success('Avisos ativados. Um aviso de teste está a caminho.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ativar os avisos.');
    } finally {
      setOcupado(false);
      void reler();
    }
  }, [empresaId, ocupado, reler]);

  const desativar = useCallback(async () => {
    setOcupado(true);
    try {
      await desativarPush();
      toast.success('Avisos desativados neste aparelho.');
    } catch {
      toast.error('Não foi possível desativar agora.');
    } finally {
      setOcupado(false);
      void reler();
    }
  }, [reler]);

  return { estado, ocupado, ativar, desativar };
}
