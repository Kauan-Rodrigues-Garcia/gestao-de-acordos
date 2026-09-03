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
 *
 * `excluidos` é a única lista que se lê ao contrário: ela TIRA gente que as
 * outras três já colocaram. Existe porque «os líderes destes cinco setores,
 * menos a Fulana» é uma frase comum na operação, e a alternativa seria
 * abandonar o recorte por setor e cadastrar quarenta pessoas à mão.
 */
export interface ParticipantesDesafio {
  setores:    string[];
  equipes:    string[];
  operadores: string[];
  /** Cargos que disputam (`perfis.perfil`). Vazio = todos os cargos. */
  cargos:     string[];
  /** Tirados da campanha, mesmo estando num setor ou equipe dela. */
  excluidos:  string[];
  /**
   * Super admins convidados para TESTAR a campanha.
   *
   * `fn_desafio_pessoas_multi` exclui `super_admin` do quadro de propósito —
   * não é operação, e encheria todo ranking de gente que não disputa. Quem
   * está nesta lista fura essa exclusão, um a um, e entra no placar como
   * qualquer participante.
   *
   * É ferramenta de conferência: montar a campanha, entrar nela e ver como
   * ela se comporta antes de publicar.
   */
  convidados: string[];
}

/**
 * O prêmio de uma colocação.
 *
 * A lista substitui o campo `premio` (texto solto) quando está preenchida —
 * `premio` continua existindo para a campanha que tem um prêmio só, e para as
 * que foram criadas antes desta lista.
 *
 * `posicao` é 1-based e não precisa ser contígua: 1º, 2º e 5º é uma premiação
 * válida, e inventar o 3º e o 4º para tapar o buraco seria pior.
 */
export interface PremioPorPosicao {
  posicao: number;
  premio: string;
  /** Emoji ou ícone curto, opcional. Some quando vazio. */
  icone?: string;
}

/**
 * Contra quem se disputa.
 *
 * `empresa` = um placar só, com todo mundo. `setor` = cada pessoa disputa
 * dentro do próprio setor, e o placar dela é o do setor dela — três setores,
 * três disputas paralelas, sem uma comparar com a outra.
 *
 * A pergunta "qual é o setor desta pessoa" continua sendo respondida pela
 * regra de sempre (cadastro + clones que contam), resolvida no servidor.
 */
export type EscopoDisputa = 'empresa' | 'setor';

/**
 * Quem leva o prêmio.
 *
 * `todos_que_batem` — atingir o valor até o encerramento já ganha; não há um
 * vencedor único, e o ranking é só a forma de acompanhar. É o caso do Café no
 * IBIS.
 *
 * `melhor_colocado` — o primeiro do ranking leva. Aí o critério de ordenação é
 * também o critério do prêmio.
 */
export type Premiacao = 'todos_que_batem' | 'melhor_colocado';

export interface RegraDesafio {
  versao: 1;
  metrica: MetricaDesafio;
  modo: ModoDisputa[];
  criterioRanking: CriterioRanking;
  /** Contra quem se disputa: a empresa inteira ou o próprio setor. */
  escopoDisputa: EscopoDisputa;
  /** Prêmio de quem bate a meta, ou do primeiro colocado. */
  premiacao: Premiacao;
  /**
   * Meta padrão, para quando todo mundo tem o mesmo número.
   *
   * `null` = o modelo não usa meta (corrida, top ranking) OU cada pessoa tem a
   * sua, em `metasPorOperador`.
   */
  metaIndividual: number | null;
  /**
   * Meta de cada operador, quando elas são diferentes entre si.
   *
   * A chave é o `id` do perfil; um login normalizado (minúsculas, sem espaço)
   * também é aceito, porque é assim que a meta chega das planilhas. Ver
   * `metaDoParticipante` em `calcularDesafio.ts`.
   *
   * ## O mapa também define quem disputa
   *
   * Preenchido, ele passa a ser a LISTA de participantes: quem não tem meta
   * aqui não está na campanha. É o comportamento que a operação espera — a
   * planilha de metas é a convocação — e evita o ranking encher de gente
   * zerada com "sem meta definida" no rodapé.
   */
  metasPorOperador: Record<string, number>;
  /**
   * Meta da equipe.
   *
   * `null` com metas individuais definidas = a meta da equipe é a SOMA das
   * metas de quem está nela. Fixar um número aqui quando cada integrante tem a
   * sua faria a barra da equipe contar uma história diferente da soma das
   * barras dos integrantes.
   */
  metaEquipe:     number | null;
  /** Meta única da operação inteira (modelo `meta_coletiva`). */
  metaColetiva:   number | null;
  participantes: ParticipantesDesafio;
  /**
   * Prêmio por colocação. Vazio = a campanha usa o texto de `Desafio.premio`.
   */
  premios: PremioPorPosicao[];
  /**
   * De onde sai o número de cada participante.
   *
   * `proprio` — o recebimento da própria pessoa. É o padrão e o caso de toda
   * campanha de operação.
   *
   * `equipe_liderada` — o recebimento da EQUIPE que a pessoa lidera. É o que
   * faz sentido numa disputa entre líderes: o líder não tabula, quem tabula é
   * a equipe dele, e ranqueá-lo pelo próprio card o deixaria zerado.
   */
  fonteResultado: FonteResultado;
}

