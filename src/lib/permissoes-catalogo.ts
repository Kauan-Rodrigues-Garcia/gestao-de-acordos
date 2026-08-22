/**
 * permissoes-catalogo.ts — a lista oficial de permissões do sistema.
 *
 * ## Por que o catálogo mora em código
 *
 * Uma permissão só significa alguma coisa se existir código perguntando por
 * ela. Enquanto a lista viveu dentro da tela de administração, nada impedia
 * que alguém acrescentasse um item bonito que o app nunca consulta — e foi
 * exatamente assim que `ver_acordos_proprios` e `ver_analiticos_setor` viraram
 * botões que ligam, desligam e não mudam nada.
 *
 * Aqui a lista fica ao lado do código que a usa, e dois testes de contrato
 * (`permissoes-catalogo.test.ts`) quebram a CI quando os dois lados divergem:
 *
 *   1. toda chave deste catálogo é consultada em algum lugar do app;
 *   2. todo `temPermissao('x')` e `requiredPermissao="x"` existe aqui.
 *
 * Mesmo padrão de `logs-catalogo.ts`, que já provou funcionar.
 *
 * ## O que estas permissões governam
 *
 * **Navegação e interface.** Elas decidem qual menu aparece, qual rota abre e
 * qual botão fica visível. Elas NÃO são barreira de segurança: quem manda no
 * dado é a RLS. Forçar `ver_acordos_gerais` num operador não faz ele enxergar
 * acordo de outra pessoa — a política do banco continua negando, e isso é o
 * comportamento correto.
 */

/** Os cargos que o administrador configura na tela. */
export const CARGOS_CONFIGURAVEIS = [
  'operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria',
] as const;
export type CargoConfiguravel = typeof CARGOS_CONFIGURAVEIS[number];

/**
 * Cargos com acesso total por construção (migration `20260812b`).
 *
 * Aparecem na tela em modo leitura, com tudo ligado. Não somem da lista: um
 * cargo que desaparece sem explicação parece defeito, e a pergunta "por que
 * não posso configurar o administrador?" já foi feita.
 */
export const CARGOS_ACESSO_TOTAL = ['administrador', 'super_admin'] as const;

/**
 * Chaves que o acesso total NÃO concede sozinho.
 *
 * "Administrador pode tudo" é verdade sobre o produto do dia a dia, e deixa de
 * ser verdade quando a permissão desfaz um fato já publicado. Reabrir mês
 * fechado é assim: o relatório de agosto já circulou por WhatsApp, e reescrevê-lo
 * em setembro muda um número que a diretoria leu — em silêncio, porque quem
 * recebeu o arquivo não é avisado.
 *
 * Sem esta lista, ligar `ignorar_fechamento_mes` no catálogo teria liberado o
 * cadeado para TODO administrador no mesmo deploy, sem ninguém decidir isso: o
 * `temPermissao` responde `true` para acesso total antes de consultar tabela
 * nenhuma. A lista existe para que ampliar a exceção continue sendo uma escolha
 * registrada, e não efeito colateral de uma chave nova.
 *
 * Quem lê estas chaves é `temPermissaoExplicita`, nunca `temPermissao`.
 */
export const PERMISSOES_EXPLICITAS = ['ignorar_fechamento_mes'] as const;

/** A chave precisa de concessão nominal, mesmo para quem tem acesso total? */
export function exigeConcessaoExplicita(key: string): boolean {
  return (PERMISSOES_EXPLICITAS as readonly string[]).includes(key);
}

export type TenantSlug = 'bookplay' | 'pagueplay';

/**
 * Os grupos do painel.
 *
 * Os cinco primeiros são a organização antiga, por CATEGORIA — "Filtros e
 * visão" decide filtro em toda parte do sistema de uma vez. É exatamente o que
 * a reestruturação por aba está desmontando.
 *
 * Os grupos com nome de aba são a organização nova: tudo que aquela aba decide
 * mora junto, e não fala pela vizinha. Cada fase move uma aba para cá, e o
 * grupo antigo encolhe. Quando "Filtros e visão" ficar vazio, ele sai — junto
 * com as chaves globais que ele agrupava.
 *
 * Ver `docs/PERMISSOES-POR-ABA-PROJETO.md`.
 */
