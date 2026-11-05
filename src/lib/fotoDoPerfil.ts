/**
 * A foto do próprio perfil, entre quem a troca (o menu do perfil, no `Layout`)
 * e quem depende dela (o trenzinho de Natal: só entra na fila quem tem foto).
 *
 * Só eventos da janela: quem troca avisa, quem depende relê do banco.
 */

const FOTO_MUDOU = 'perfil:foto-mudou';
const PEDIR_FOTO = 'perfil:pedir-foto';

/** O `Layout` chama depois de pôr ou tirar a foto. */
export function avisarFotoMudou() {
  window.dispatchEvent(new Event(FOTO_MUDOU));
}

export function ouvirFotoMudou(f: () => void) {
  window.addEventListener(FOTO_MUDOU, f);
  return () => window.removeEventListener(FOTO_MUDOU, f);
}

/** Abre o menu do perfil, onde se põe a foto. */
export function pedirFotoDoPerfil() {
  window.dispatchEvent(new Event(PEDIR_FOTO));
}

export function ouvirPedidoDeFoto(f: () => void) {
  window.addEventListener(PEDIR_FOTO, f);
  return () => window.removeEventListener(PEDIR_FOTO, f);
}
