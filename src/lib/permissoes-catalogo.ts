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
 * ## O que estas permissões governam: TUDO
 *
 * **O painel é a autoridade única sobre acesso.** Se ele liga uma aba para um
 * cargo, aquele cargo abre a aba. Se ele limita a um setor, o banco limita ao
 * setor. Se ele desliga, está desligado e não há caminho alternativo — nem
 * digitando a URL, nem por lista de cargo escrita em algum arquivo.
 *
 * Regra ditada pelo Cleber em 23/08/2026, e ela não admite exceção de código:
 *
 *   «Eu quero ter o poder absoluto dessa aba de permissões. Não quero nenhum
 *    tipo de regra que bloqueie uma decisão minha. Eu quero definir o teto.»
 *
 * ## Isto INVERTEU o modelo anterior — e o anterior está morto
 *
 * Até 23/08 estas chaves eram cosmética: decidiam menu e botão, e a RLS decidia
 * o dado por listas de cargo escritas dentro das próprias policies. O cabeçalho
 * deste arquivo dizia, com todas as letras, que forçar uma chave num operador
 * «não faz ele enxergar acordo de outra pessoa — e isso é o comportamento
 * correto».
 *
 * Não é mais. Aquele texto era a causa direta da queixa que se repetiu por
 * meses: **«eu libero na tela e não acontece nada»**. Ele foi removido em
 * 24/08/2026 para que ninguém — pessoa ou IA — volte a implementar o modelo
 * antigo achando que está seguindo o projeto.
 *
 * O que tornou a inversão real, e está aplicado em produção:
 *
 *   `20260823010000` .. matou `fn_teto_rls_acordos`, o teto por cargo que ficava
 *                       ACIMA do painel e silenciosamente cortava o que ele
 *                       liberava
 *   `20260823020000` .. criou `fn_user_tem()` e `fn_user_escopo()` — o painel
 *                       dentro do Postgres, espelhando `useCargoPermissoes`
 *   `20260823030000`–`060000` .. converteu ~76 policies em 40 tabelas de
 *                       lista-de-cargo para pergunta-ao-painel
 *
 * ## A única exceção, e por que ela existe
 *
 * `super_admin` passa por cima de tudo. Não é resíduo do modelo antigo: é a
 * garantia de que ninguém se tranca para fora do sistema editando o próprio
 * painel. É o único cargo que o painel não consegue reduzir, e ele existe para
 * proteger quem configura — nunca para limitá-lo.
 *
 * ## O que isso exige de TODO código novo
 *
 * Nenhuma decisão de acesso pode perguntar o cargo. Nem na tela, nem no hook,
 * nem na policy. A pergunta certa é sempre ao painel:
 *
 *   tela ....... `temPermissao('chave')` / `niveisLiberados('aba', temPermissao)`
 *   banco ...... `fn_user_tem('chave')` / `fn_user_escopo('aba')`
 *
 * `isPerfilLider(cargo)`, `perfil === 'diretoria'` e afins são o modelo antigo
 * sobrevivendo. `painel-manda.test.ts` reprova qualquer uso novo deles: os que
 * restam estão numa lista nominal, justificada caso a caso, que só encolhe.
 */

import { produtoDoSlug, type Produto } from '@/lib/produto';

/** Os cargos que o administrador configura na tela. */
export const CARGOS_CONFIGURAVEIS = [
  'operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria', 'rh',
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
export const PERMISSOES_EXPLICITAS = [
  'ignorar_fechamento_mes',
  /*
   * Reabrir competência finalizada do RH.
   *
   * Mesma família do cadeado do mês, e pelo mesmo motivo: a competência
   * finalizada é a folha que já foi paga. Reabri-la reescreve um número que
   * pessoas receberam — e quem recebeu não é avisado.
   *
   * Como toda chave desta lista, o acesso total do administrador não a concede
   * sozinho. Alguém precisa ligar, e a decisão fica registrada.
   */
  'rh_reabrir_fechamento',
] as const;

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
  'Pix Automático',
  'Painel Diretoria',
  'RH Gestão',
  // Tickets entrou em 24/08/2026. Era o único módulo cujo acesso ficava
  // inteiramente fora do painel — flag por empresa + cadastro + cargo.
  'Tickets',
  // Chat interno, 25/08/2026. Substitui a "Pomba" do sistema da empresa.
  'Chat',
  // Modo TV, 01/09/2026. A apresentação que roda no PC ligado à TV por HDMI.
  'Modo TV',
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
  /**
   * Em quais PRODUTOS esta chave existe. Ausente = só `cobranca`.
   *
   * Eixo diferente de `tenants`, e acima dele: `tenants` separa as duas
   * empresas DA cobrança; `produtos` separa cobrança de Vendas e de RH.
   *
   * Quase todo o catálogo fala de acordo, recebimento, meta e tabulação, e por
   * isso o padrão é cobrança. O que ganha declaração explícita é o punhado de
   * chaves que qualquer operação precisa — cadastrar gente, configurar a
   * empresa, recuperar o que foi apagado. Ver `produtosDaPermissao`.
   */
  produtos?: readonly Produto[];
  /** Valor de partida ao semear. Cargo omitido nasce `false`. */
  padrao: Partial<Record<CargoConfiguravel, boolean>>;
  /**
   * Chave que só tem efeito se OUTRA estiver ligada.
   *
   * Existe porque a tela mentiu uma vez: as cinco abas internas secundárias do
   * Analítico apareciam no painel como interruptores comuns, o administrador
   * ligava as oito para o `operador`, e cinco não faziam nada — elas vivem
   * dentro da visão de setor, e um cargo com alcance «só os próprios» abre a
   * lista individual, que não tem régua de abas.
   *
   * Ligar e não acontecer nada, sem explicação, é o defeito que este projeto
   * inteiro existe para desfazer. Declarar a dependência aqui faz o painel
   * mostrá-la — e oferecer o atalho para satisfazê-la.
   *
   * `chaves` é um OU: basta uma delas estar ligada.
   */
  depende?: { chaves: string[]; motivo: string };
}

/**
 * As chaves que qualquer operação precisa — cobrança, vendas ou RH.
 *
 * Cadastrar gente, configurar a empresa e recuperar o que foi apagado. Todo o
 * resto do catálogo fala de acordo, recebimento, meta e tabulação, e por isso
 * o padrão de `produtos` é só cobrança.
 */
const TODA_OPERACAO: readonly Produto[] = ['cobranca', 'comercial', 'rh'];

/** Atalhos para os padrões que se repetem. */
const LIDERANCA: Partial<Record<CargoConfiguravel, boolean>> = {
  lider: true, elite: true, gerencia: true, diretoria: true,
};
const TODOS: Partial<Record<CargoConfiguravel, boolean>> = {
  operador: true, ouvidoria: true, lider: true, elite: true,
  gerencia: true, diretoria: true,
};
/** Todos os cargos editáveis, inclusive RH. Usado por controles transversais. */
const TODOS_COM_RH: Partial<Record<CargoConfiguravel, boolean>> = {
  ...TODOS, rh: true,
};

