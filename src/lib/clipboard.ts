import { toast } from 'sonner';

/**
 * src/lib/clipboard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Copiar para a área de transferência, com fallback e feedback.
 *
 * `navigator.clipboard.writeText` REJEITA em situações corriqueiras — página
 * servida em http, documento sem foco, permissão negada. Havia quatro versões
 * disto no projeto e as chamadas cruas espalhadas falhavam de três formas:
 *
 *   • `ModalFilaWhatsApp` / `AdminConfiguracoes` / `AcordosTableBody` — sem
 *     `.catch()`: o clique não copiava, não avisava nada, e ainda gerava
 *     unhandled rejection;
 *   • `useCampanhaFacil` — o toast "Mensagem copiada." ficava FORA do try, então
 *     aparecia mesmo quando os dois caminhos de cópia falhavam;
 *   • `PixAutomatico` — cópia local homônima, sem o fallback de `execCommand`.
 */

/**
 * Copia `texto`, avisando por toast.
 *
 * @param msgOk   toast de sucesso.
 * @param msgErro toast de falha. Sem isto, a mensagem antiga dizia sempre
 *                "Não foi possível copiar a lista." — errada em quase todo lugar.
 * @returns `true` se copiou.
 */
export async function copiarTexto(
  texto:   string,
  msgOk    = 'Lista copiada',
  msgErro  = 'Não foi possível copiar.',
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(msgOk);
    return true;
  } catch {
    // Fallback: textarea temporário + execCommand (contexto não seguro, foco).
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      const copiou = document.execCommand('copy');
      ta.remove();
      // `execCommand` devolve false em vez de lançar quando o navegador recusa —
      // sem checar o retorno, anunciávamos sucesso sem ter copiado.
      if (!copiou) { toast.error(msgErro); return false; }
      toast.success(msgOk);
      return true;
    } catch {
      toast.error(msgErro);
      return false;
    }
  }
}

/** Copia sem toast de sucesso — para quem já dá o próprio feedback visual. */
export async function copiarTextoSilencioso(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      const copiou = document.execCommand('copy');
      ta.remove();
      return copiou;
    } catch {
      return false;
    }
  }
}