/** Ver `RegraDesafio.fonteResultado`. */
export type FonteResultado = 'proprio' | 'equipe_liderada';

/** Tema da campanha. Governa a gincana, não o desenho da aplicação. */
export type TemaDesafio = 'padrao' | 'cafe' | 'corrida' | 'equipes';

/** Cor de acento da campanha, por cima do tema. `null` = a cor do tema. */
export type AcentoDesafio =
  | 'ambar' | 'violeta' | 'esmeralda' | 'rosa' | 'azul' | 'laranja';

export interface VisualDesafio {
  tema: TemaDesafio;
  icone: string;
  mostrarFotos: boolean;
  animarUltrapassagem: boolean;
  comemorarMeta: boolean;
  /** Cor de acento escolhida na configuração. `null` = a do tema. */
  acento: AcentoDesafio | null;
  /** O card do catálogo mostra a mídia de destaque como fundo. */
  midiaNoCard: boolean;
  /** A campanha aparece no menu lateral, com a mídia de destaque. */
  fixarNoMenu: boolean;
  /** Como a imagem de DESTAQUE preenche o espaço dela. */
  ajusteMidia: AjusteImagem;
  /** Como a ARTE DE DIVULGAÇÃO preenche o espaço dela. */
  ajusteArte: AjusteImagem;
}

/**
 * Como uma imagem preenche o espaço em que é desenhada.
 *
 * `cobrir`  — preenche tudo e corta o que sobra (`object-cover`).
 * `conter`  — mostra a imagem INTEIRA, com margem onde faltar
 *             (`object-contain`).
 *
 * `conter` é o padrão para a arte de divulgação, e não é preferência: um
 * cartaz cortado perde justamente o que ele tem a dizer. O destaque nasce em
 * `cobrir` porque ele é um selo — o corte ali é o comportamento certo.
 */
export type AjusteImagem = 'cobrir' | 'conter';

/**
 * Quem enxerga a campanha, por cima da régua de permissões.
 *
 * `alcance` — vale o escopo do cargo (`desafios_escopo_*`). É o padrão.
 * `todos`   — mural: a empresa inteira acompanha, mesmo quem não disputa.
 */
export type VisibilidadeDesafio = 'alcance' | 'todos';

export interface Desafio {
  id: string;
  /** A empresa DONA da campanha — quem a criou, e onde o log a registra. */
  empresaId: string;
  /**
   * As empresas que a campanha ALCANÇA.
   *
   * Vazio = só a dona, que é como toda campanha anterior a Desafios 2.0 foi
   * gravada. Preenchido com duas ou mais, os setores das duas operações
   * disputam no mesmo ranking.
   */
  empresas: string[];
  nome: string;
  descricao: string | null;
  premio: string | null;
  /** `yyyy-MM-dd`. Sem nenhum vínculo com mês: a campanha pode atravessá-lo. */
  dataInicio: string;
  dataFim: string;
  tipo: TipoDesafio;
  /**
   * Setor dono da campanha.
   *
   * `null` = campanha da empresa inteira, configurada pela administração.
   * Preenchido = campanha DAQUELE setor: a liderança dele cria e edita
   * (`desafios_configurar_setor`), e os outros setores nem a enxergam — a RLS
   * recorta no SELECT.
   */
  setorId: string | null;
  regra: RegraDesafio;
  visual: VisualDesafio;
  status: StatusDesafio;
  /**
   * O DESTAQUE: foto ou GIF pequeno.
   *
   * É o selo do menu lateral e o fundo do card no catálogo. Não é o cartaz da
   * campanha — esse é `arteUrl`, e são formatos diferentes: o menu quer algo
   * que se leia a 40 px.
   */
  midiaUrl: string | null;
  /** O caminho no balde `desafios`, para conseguir apagar o arquivo depois. */
  midiaCaminho: string | null;
  /**
   * A ARTE DE DIVULGAÇÃO: o cartaz da campanha. Opcional.
   *
   * Mostrada inteira na tela do desafio e no topo da gaveta. `null` = a tela
   * cai no destaque, que é como a campanha era antes desta separação.
   */
  arteUrl: string | null;
  arteCaminho: string | null;
  visibilidade: VisibilidadeDesafio;
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
  /**
   * O cargo (`perfis.perfil`), para o recorte por cargo.
   *
   * Vazio na campanha gravada antes de Desafios 2.0 — o normalizador devolve
   * `'operador'`, que é o que o recorte por cargo lê como «não é liderança».
   */
  perfil: string;
  /** A empresa da pessoa. Distingue as duas operações na mesma tela. */
  empresaId: string | null;
  /**
   * Super admin convidado só para testar esta campanha.
   *
   * A tela marca o card dele para que ninguém confunda um teste com um
   * participante de verdade.
   */
  convidado: boolean;
}

/** Um setor oferecido no seletor da configuração, com a empresa a que pertence. */
export interface SetorDisponivel {
  id: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  empresaSlug: string | null;
  equipes: { id: string; nome: string }[];
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
