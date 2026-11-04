/**
 * canalPessoal.ts — o tópico privado `chat:<pessoa>`, que todo mundo assina.
 *
 * O `assinarTabela` divide um canal por tópico e fica com as escutas de quem
 * chegou primeiro: dois consumidores do mesmo tópico precisam declarar A MESMA
 * lista, senão o segundo fica surdo. Por isso a lista mora aqui.
 *
 *   mensagem, participante  o chat (migration 20260918110000)
 *   bingo                   o convite do Bingo do Modo TV (20261030200000)
 *
 * A policy `chat_sinal_receber` confere só o tópico, então qualquer evento
 * novo passa por ela sem mudar nada no banco.
 */
import type { EscutaSinal } from '@/lib/realtime';

export const ESCUTAS_CANAL_PESSOAL: EscutaSinal[] = [{ sinal: 'mensagem' }, { sinal: 'participante' }, { sinal: 'bingo' }];

export const topicoPessoal = (perfilId: string) => `chat:${perfilId}`;
