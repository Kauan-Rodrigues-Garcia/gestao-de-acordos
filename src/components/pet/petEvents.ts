/**
 * petEvents — canal simples (CustomEvent no window) para o app avisar o pet.
 * Zero acoplamento: quem dispara não precisa saber se o pet está montado.
 */
export const PET_EVENTO_COMEMORAR = 'pet:comemorar';
export const PET_EVENTO_DESPEDIDA = 'pet:despedida';

/** Chame quando o usuário marcar um acordo/parcela como pago —
 *  a Aura comemora com confete no canto da tela. */
export function celebrarPetAcordoPago() {
  try {
    window.dispatchEvent(new CustomEvent(PET_EVENTO_COMEMORAR));
  } catch { /* noop — nunca pode quebrar o fluxo de tabulação */ }
}

/**
 * Chame quando o usuário dispensar o card de despedida — o pet acena e sai
 * andando pela direita.
 *
 * O card vive no `Layout` e o pet no `App`, em subárvores diferentes: este
 * canal é o que liga os dois sem que nenhum precise conhecer o outro.
 */
export function despedirPet() {
  try {
    window.dispatchEvent(new CustomEvent(PET_EVENTO_DESPEDIDA));
  } catch { /* noop — o adeus é enfeite, não pode quebrar a tela */ }
}
