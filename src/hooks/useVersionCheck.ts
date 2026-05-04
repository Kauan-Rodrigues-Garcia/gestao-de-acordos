import { useEffect } from 'react';
import { toast } from 'sonner';

declare const __APP_VERSION__: string;

const POLL_MS = 5 * 60 * 1000; // 5 minutos

export function useVersionCheck() {
  useEffect(() => {
    // Em desenvolvimento (__APP_VERSION__ = 'dev') não faz polling
    if (__APP_VERSION__ === 'dev') return;

    let toastMostrado = false;

    async function check() {
      if (toastMostrado) return;
      try {
        const res = await fetch('/version.json?_t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        if (v && v !== __APP_VERSION__) {
          toastMostrado = true;
          toast.info('Nova versão disponível', {
            description: 'Uma atualização foi publicada. Recarregue para aplicar.',
            action: { label: 'Recarregar', onClick: () => window.location.reload() },
            duration: Infinity,
          });
        }
      } catch {
        // erro de rede — ignorar silenciosamente
      }
    }

    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);
}
