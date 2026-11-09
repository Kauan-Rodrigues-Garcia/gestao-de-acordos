/** copiar.ts — copiar texto para a área de transferência, com plano B para navegador sem `clipboard`. */
import { toast } from 'sonner';

export async function copiarTexto(texto: string, aviso = 'Texto copiado. É só colar no ticket.'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Plano B: navegador antigo ou página sem permissão de clipboard.
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) {
      toast.error('Não consegui copiar. Selecione o texto e use Ctrl+C.');
      return false;
    }
  }
  toast.success(aviso);
  return true;
}
