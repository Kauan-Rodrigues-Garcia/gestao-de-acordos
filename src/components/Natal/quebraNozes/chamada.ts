/**
 * A chamada local dos quebra-nozes: sobe só na tela de quem clicou. Disparam os
 * botões da prévia (`PreviaNatal.tsx`, no `npm run dev`) e o «Ver só aqui» do
 * card de Configurações › Geral; o palco do sistema (`sistema.tsx`) ouve. Fica
 * num arquivo à parte para quem dispara não puxar os bonecos junto.
 *
 * A chamada para a cidade inteira é outra coisa: passa pelo banco
 * (`configuracao.ts`).
 */
import type { TipoDeSessao } from './agenda';
import type { Cidade } from './elenco';

export const EVENTO_QUEBRA_NOZES = 'natal-quebra-nozes';

export interface ChamadaLocal {
  tipo: TipoDeSessao;
  /** À força; sem ela vale a cidade do setor de quem está logado. */
  cidade?: Cidade;
}

/**
 * Devolve se o palco ouviu. Ele só está montado com o tema de Natal ligado:
 * sem ele o clique não daria em nada, e quem chamou precisa saber dizer por
 * quê. (O palco marca que ouviu com `preventDefault`.)
 */
export function chamarQuebraNozes(chamada: ChamadaLocal): boolean {
  return !window.dispatchEvent(new CustomEvent<ChamadaLocal>(EVENTO_QUEBRA_NOZES, { detail: chamada, cancelable: true }));
}

export const SEM_PALCO = 'O palco não está nesta tela: ligue o tema de Natal.';

/** O palco responde a quem chamou: o que tocou, ou por que não tocou. */
export const EVENTO_QUEBRA_NOZES_RESPOSTA = 'natal-quebra-nozes-resposta';
