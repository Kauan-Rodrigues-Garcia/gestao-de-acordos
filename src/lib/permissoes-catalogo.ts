/**
 * Catálogo único de permissões do sistema.
 *
 * Cada chave é consumida pelo frontend e, quando envolve dados, pela função
 * `fn_tem_permissao`/RLS. Não existe mais cargo com bypass geral: o mapa salvo
 * é a decisão final.
 */
export const CARGOS_CONFIGURAVEIS = [
  'operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria',
  'administrador', 'super_admin',
] as const;
export type CargoConfiguravel = typeof CARGOS_CONFIGURAVEIS[number];

/** Mantido por compatibilidade; acesso total fixo deixou de existir. */
export const CARGOS_ACESSO_TOTAL = [] as const;
/** Toda permissão, inclusive mês fechado, obedece à matriz. */
export const PERMISSOES_EXPLICITAS = [] as const;
export function exigeConcessaoExplicita(_key: string): boolean { return false; }

export type TenantSlug = 'bookplay' | 'pagueplay';
export const GRUPOS_PERMISSAO = [
  'Abas e telas', 'Dashboard', 'Acordos', 'Analítico', 'Gestão de pessoas',
  'Configurações', 'Ouvidoria', 'Campanha Fácil', 'WhatsApp e Tickets',
  'Ações específicas',
] as const;
export type GrupoPermissao = typeof GRUPOS_PERMISSAO[number];

export interface PermissaoMeta {
  key: string;
  label: string;
  descricao: string;
  grupo: GrupoPermissao;
  tenants?: TenantSlug[];
  padrao: Partial<Record<CargoConfiguravel, boolean>>;
  /** Permissões-pai que também precisam estar ligadas. */
  requer?: string[];
}

const TODOS: Partial<Record<CargoConfiguravel, boolean>> = {
  operador: true, ouvidoria: true, lider: true, elite: true, gerencia: true,
  diretoria: true, administrador: true, super_admin: true,
};
const LIDERANCA: Partial<Record<CargoConfiguravel, boolean>> = {
  lider: true, elite: true, gerencia: true, administrador: true, super_admin: true,
};
const LIDERANCA_COMPLETA: Partial<Record<CargoConfiguravel, boolean>> = {
  lider: true, elite: true, gerencia: true, diretoria: true,
  administrador: true, super_admin: true,
};
const CUPULA: Partial<Record<CargoConfiguravel, boolean>> = {
  gerencia: true, diretoria: true, administrador: true, super_admin: true,
};
const ADMIN: Partial<Record<CargoConfiguravel, boolean>> = {
  administrador: true, super_admin: true,
};
const SUPER: Partial<Record<CargoConfiguravel, boolean>> = { super_admin: true };
const OUVIDORIA_ADMIN: Partial<Record<CargoConfiguravel, boolean>> = {
  ouvidoria: true, administrador: true, super_admin: true,
};
const NINGUEM: Partial<Record<CargoConfiguravel, boolean>> = {};