export const GRUPOS_PERMISSAO = [
  'Abas e telas',
  'Acordos',
  'Importações',
  'Gestão de pessoas',
  'Metas',
  'Filtros e visão',
  'Ações específicas',
  'Lixeira',
  'Painel Líder',
  'Dashboard',
  'Analítico',
] as const;
export type GrupoPermissao = typeof GRUPOS_PERMISSAO[number];

export interface PermissaoMeta {
  key: string;
  /** Rótulo curto, como o admin lê na tela. */
  label: string;
  /** O que a permissão libera, em uma frase. */
  descricao: string;
  grupo: GrupoPermissao;
  /**
   * Operações onde a permissão faz sentido. Ausente = as duas.
   *
   * Ouvidoria não existe na BookPlay; Pix Automático e Campanha Fácil não
   * existem na PaguePlay. Mostrar o toggle de um módulo que a operação não tem
   * é oferecer um controle que não controla nada.
   */
  tenants?: TenantSlug[];
  /** Valor de partida ao semear. Cargo omitido nasce `false`. */
  padrao: Partial<Record<CargoConfiguravel, boolean>>;
}

/** Atalhos para os padrões que se repetem. */
const LIDERANCA: Partial<Record<CargoConfiguravel, boolean>> = {
  lider: true, elite: true, gerencia: true, diretoria: true,
};
const TODOS: Partial<Record<CargoConfiguravel, boolean>> = {
  operador: true, ouvidoria: true, lider: true, elite: true,
  gerencia: true, diretoria: true,
};

