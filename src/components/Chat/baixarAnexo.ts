/**
 * baixarAnexo.ts — o clique de «baixar» do chat, sem abrir guia nova.
 *
 * A URL vem de `urlDeDownloadDoAnexo` (ver o porquê lá). Aqui fica só a parte
 * que precisa de `document`: um link temporário, clicado e descartado. Sem
 * `target="_blank"` — com o `Content-Disposition: attachment` do Storage o
 * navegador salva o arquivo e a página não sai do lugar.
 *
 * Mora fora de `comum.tsx` porque arquivo de componente que exporta função
 * perde o Fast Refresh, e o visualizador de mídia usa o mesmo clique.
 */
import { toast } from 'sonner';
import { urlDeDownloadDoAnexo } from '@/services/chat/chat.service';

export async function baixarAnexo(caminho: string, nome: string): Promise<void> {
  const url = await urlDeDownloadDoAnexo(caminho, nome);
  if (!url) {
    toast.error('Não foi possível baixar o arquivo. Tente de novo.');
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
