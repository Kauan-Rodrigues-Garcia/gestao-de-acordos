/**
 * tiposDesafio.ts — os modelos de gincana.
 *
 * ## Por que uma tabela e não seis telas
 *
 * "Bater a meta", "corrida", "top ranking", "batalha de equipes", "meta
 * coletiva" e "sprint" não são seis páginas: são seis combinações de três
 * perguntas — o ranking ordena por quê, existe meta, e a disputa é individual,
 * por equipe ou as duas. Escrever uma página por modelo obrigaria a próxima
 * gincana a virar uma sétima página.
 *
 * O modelo aqui é só o PADRÃO. O valor efetivo continua vindo da `regra` da
 * campanha: um `top_ranking` com critério trocado à mão é válido, e a tela não
 * precisa saber disso.
 */
import type { CriterioRanking, ModoDisputa, TipoDesafio } from './types';

export interface ModeloDesafio {
  tipo: TipoDesafio;
  nome: string;
  /** Uma frase, como o administrador lê na tela de configuração. */
  objetivo: string;
  criterioPadrao: CriterioRanking;
  modoPadrao: ModoDisputa[];
  /** O modelo trabalha com meta individual/equipe? */
  usaMeta: boolean;
  /** O modelo tem uma meta única da operação inteira? */
  usaMetaColetiva: boolean;
}

export const MODELOS_DESAFIO: readonly ModeloDesafio[] = [
  {
    tipo: 'bater_meta',
    nome: 'Bater a meta',
    objetivo: 'Atingir a meta, ou chegar mais perto dela que os outros.',
    criterioPadrao: 'menor_falta',
    modoPadrao: ['individual', 'equipe'],
    usaMeta: true,
    usaMetaColetiva: false,
  },
  {
    tipo: 'corrida',
    nome: 'Corrida',
    objetivo: 'Quem receber mais dentro do período.',
    criterioPadrao: 'maior_recebido',
    modoPadrao: ['individual'],
    usaMeta: false,
    usaMetaColetiva: false,
  },
  {
    tipo: 'top_ranking',
    nome: 'Top ranking',
    objetivo: 'Classificar os melhores operadores do período.',
    criterioPadrao: 'maior_recebido',
    modoPadrao: ['individual'],
    usaMeta: false,
    usaMetaColetiva: false,
  },
  {
    tipo: 'batalha_equipes',
    nome: 'Batalha de equipes',
    objetivo: 'Comparar o resultado consolidado entre as equipes.',
    criterioPadrao: 'maior_recebido',
    modoPadrao: ['equipe'],
    usaMeta: true,
    usaMetaColetiva: false,
  },
  {
    tipo: 'meta_coletiva',
    nome: 'Meta coletiva',
    objetivo: 'Todo mundo somando para o mesmo número.',
    criterioPadrao: 'maior_recebido',
    modoPadrao: ['individual', 'equipe'],
    usaMeta: false,
    usaMetaColetiva: true,
  },
  {
    tipo: 'sprint',
    nome: 'Sprint',
    objetivo: 'Disputa curta, de poucos dias.',
    criterioPadrao: 'maior_recebido',
    modoPadrao: ['individual'],
    usaMeta: true,
    usaMetaColetiva: false,
  },
] as const;

const POR_TIPO = new Map(MODELOS_DESAFIO.map(m => [m.tipo, m]));

/** O modelo de um tipo. Tipo desconhecido cai em «bater a meta», o mais geral. */
export function modeloDoTipo(tipo: TipoDesafio | string): ModeloDesafio {
  return POR_TIPO.get(tipo as TipoDesafio) ?? MODELOS_DESAFIO[0];
}

/** Rótulo do critério, como aparece no Hero e na configuração. */
export function rotuloCriterio(criterio: CriterioRanking): string {
  switch (criterio) {
    case 'menor_falta':      return 'Mais perto da meta';
    case 'maior_percentual': return 'Maior percentual da meta';
    case 'maior_recebido':   return 'Maior valor recebido';
  }
}