/*
 * `rh` NÃO entra em `TODOS`, e a ausência é deliberada.
 *
 * O atalho descreve a OPERAÇÃO — quem atende, cobra e tabula. O RH não faz
 * nada disso: ele confere folha. Incluí-lo aqui daria a ele Acordos, Pix,
 * Analítico e Lixeira num único caractere, sem ninguém ter decidido isso, e a
 * descoberta viria de alguém do RH abrindo a carteira de acordos de um
 * operador.
 *
 * As chaves dele são nominais, no grupo «RH Gestão».
 */

export const PERMISSOES: PermissaoMeta[] = [
  // ── Abas e telas ─────────────────────────────────────────────────────────
  // Uma permissão por destino do menu. É o grupo que o admin procura primeiro,
  // porque é assim que ele pensa o problema: "quem pode abrir essa aba?".
  {
    key: 'ver_dashboard', label: 'Exibir Dashboard',
    descricao: 'Abrir a tela inicial do sistema',
    grupo: 'Dashboard', produtos: TODA_OPERACAO, padrao: TODOS_COM_RH,
  },
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
    /*
     * O chat NASCE fechado para todo mundo, e `padrao: {}` sozinho não garante
     * isso: `temPermissao` responde `true` para administrador antes de olhar
     * tabela nenhuma. Quem segura o administrador é a trava `chat_config`, no
     * banco — ver a migration 20260825210000.
     *
     * Quando o chat abrir para a operação, a chave passa a mandar sozinha.
     */
    key: 'ver_chat', label: 'Chat interno',
    descricao: 'Abrir o chat e conversar com outras pessoas da empresa',
    grupo: 'Chat', padrao: {},
  },
  {
    key: 'chat_escopo_equipe', label: 'Chat: pessoas da equipe',
    descricao: 'Iniciar conversa com quem está na mesma equipe',
    grupo: 'Chat', padrao: {},
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o alcance valer.' },
  },
  {
    key: 'chat_escopo_setor', label: 'Chat: pessoas do setor',
    descricao: 'Iniciar conversa com quem está no mesmo setor',
    grupo: 'Chat', padrao: {},
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o alcance valer.' },
  },
  {
    key: 'chat_escopo_todos_setores', label: 'Chat: a empresa inteira',
    descricao: 'Iniciar conversa com qualquer pessoa da empresa',
    grupo: 'Chat', padrao: {},
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o alcance valer.' },
  },
  {
    key: 'chat_cargo_operador', label: 'Chat: cargo Operador',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Operador',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_lider', label: 'Chat: cargo Líder',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Líder',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_elite', label: 'Chat: cargo Elite',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Elite',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_gerencia', label: 'Chat: cargo Gerência',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Gerência',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_diretoria', label: 'Chat: cargo Diretoria',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Diretoria',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_ouvidoria', label: 'Chat: cargo Ouvidoria',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Ouvidoria',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_rh', label: 'Chat: cargo RH',
    descricao: 'Permitir iniciar conversa com pessoas do cargo RH',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_administrador', label: 'Chat: cargo Administrador',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Administrador',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  {
    key: 'chat_cargo_super_admin', label: 'Chat: cargo Super Admin',
    descricao: 'Permitir iniciar conversa com pessoas do cargo Super Admin',
    grupo: 'Chat', padrao: TODOS_COM_RH,
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para o cargo valer.' },
  },
  /*
   * ── Grupos ───────────────────────────────────────────────────────────────
   *
   * Quatro chaves e não uma: criar um grupo e mexer no grupo dos outros são
   * poderes diferentes, e a operação já pediu a distinção («o líder cria, mas
   * quem tira gente é a gerência» é uma configuração legítima).
   *
   * Nenhuma delas decide COM QUEM se monta o grupo: isso é o alcance do chat
   * (`chat_escopo_*`), o mesmo da conversa direta. Uma segunda régua de
   * alcance só para grupos seria uma segunda coisa para manter em dia.
   */
  {
    key: 'chat_grupo_criar', label: 'Chat: criar grupos',
    descricao: 'Montar um grupo com as pessoas que já estão no seu alcance',
    grupo: 'Chat', padrao: { ...LIDERANCA, ouvidoria: true },
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para haver grupo.' },
  },
  {
    key: 'chat_grupo_editar', label: 'Chat: configurar grupos',
    descricao: 'Alterar nome, foto e a trava «só a liderança escreve» dos grupos que administra',
    grupo: 'Chat', padrao: { ...LIDERANCA, ouvidoria: true },
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para haver grupo.' },
  },
  {
    key: 'chat_grupo_adicionar', label: 'Chat: adicionar ao grupo',
    descricao: 'Colocar pessoas nos grupos que administra',
    grupo: 'Chat', padrao: { ...LIDERANCA, ouvidoria: true },
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para haver grupo.' },
  },
  {
    key: 'chat_grupo_remover', label: 'Chat: remover do grupo',
    descricao: 'Tirar pessoas dos grupos que administra',
    grupo: 'Chat', padrao: { ...LIDERANCA, ouvidoria: true },
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para haver grupo.' },
  },
  /*
   * ── Monitoria ────────────────────────────────────────────────────────────
   *
   * Abre a aba Monitor, onde se escolhe uma pessoa e se acompanha o chat dela
   * em tempo real. É uma chave de VIGILÂNCIA, e por isso os níveis existem
   * separados: um líder acompanhar o próprio setor é uma coisa, e alguém
   * acompanhar a empresa inteira é outra, que deve ser decidida de propósito.
   *
   * Monitoria é só leitura, sempre. Nenhum nível permite escrever, curtir ou
   * marcar como lida na conversa de outra pessoa — ver `fn_chat_curtir` e
   * `fn_chat_posso_escrever`, que exigem participação e não aceitam monitor.
   */
  {
    key: 'chat_monitor', label: 'Chat: aba Monitor',
    descricao: 'Acompanhar em tempo real as conversas de outra pessoa (somente leitura)',
    grupo: 'Chat', padrao: { ...LIDERANCA, ouvidoria: true },
    depende: { chaves: ['ver_chat'], motivo: 'O chat precisa estar ligado para monitorar.' },
  },
  {
    key: 'chat_monitor_escopo_equipe', label: 'Monitor: pessoas da equipe',
    descricao: 'Acompanhar quem está na mesma equipe',
    grupo: 'Chat', padrao: {},
    depende: { chaves: ['chat_monitor'], motivo: 'A aba Monitor precisa estar ligada para o alcance valer.' },
  },
  {
    key: 'chat_monitor_escopo_setor', label: 'Monitor: pessoas do setor',
    descricao: 'Acompanhar quem está no mesmo setor',
    grupo: 'Chat', padrao: { lider: true, elite: true, gerencia: true, ouvidoria: true },
    depende: { chaves: ['chat_monitor'], motivo: 'A aba Monitor precisa estar ligada para o alcance valer.' },
  },
  {
    key: 'chat_monitor_escopo_todos_setores', label: 'Monitor: a empresa inteira',
    descricao: 'Acompanhar qualquer pessoa da empresa',
    grupo: 'Chat', padrao: { diretoria: true },
    depende: { chaves: ['chat_monitor'], motivo: 'A aba Monitor precisa estar ligada para o alcance valer.' },
  },
  {
    key: 'ver_tickets', label: 'Aba Tickets',
    descricao: 'Abrir a fila de chamados internos',
    grupo: 'Abas e telas',
    padrao: { lider: true, elite: true, gerencia: true, diretoria: true, ouvidoria: true },
  },
  {
    key: 'ver_rh_gestao', label: 'Aba RH Gestão',
    descricao: 'Abrir o Controle de Premiação e Comissão',
    grupo: 'Abas e telas',
    padrao: { lider: true, elite: true, gerencia: true, diretoria: true, rh: true },
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
     * Padrão VAZIO — mas a chave FUNCIONA, e a diferença é toda.
     *
     * Até 23/08/2026 a policy `logs_sis_admin` decidia por cargo, e conceder
     * `ver_logs` a outro cargo não dava acesso: dava uma ABA VAZIA, porque o
     * RLS devolvia zero linhas. Sem erro e sem explicação. Foi o que aconteceu
     * quando o padrão era `{ gerencia: true, diretoria: true }` — dois
     * diretores com a aba e nada dentro dela.
     *
     * `20260823060000` trocou aquela lista por `fn_user_tem('ver_logs')`. Ligar
     * a chave hoje abre a trilha de verdade, sem mexer em migration nenhuma.
     * O padrão continua vazio porque é assim que está configurado, não porque
     * ligá-lo não teria efeito.
     *
     * `logs-permissao-vs-rls.test.ts` reprova se a lista de cargo voltar para
     * dentro da policy.
     */
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'ver_configuracoes', label: 'Configurações',
    descricao: 'Abrir a tela de configurações da empresa',
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'config_sub_geral', label: 'Configurações: Geral',
    descricao: 'Abrir a aba interna Geral',
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'config_sub_permissoes', label: 'Configurações: Permissões',
    descricao: 'Abrir a aba interna Permissões',
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'config_sub_direto_extra', label: 'Configurações: Direto e Extra',
    descricao: 'Abrir a aba interna Direto e Extra',
    grupo: 'Abas e telas', padrao: {},
  },
  {
    key: 'config_sub_tags', label: 'Configurações: Tags',
    descricao: 'Abrir a aba interna Tags',
    grupo: 'Abas e telas', padrao: {},
  },
  {
    key: 'config_sub_documentacoes', label: 'Configurações: Documentações',
    descricao: 'Abrir a aba interna Documentações',
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'config_sub_multiempresa', label: 'Configurações: Multiempresa',
    descricao: 'Abrir a aba interna Multiempresa',
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'ver_monitoramento_uso', label: 'Monitoramento de uso',
    descricao: 'Abrir a aba «Monitoramento de uso» dentro de Logs: quem acessa o sistema, quais telas e por quanto tempo',
    /*
     * Padrão vazio porque hoje só o acesso total tem — mas isto é
     * CONFIGURÁVEL, e a diferença importa.
     *
     * Até 24/08/2026 `uso_telas_select` exigia cargo `administrador`, escrito
     * dentro da policy. Quem tinha `ver_logs` via a sub-aba e recebia zero
     * linhas: a trilha abria, o monitoramento não, e nada na tela dizia por
     * quê. Foi o exemplo que o dono do projeto deu ao descrever a queixa.
     *
     * `20260824200000` trocou a lista de cargo por esta chave. Ligá-la para a
     * diretoria agora abre o monitoramento de verdade.
     */
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
    depende: {
      chaves: ['ver_configuracoes'],
      motivo: 'O monitoramento é uma aba interna de Configurações → Logs.',
    },
  },
  {
    key: 'ver_banco_dados', label: 'Banco de dados',
    descricao: 'Abrir a sub-aba «Banco de dados» em Configurações',
    grupo: 'Abas e telas', produtos: TODA_OPERACAO, padrao: {},
    depende: {
      chaves: ['ver_configuracoes'],
      motivo: 'É uma sub-aba de Configurações.',
    },
  },

  // ── Acordos ──────────────────────────────────────────────────────────────
  /*
   * `ver_acordos_gerais` foi APOSENTADA na fase 5a.
   *
   * Era a chave global mais usada do sistema: sozinha decidia o alcance de
   * Acordos, Dashboard e Lixeira. As três já têm níveis próprios, e com a
   * conversão desta aba ela ficou sem nenhum consumidor.
   *
   * O equivalente hoje é `acordos_escopo_setor` (e `dashboard_escopo_setor`,
   * `lixeira_escopo_setor` nas outras abas) — que é o ponto: a mesma pergunta
   * passa a ter uma resposta por aba, em vez de uma para todas.
   *
   * O teste "as chaves aposentadas não voltaram" a trava fora daqui.
   */
  // Os quatro níveis desta aba. `todos_setores` aqui NÃO acrescenta filtro de
  // setor (a tela não tem um): ele amplia as LISTAS de equipe e de pessoa, de
  // "o meu setor" para "a empresa". Ver `permissoes-escopo.ts`.
  {
    key: 'acordos_escopo_individual', label: 'Acordos: os próprios acordos',
    descricao: 'Ver na lista de acordos os da própria pessoa',
    grupo: 'Acordos', tenants: ['bookplay'], padrao: TODOS,
  },
  {
    key: 'acordos_escopo_equipe', label: 'Acordos: acordos da equipe',
    descricao: 'Ver na lista os acordos da equipe, com os atalhos de equipe no topo',
    grupo: 'Acordos', tenants: ['bookplay'],
    padrao: { lider: true, elite: true, gerencia: true, ouvidoria: true },
  },
  {
    key: 'acordos_escopo_setor', label: 'Acordos: acordos do setor',
    descricao: 'Ver na lista os acordos de outras pessoas, e a coluna Operador',
    grupo: 'Acordos', tenants: ['bookplay'], padrao: LIDERANCA,
  },
  {
    key: 'acordos_escopo_todos_setores', label: 'Acordos: todos os setores',
    descricao: 'Listar equipes e pessoas de qualquer setor nos filtros de Acordos',
    grupo: 'Acordos', tenants: ['bookplay'], padrao: { gerencia: true, diretoria: true },
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
  {
    key: 'acordos_autorizar_tabulacao', label: 'Autorizar tabulação',
    descricao: 'Digitar usuário e senha para liberar transferência de NR, vínculo EXTRA e duplicados na importação',
    /*
     * Nasce com `PERFIS_AUTORIZADORES` — a lista que estava em `lib/index.ts`.
     *
     * Ela existia porque QUATRO listas diferentes respondiam a mesma pergunta
     * em 2026-08-09, e gerência e elite eram recusadas numa tela e aceitas em
     * outra. A lista única resolveu a divergência; esta chave a torna
     * configurável, que é o passo que faltava.
     *
     * ⚠️ O servidor confere a MESMA chave em `fn_transferir_acordo_nr`. Os dois
     * lados mudam juntos — `20260824200000` os converteu de uma vez.
     */
    grupo: 'Acordos', padrao: LIDERANCA,
  },
  {
    key: 'acordos_capturar_erp', label: 'Capturar relatório do ERP',
    descricao: 'Disparar a captura automática do relatório do ERP',
    grupo: 'Acordos', tenants: ['pagueplay'], padrao: {},
  },
  {
    key: 'acordos_campos_admin', label: 'Preencher acordo por imagem (IA/OCR)',
    descricao: 'Enviar, colar ou capturar prints para preencher automaticamente os dados do acordo',
    grupo: 'Acordos', tenants: ['bookplay'], padrao: {},
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
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: LIDERANCA,
  },
  {
    key: 'usuarios_sub_usuarios', label: 'Aba interna Usuários',
    descricao: 'Abrir a lista de pessoas dentro do módulo Usuários',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: LIDERANCA,
  },
  {
    key: 'ver_setores', label: 'Aba interna Setores',
    descricao: 'Abrir a administração de setores dentro do módulo Usuários',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO,
    padrao: { gerencia: true, diretoria: true },
  },
  {
    key: 'ver_equipes', label: 'Ver equipes',
    descricao: 'Abrir a lista de equipes e seus membros',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: LIDERANCA,
  },
  // `ver_operadores` saiu em 31/08/2026, junto com a aba Acompanhamento. Ela
  // liberava o drill-down da lista de operadores daquela aba — "ver informações
  // detalhadas de outras pessoas do setor" era literalmente aquele painel — e
  // nenhum outro código a consultava. Ver 20260831123000.

  // ── Metas ────────────────────────────────────────────────────────────────
  {
    key: 'ver_metas', label: 'Ver metas',
    descricao: 'Abrir a tela de metas, feriados e quartis',
    grupo: 'Metas', padrao: LIDERANCA,
  },
  {
    key: 'ver_comemoracoes', label: 'Aba interna Comemorações',
    descricao: 'Abrir a administração de comemorações dentro do módulo Usuários',
    grupo: 'Gestão de pessoas', padrao: { diretoria: true },
  },

  // ── Filtros e visão ──────────────────────────────────────────────────────
  /*
   * `ver_todos_setores` foi APOSENTADA na fase 6a — a última das seis chaves
   * globais de escopo.
   *
   * O último consumidor era `useAnalytics`, que serve o Dashboard e o Painel
   * Diretoria ao mesmo tempo. Enquanto ela existia, "enxergar além do próprio
   * setor" era uma resposta só para as duas telas — e para Acordos, Analítico,
   * Lixeira e Painel Líder antes delas.
   *
   * O equivalente hoje é `<aba>_escopo_todos_setores`, uma por aba.
   *
   * O teste "as chaves aposentadas não voltaram" a trava fora daqui.
   */
  /*
   * Ações de gestão, uma por lista de cargo que vivia dentro de uma policy.
   *
   * Cada uma nasce EXATAMENTE com quem já podia — nada muda no dia em que
   * entram. O que muda é que passam a ser interruptor: até aqui, "quem exclui
   * uma equipe" estava escrito em SQL e só mudava com migration.
   *
   * Não dava para reaproveitar as chaves antigas: `editar_equipes` está ligada
   * para seis cargos e a exclusão era só do administrador. Ligar uma na outra
   * teria concedido exclusão em massa sem ninguém pedir.
   */
  {
    key: 'administrar_sistema', label: 'Administrar o sistema',
    descricao: 'Editar o painel de permissões, a fila de Tickets e ver o monitoramento de uso',
    grupo: 'Ações específicas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'comemoracoes_gerenciar', label: 'Comemorações: criar e editar',
    descricao: 'Montar e apagar comemorações e a mídia delas',
    grupo: 'Ações específicas', padrao: { diretoria: true },
  },
  {
    key: 'usuarios_administrar', label: 'Usuários: administrar contas',
    descricao: 'Criar, excluir e editar qualquer pessoa, inclusive de outros setores',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'usuarios_editar_do_setor', label: 'Usuários: editar quem é do meu setor',
    descricao: 'Alterar dados das pessoas do próprio setor, sem alcançar administradores',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: { lider: true, elite: true, gerencia: true },
  },
  {
    key: 'usuarios_transferir', label: 'Usuários: transferir de setor ou empresa',
    descricao: 'Abrir e concluir transferências de pessoas',
    grupo: 'Gestão de pessoas',
    produtos: TODA_OPERACAO, padrao: { lider: true, elite: true, gerencia: true, diretoria: true },
  },
  {
    key: 'usuarios_ver_administradores', label: 'Usuários: enxergar contas de administrador',
    descricao: 'Mostrar as contas de administrador e super admin na lista de pessoas',
    /*
     * Outro EIXO, e não outro nível de escopo.
     *
     * «Até onde eu vejo» (setor × empresa) é `usuarios_escopo_*`. «Quem eu
     * vejo» é esta chave. Juntar as duas foi o que produziu o filtro atual, em
     * que ampliar o alcance de um cargo revelava as contas de administração
     * sem ninguém ter decidido isso.
     */
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'usuarios_desfazer_transferencia', label: 'Usuários: desfazer transferência',
    descricao: 'Reverter uma transferência de setor ou empresa já concluída',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'setores_criar_editar', label: 'Setores: criar e editar',
    descricao: 'Criar setores e alterar nome, descrição e demais dados',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO,
    padrao: { gerencia: true, diretoria: true },
  },
  {
    key: 'setores_ativar_desativar', label: 'Setores: ativar e desativar',
    descricao: 'Alterar a situação ativa de um setor',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO,
    padrao: { gerencia: true, diretoria: true },
  },
  {
    key: 'setores_reordenar', label: 'Setores: alterar ordem',
    descricao: 'Reordenar os cards de setores na tela',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO,
    padrao: { gerencia: true, diretoria: true },
  },
  {
    key: 'acesso_multiempresa_permitido', label: 'Acesso às duas operações',
    descricao: 'Cargo que pode receber a chave de multiempresa e alternar entre BookPlay e PaguePlay',
    /*
     * Esta chave habilita o CARGO. Quem de fato alterna é quem também tem a
     * flag `acesso_multiempresa` no próprio cadastro — são duas travas, e a
     * segunda continua sendo por pessoa.
     *
     * `administrador` responde `true` aqui por acesso total, e isso é um ganho
     * declarado em `20260824200000`: antes o seletor exigia gerência ou
     * diretoria, e um administrador com a flag ligada não via as duas empresas.
     */
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: { gerencia: true, diretoria: true },
  },
  {
    key: 'equipes_criar_editar', label: 'Equipes: criar e editar',
    descricao: 'Criar equipes novas e alterar as existentes',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: { lider: true, elite: true, gerencia: true },
  },
  {
    key: 'equipes_excluir', label: 'Equipes: excluir',
    descricao: 'Apagar uma equipe inteira',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: {},
  },
  {
    key: 'equipes_gerenciar_composicao', label: 'Equipes: gerenciar composição',
    descricao: 'Definir líderes da equipe e clonar operadores de outros setores',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: { lider: true, gerencia: true },
  },
  {
    key: 'metas_editar', label: 'Metas: criar e editar',
    descricao: 'Definir e alterar metas de setor, equipe e operador',
    grupo: 'Metas', padrao: { lider: true, elite: true, gerencia: true },
  },
  {
    key: 'metas_excluir', label: 'Metas: excluir',
    descricao: 'Apagar uma meta já definida',
    grupo: 'Metas', padrao: {},
  },
  {
    key: 'metas_editar_dias_uteis', label: 'Metas: editar dias úteis e quartis',
    descricao: 'Alterar a configuração mensal de dias úteis, feriados e faixas de quartil',
    grupo: 'Metas', padrao: { lider: true },
  },
  {
    key: 'metas_excluir_dias_uteis', label: 'Metas: excluir a configuração do mês',
    descricao: 'Apagar a configuração mensal de dias úteis e quartis',
    grupo: 'Metas', padrao: {},
  },
  {
    key: 'usuarios_escopo_setor', label: 'Usuários: pessoas do próprio setor',
    descricao: 'Ver na gestão de pessoas quem é do setor da própria pessoa',
    grupo: 'Gestão de pessoas', produtos: TODA_OPERACAO, padrao: TODOS,
  },
  {
    key: 'usuarios_escopo_todos_setores', label: 'Usuários: pessoas de todos os setores',
    descricao: 'Ver na gestão de pessoas quem é de qualquer setor da empresa',
    grupo: 'Gestão de pessoas',
    produtos: TODA_OPERACAO, padrao: { gerencia: true, diretoria: true, ouvidoria: true },
  },
  {
    key: 'painel_diretoria_escopo_setor', label: 'Painel Diretoria: o próprio setor',
    descricao: 'Ver no Painel Diretoria os números do setor da própria pessoa',
    grupo: 'Painel Diretoria', padrao: { gerencia: true },
  },
  {
    key: 'painel_diretoria_escopo_todos_setores', label: 'Painel Diretoria: todos os setores',
    descricao: 'Ver no Painel Diretoria a empresa inteira, com o filtro de setor disponível',
    grupo: 'Painel Diretoria', padrao: { diretoria: true },
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
  // `painel_lider_sub_acompanhamento` saiu daqui em 31/08/2026, junto com a aba
  // que ela abria. A chave continua nos JSONBs de cargos_permissoes — apagá-la
  // de lá exigiria migrar empresa por empresa para desligar uma permissão que
  // já não tem efeito nenhum. Fora do catálogo, ela some do Admin → Cargos.
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
  /*
   * Ajuste manual de recebimento — correção TEMPORÁRIA do relatório do ERP.
   *
   * As três nascem no painel porque é a regra permanente do projeto: toda
   * ferramenta nova é governada por chave. O pedido diz que "o líder não
   * precisa de permissão nenhuma", e as duas coisas convivem — `_lancar` nasce
   * LIGADA para a liderança inteira, então ninguém precisa ligar nada, e mesmo
   * assim dá para desligar sem deploy no dia em que o ERP for consertado.
   */
  {
    key: 'painel_lider_sub_ajuste_recebimento', label: 'Painel Líder: Ajuste de recebimento',
    descricao: 'Abrir a aba interna de ajuste manual de recebimento (correção temporária)',
    grupo: 'Painel Líder', padrao: LIDERANCA,
  },
  {
    key: 'ajuste_recebimento_lancar', label: 'Lançar ajuste de recebimento',
    descricao: 'Criar, atualizar e apagar o card de recebimento de quem você supervisiona',
    grupo: 'Ações específicas', padrao: LIDERANCA,
    depende: {
      chaves: ['painel_lider_sub_ajuste_recebimento'],
      motivo: 'O formulário de lançamento vive dentro da aba de Ajuste de recebimento, no Painel Líder.',
    },
  },
  {
    key: 'ajuste_recebimento_administrar', label: 'Administrar ajustes de recebimento',
    descricao: 'Ver e editar os cards de TODA a empresa, e não só os de quem você supervisiona',
    grupo: 'Ações específicas', padrao: {},
  },
  /*
   * Configurar desafios.
   *
   * Nasce em `{}` (ninguém) e não é esquecimento: `administrador` e
   * `super_admin` recebem `true` por regra do resolvedor, então a
   * administração já funciona e qualquer outra pessoa precisa ser habilitada
   * nominalmente. Quem configura decide meta e prêmio de uma disputa — é a
   * decisão certa para essa chave.
   *
   * É ela que a RLS de `public.desafios` consulta (migration 20260823170000);
   * a tela apenas esconde o botão.
   */
  /*
   * Configurar a campanha DO PRÓPRIO SETOR.
   *
   * Nasce para a liderança: é o pedido, e o alcance dela já é o setor em todo
   * o resto do sistema. Quem tem esta chave só alcança desafios com
   * `setorId` igual ao setor dele — e a RLS confere isso nas DUAS pontas do
   * UPDATE, para que ninguém pegue a campanha do próprio setor e a reescreva
   * como sendo de outro.
   */
  {
    key: 'desafios_configurar_setor', label: 'Configurar desafios do próprio setor',
    descricao: 'Criar, editar e encerrar as gincanas do setor a que a pessoa pertence',
    grupo: 'Ações específicas', padrao: LIDERANCA,
    depende: {
      chaves: ['analitico_sub_desafios'],
      motivo: 'A tela de configuracao vive dentro da aba Desafios, no Analitico.',
    },
  },
  {
    key: 'desafios_configurar', label: 'Configurar desafios',
    descricao: 'Criar, editar, ativar e encerrar as gincanas da aba Desafios',
    grupo: 'Ações específicas', padrao: {},
    depende: {
      chaves: ['analitico_sub_desafios'],
      motivo: 'A tela de configuracao vive dentro da aba Desafios, no Analitico.',
    },
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
  /*
   * Qualificador do nível `equipe`, e não um quinto nível.
   *
   * `dashboard_escopo_equipe` responde «enxerga equipe?»; esta responde «qual
   * equipe?». Sem ela, ligar o alcance de equipe num operador entregava todas
   * as equipes do setor — mais do que ele precisa para acompanhar a própria.
   *
   * NÃO entra em `ABAS_COM_ESCOPO`: aquele registro descreve a escada
   * individual → equipe → setor → todos, e `fn_user_escopo()` no banco lê os
   * quatro nomes por composição (`dashboard_escopo_` + nível). Um quinto nome
   * ali viraria um peso que não existe.
   *
   * Só decide alguma coisa quando `equipe` é o teto da pessoa: quem alcança o
   * setor já alcança todas as equipes dele, por definição.
   */
  {
    key: 'dashboard_escopo_equipe_todas', label: 'Dashboard: todas as equipes',
    descricao: 'Com o alcance de equipe, ver qualquer equipe do setor — desligada, só as equipes de que a pessoa participa',
    grupo: 'Dashboard', padrao: LIDERANCA,
    depende: {
      chaves: ['dashboard_escopo_equipe'],
      motivo: 'Ela qualifica o alcance de equipe; sem ele nao ha equipe nenhuma para ampliar',
    },
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
  /*
   * Desafios — a aba das gincanas internas.
   *
   * Nasce ligada para todo mundo porque uma gincana existe para ser vista por
   * quem disputa: um placar que só a liderança enxerga não motiva ninguém, e
   * "Sua corrida" (§22 do pedido) é escrita para o operador.
   *
   * É por esta chave, e não por uma regra nova de escopo, que uma operação
   * encerra o placar público — desligá-la para um cargo tira a aba dele sem
   * tocar em nada do Analítico.
   */
  {
    key: 'analitico_sub_desafios', label: 'Analítico: Desafios',
    descricao: 'Abrir a aba interna das gincanas, com ranking individual e por equipe',
    grupo: 'Analítico', padrao: TODOS,
  },
  // Abas internas secundárias — a régua de dentro da visão de setor.
  {
    key: 'analitico_sub_por_operador', label: 'Analítico: Por operador',
    descricao: 'Abrir a aba interna com o recebimento operador a operador',
    grupo: 'Analítico', padrao: TODOS,
    depende: {
      chaves: ['analitico_escopo_setor', 'analitico_escopo_todos_setores'],
      motivo: 'vive na visao de setor — com «so os proprios» a tela abre a lista individual, que nao tem regua de abas',
    },
  },
  {
    key: 'analitico_sub_formas_pagamento', label: 'Analítico: Formas de pagamento',
    descricao: 'Abrir a aba interna de Pix, boleto e cartão por período',
    grupo: 'Analítico', padrao: TODOS,
    depende: {
      chaves: ['analitico_escopo_setor', 'analitico_escopo_todos_setores'],
      motivo: 'vive na visao de setor — com «so os proprios» a tela abre a lista individual, que nao tem regua de abas',
    },
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
    depende: {
      chaves: ['analitico_escopo_setor', 'analitico_escopo_todos_setores'],
      motivo: 'vive na visao de setor — com «so os proprios» a tela abre a lista individual, que nao tem regua de abas',
    },
  },
  {
    key: 'analitico_sub_sem_operador', label: 'Analítico: Sem operador',
    descricao: 'Abrir a aba interna de conferência das linhas sem operador vinculado',
    grupo: 'Analítico', padrao: TODOS,
    depende: {
      chaves: ['analitico_escopo_setor', 'analitico_escopo_todos_setores'],
      motivo: 'vive na visao de setor — com «so os proprios» a tela abre a lista individual, que nao tem regua de abas',
    },
  },
  {
    key: 'analitico_validar_relatorio', label: 'Analítico: validar relatório',
    descricao: 'Marcar um relatório importado como conferido',
    /*
     * Era `isPerfilAdmin`, e a diretoria ficava de fora DE PROPÓSITO: validar
     * assina que o número está certo, e o número já circulou. Nasce igual — o
     * que muda é que agora dá para mudar de ideia sem migration.
     */
    grupo: 'Analítico', padrao: {},
  },

  /*
   * APOSENTADAS junto com a chegada das chaves granulares: editar_usuarios,
   * editar_equipes e gerenciar_metas.
   *
   * Cada uma dizia 'pode escrever aqui' para acoes que o banco tratava como
   * coisas diferentes — criar, editar e excluir tinham listas de cargo
   * distintas dentro do RLS. Uma chave so nunca representou isso: era por isso
   * que ligar 'editar_equipes' nao dava poder de excluir equipe, e nada na
   * tela explicava o porque.
   *
   * O teste 'as chaves aposentadas nao voltaram' as trava fora daqui.
   */

  // ── Pix Automático ───────────────────────────────────────────────────────
  // Aba principal no painel mesmo vivendo dentro de Acordos na tela: foi
  // pedida assim, e é o que a torna independente de `ver_acordos`.
  //
  // Os níveis decidem só o que a pessoa VÊ. Aprovar Pix mexe em comissão e
  // continua em `aprovar_pix_automatico`, separado de propósito.
  {
    key: 'pix_escopo_individual', label: 'Pix: os próprios registros',
    descricao: 'Ver no Pix Automático os registros da própria pessoa',
    grupo: 'Pix Automático', tenants: ['bookplay'], padrao: TODOS,
  },
  {
    key: 'pix_escopo_equipe', label: 'Pix: registros da equipe',
    descricao: 'Ver no Pix Automático os registros da equipe, com o filtro de equipe',
    grupo: 'Pix Automático', tenants: ['bookplay'],
    padrao: { lider: true, elite: true, gerencia: true, ouvidoria: true },
  },
  {
    key: 'pix_escopo_setor', label: 'Pix: registros do setor',
    descricao: 'Ver no Pix Automático os registros de outras pessoas do setor, e a coluna Operador',
    grupo: 'Pix Automático', tenants: ['bookplay'],
    padrao: { lider: true, elite: true, gerencia: true, ouvidoria: true },
  },
  {
    key: 'pix_escopo_todos_setores', label: 'Pix: todos os setores',
    descricao: 'Ver no Pix Automático qualquer setor, com o filtro de setor disponível',
    grupo: 'Pix Automático', tenants: ['bookplay'], padrao: { gerencia: true },
  },
  {
    key: 'pix_editar_configuracoes', label: 'Pix: editar a configuração do setor',
    descricao: 'Alterar o percentual de comissão, o registro manual e as metas de Pix do setor',
    grupo: 'Pix Automático', tenants: ['bookplay'],
    padrao: { lider: true, elite: true, gerencia: true, ouvidoria: true },
  },
  {
    key: 'pix_ajustar_saldo', label: 'Pix: corrigir valor divergente',
    descricao:
      'Anotar quanto a empresa pagou a mais ou a menos a uma pessoa, e aplicar '
      + 'essa correção num próximo pagamento — mexe em dinheiro que vai sair',
    grupo: 'Pix Automático', tenants: ['bookplay'],
    padrao: { lider: true, elite: true, gerencia: true },
    /*
     * Anotar saldo é ação sobre registro alheio: quem só enxerga os próprios
     * não tem em quem anotar. O banco cobra o mesmo par (ver
     * `fn_pix_pode_ajustar_saldo`), então declarar aqui é o que impede o painel
     * de oferecer uma chave que liga e não faz nada.
     */
    depende: {
      chaves: ['pix_escopo_setor', 'pix_escopo_todos_setores'],
      motivo: 'a correção é anotada em OUTRA pessoa — sem alcance de setor não há em quem anotar',
    },
  },
  {
    key: 'pix_marcar_premiacao_paga', label: 'Pix: marcar a premiação como paga',
    descricao:
      'Registrar que a premiação do mês de alguém saiu, e quanto — o valor entra '
      + 'no «já pago» do painel de pagamento',
    grupo: 'Pix Automático', tenants: ['bookplay'],
    /*
     * Era `PERFIL_NIVEL[cargo] >= PERFIL_NIVEL.gerencia`, escrito na tela E na
     * RPC (`fn_user_has_any_role`). Hierarquia de cargo é a mesma decisão de
     * sempre com outra roupa: promover alguém a «paga a premiação» exigia mexer
     * em código nos dois lugares.
     *
     * `padrao` reproduz exatamente quem podia antes — gerência e diretoria; o
     * acesso total de administrador e super_admin continua vindo de
     * `fn_user_tem`, que não precisa da chave semeada.
     */
    padrao: { gerencia: true, diretoria: true },
    /*
     * A premiação marcada é de OUTRA pessoa, e o painel que traz o botão
     * (`PixPainelPremiacoes`) só monta para quem enxerga o setor. Sem o par, a
     * chave ligaria um botão que não existe em tela nenhuma.
     */
    depende: {
      chaves: ['pix_escopo_setor', 'pix_escopo_todos_setores'],
      motivo: 'a premiação é de OUTRA pessoa — sem alcance de setor o painel de pagamento nem aparece',
    },
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
    key: 'ouvidoria_responsavel', label: 'Responsável pela Ouvidoria',
    descricao: 'Enxergar a Ouvidoria inteira sem depender de concessão individual em «Conceder acesso»',
    /*
     * Era `cargo === 'ouvidoria'` dentro de `useOuvidoriaAcesso`.
     *
     * Responsável e convidado são coisas diferentes: o responsável vê tudo por
     * ser dono do módulo; o convidado vê no nível que alguém lhe concedeu em
     * `ouvidoria_acessos`. Com o cargo escrito na tela, promover outra pessoa a
     * responsável exigia mexer em código.
     */
    grupo: 'Ações específicas', tenants: ['pagueplay'], padrao: { ouvidoria: true },
  },
  {
    key: 'tickets_administrar', label: 'Tickets: administrar a fila',
    descricao: 'Atender qualquer ticket e gerenciar o cadastro de atendentes',
    grupo: 'Tickets', padrao: {},
  },
  {
    key: 'tickets_abrir', label: 'Tickets: abrir chamado',
    descricao: 'Criar tickets. A aba em si depende de «Aba Tickets» e do interruptor da empresa',
    /*
     * Tickets era o único módulo FORA do painel: quem via a aba saía de
     * `useTicketsAcesso` — flag por empresa + cadastro de atendentes + cargo.
     * `docs/PERMISSOES-POR-ABA-PROJETO.md` §5.3 registrou isso como pendência
     * consciente, porque chave sem consumidor reprova no teste de contrato.
     *
     * Agora tem consumidor, e o cargo saiu do caminho.
     */
    grupo: 'Tickets',
    padrao: { lider: true, elite: true, gerencia: true, diretoria: true, ouvidoria: true },
  },
  {
    key: 'criar_solicitacao_whatsapp', label: 'Abrir solicitação de WhatsApp',
    descricao: 'Pedir o envio de uma mensagem, além de acompanhar as existentes',
    grupo: 'Ações específicas', padrao: TODOS,
  },
  {
    key: 'solicitacoes_ver_todas', label: 'Solicitações: visão geral',
    descricao: 'Ver e atender solicitações de outras pessoas da empresa',
    grupo: 'Ações específicas', tenants: ['pagueplay'], padrao: LIDERANCA,
  },
  {
    key: 'solicitacoes_definir_responsavel', label: 'Solicitações: definir responsáveis',
    descricao: 'Adicionar e remover pessoas responsáveis pelo atendimento',
    grupo: 'Ações específicas', tenants: ['pagueplay'], padrao: LIDERANCA,
  },
  {
    key: 'aprovar_pix_automatico', label: 'Aprovar Pix automático',
    descricao: 'Aprovar ou desaprovar um Pix — decide comissão',
    grupo: 'Ações específicas', tenants: ['bookplay'], padrao: LIDERANCA,
  },
  // ── RH Gestão ────────────────────────────────────────────────────────────
  /*
   * O alcance e as ações moram separados, como no Pix.
   *
   * Os três níveis respondem "até onde eu enxergo"; as sete chaves de ação
   * respondem "o que eu decido". O nível `individual` não existe aqui de
   * propósito: o operador não preenche a própria premiação, então um "só os
   * meus" seria um interruptor que liga e não mostra nada — exatamente o
   * defeito que `depende` foi criado para expor.
   *
   * `equipe` significa AS EQUIPES QUE A PESSOA LIDERA (`equipe_lideres`), e não
   * "a equipe a que ela pertence". É o requisito do pedido: estar no mesmo
   * setor não dá acesso à equipe alheia.
   */
  {
    key: 'rh_escopo_equipe', label: 'RH: as equipes que eu lidero',
    descricao: 'Ver no RH Gestão os operadores das equipes sob a própria liderança',
    grupo: 'RH Gestão', padrao: { lider: true, elite: true },
  },
  {
    key: 'rh_escopo_setor', label: 'RH: o próprio setor',
    descricao: 'Ver no RH Gestão todas as equipes do próprio setor — a visão da gerência',
    grupo: 'RH Gestão', padrao: { gerencia: true },
  },
  {
    key: 'rh_escopo_todos_setores', label: 'RH: todos os setores',
    descricao: 'Ver no RH Gestão a empresa inteira, por cidade e setor — a visão do RH',
    grupo: 'RH Gestão', padrao: { diretoria: true, rh: true },
  },
  {
    key: 'rh_preencher', label: 'RH: preencher premiação/comissão',
    descricao: 'Informar e corrigir o valor de cada operador, e concluir a equipe',
    grupo: 'RH Gestão', padrao: { lider: true, elite: true, gerencia: true },
    depende: {
      chaves: ['rh_escopo_equipe', 'rh_escopo_setor', 'rh_escopo_todos_setores'],
      motivo: 'preencher é sobre operadores que se enxerga — sem alcance não há quem preencher',
    },
  },
  {
    key: 'rh_validar', label: 'RH: validar equipe',
    descricao: 'Conferir e validar as equipes do escopo, depois de concluídas pela liderança',
    grupo: 'RH Gestão', padrao: { gerencia: true },
    depende: {
      chaves: ['rh_escopo_setor', 'rh_escopo_todos_setores'],
      motivo: 'validar é ato de gerência sobre o setor — o alcance de equipe não alcança',
    },
  },
  {
    key: 'rh_enviar', label: 'RH: enviar o setor ao RH',
    descricao: 'Encaminhar ao RH o fechamento de um setor com todas as equipes validadas',
    grupo: 'RH Gestão', padrao: { gerencia: true },
    depende: {
      chaves: ['rh_escopo_setor', 'rh_escopo_todos_setores'],
      motivo: 'envia-se o setor inteiro — quem só alcança a equipe não tem o que enviar',
    },
  },
  {
    key: 'rh_aprovar', label: 'RH: aprovar',
    descricao: 'Aprovar o lançamento de um operador ou de uma equipe já enviada — decide pagamento',
    grupo: 'RH Gestão', padrao: { gerencia: true, rh: true },
  },
  {
    key: 'rh_devolver', label: 'RH: devolver',
    descricao: 'Devolver um operador ou uma equipe para correção, sempre com motivo',
    grupo: 'RH Gestão', padrao: { gerencia: true, rh: true },
  },
  /*
   * Marcar um operador como fora da folha da competência.
   *
   * Não é o mesmo que lançar zero. Zero significa "conferi e deu zero"; fora
   * da folha significa "não há o que pagar" — não atingiu, entrou no meio do
   * mês, esteve afastado. Sem esta chave, quem não bateu a meta segurava a
   * conclusão da equipe inteira e o líder digitava zero só para destravar,
   * criando um pagamento de zero na folha que ninguém decidiu.
   *
   * Nasce com quem preenche: é durante o preenchimento que a ausência aparece.
   */
  {
    key: 'rh_dispensar', label: 'RH: marcar operador fora da folha',
    descricao: 'Tirar da competência quem não tem premiação a receber, com motivo registrado',
    grupo: 'RH Gestão',
    padrao: { lider: true, elite: true, gerencia: true, rh: true },
    depende: {
      chaves: ['ver_rh_gestao'],
      motivo: 'A acao vive na tabela de operadores do RH Gestao.',
    },
  },
  {
    key: 'rh_gerenciar_fechamento', label: 'RH: abrir competência e definir prazo',
    descricao: 'Abrir a competência do mês, definir/prorrogar o prazo e finalizar o fechamento',
    grupo: 'RH Gestão', padrao: { rh: true },
  },
  {
    key: 'rh_reabrir_fechamento', label: 'RH: reabrir competência finalizada',
    descricao:
      'Reabrir um fechamento já finalizado, com motivo obrigatório. A folha daquele '
      + 'mês já foi paga — reabrir reescreve um número que as pessoas receberam',
    grupo: 'RH Gestão', padrao: {},
  },
  {
    key: 'rh_configurar', label: 'RH: configurar cidades e setores',
    descricao: 'Definir quais setores entram no RH, em que cidade e sob premiação ou comissão',
    grupo: 'RH Gestão', padrao: { rh: true },
  },
  {
    key: 'rh_editar_cracha', label: 'RH: cadastrar crachá',
    descricao:
      'Cadastrar e alterar o crachá do operador. Ver o crachá dentro do módulo '
      + 'já vem com o alcance; alterar é decisão separada',
    grupo: 'RH Gestão', padrao: { rh: true },
  },

  {
    key: 'ignorar_fechamento_mes', label: 'Escrever em mês fechado',
    descricao:
      'Criar, editar e excluir em mês já encerrado. O super admin sempre pode; '
      + 'ligue aqui para abrir a exceção a outro cargo — a alteração muda um mês '
      + 'cujo relatório já circulou',
    grupo: 'Ações específicas', padrao: {},
  },

  // ── Modo TV ──────────────────────────────────────────────────────────────
  //
  // Todas nascem com `padrao: {}` — desligadas para TODO cargo configurável.
  // É o pedido da fase 1: enquanto o Modo TV está sendo provado na parede, só
  // quem tem acesso total abre a aba. Isso não é teto: no dia em que o setor
  // for cuidar da própria TV, o painel liga a chave e pronto, sem deploy.
  //
  // O palco (`/tv/:slug`) NÃO consulta nada disto: ele é público de propósito e
  // fala com uma RPC só. Estas chaves guardam a MESA, que é onde se decide o
  // que a operação inteira vai ver.
  {
    key: 'ver_modo_tv', label: 'Modo TV',
    descricao: 'Abrir a mesa do Modo TV e ver o que está no ar em cada tela',
    grupo: 'Modo TV', tenants: ['bookplay'], padrao: {},
  },
  {
    key: 'tv_editar_cenas', label: 'TV: montar cenas',
    descricao:
      'Criar, montar e apagar as cenas do setor. Mexe só na prévia — não troca '
      + 'o que está na parede',
    grupo: 'Modo TV', tenants: ['bookplay'], padrao: {},
    depende: {
      chaves: ['ver_modo_tv'],
      motivo: 'A mesa precisa estar aberta para haver onde montar a cena.',
    },
  },
  {
    /*
     * Separada de `tv_editar_cenas` de propósito, e é a separação que mais
     * importa aqui: montar a cena e decidir que ela vai para a parede da
     * empresa inteira são decisões diferentes. É como funciona redação de
     * transmissão — alguém prepara, outro alguém põe no ar.
     *
     * Permite dar a um líder o preparo da cena da campanha sem dar a ele o
     * poder de trocar sozinho o que todo mundo está vendo.
     */
    key: 'tv_cortar', label: 'TV: mandar ao ar',
    descricao:
      'Trocar a cena que está na TV. É a permissão que muda o que a operação '
      + 'inteira vê naquele instante',
    grupo: 'Modo TV', tenants: ['bookplay'], padrao: {},
    depende: {
      chaves: ['ver_modo_tv'],
      motivo: 'Sem a mesa aberta não há de onde cortar.',
    },
  },
  {
    key: 'tv_gerenciar_telas', label: 'TV: cadastrar telas',
    descricao: 'Criar tela, definir o endereço público dela e aposentar tela antiga',
    grupo: 'Modo TV', tenants: ['bookplay'], padrao: {},
    depende: {
      chaves: ['ver_modo_tv'],
      motivo: 'A mesa precisa estar aberta para haver onde cadastrar a tela.',
    },
  },
  {
    key: 'tv_enviar_midia', label: 'TV: enviar imagem',
    descricao: 'Subir imagem para a biblioteca do Modo TV e remover o que subiu',
    grupo: 'Modo TV', tenants: ['bookplay'], padrao: {},
    depende: {
      chaves: ['ver_modo_tv'],
      motivo: 'A biblioteca vive dentro da mesa.',
    },
  },
];

/** Índice por chave, para consulta direta. */
export const PERMISSOES_POR_CHAVE: Record<string, PermissaoMeta> =
  Object.fromEntries(PERMISSOES.map(p => [p.key, p]));

export const CHAVES_PERMISSAO: string[] = PERMISSOES.map(p => p.key);

/**
 * Em que produtos esta chave existe. Ausente = só cobrança.
 *
 * O padrão não é descuido: este catálogo NASCEU sendo o da cobrança. As 100
 * chaves falam de acordo, recebimento, meta, tabulação, Pix — vocabulário que
 * não significa nada em Vendas ou RH. Declarar `produtos` em cada uma delas
 * seria repetir cem vezes a mesma informação que a ausência já dá.
 *
 * E a omissão falha do lado seguro: chave nova sem `produtos` fica presa na
 * cobrança. O pior que acontece é ela não aparecer onde deveria — nunca
 * aparecer onde não deveria, que é o erro que a Fase 0 veio fechar.
 */
export function produtosDaPermissao(p: PermissaoMeta): readonly Produto[] {
  return p.produtos ?? ['cobranca'];
}

/**
 * A permissão vale nesta operação?
 *
 * Duas perguntas em sequência, e a ordem importa:
 *
 *   1. o PRODUTO tem esta chave? (`ver_acordos` não existe no Comercial)
 *   2. dentro da cobrança, esta EMPRESA tem? (`tenants`, o eixo antigo)
 *
 * A segunda só faz sentido depois da primeira. Ouvidoria não existe na
 * BookPlay — mas antes disso, Ouvidoria não existe fora da cobrança.
 */
export function permissaoNoTenant(p: PermissaoMeta, slug: string | null | undefined): boolean {
  const produto = produtoDoSlug(slug);
  // Slug indefinido (dev sem `VITE_TENANT_SLUG`) mostra tudo, como sempre fez:
  // é ambiente de desenvolvimento, e esconder metade do painel ali só atrapalha.
  if (slug && !produto) return false;
  if (produto && !produtosDaPermissao(p).includes(produto)) return false;

  if (!p.tenants) return true;
  if (!slug) return true;
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
