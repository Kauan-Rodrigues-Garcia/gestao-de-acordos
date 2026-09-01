/**
 * menuLateral.ts — QUAIS abas o menu tem, e quem enxerga cada uma.
 *
 * ## Por que isto saiu do `Layout.tsx`
 *
 * A lista e o filtro moravam dentro do componente, e enquanto o menu só era
 * desenhado para quem estava logado isso bastava. O editor de ordem mudou a
 * pergunta: ele precisa mostrar **o menu de OUTRO cargo**, para o super_admin
 * arrastar as abas na ordem que aquele cargo vai ver.
 *
 * Reescrever o filtro dentro do editor daria duas réguas para a mesma decisão,
 * e a segunda envelheceria: aba nova entra no `NAV_ITEMS`, o menu de verdade
 * passa a mostrá-la e a prévia do editor continua com a lista de ontem. Aqui a
 * régua é uma só, parametrizada por quem pergunta.
 *
 * ## O que o filtro NÃO é
 *
 * Não é barreira de segurança. Quem manda no dado é a RLS; esconder um item de
 * menu é conforto. É por isso que a prévia por cargo pode ser aproximada nas
 * duas concessões que dependem de PESSOA (ver `ContextoMenu` abaixo) sem que
 * isso vire um risco: errar a prévia mostra uma aba a mais num desenho, nunca
 * concede acesso a coisa nenhuma.
 */
import {
  LayoutDashboard, FileText, Plus, Users, Settings, Trash2, TrendingUp,
  BarChart3, Upload, Target, BarChart2, LifeBuoy, Megaphone, MessageSquarePlus,
  Ticket, ClipboardList, Tv,
} from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { produtoPermite, type Produto } from '@/lib/produto';

export interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
  /**
   * Em quais PRODUTOS esta aba existe. Obrigatório na prática: sem a lista, a
   * aba não aparece em lugar nenhum.
   *
   * É uma lista BRANCA, e essa é a mudança de 25/08. Antes a régua era por
   * exclusão (`hiddenForPaguePay`), e uma aba sem marcação aparecia em todo
   * tenant — o Comercial abriu mostrando Acordos, Novo Acordo e Campanha
   * Fácil, a cobrança inteira, vazia. Com lista branca, esquecer de declarar
   * some com a aba: o erro fica visível em vez de vazar.
   *
   * Não confundir com os dois campos abaixo. Aqui se decide QUAL PRODUTO; lá,
   * qual das duas empresas de cobrança.
   */
  produtos?: readonly Produto[];
  /**
   * Oculta na PaguePlay. Distinção INTERNA da cobrança — as duas empresas
   * cobram, mas nem toda tela serve às duas. Não tem efeito fora de `cobranca`,
   * porque fora dela a aba já não existe.
   */
  hiddenForPaguePay?: boolean;
  /** Oculta na BookPlay. Mesma natureza do campo acima. */
  hiddenForBookplay?: boolean;
  /** Chave de `cargos_permissoes` que precisa estar true (admin bypassa) */
  permissaoKey?: string;
}

/**
 * As abas que toda operação tem, seja qual for o produto.
 *
 * Três, e a lista é curta de propósito: a porta de entrada, cadastrar gente e
 * configurar a empresa. Todo o resto — acordo, recebimento, meta, analítico —
 * é vocabulário da cobrança e não significa nada em Vendas ou RH.
 *
 * A Lixeira esteve aqui por um dia e saiu: ela lista ACORDOS excluídos, não
 * "coisas apagadas" em geral. Foi o tipo de engano que a lista branca torna
 * barato — reclassificar é mudar uma constante, e nada vazou enquanto isso,
 * porque a tela é isolada por empresa.
 */
const TODOS_OS_PRODUTOS: readonly Produto[] = ['cobranca', 'comercial', 'rh'];

/** Só cobrança. O apelido existe para a lista abaixo ficar legível. */
const SO_COBRANCA: readonly Produto[] = ['cobranca'];

