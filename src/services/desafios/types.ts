/**
 * types.ts — o vocabulário do módulo de Desafios.
 *
 * Um desafio é CONFIGURAÇÃO. Nada aqui descreve o Café no IBIS: ele é uma
 * linha da tabela `desafios` com `tipo = 'bater_meta'`, duas datas e duas
 * metas. Trocar a campanha é trocar a linha, não o código.
 *
 * `regra` e `visual` são JSONB no banco e chegam como `unknown`. A leitura
 * passa por `normalizarRegra`/`normalizarVisual` (em `desafios.service.ts`),
 * que preenchem o que faltar — campanha antiga com JSON incompleto abre com o
 * padrão em vez de quebrar a tela.
 */

/** Modelos de disputa. O tipo decide o PADRÃO; a regra decide o valor. */
export type TipoDesafio =
  | 'bater_meta'
  | 'corrida'
  | 'top_ranking'
  | 'batalha_equipes'
  | 'meta_coletiva'
  | 'sprint';

/**
 * Como o ranking ordena.
 *
 * `menor_falta` é "quem está mais perto da meta" — quem já bateu tem falta
 * zero e o desempate vai para o valor recebido.
 */
export type CriterioRanking = 'maior_recebido' | 'menor_falta' | 'maior_percentual';

export type ModoDisputa = 'individual' | 'equipe';

export type StatusDesafio = 'rascunho' | 'ativo' | 'encerrado';

/** O que conta como "resultado" no desafio. */
export type MetricaDesafio = 'valor_recebido' | 'quantidade';

/**
 * Recorte de quem disputa.
 *
 * Lista vazia = sem recorte naquela dimensão (todo mundo que o escopo do
 * usuário já alcança). Não é "ninguém": um desafio que nasce sem participante
 * marcado é o caso comum — a campanha vale para a operação inteira.
 */
export interface ParticipantesDesafio {
  setores:    string[];
  equipes:    string[];
  operadores: string[];
}

export interface RegraDesafio {
  versao: 1;
  metrica: MetricaDesafio;
  modo: ModoDisputa[];
  criterioRanking: CriterioRanking;
  /** `null` = o modelo não usa meta (corrida, top ranking). */
  metaIndividual: number | null;
  metaEquipe:     number | null;
  /** Meta única da operação inteira (modelo `meta_coletiva`). */
  metaColetiva:   number | null;
  participantes: ParticipantesDesafio;
}

/** Tema da campanha. Governa a gincana, não o desenho da aplicação. */
export type TemaDesafio = 'padrao' | 'cafe' | 'corrida' | 'equipes';

export interface VisualDesafio {
  tema: TemaDesafio;
  icone: string;
  mostrarFotos: boolean;
  animarUltrapassagem: boolean;
  comemorarMeta: boolean;
}

export interface Desafio {
  id: string;
  empresaId: string;
  nome: string;
  descricao: string | null;
  premio: string | null;
  /** `yyyy-MM-dd`. Sem nenhum vínculo com mês: a campanha pode atravessá-lo. */
  dataInicio: string;
  dataFim: string;
  tipo: TipoDesafio;
  regra: RegraDesafio;
  visual: VisualDesafio;
  status: StatusDesafio;
  criadoPor: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Uma pessoa que pode disputar, como o banco a devolve.
 *
 * `setores` e `equipes` são os conjuntos em que o RECEBIMENTO dela conta —
 * equipe do cadastro mais as equipes em que ela é clone com a caixinha ligada.
 * É a mesma regra de `setoresDoOperador`, resolvida no servidor porque a
 * política de `perfis` não deixa o operador ler o cadastro dos colegas.
 */
export interface PessoaDesafio {
  id: string;
  nome: string;
  usuario: string | null;
  fotoUrl: string | null;
  equipeId: string | null;
  equipeNome: string;
  setorId: string | null;
  situacao: string;
  setores: string[];
  equipes: string[];
}

/**
 * Recebimento agregado no período, por operador e setor carimbado.
 *
 * O `setor_id` existe para que `linhaNoEscopo` — a MESMA função que o
 * dashboard e a aba Analítico usam — possa recortar por setor sem que este
 * módulo saiba como essa regra funciona.
 */
export interface LinhaDesafio {
  operador_id: string;
  setor_id: string | null;
  total: number;
  total_ho: number;
  qtd: number;
}

export interface DadosDesafio {
  participantes: PessoaDesafio[];
  linhas: LinhaDesafio[];
}