export const PERMISSOES: PermissaoMeta[] = [
  // ── Abas e telas ─────────────────────────────────────────────────────────
  // Uma permissão por destino do menu. É o grupo que o admin procura primeiro,
  // porque é assim que ele pensa o problema: "quem pode abrir essa aba?".
  {
    key: 'ver_acordos', label: 'Aba Acordos',
    descricao: 'Abrir a lista completa de acordos em /acordos',
    grupo: 'Abas e telas', tenants: ['bookplay'], padrao: TODOS,
  },
  {
    key: 'ver_analitico', label: 'Aba Analítico',
    descricao: 'Abrir o Analítico de recebimentos e o Recebimento diário',
    grupo: 'Abas e telas', padrao: TODOS,
  },
  {
    key: 'ver_painel_lider', label: 'Painel do Líder',
    descricao: 'Abrir o painel da equipe, com acordos por operador e métricas',
    grupo: 'Abas e telas', padrao: LIDERANCA,
  },
  {
    key: 'ver_painel_diretoria', label: 'Painel da Diretoria',
    descricao: 'Abrir o painel estratégico, com KPIs e projeções',
    grupo: 'Abas e telas', padrao: { diretoria: true },
  },
  {
    key: 'ver_ouvidoria', label: 'Aba Ouvidoria',
    descricao: 'Abrir a Ouvidoria e ver os atendimentos registrados',
    grupo: 'Abas e telas', tenants: ['pagueplay'], padrao: { ouvidoria: true },
  },
  {
    key: 'ver_campanha_facil', label: 'Aba Campanha Fácil',
    descricao: 'Abrir o módulo de campanhas de cobrança',
    grupo: 'Abas e telas', tenants: ['bookplay'], padrao: LIDERANCA,
  },
  {
    key: 'ver_solicitacoes_whatsapp', label: 'Aba Solicitações de WhatsApp',
    descricao: 'Abrir o chat interno de solicitação de mensagem',
    grupo: 'Abas e telas', padrao: TODOS,
  },
  {
    key: 'ver_pix_automatico', label: 'Aba Pix Automático',
    descricao: 'Abrir o painel de Pix automático e o ranking de comissão',
    grupo: 'Abas e telas', tenants: ['bookplay'], padrao: TODOS,
  },
  {
    key: 'ver_lixeira', label: 'Lixeira',
    descricao: 'Abrir a lixeira e restaurar acordos excluídos',
    grupo: 'Abas e telas', padrao: TODOS,
  },
  {
    key: 'ver_logs', label: 'Logs do sistema',
    descricao: 'Abrir a trilha de auditoria em Configurações',
    /*
     * Padrão VAZIO, e isto não é descuido.
     *
     * A leitura de `logs_sistema` é limitada pelo RLS a super_admin (e ao cargo
     * legado `administrador`) — ver `logs_sis_admin`. Conceder `ver_logs` a
     * outro cargo não dá acesso: dá uma ABA VAZIA, porque o RLS devolve zero
     * linhas e `fn_logs_resumo` devolve zeros. Sem erro e sem explicação.
     *
     * Foi o que aconteceu: até 17/08/2026 este padrão era
     * `{ gerencia: true, diretoria: true }`. Na PaguePlay isso deixou dois
     * diretores com a aba e sem nada dentro dela, mais dois cargos (elite e
     * gerência) armados para o próximo contratado.
     *
     * Se um dia a trilha precisar ser aberta a mais gente, mexa nos DOIS lados
     * na mesma migration. O teste `logs-permissao-vs-rls.test.ts` quebra se só
     * um dos lados mudar.
     */
    grupo: 'Abas e telas', padrao: {},
  },
  {
    key: 'ver_configuracoes', label: 'Configurações',
    descricao: 'Abrir a tela de configurações da empresa',
    grupo: 'Abas e telas', padrao: {},
  },

  // ── Acordos ──────────────────────────────────────────────────────────────
  {
    key: 'ver_acordos_gerais', label: 'Ver acordos de outras pessoas',
    descricao: 'Enxergar acordos além dos próprios, dentro do que a RLS permitir',
    grupo: 'Acordos', padrao: LIDERANCA,
  },
  {
    key: 'criar_acordos', label: 'Criar acordo',
    descricao: 'Cadastrar acordo novo',
    grupo: 'Acordos', padrao: TODOS,
  },
  {
    key: 'editar_acordos', label: 'Editar acordo',
    descricao: 'Alterar campos de um acordo existente',
    grupo: 'Acordos', padrao: TODOS,
  },
  {
    key: 'excluir_acordos', label: 'Excluir acordo',
    descricao: 'Mover acordo para a lixeira',
    grupo: 'Acordos', padrao: TODOS,
  },
  {
    key: 'excluir_em_lote', label: 'Excluir em lote',
    descricao: 'Excluir vários acordos de uma vez',
    grupo: 'Acordos', padrao: LIDERANCA,
  },

  // ── Importações ──────────────────────────────────────────────────────────
  {
    key: 'importar_excel', label: 'Importar acordos por planilha',
    descricao: 'Cadastrar acordos em lote a partir de um Excel',
    grupo: 'Importações', padrao: TODOS,
  },
  {
    key: 'importar_analitico', label: 'Importar relatório Analítico',
    descricao: 'Subir o relatório de recebimentos do ERP',
    grupo: 'Importações', padrao: LIDERANCA,
  },
  {
    key: 'importar_diario', label: 'Importar Recebimento diário',
    descricao: 'Subir o relatório diário de recebimentos do ERP',
    grupo: 'Importações', padrao: LIDERANCA,
  },

  // ── Gestão de pessoas ────────────────────────────────────────────────────
  {
    key: 'ver_usuarios', label: 'Ver usuários',
    descricao: 'Abrir a lista de pessoas da empresa',
    grupo: 'Gestão de pessoas', padrao: LIDERANCA,
  },
  {
    key: 'editar_usuarios', label: 'Editar usuários',
    descricao: 'Alterar dados, cargo e situação de uma pessoa',
    grupo: 'Gestão de pessoas', padrao: {},
  },
  {
    key: 'ver_equipes', label: 'Ver equipes',
    descricao: 'Abrir a lista de equipes e seus membros',
    grupo: 'Gestão de pessoas', padrao: LIDERANCA,
  },
  {
    key: 'editar_equipes', label: 'Editar equipes',
    descricao: 'Criar, renomear e remover equipes',
    grupo: 'Gestão de pessoas', padrao: {},
  },
  {
    key: 'ver_operadores', label: 'Ver dados de operadores',
    descricao: 'Ver informações detalhadas de outras pessoas do setor',
    grupo: 'Gestão de pessoas', padrao: LIDERANCA,
  },

  // ── Metas ────────────────────────────────────────────────────────────────
  {
    key: 'ver_metas', label: 'Ver metas',
    descricao: 'Abrir a tela de metas, feriados e quartis',
    grupo: 'Metas', padrao: LIDERANCA,
  },
  {
    key: 'gerenciar_metas', label: 'Editar metas',
    descricao: 'Definir e alterar metas de setor, equipe e operador',
    grupo: 'Metas', padrao: { gerencia: true, diretoria: true },
  },

  // ── Filtros e visão ──────────────────────────────────────────────────────
  {
    key: 'ver_todos_setores', label: 'Ver todos os setores',
    descricao: 'Enxergar dados além do próprio setor',
    grupo: 'Filtros e visão', padrao: { gerencia: true, diretoria: true },
  },
  /*
   * `ver_analiticos_global` foi APOSENTADA na fase 4.
   *
   * Ela tinha um consumidor só, `veTodosOsSetores`, que respondia por cinco
   * telas ao mesmo tempo. Com o Analítico ganhando escopo próprio, a função
   * saiu e a chave ficou sem ninguém para perguntar por ela — um toggle que
   * liga, desliga e não muda nada. Quem decide agora é
   * `analitico_escopo_todos_setores`, e o Dashboard tem o dele.
   *
   * O teste "as chaves aposentadas não voltaram" a trava fora daqui.
   */
  /*
   * `filtrar_por_setor` e `filtrar_por_equipe` foram APOSENTADAS na fase 3b.
   *
   * Elas eram globais e tinham um consumidor cada, os dois no Dashboard. Com
   * o filtro único, quem decide se a linha de setor ou de equipe aparece são
   * os níveis daquela aba — `dashboard_escopo_setor` e `_equipe`. Manter as
   * antigas no catálogo criaria dois toggles que ligam, desligam e não mudam
   * nada, que é o defeito que estes testes existem para impedir.
   *
   * O teste "as chaves aposentadas não voltaram" as trava fora daqui.
   */
  {
    key: 'filtrar_por_usuario', label: 'Filtrar por pessoa',
    descricao: 'Usar o filtro de pessoa nas listagens e painéis',
    grupo: 'Filtros e visão', padrao: LIDERANCA,
  },

  // ── Lixeira ──────────────────────────────────────────────────────────────
  // A primeira aba com escopo próprio. Antes, o alcance dela vinha de
  // `ver_acordos_gerais` — a mesma chave que decidia Acordos e Dashboard, então
  // mexer numa mexia nas três. Agora a Lixeira responde só pelas chaves abaixo.
  //
  // Os quatro níveis são independentes: ligar e desligar cada um faz a opção
  // aparecer ou sumir do filtro da aba. Ver `permissoes-escopo.ts`.
  {
    key: 'lixeira_escopo_individual', label: 'Lixeira: os próprios acordos',
    descricao: 'Ver na lixeira os acordos excluídos pela própria pessoa',
    grupo: 'Lixeira', padrao: TODOS,
  },
  {
    key: 'lixeira_escopo_equipe', label: 'Lixeira: acordos da equipe',
    descricao: 'Ver na lixeira os acordos excluídos pela equipe',
    grupo: 'Lixeira', padrao: LIDERANCA,
  },
  {
    key: 'lixeira_escopo_setor', label: 'Lixeira: acordos do setor',
    descricao: 'Ver na lixeira os acordos excluídos no setor inteiro',
    grupo: 'Lixeira', padrao: LIDERANCA,
  },
  {
    key: 'lixeira_escopo_todos_setores', label: 'Lixeira: todos os setores',
    descricao: 'Ver na lixeira os acordos excluídos em qualquer setor da empresa',
    grupo: 'Lixeira', padrao: { gerencia: true, diretoria: true },
  },
  {
    key: 'lixeira_restaurar', label: 'Restaurar da lixeira',
    descricao: 'Devolver um acordo excluído para a lista',
    grupo: 'Lixeira', padrao: TODOS,
  },
  {
    key: 'lixeira_limpar', label: 'Esvaziar a lixeira',
    descricao: 'Apagar de vez tudo que está na lixeira',
    grupo: 'Lixeira', padrao: TODOS,
  },

  // ── Painel Líder ─────────────────────────────────────────────────────────
  // Segunda aba a sair do escopo global. O alcance vinha de
  // `veTodosOsSetores`, que decidia por CARGO (diretoria e admin sempre) ou
  // pelas chaves globais. Agora vem daqui — o que torna configurável o que
  // antes era fixo no código para a diretoria.
  {
    key: 'painel_lider_escopo_setor', label: 'Painel Líder: o próprio setor',
    descricao: 'Ver no Painel Líder os dados do setor da própria pessoa',
    grupo: 'Painel Líder', padrao: LIDERANCA,
  },
  {
    key: 'painel_lider_escopo_todos_setores', label: 'Painel Líder: todos os setores',
    descricao: 'Ver no Painel Líder qualquer setor, com o filtro de setor disponível',
    grupo: 'Painel Líder', padrao: { diretoria: true },
  },
  {
    key: 'painel_lider_sub_acompanhamento', label: 'Painel Líder: Acompanhamento',
    descricao: 'Abrir a aba interna de acompanhamento do time',
    grupo: 'Painel Líder', padrao: LIDERANCA,
  },
  {
    key: 'painel_lider_sub_desempenho_equipes', label: 'Painel Líder: Desempenho Equipes',
    descricao: 'Abrir a aba interna de desempenho por equipe',
    grupo: 'Painel Líder', padrao: LIDERANCA,
  },
  {
    key: 'painel_lider_sub_quartis', label: 'Painel Líder: Quartis',
    descricao: 'Abrir a aba interna de quartis por operador',
    grupo: 'Painel Líder', padrao: LIDERANCA,
  },
  {
    key: 'painel_lider_sub_grafico_recebimento', label: 'Painel Líder: Gráfico recebimento',
    descricao: 'Abrir a aba interna do gráfico de recebimento',
    grupo: 'Painel Líder', padrao: LIDERANCA,
  },

  // ── Dashboard ────────────────────────────────────────────────────────────
  // O Dashboard NÃO tem chave de aba, e isso é deliberado: ele é a rota `/`,
  // para onde o login e três redirecionamentos de `ProtectedRoute` apontam.
  // Um interruptor aqui trancaria a pessoa fora do app. Ver
  // `permissoes-escopo.ts`.
  {
    key: 'dashboard_escopo_individual', label: 'Dashboard: os próprios dados',
    descricao: 'Ver no Dashboard os acordos da própria pessoa',
    grupo: 'Dashboard', padrao: TODOS,
  },
  {
    key: 'dashboard_escopo_equipe', label: 'Dashboard: dados da equipe',
    descricao: 'Ver no Dashboard os acordos da equipe, com o filtro de equipe',
    grupo: 'Dashboard', padrao: LIDERANCA,
  },
  {
    key: 'dashboard_escopo_setor', label: 'Dashboard: dados do setor',
    descricao: 'Ver no Dashboard os acordos do setor inteiro',
    grupo: 'Dashboard', padrao: LIDERANCA,
  },
  {
    key: 'dashboard_escopo_todos_setores', label: 'Dashboard: todos os setores',
    descricao: 'Ver no Dashboard qualquer setor, com o filtro de setor disponível',
    grupo: 'Dashboard', padrao: { gerencia: true, diretoria: true },
  },

  // ── Analítico ────────────────────────────────────────────────────────────
  // Quarta aba a sair do escopo global, e a que encerra `veTodosOsSetores`.
  //
  // Os padrões abaixo reproduzem o que o CARGO decidia no código: a visão
  // individual era de quem não é liderança (mais o elite, que alterna), a
  // visão de setor era da liderança inteira — `ouvidoria` incluída, porque ela
  // está em `PERFIS_LIDER` — e o alcance total vinha das duas chaves globais.
  {
    key: 'analitico_escopo_individual', label: 'Analítico: os próprios números',
    descricao: 'Ver no Analítico o recebimento da própria pessoa',
    grupo: 'Analítico', padrao: { operador: true, elite: true },
  },
  {
    key: 'analitico_escopo_setor', label: 'Analítico: o próprio setor',
    descricao: 'Ver no Analítico o recebimento do setor inteiro, operador a operador',
    grupo: 'Analítico',
    padrao: { lider: true, elite: true, gerencia: true, ouvidoria: true, diretoria: true },
  },
  {
    key: 'analitico_escopo_todos_setores', label: 'Analítico: todos os setores',
    descricao: 'Ver no Analítico qualquer setor, com o filtro de setor disponível',
    grupo: 'Analítico', padrao: { gerencia: true, diretoria: true },
  },
  // Abas internas primárias — a régua de cima da tela.
  {
    key: 'analitico_sub_analitico', label: 'Analítico: aba Analítico',
    descricao: 'Abrir a aba interna do relatório analítico mensal',
    grupo: 'Analítico', padrao: TODOS,
  },
  {
    key: 'analitico_sub_recebimento_diario', label: 'Analítico: Recebimento diário',
    descricao: 'Abrir a aba interna do recebimento do dia',
    grupo: 'Analítico', padrao: TODOS,
  },
  {
    key: 'analitico_sub_colchao', label: 'Analítico: Colchão',
    descricao: 'Abrir a aba interna do colchão, que nunca entra nos totais do Analítico',
    grupo: 'Analítico', padrao: TODOS,
  },
  // Abas internas secundárias — a régua de dentro da visão de setor.
  {
    key: 'analitico_sub_por_operador', label: 'Analítico: Por operador',
    descricao: 'Abrir a aba interna com o recebimento operador a operador',
    grupo: 'Analítico', padrao: TODOS,
  },
  {
    key: 'analitico_sub_formas_pagamento', label: 'Analítico: Formas de pagamento',
    descricao: 'Abrir a aba interna de Pix, boleto e cartão por período',
    grupo: 'Analítico', padrao: TODOS,
  },
  {
    key: 'analitico_sub_ranking', label: 'Analítico: Ranking',
    descricao: 'Abrir a aba interna do ranking de recebimento',
    grupo: 'Analítico', padrao: TODOS,
  },
  {
    key: 'analitico_sub_destaques_dia', label: 'Analítico: Destaques do dia',
    descricao: 'Abrir a aba interna dos destaques do dia',
    grupo: 'Analítico', padrao: TODOS,
  },
  {
    key: 'analitico_sub_sem_operador', label: 'Analítico: Sem operador',
    descricao: 'Abrir a aba interna de conferência das linhas sem operador vinculado',
    grupo: 'Analítico', padrao: TODOS,
  },

  // ── Ações específicas ────────────────────────────────────────────────────
  // Separadas de "abrir a aba": ver o módulo e agir dentro dele são decisões
  // diferentes. Aprovar Pix mexe em comissão; registrar atendimento de
  // ouvidoria mexe em reclamação de cliente.
  {
    key: 'editar_ouvidoria', label: 'Registrar e editar atendimentos',
    descricao: 'Criar e alterar atendimentos na Ouvidoria, além de apenas ver',
    grupo: 'Ações específicas', tenants: ['pagueplay'], padrao: { ouvidoria: true },
  },
  {
    key: 'gerenciar_acessos_ouvidoria', label: 'Conceder acesso à Ouvidoria',
    descricao: 'Definir quem enxerga a Ouvidoria e em qual nível',
    grupo: 'Ações específicas', tenants: ['pagueplay'], padrao: {},
  },
  {
    key: 'criar_solicitacao_whatsapp', label: 'Abrir solicitação de WhatsApp',
    descricao: 'Pedir o envio de uma mensagem, além de acompanhar as existentes',
    grupo: 'Ações específicas', padrao: TODOS,
  },
  {
    key: 'aprovar_pix_automatico', label: 'Aprovar Pix automático',
    descricao: 'Aprovar ou desaprovar um Pix — decide comissão',
    grupo: 'Ações específicas', tenants: ['bookplay'], padrao: LIDERANCA,
  },
  {
    key: 'ignorar_fechamento_mes', label: 'Escrever em mês fechado',
    descricao:
      'Criar, editar e excluir em mês já encerrado. O super admin sempre pode; '
      + 'ligue aqui para abrir a exceção a outro cargo — a alteração muda um mês '
      + 'cujo relatório já circulou',
    grupo: 'Ações específicas', padrao: {},
  },
];

