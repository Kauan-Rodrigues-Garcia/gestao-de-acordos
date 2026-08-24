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
  Ticket, ClipboardList,
} from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { podeAcessarAbaWpp } from '@/pages/SolicitacoesWhatsapp/permissoes';

export interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
  /** Se true, o item fica oculto quando o tenant for PaguePay */
  hiddenForPaguePay?: boolean;
  /** Se true, o item fica oculto quando o tenant for BookPlay */
  hiddenForBookplay?: boolean;
  /** Chave de `cargos_permissoes` que precisa estar true (admin bypassa) */
  permissaoKey?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',        icon: LayoutDashboard, to: ROUTE_PATHS.DASHBOARD,           roles: ['operador','lider','administrador','elite','gerencia','diretoria','ouvidoria'] },
  // Visibilidade especial (cargo ouvidoria/admin OU acesso concedido) — ver filtro abaixo
  { label: 'Ouvidoria',        icon: LifeBuoy,        to: ROUTE_PATHS.OUVIDORIA,           permissaoKey: 'ver_ouvidoria' },
  // Visibilidade especial (PaguePlay + gate de rollout) — ver filtro abaixo
  { label: 'Solicitar Atendimento', icon: MessageSquarePlus, to: ROUTE_PATHS.SOLICITACOES_WHATSAPP, permissaoKey: 'ver_solicitacoes_whatsapp' },
  // `ver_tickets` decide quem tem a porta; o interruptor em `tickets_config` e o
  // cadastro de atendentes decidem quando ela abre. Ate 23/08 nao havia chave
  // nenhuma aqui, e o cargo escrito na rota era o unico dono da decisao.
  { label: 'Tickets',          icon: Ticket,          to: ROUTE_PATHS.TICKETS,             permissaoKey: 'ver_tickets' },
  // RH Gestão. Sem lista de cargo: quem abre é a chave, e o alcance de dentro
  // vem dos níveis da aba. É o padrão das abas já convertidas.
  { label: 'RH Gestão',        icon: ClipboardList,   to: ROUTE_PATHS.RH_GESTAO,           permissaoKey: 'ver_rh_gestao' },
  // Comemorações virou aba dentro de Usuários (BookPlay e PaguePlay) — sem
  // item de menu. A rota antiga redireciona para lá.
  // `diretoria` estava fora da lista, embora `ver_acordos` seja true para o
  // cargo na BookPlay: a rota abria por URL e o item não aparecia no menu.
  { label: 'Acordos',          icon: FileText,        to: ROUTE_PATHS.ACORDOS,             roles: ['operador','lider','administrador','elite','gerencia','diretoria'], hiddenForPaguePay: true, permissaoKey: 'ver_acordos' },
  { label: 'Novo Acordo',      icon: Plus,            to: ROUTE_PATHS.ACORDO_NOVO,         roles: ['operador','lider','administrador','elite','gerencia'], hiddenForPaguePay: true, permissaoKey: 'criar_acordos' },
  { label: 'Painel Líder',     icon: BarChart3,       to: ROUTE_PATHS.PAINEL_LIDER,        roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_painel_lider' },
  { label: 'Painel Diretoria', icon: TrendingUp,      to: ROUTE_PATHS.PAINEL_DIRETORIA,    roles: ['diretoria','administrador'], permissaoKey: 'ver_painel_diretoria' },
  { label: 'Usuários',         icon: Users,           to: ROUTE_PATHS.ADMIN_USUARIOS,      roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_usuarios' },
  // Metas virou aba dentro de Usuários (BookPlay e PaguePlay) — esconde o menu standalone.
  { label: 'Metas',            icon: Target,          to: '/admin/metas',                  roles: ['administrador','lider','elite','gerencia'], permissaoKey: 'ver_metas', hiddenForBookplay: true, hiddenForPaguePay: true },
  { label: 'Configurações',    icon: Settings,        to: ROUTE_PATHS.ADMIN_CONFIGURACOES, roles: ['administrador'], permissaoKey: 'ver_configuracoes' },
  { label: 'Lixeira',          icon: Trash2,          to: '/admin/lixeira',                roles: ['administrador','lider','operador','elite','gerencia','diretoria'], permissaoKey: 'ver_lixeira' },
  // Estes três eram renderizados À MÃO abaixo do laço, com condição só de slug
  // e cargo. Analítico e Campanha Fácil não consultavam permissão nenhuma:
  // desligar a aba na tela de Permissões bloqueava a rota e o item continuava
  // no menu. Dentro da lista, todo item passa pelo mesmo filtro.
  { label: 'Analítico',        icon: BarChart2,       to: ROUTE_PATHS.ANALITICO,           permissaoKey: 'ver_analitico' },
  { label: 'Campanha Fácil',   icon: Megaphone,       to: ROUTE_PATHS.CAMPANHA_FACIL,      hiddenForPaguePay: true, permissaoKey: 'ver_campanha_facil' },
  { label: 'Importar Excel',   icon: Upload,          to: '/acordos/importar',             permissaoKey: 'importar_excel' },
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
      return ctx.isPaguePlay && podeAcessarAbaWpp(ctx.cargo);
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
