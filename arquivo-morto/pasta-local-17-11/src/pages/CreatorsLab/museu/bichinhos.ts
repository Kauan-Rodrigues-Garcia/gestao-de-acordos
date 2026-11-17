/**
 * Os três bichinhos do Museu.
 *
 * Saem do sorteio de aparência da própria Corrida da Sorte, com uma semente
 * fixa: os mesmos três em toda visita, e de ninguém — não é a escolha de
 * nenhuma pessoa nem de nenhuma corrida de verdade.
 */
import { opcoesDe } from '@/components/Corrida/motor/bichinhos';

export const BICHINHOS_DO_MUSEU = opcoesDe(1, 'museu');

/** Os corredores da peça: nomes de mentira, um por bichinho. */
export const CORREDORES_DO_MUSEU = ['Corredor A', 'Corredor B', 'Corredor C'] as const;