export const NAV_ITEMS: NavItem[] = [
  // A única aba que existe em todo produto por necessidade: é a rota `/`, a
  // porta de entrada. O que ela DESENHA muda por produto — ver `Dashboard`.
  { label: 'Dashboard',        icon: LayoutDashboard, to: ROUTE_PATHS.DASHBOARD,           produtos: TODOS_OS_PRODUTOS, permissaoKey: 'ver_dashboard' },
  // Visibilidade especial (cargo ouvidoria/admin OU acesso concedido) — ver filtro abaixo
  { label: 'Ouvidoria',        icon: LifeBuoy,        to: ROUTE_PATHS.OUVIDORIA,           produtos: SO_COBRANCA, permissaoKey: 'ver_ouvidoria' },
  // Visibilidade especial (PaguePlay + gate de rollout) — ver filtro abaixo
  { label: 'Solicitar Atendimento', icon: MessageSquarePlus, to: ROUTE_PATHS.SOLICITACOES_WHATSAPP, produtos: SO_COBRANCA, permissaoKey: 'ver_solicitacoes_whatsapp' },
  // `ver_tickets` decide quem tem a porta; o interruptor em `tickets_config` e o
  // cadastro de atendentes decidem quando ela abre. Ate 23/08 nao havia chave
  // nenhuma aqui, e o cargo escrito na rota era o unico dono da decisao.
  { label: 'Tickets',          icon: Ticket,          to: ROUTE_PATHS.TICKETS,             produtos: SO_COBRANCA, permissaoKey: 'ver_tickets' },
  // RH Gestão. Sem lista de cargo: quem abre é a chave, e o alcance de dentro
  // vem dos níveis da aba. É o padrão das abas já convertidas.
  //
  // Fica em `cobranca` e NÃO no produto `rh`: esta aba é a gestão de pessoal
  // DA cobrança (célula, fechamento, lançamento), construída sobre os setores
  // e equipes dela. O produto `rh`, quando tiver tela, terá a sua — com a
  // visão das quatro empresas, que esta não tem.
  { label: 'RH Gestão',        icon: ClipboardList,   to: ROUTE_PATHS.RH_GESTAO,           produtos: SO_COBRANCA, permissaoKey: 'ver_rh_gestao' },
  // Modo TV. Sem lista de cargo, como as demais: quem abre é a chave. Ela nasce
  // desligada para todo cargo configurável, então hoje o item só aparece para
  // quem tem acesso total — que é o pedido enquanto a fase 1 está sendo provada
  // na parede. O palco (`/tv/:slug`) não entra em menu nenhum: ele é endereço
  // de TV, não tela de gente.
  { label: 'Modo TV',          icon: Tv,              to: ROUTE_PATHS.MODO_TV,             produtos: SO_COBRANCA, permissaoKey: 'ver_modo_tv' },
  // Comemorações virou aba dentro de Usuários (BookPlay e PaguePlay) — sem
  // item de menu. A rota antiga redireciona para lá.
  // `diretoria` estava fora da lista, embora `ver_acordos` seja true para o
  // cargo na BookPlay: a rota abria por URL e o item não aparecia no menu.
  { label: 'Acordos',          icon: FileText,        to: ROUTE_PATHS.ACORDOS,             produtos: SO_COBRANCA, roles: ['operador','lider','administrador','elite','gerencia','diretoria'], hiddenForPaguePay: true, permissaoKey: 'ver_acordos' },
  { label: 'Novo Acordo',      icon: Plus,            to: ROUTE_PATHS.ACORDO_NOVO,         produtos: SO_COBRANCA, roles: ['operador','lider','administrador','elite','gerencia'], hiddenForPaguePay: true, permissaoKey: 'criar_acordos' },
  { label: 'Painel Líder',     icon: BarChart3,       to: ROUTE_PATHS.PAINEL_LIDER,        produtos: SO_COBRANCA, roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_painel_lider' },
  { label: 'Painel Diretoria', icon: TrendingUp,      to: ROUTE_PATHS.PAINEL_DIRETORIA,    produtos: SO_COBRANCA, roles: ['diretoria','administrador'], permissaoKey: 'ver_painel_diretoria' },
  // Cadastrar gente é necessidade de qualquer operação, e a tela é sobre
  // pessoa, setor e equipe — vocabulário que Vendas e RH também usam.
  { label: 'Usuários',         icon: Users,           to: ROUTE_PATHS.ADMIN_USUARIOS,      produtos: TODOS_OS_PRODUTOS, roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_usuarios' },
  // Metas virou aba dentro de Usuários (BookPlay e PaguePlay) — esconde o menu standalone.
  { label: 'Metas',            icon: Target,          to: '/admin/metas',                  produtos: SO_COBRANCA, roles: ['administrador','lider','elite','gerencia'], permissaoKey: 'ver_metas', hiddenForBookplay: true, hiddenForPaguePay: true },
  { label: 'Configurações',    icon: Settings,        to: ROUTE_PATHS.ADMIN_CONFIGURACOES, produtos: TODOS_OS_PRODUTOS, roles: ['administrador'], permissaoKey: 'ver_configuracoes' },
  { label: 'Lixeira',          icon: Trash2,          to: '/admin/lixeira',                produtos: SO_COBRANCA, roles: ['administrador','lider','operador','elite','gerencia','diretoria'], permissaoKey: 'ver_lixeira' },
  // Estes três eram renderizados À MÃO abaixo do laço, com condição só de slug
  // e cargo. Analítico e Campanha Fácil não consultavam permissão nenhuma:
  // desligar a aba na tela de Permissões bloqueava a rota e o item continuava
  // no menu. Dentro da lista, todo item passa pelo mesmo filtro.
  { label: 'Analítico',        icon: BarChart2,       to: ROUTE_PATHS.ANALITICO,           produtos: SO_COBRANCA, permissaoKey: 'ver_analitico' },
  { label: 'Campanha Fácil',   icon: Megaphone,       to: ROUTE_PATHS.CAMPANHA_FACIL,      produtos: SO_COBRANCA, hiddenForPaguePay: true, permissaoKey: 'ver_campanha_facil' },
  { label: 'Importar Excel',   icon: Upload,          to: '/acordos/importar',             produtos: SO_COBRANCA, permissaoKey: 'importar_excel' },
];

/**
 * Tudo o que a decisão «esta aba aparece?» precisa saber.
 *
 * As duas últimas dependem de PESSOA, e não de cargo. No menu de verdade elas
 * chegam resolvidas pelos hooks; na prévia por cargo do editor, o super_admin
 * escolhe um cargo e não uma pessoa, então elas chegam pelo que vale para o
 * cargo — e o editor diz isso na tela, em vez de fingir precisão que não tem.
 */
export interface ContextoMenu {
  /** O cargo de quem está vendo (ou o cargo que a prévia simula). */
  cargo: string;
  /**
   * O produto da empresa onde a pessoa está. `null` enquanto carrega — e nesse
   * estado o menu sai VAZIO, de propósito: meio segundo sem abas é melhor do
   * que meio segundo com as abas do produto errado.
   */
  produto: Produto | null;
  isPaguePlay: boolean;
  isBookplay: boolean;
  /**
   * A permissão configurável. No menu real é `temPermissao` (da pessoa); na
   * prévia é `valorDoCargo` (do cargo escolhido). Os dois já respondem `true`
   * para administrador e super_admin, que têm acesso total por construção.
   */
  temPermissao: (chave: string) => boolean;
  /** Concessão fina em `ouvidoria_acessos`. Vale POR PESSOA. */
  acessoOuvidoria: boolean;
  /** Interruptor da empresa + cadastro de atendentes de Tickets. */
  acessoTickets: boolean;
}

/**
 * As abas que este contexto enxerga, na ordem do código.
 *
 * Itens COM `permissaoKey` são controlados exclusivamente pela permissão:
 *   - admin/super_admin sempre veem (`temPermissao` retorna true);
 *   - outros cargos: visível se e somente se a permissão estiver ativa.
 *   Isso mantém a nav consistente com o `ProtectedRoute` da rota correspondente.
 *
 * Itens SEM `permissaoKey` são controlados pelo cargo (`roles`).
 */
export function abasDoMenu(ctx: ContextoMenu): NavItem[] {
  return NAV_ITEMS.filter(item => {
    // PRIMEIRO de tudo, e por lista branca: a aba existe neste produto?
    //
    // Vem antes de cargo e de permissão porque é uma pergunta de outra ordem.
    // Cargo e permissão respondem «esta pessoa pode ver?»; esta responde «isto
    // sequer existe aqui?». Um vendedor com `ver_acordos` ligado por engano
    // continua sem ver Acordos, porque acordo não é coisa do Comercial.
    if (!produtoPermite(item.produtos, ctx.produto)) return false;

    // As duas empresas de cobrança. Só têm efeito dentro de `cobranca` — fora
    // dela a aba já saiu na linha acima.
    if (item.hiddenForPaguePay && ctx.isPaguePlay) return false;
    if (item.hiddenForBookplay && ctx.isBookplay) return false;

    // A permissão configurável vem PRIMEIRO e vale para todo item que a
    // declara. Ela ficava depois dos casos especiais abaixo, que retornam cedo
    // — então Ouvidoria e Solicitar Atendimento nunca chegavam a consultá-la, e
    // o menu continuava mostrando a aba de quem tinha a permissão desligada.
    if (item.permissaoKey && !ctx.temPermissao(item.permissaoKey)) return false;

    // Ouvidoria: PaguePlay only; visível para cargo ouvidoria, admins e
    // usuários com acesso concedido em ouvidoria_acessos. A concessão fina
    // continua valendo POR CIMA da permissão já verificada acima.
    if (item.to === ROUTE_PATHS.OUVIDORIA) {
      // OU, e nao E: a permissao ja foi conferida acima. Como E, ligar
      // `ver_ouvidoria` para um cargo nao fazia nada enquanto a pessoa nao
      // tivesse linha em `ouvidoria_acessos` — o caso classico de "liberei e
      // nao aconteceu". A concessao fina continua valendo como caminho extra.
      return ctx.isPaguePlay && (ctx.temPermissao('ver_ouvidoria') || ctx.acessoOuvidoria);
    }

    // Solicitar Atendimento: PaguePlay. O operador enxerga só os pedidos dele,
    // e quem garante isso é a RLS, não este filtro.
    if (item.to === ROUTE_PATHS.SOLICITACOES_WHATSAPP) {
      return ctx.isPaguePlay;
    }

    // Tickets: nasce só para administrador. A liderança entra quando a chave
    // `tickets_config.liberado_para_lideranca` for virada na própria aba.
    if (item.to === ROUTE_PATHS.TICKETS) {
      // A permissao ja foi conferida acima (o item declara `ver_tickets`).
      // O que sobra aqui e o interruptor da empresa e o cadastro de
      // atendentes — dois controles que o proprio admin liga na tela.
      return ctx.acessoTickets;
    }

    if (item.permissaoKey) return true;

    return !item.roles || item.roles.includes(ctx.cargo) || ctx.cargo === 'super_admin';
  });
}

/**
 * Tickets para um CARGO, sem olhar pessoa.
 *
 * `useTicketsAcesso` responde pela pessoa logada e soma um caminho que é
 * individual: estar em `tickets_atendentes`. Numa prévia por cargo esse caminho
 * não existe — não há pessoa —, e o que sobra são as duas chaves do painel.
 *
 * Recebe `temPermissao` e não `cargo` desde 24/08/2026. Antes eram
 * `isPerfilAdmin`/`isPerfilLider` escritos aqui, e a prévia mentia assim que
 * alguém mexesse em Tickets no painel: a réplica mostrava a aba pela lista de
 * cargo enquanto a tela real já a escondia pela chave.
 */
export function ticketsVisivelParaCargo(
  temPermissao: (chave: string) => boolean,
  liberadoParaLideranca: boolean,
): boolean {
  if (temPermissao('tickets_administrar')) return true;
  return liberadoParaLideranca && temPermissao('tickets_abrir');
}