export const PERMISSOES: PermissaoMeta[] = [
  // ── Abas principais ────────────────────────────────────────────────────
  { key: 'ver_dashboard', label: 'Dashboard', descricao: 'Abrir o painel inicial da operação', grupo: 'Abas e telas', padrao: TODOS },
  { key: 'ver_acordos', label: 'Aba Acordos', descricao: 'Abrir a lista completa de acordos', grupo: 'Abas e telas', tenants: ['bookplay'], padrao: TODOS },
  { key: 'ver_analitico', label: 'Aba Analítico', descricao: 'Abrir recebimentos, diário e colchão', grupo: 'Abas e telas', padrao: TODOS },
  { key: 'ver_painel_lider', label: 'Painel do Líder', descricao: 'Abrir o painel operacional das equipes', grupo: 'Abas e telas', padrao: LIDERANCA },
  { key: 'ver_painel_diretoria', label: 'Painel da Diretoria', descricao: 'Abrir o painel estratégico', grupo: 'Abas e telas', padrao: { diretoria: true, administrador: true, super_admin: true } },
  { key: 'ver_usuarios', label: 'Usuários', descricao: 'Abrir a gestão de pessoas e suas abas internas', grupo: 'Abas e telas', padrao: LIDERANCA },
  { key: 'ver_configuracoes', label: 'Configurações', descricao: 'Abrir as configurações da operação', grupo: 'Abas e telas', padrao: ADMIN },
  { key: 'ver_ouvidoria', label: 'Ouvidoria', descricao: 'Abrir os atendimentos da Ouvidoria', grupo: 'Abas e telas', tenants: ['pagueplay'], padrao: OUVIDORIA_ADMIN },
  { key: 'ver_campanha_facil', label: 'Campanha Fácil', descricao: 'Abrir o módulo de campanhas', grupo: 'Abas e telas', tenants: ['bookplay'], padrao: LIDERANCA_COMPLETA },
  { key: 'ver_solicitacoes_whatsapp', label: 'Solicitações de WhatsApp', descricao: 'Abrir o atendimento interno de WhatsApp', grupo: 'Abas e telas', tenants: ['pagueplay'], padrao: TODOS },
  { key: 'ver_tickets', label: 'Tickets', descricao: 'Abrir a fila de tickets', grupo: 'Abas e telas', padrao: ADMIN },
  { key: 'ver_lixeira', label: 'Lixeira', descricao: 'Abrir os acordos excluídos', grupo: 'Abas e telas', padrao: { operador: true, lider: true, elite: true, gerencia: true, diretoria: true, administrador: true, super_admin: true } },
  { key: 'ver_creators_lab', label: 'Creators Lab', descricao: 'Abrir a área Creators Lab', grupo: 'Abas e telas', padrao: TODOS },

  // ── Dashboard e visão ──────────────────────────────────────────────────
  { key: 'ver_acordos_gerais', label: 'Ver dados de outras pessoas', descricao: 'Ampliar cards, gráficos e acordos além dos próprios', grupo: 'Dashboard', padrao: LIDERANCA_COMPLETA },
  { key: 'ver_todos_setores', label: 'Ver todos os setores', descricao: 'Consultar dados além do próprio setor', grupo: 'Dashboard', padrao: CUPULA },
  { key: 'filtrar_por_setor', label: 'Filtrar por setor', descricao: 'Usar o seletor de setor nos painéis e listagens', grupo: 'Dashboard', padrao: LIDERANCA_COMPLETA },
  { key: 'filtrar_por_equipe', label: 'Filtrar por equipe', descricao: 'Usar o seletor de equipe nos painéis e listagens', grupo: 'Dashboard', padrao: LIDERANCA },
  { key: 'filtrar_por_usuario', label: 'Filtrar por pessoa', descricao: 'Usar o seletor de usuário nos painéis e listagens', grupo: 'Dashboard', padrao: LIDERANCA_COMPLETA },
  { key: 'filtrar_por_tag', label: 'Filtrar acordos por tag', descricao: 'Usar o seletor de tags na tabela de acordos', grupo: 'Dashboard', tenants: ['bookplay'], padrao: SUPER, requer: ['ver_acordos'] },

  // ── Acordos ────────────────────────────────────────────────────────────
  { key: 'criar_acordos', label: 'Criar acordos', descricao: 'Cadastrar um novo acordo', grupo: 'Acordos', padrao: TODOS },
  { key: 'editar_acordos', label: 'Editar acordos', descricao: 'Alterar acordos permitidos pela visão configurada', grupo: 'Acordos', padrao: TODOS },
  { key: 'excluir_acordos', label: 'Excluir acordos', descricao: 'Mover um acordo para a lixeira', grupo: 'Acordos', padrao: TODOS },
  { key: 'excluir_em_lote', label: 'Excluir em lote', descricao: 'Excluir vários acordos de uma vez', grupo: 'Acordos', padrao: LIDERANCA_COMPLETA },
  { key: 'importar_excel', label: 'Importar acordos por planilha', descricao: 'Cadastrar acordos em lote por Excel', grupo: 'Acordos', padrao: TODOS },
  { key: 'ver_pix_automatico', label: 'Pix Automático', descricao: 'Abrir a área de Pix automático', grupo: 'Acordos', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_acordos'] },
  { key: 'aprovar_pix_automatico', label: 'Aprovar Pix Automático', descricao: 'Aprovar ou desaprovar registros de Pix', grupo: 'Acordos', tenants: ['bookplay'], padrao: LIDERANCA, requer: ['ver_pix_automatico'] },
  { key: 'restaurar_lixeira', label: 'Restaurar acordos', descricao: 'Restaurar itens da lixeira', grupo: 'Acordos', padrao: TODOS, requer: ['ver_lixeira'] },
  { key: 'esvaziar_lixeira', label: 'Esvaziar lixeira', descricao: 'Excluir definitivamente os itens visíveis', grupo: 'Acordos', padrao: LIDERANCA_COMPLETA, requer: ['ver_lixeira'] },

  // ── Analítico ──────────────────────────────────────────────────────────
  { key: 'ver_analiticos_global', label: 'Métricas da empresa inteira', descricao: 'Consolidar todos os setores no Analítico', grupo: 'Analítico', padrao: CUPULA, requer: ['ver_analitico'] },
  { key: 'importar_analitico', label: 'Importar relatório Analítico', descricao: 'Enviar o relatório mensal do ERP', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico'] },
  { key: 'importar_diario', label: 'Importar recebimento diário', descricao: 'Enviar o relatório diário do ERP', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico'] },
  { key: 'validar_relatorios', label: 'Validar relatórios', descricao: 'Validar ou reabrir relatórios de um setor', grupo: 'Analítico', padrao: ADMIN, requer: ['ver_analitico'] },

  // ── Gestão de pessoas ──────────────────────────────────────────────────
  { key: 'criar_usuarios', label: 'Criar usuários', descricao: 'Cadastrar uma nova pessoa', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_usuarios'] },
  { key: 'editar_usuarios', label: 'Editar usuários', descricao: 'Alterar dados, cargo, setor e foto de outra pessoa', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_usuarios'] },
  { key: 'excluir_usuarios', label: 'Excluir usuários', descricao: 'Remover uma pessoa e tratar os acordos dela', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_usuarios'] },
  { key: 'redefinir_senha_usuarios', label: 'Redefinir senhas', descricao: 'Definir uma senha temporária para outra pessoa', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_usuarios'] },
  { key: 'gerenciar_situacao_usuarios', label: 'Alterar situação', descricao: 'Marcar usuário como ativo, férias ou desligado', grupo: 'Gestão de pessoas', padrao: LIDERANCA_COMPLETA, requer: ['ver_usuarios'] },
  { key: 'transferir_usuarios', label: 'Transferir usuários', descricao: 'Mover pessoas entre setores, equipes ou empresas', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_usuarios'] },
  { key: 'impersonar_usuarios', label: 'Entrar como usuário', descricao: 'Assumir temporariamente a sessão de outra pessoa', grupo: 'Gestão de pessoas', padrao: SUPER, requer: ['ver_usuarios'] },
  { key: 'ver_setores', label: 'Aba Setores', descricao: 'Abrir a gestão de setores dentro de Usuários', grupo: 'Gestão de pessoas', padrao: { gerencia: true, administrador: true, super_admin: true }, requer: ['ver_usuarios'] },
  { key: 'editar_setores', label: 'Editar setores', descricao: 'Criar, alterar e excluir setores', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_setores'] },
  { key: 'ver_equipes', label: 'Aba Equipes', descricao: 'Abrir a gestão de equipes', grupo: 'Gestão de pessoas', padrao: LIDERANCA, requer: ['ver_usuarios'] },
  { key: 'editar_equipes', label: 'Editar equipes', descricao: 'Criar, alterar e excluir equipes e membros', grupo: 'Gestão de pessoas', padrao: ADMIN, requer: ['ver_equipes'] },
  { key: 'ver_operadores', label: 'Ver operadores', descricao: 'Ver detalhes e resultados de outras pessoas', grupo: 'Gestão de pessoas', padrao: LIDERANCA_COMPLETA },
  { key: 'ver_metas', label: 'Aba Metas', descricao: 'Abrir metas, feriados e quartis', grupo: 'Gestão de pessoas', padrao: LIDERANCA, requer: ['ver_usuarios'] },
  { key: 'gerenciar_metas', label: 'Editar metas', descricao: 'Definir metas de setor, equipe e operador', grupo: 'Gestão de pessoas', padrao: { gerencia: true, administrador: true, super_admin: true }, requer: ['ver_metas'] },
  { key: 'ver_comemoracoes', label: 'Aba Comemorações', descricao: 'Abrir a criação de comemorações', grupo: 'Gestão de pessoas', padrao: LIDERANCA, requer: ['ver_usuarios'] },
  { key: 'gerenciar_comemoracoes', label: 'Gerenciar comemorações', descricao: 'Criar, finalizar e moderar comemorações', grupo: 'Gestão de pessoas', padrao: LIDERANCA, requer: ['ver_comemoracoes'] },

  // ── Configurações ──────────────────────────────────────────────────────
  { key: 'ver_configuracoes_geral', label: 'Aba Geral', descricao: 'Ver modelos de mensagem e status do sistema', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes'] },
  { key: 'editar_modelos_mensagem', label: 'Editar modelos de mensagem', descricao: 'Criar, alterar e excluir modelos do WhatsApp', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes_geral'] },
  { key: 'ver_permissoes', label: 'Aba Permissões', descricao: 'Abrir a matriz de permissões', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes'] },
  { key: 'gerenciar_permissoes', label: 'Editar permissões', descricao: 'Salvar permissões por cargo e por pessoa', grupo: 'Configurações', padrao: SUPER, requer: ['ver_permissoes'] },
  { key: 'ver_direto_extra', label: 'Aba Direto e Extra', descricao: 'Abrir a configuração de Direto e Extra', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes'] },
  { key: 'gerenciar_direto_extra', label: 'Editar Direto e Extra', descricao: 'Ligar ou desligar a regra por setor, equipe ou pessoa', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_direto_extra'] },
  { key: 'ver_tags', label: 'Aba Tags', descricao: 'Abrir o cadastro de tags', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes'] },
  { key: 'gerenciar_tags', label: 'Editar tags', descricao: 'Criar, alterar e excluir tags', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_tags'] },
  { key: 'ver_logs', label: 'Aba Logs', descricao: 'Ler a trilha de auditoria da operação', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes'] },
  { key: 'ver_monitoramento_uso', label: 'Monitoramento de uso', descricao: 'Ver acessos, tempo e telas utilizadas', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_logs'] },
  { key: 'expurgar_logs', label: 'Expurgar logs antigos', descricao: 'Executar o expurgo manual da trilha', grupo: 'Configurações', padrao: SUPER, requer: ['ver_logs'] },
  { key: 'ver_documentacoes', label: 'Aba Documentações', descricao: 'Abrir documentos e termos LGPD', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_configuracoes'] },
  { key: 'gerenciar_documentacoes', label: 'Editar documentações', descricao: 'Criar, publicar e substituir documentos', grupo: 'Configurações', padrao: ADMIN, requer: ['ver_documentacoes'] },
  { key: 'ver_multiempresa', label: 'Aba Multiempresa', descricao: 'Abrir a gestão de acesso às duas operações', grupo: 'Configurações', padrao: SUPER, requer: ['ver_configuracoes'] },
  { key: 'gerenciar_multiempresa', label: 'Editar acesso multiempresa', descricao: 'Conceder ou remover acesso entre operações', grupo: 'Configurações', padrao: SUPER, requer: ['ver_multiempresa'] },
  { key: 'editar_menu_lateral', label: 'Editar menu lateral', descricao: 'Alterar a ordem global das abas no menu', grupo: 'Configurações', padrao: SUPER },

  // ── Módulos específicos ────────────────────────────────────────────────
  { key: 'editar_ouvidoria', label: 'Registrar e editar atendimentos', descricao: 'Criar, editar, resolver e reabrir atendimentos', grupo: 'Ouvidoria', tenants: ['pagueplay'], padrao: OUVIDORIA_ADMIN, requer: ['ver_ouvidoria'] },
  { key: 'gerenciar_acessos_ouvidoria', label: 'Gerenciar acessos da Ouvidoria', descricao: 'Definir exceções individuais de acesso', grupo: 'Ouvidoria', tenants: ['pagueplay'], padrao: OUVIDORIA_ADMIN, requer: ['ver_ouvidoria'] },
  { key: 'gerenciar_campanha_facil', label: 'Editar Campanha Fácil', descricao: 'Criar, alterar e excluir mensagens e descontos', grupo: 'Campanha Fácil', tenants: ['bookplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_campanha_facil'] },
  { key: 'criar_solicitacao_whatsapp', label: 'Abrir solicitação de WhatsApp', descricao: 'Criar pedidos de atendimento', grupo: 'WhatsApp e Tickets', tenants: ['pagueplay'], padrao: TODOS, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'ver_solicitacoes_whatsapp_geral', label: 'Ver solicitações gerais', descricao: 'Ver pedidos de outras pessoas e setores', grupo: 'WhatsApp e Tickets', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'atender_solicitacoes_whatsapp', label: 'Atender solicitações', descricao: 'Enviar mensagens e alterar o andamento dos pedidos', grupo: 'WhatsApp e Tickets', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'gerenciar_responsaveis_whatsapp', label: 'Gerenciar responsáveis', descricao: 'Definir quem atende solicitações de WhatsApp', grupo: 'WhatsApp e Tickets', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'abrir_tickets', label: 'Abrir tickets', descricao: 'Criar novos tickets', grupo: 'WhatsApp e Tickets', padrao: LIDERANCA_COMPLETA, requer: ['ver_tickets'] },
  { key: 'atender_tickets', label: 'Atender tickets', descricao: 'Assumir tickets, responder e mudar o status', grupo: 'WhatsApp e Tickets', padrao: ADMIN, requer: ['ver_tickets'] },
  { key: 'gerenciar_tickets', label: 'Gerenciar fila de tickets', descricao: 'Configurar atendentes e a disponibilidade da aba', grupo: 'WhatsApp e Tickets', padrao: ADMIN, requer: ['ver_tickets'] },

  { key: 'ignorar_fechamento_mes', label: 'Escrever em mês fechado', descricao: 'Criar, editar e excluir dados em mês encerrado', grupo: 'Ações específicas', padrao: NINGUEM },
];

export const PERMISSOES_POR_CHAVE: Record<string, PermissaoMeta> =
  Object.fromEntries(PERMISSOES.map(p => [p.key, p]));
export const CHAVES_PERMISSAO: string[] = PERMISSOES.map(p => p.key);

export function permissaoNoTenant(p: PermissaoMeta, slug: string | null | undefined): boolean {
  if (!p.tenants || !slug) return true;
  return p.tenants.includes(slug as TenantSlug);
}
export function catalogoDoTenant(slug: string | null | undefined): PermissaoMeta[] {
  return PERMISSOES.filter(p => permissaoNoTenant(p, slug));
}
export function gruposDoTenant(slug: string | null | undefined): GrupoPermissao[] {
  const presentes = new Set(catalogoDoTenant(slug).map(p => p.grupo));
  return GRUPOS_PERMISSAO.filter(g => presentes.has(g));
}
export function permissoesPadraoDoCargo(cargo: string): Record<string, boolean> {
  return Object.fromEntries(PERMISSOES.map(p => [p.key, p.padrao[cargo as CargoConfiguravel] ?? false]));
}

/** Normaliza dependências: filho ligado liga os pais; pai desligado derruba filhos. */
export function normalizarDependencias(
  entrada: Record<string, boolean>, chaveAlterada?: string, valorAlterado?: boolean,
): Record<string, boolean> {
  const mapa = { ...entrada };
  if (chaveAlterada) mapa[chaveAlterada] = !!valorAlterado;

  const ligarPais = (chave: string, visitadas = new Set<string>()) => {
    if (visitadas.has(chave)) return;
    visitadas.add(chave);
    for (const pai of PERMISSOES_POR_CHAVE[chave]?.requer ?? []) {
      mapa[pai] = true;
      ligarPais(pai, visitadas);
    }
  };
  const desligarFilhos = (pai: string, visitadas = new Set<string>()) => {
    if (visitadas.has(pai)) return;
    visitadas.add(pai);
    for (const p of PERMISSOES.filter(item => item.requer?.includes(pai))) {
      mapa[p.key] = false;
      desligarFilhos(p.key, visitadas);
    }
  };
  if (chaveAlterada && valorAlterado) ligarPais(chaveAlterada);
  if (chaveAlterada && !valorAlterado) desligarFilhos(chaveAlterada);

  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of PERMISSOES) {
      if (!mapa[p.key]) continue;
      if ((p.requer ?? []).some(pai => !mapa[pai])) {
        mapa[p.key] = false;
        mudou = true;
      }
    }
  }
  return mapa;
}
