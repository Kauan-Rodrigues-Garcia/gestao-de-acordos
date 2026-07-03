import { toast } from 'sonner';

/**
 * Copia texto para a área de transferência com fallback para navegadores
 * sem `navigator.clipboard` (ou contextos não seguros). Mostra um toast.
 */
export async function copiarTexto(texto: string, msg = 'Lista copiada'): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(msg);
    return;
  } catch {
    // Fallback: textarea temporário + execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast.success(msg);
    } catch {
      toast.error('Não foi possível copiar a lista.');
    }
  }
}