/** Índice por chave, para consulta direta. */
export const PERMISSOES_POR_CHAVE: Record<string, PermissaoMeta> =
  Object.fromEntries(PERMISSOES.map(p => [p.key, p]));

export const CHAVES_PERMISSAO: string[] = PERMISSOES.map(p => p.key);

/** A permissão vale nesta operação? Sem `tenants` declarado, vale nas duas. */
export function permissaoNoTenant(p: PermissaoMeta, slug: string | null | undefined): boolean {
  if (!p.tenants) return true;
  if (!slug) return true; // slug indefinido (dev sem VITE_TENANT_SLUG): mostra tudo
  return p.tenants.includes(slug as TenantSlug);
}

/** O catálogo recortado para uma operação. */
export function catalogoDoTenant(slug: string | null | undefined): PermissaoMeta[] {
  return PERMISSOES.filter(p => permissaoNoTenant(p, slug));
}

/** Os grupos que têm ao menos uma permissão nesta operação, na ordem oficial. */
export function gruposDoTenant(slug: string | null | undefined): GrupoPermissao[] {
  const presentes = new Set(catalogoDoTenant(slug).map(p => p.grupo));
  return GRUPOS_PERMISSAO.filter(g => presentes.has(g));
}

/**
 * O mapa completo de um cargo, com todo o catálogo — nunca parcial.
 *
 * É o que a migration semeia e o que a tela usa quando o banco ainda não tem a
 * linha. Chave ausente do `padrao` nasce `false`: depois de 2026-08-15, ausência
 * significa NEGADO, e não mais "provavelmente pode".
 *
 * Acesso total nasce com tudo ligado, exceto as chaves de `PERMISSOES_EXPLICITAS`
 * — inclusive para o super admin. Não é contradição: o que libera o super admin
 * do cadeado do mês é `CARGOS_QUE_IGNORAM_FECHAMENTO`, em código, justamente para
 * que a saída de emergência não dependa de uma linha de tabela que alguém possa
 * desligar sem querer.
 */
export function permissoesPadraoDoCargo(cargo: string): Record<string, boolean> {
  const total = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargo);
  return Object.fromEntries(
    PERMISSOES.map(p => [
      p.key,
      total && !exigeConcessaoExplicita(p.key)
        ? true
        : (p.padrao[cargo as CargoConfiguravel] ?? false),
    ]),
  );
}
