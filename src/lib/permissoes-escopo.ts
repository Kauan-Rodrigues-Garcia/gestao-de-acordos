/**
 * permissoes-escopo.ts — escopo de dados POR ABA.
 *
 * ## O problema que isto resolve
 *
 * Até aqui o escopo era global: `ver_acordos_gerais` e `ver_todos_setores`
 * decidiam, de uma vez, o que a pessoa via em Acordos, Dashboard, Lixeira,
 * Analítico e Painel Diretoria. Mudar o alcance numa tela mudava nas outras sem
 * ninguém pedir.
 *
 * Agora cada aba carrega os próprios níveis, e uma aba não fala pela outra. Um
 * cargo pode ser `individual` em Acordos e `setor` na Lixeira sem contradição.
 *
 * ## Os níveis são independentes, não uma escada
 *
 * `individual`, `equipe`, `setor` e `todos_setores` são quatro chaves separadas,
 * e não um único valor. É o que o pedido descreve: ligar e desligar cada nível
 * faz a opção correspondente aparecer ou sumir do filtro daquela aba.
 *
 * Nada obriga que sejam contíguos — um cargo pode ter `individual` e `setor` sem
 * `equipe`, e o filtro mostra exatamente esses dois.
 *
 * ## Desligar a aba desliga tudo dela
 *
 * A dependência é resolvida na LEITURA, nunca gravando `false` nas filhas. Assim
 * religar a aba devolve a configuração que já existia, em vez de obrigar alguém
 * a remontá-la de memória.
 *
 * ## Este módulo não sabe de RLS
 *
 * Ele responde "o que este cargo pode escolher nesta aba". Quantas linhas
 * chegam de verdade continua sendo decisão do banco. Ver
 * `docs/PERMISSOES-ANALISE-ATUAL.md`, seção 1.
 */

/** Do mais estreito ao mais amplo. A ordem é significativa. */
export const NIVEIS_ESCOPO = ['individual', 'equipe', 'setor', 'todos_setores'] as const;
export type NivelEscopo = typeof NIVEIS_ESCOPO[number];

/** Ordem de amplitude, para comparar dois níveis. */
const AMPLITUDE: Record<NivelEscopo, number> = {
  individual: 0, equipe: 1, setor: 2, todos_setores: 3,
};

export interface AbaComEscopo {
  /**
   * A chave que liga e desliga a aba inteira, ou `null` quando a aba não tem
   * uma — caso do Dashboard.
   *
   * `null` não é lacuna a preencher depois sem pensar: o Dashboard é a rota
   * `/`, para onde o login e três redirecionamentos de `ProtectedRoute`
   * apontam. Uma chave que o desligue tranca a pessoa fora do app, e para
   * onde ela deveria cair é decisão de produto. Enquanto não houver essa
   * decisão, o Dashboard tem escopo próprio e nenhum interruptor.
   */
  chaveAba: string | null;
  /** Prefixo das chaves desta aba, sem o underscore final. */
  prefixo: string;
  /** Níveis que fazem sentido nesta aba. Nem toda aba usa os quatro. */
  niveis: readonly NivelEscopo[];
}

/**
 * O registro das abas que têm escopo próprio.
 *
 * Cresce uma entrada por fase. Manter aqui, e não espalhado, é o que permite ao
 * painel de permissões desenhar a matriz sem conhecer cada tela.
 */
