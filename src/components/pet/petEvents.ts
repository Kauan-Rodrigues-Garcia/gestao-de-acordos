/**
 * petEvents — canal simples (CustomEvent no window) para o app avisar o pet.
 * Zero acoplamento: quem dispara não precisa saber se o pet está montado.
 */
export const PET_EVENTO_COMEMORAR = 'pet:comemorar';

/** Chame quando o usuário marcar um acordo/parcela como pago —
 *  a Aura comemora com confete no canto da tela. */
export function celebrarPetAcordoPago() {
  try {
    window.dispatchEvent(new CustomEvent(PET_EVENTO_COMEMORAR));
  } catch { /* noop — nunca pode quebrar o fluxo de tabulação */ }
}
