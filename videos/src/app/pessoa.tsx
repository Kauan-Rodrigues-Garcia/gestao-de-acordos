// Quem está logado no app do vídeo. O vídeo de apresentação é da operadora
// (padrão); o de autorizações no chat é do líder. A casca e o painel leem daqui.

import { createContext, useContext } from 'react';
import { OPERADORA } from './dados';

export type Pessoa = typeof OPERADORA & { papel?: 'operador' | 'lider' };

export const PessoaContext = createContext<Pessoa>(OPERADORA);

export function usePessoa(): Pessoa {
  return useContext(PessoaContext);
}

/** O líder do vídeo de autorizações. Dados fictícios. */
export const LIDER_PLAY3: Pessoa = {
  nome: 'Carlos Mendes',
  primeiroNome: 'Carlos',
  iniciais: 'CM',
  cargo: 'Líder',
  setor: 'Play 3',
  equipe: 'Equipe Águia',
  marca: 'BookPlay',
  papel: 'lider',
};