export const ABAS_COM_ESCOPO = {
  lixeira: {
    chaveAba: 'ver_lixeira',
    prefixo: 'lixeira',
    niveis: NIVEIS_ESCOPO,
  },
  /*
   * O Painel Lider so tem dois niveis, e isso e proposital: a aba nasceu para
   * a lideranca olhar o proprio setor, e a unica pergunta que ela faz e se
   * essa pessoa enxerga alem dele. `individual` nao faria sentido — um painel
   * de equipe com uma pessoa so nao e painel — e `equipe` ja e o recorte
   * interno da tela, escolhido no filtro, nao uma permissao.
   */
  painel_lider: {
    chaveAba: 'ver_painel_lider',
    prefixo: 'painel_lider',
    niveis: ['setor', 'todos_setores'],
  },
  /*
   * O Dashboard usa os quatro níveis e não tem chave de aba — ver o comentário
   * de `chaveAba`. Ele é a tela inicial e hoje aparece para todo cargo.
   */
  dashboard: {
    chaveAba: null as string | null,
    prefixo: 'dashboard',
    niveis: NIVEIS_ESCOPO,
  },
  /*
   * O Analítico tem TRÊS níveis, e a ausência de `equipe` é deliberada.
   *
   * A tela sempre teve três alcances, e não dois: o operador vê só os próprios
   * números; líder, elite, gerência e ouvidoria veem o setor; diretoria e admin
   * escolhem entre os setores. O elite é o único que hoje alterna entre dois
   * ("Minha visão" × "Visão geral") — e é exatamente por ter dois níveis.
   *
   * `equipe` não entra porque nunca existiu como ALCANCE aqui. O Recebimento
   * Diário tem um seletor de equipe, mas ele é filtro dentro do setor que a
   * pessoa já enxerga — recorte de tela, não permissão. Registrar o nível
   * criaria um toggle que liga, desliga e não muda nada.
   *
   * O projeto em `docs/PERMISSOES-POR-ABA-PROJETO.md` §3.8 previa dois níveis,
   * `propria` e `geral`. Estavam errados: `geral` teria que significar "setor"
   * e "todos os setores" ao mesmo tempo, e aí um líder ganharia o filtro de
   * setor que ele não tem hoje. O documento foi corrigido junto com esta fase.
   */
  analitico: {
    chaveAba: 'ver_analitico',
    prefixo: 'analitico',
    niveis: ['individual', 'setor', 'todos_setores'],
  },
} as const satisfies Record<string, AbaComEscopo>;

export type AbaEscopada = keyof typeof ABAS_COM_ESCOPO;

/** A chave de permissão de um nível numa aba. */
export function chaveEscopo(prefixo: string, nivel: NivelEscopo): string {
  return `${prefixo}_escopo_${nivel}`;
}

/**
 * Os níveis que este cargo pode escolher nesta aba, do mais estreito ao mais
 * amplo. Aba desligada devolve lista vazia.
 */
export function niveisLiberados(
  aba: AbaEscopada,
  temPermissao: (chave: string) => boolean,
): NivelEscopo[] {
  const meta = ABAS_COM_ESCOPO[aba];
  // Aba sem interruptor está sempre aberta; o escopo dela decide sozinho.
  if (meta.chaveAba !== null && !temPermissao(meta.chaveAba)) return [];
  return meta.niveis.filter(n => temPermissao(chaveEscopo(meta.prefixo, n)));
}

/**
 * O nível mais amplo liberado nesta aba, ou `null` se a aba está fechada.
 *
 * É o que a consulta usa quando ninguém escolheu filtro: carregar o mais amplo
 * que a pessoa pode ver, e deixar que ela estreite.
 */
export function escopoEfetivo(
  aba: AbaEscopada,
  temPermissao: (chave: string) => boolean,
): NivelEscopo | null {
  const liberados = niveisLiberados(aba, temPermissao);
  if (liberados.length === 0) return null;
  return liberados.reduce((a, b) => (AMPLITUDE[b] > AMPLITUDE[a] ? b : a));
}

/** `a` alcança tudo que `b` alcança? */
export function alcancaPeloMenos(a: NivelEscopo, b: NivelEscopo): boolean {
  return AMPLITUDE[a] >= AMPLITUDE[b];
}

/** O mais estreito entre dois níveis — usado para não passar do teto. */
export function limitarAoTeto(nivel: NivelEscopo, teto: NivelEscopo): NivelEscopo {
  return AMPLITUDE[nivel] <= AMPLITUDE[teto] ? nivel : teto;
}
