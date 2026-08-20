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
export function exigeConcessaoExplicita(key: string): boolean { void key; return false; }

export type TenantSlug = 'bookplay' | 'pagueplay';
export const GRUPOS_PERMISSAO = [
  'Dashboard', 'Ouvidoria', 'Solicitar Atendimento', 'Painel Líder',
  'Painel Diretoria', 'Usuários', 'Configurações', 'Lixeira', 'Analítico',
  'Tickets', 'Importar Excel', 'Acordos BP', 'Novo Acordo',
  'Campanha Fácil', 'Pix Automático', 'Creators Lab',
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
  // ── Dashboard ──────────────────────────────────────────────────────────
  { key: 'ver_dashboard', label: 'Ativar Dashboard', descricao: 'Abrir o painel inicial da operação', grupo: 'Dashboard', padrao: TODOS },
  { key: 'dashboard_escopo_individual', label: 'Visão individual', descricao: 'Consultar somente os próprios dados', grupo: 'Dashboard', padrao: TODOS, requer: ['ver_dashboard'] },
  { key: 'dashboard_escopo_equipe', label: 'Visão por equipe', descricao: 'Consultar as equipes permitidas no filtro integrado', grupo: 'Dashboard', padrao: LIDERANCA, requer: ['ver_dashboard'] },
  { key: 'dashboard_escopo_setor', label: 'Visão por setor', descricao: 'Consultar todos os dados de um setor permitido', grupo: 'Dashboard', padrao: LIDERANCA_COMPLETA, requer: ['ver_dashboard'] },
  { key: 'dashboard_escopo_todos_setores', label: 'Todos os setores', descricao: 'Consultar a empresa inteira no Dashboard', grupo: 'Dashboard', padrao: CUPULA, requer: ['ver_dashboard'] },
  { key: 'criar_acordos', label: 'Criar acordos no Dashboard', descricao: 'Cadastrar um novo acordo na operação PaguePlay', grupo: 'Dashboard', tenants: ['pagueplay'], padrao: TODOS, requer: ['ver_dashboard'] },
  { key: 'dashboard_editar_acordos', label: 'Editar acordos', descricao: 'Alterar acordos permitidos pelo escopo do Dashboard', grupo: 'Dashboard', tenants: ['pagueplay'], padrao: TODOS, requer: ['ver_dashboard'] },
  { key: 'dashboard_alterar_status_acordos', label: 'Alterar status', descricao: 'Marcar acordos do Dashboard como pagos ou desfazer a alteração', grupo: 'Dashboard', tenants: ['pagueplay'], padrao: TODOS, requer: ['ver_dashboard'] },
  { key: 'dashboard_excluir_acordos', label: 'Excluir acordos', descricao: 'Mover um acordo do Dashboard para a lixeira', grupo: 'Dashboard', tenants: ['pagueplay'], padrao: TODOS, requer: ['ver_dashboard'] },
  { key: 'dashboard_excluir_em_lote', label: 'Excluir em lote', descricao: 'Excluir vários acordos do Dashboard de uma vez', grupo: 'Dashboard', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_dashboard'] },
  { key: 'dashboard_ignorar_fechamento_mes', label: 'Escrever em mês fechado', descricao: 'Criar, editar e excluir dados do Dashboard em mês encerrado', grupo: 'Dashboard', tenants: ['pagueplay'], padrao: NINGUEM, requer: ['ver_dashboard'] },

  // ── Abas principais independentes ──────────────────────────────────────
  { key: 'ver_ouvidoria', label: 'Ativar Ouvidoria', descricao: 'Abrir os atendimentos da Ouvidoria', grupo: 'Ouvidoria', tenants: ['pagueplay'], padrao: OUVIDORIA_ADMIN },
  { key: 'ver_solicitacoes_whatsapp', label: 'Ativar Solicitar Atendimento', descricao: 'Abrir o atendimento interno de WhatsApp', grupo: 'Solicitar Atendimento', tenants: ['pagueplay'], padrao: TODOS },
  { key: 'ver_painel_lider', label: 'Ativar Painel do Líder', descricao: 'Abrir o painel operacional das equipes', grupo: 'Painel Líder', padrao: LIDERANCA },
  { key: 'ver_painel_diretoria', label: 'Ativar Painel da Diretoria', descricao: 'Abrir o painel estratégico', grupo: 'Painel Diretoria', padrao: { diretoria: true, administrador: true, super_admin: true } },
  { key: 'ver_usuarios', label: 'Ativar Usuários', descricao: 'Abrir a gestão de pessoas e suas abas internas', grupo: 'Usuários', padrao: LIDERANCA },
  { key: 'ver_configuracoes', label: 'Ativar Configurações', descricao: 'Abrir as configurações da operação', grupo: 'Configurações', padrao: ADMIN },
  { key: 'ver_lixeira', label: 'Ativar Lixeira', descricao: 'Abrir os acordos excluídos', grupo: 'Lixeira', padrao: { operador: true, lider: true, elite: true, gerencia: true, diretoria: true, administrador: true, super_admin: true } },
  { key: 'ver_analitico', label: 'Ativar Analítico', descricao: 'Abrir recebimentos, diário e colchão', grupo: 'Analítico', padrao: TODOS },
  { key: 'ver_tickets', label: 'Ativar Tickets', descricao: 'Abrir a fila de tickets', grupo: 'Tickets', padrao: ADMIN },
  { key: 'importar_excel', label: 'Ativar Importar Excel', descricao: 'Cadastrar acordos em lote por Excel', grupo: 'Importar Excel', padrao: TODOS },
  { key: 'ver_acordos', label: 'Ativar Acordos BP', descricao: 'Abrir a lista completa de acordos', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: TODOS },
  { key: 'ver_novo_acordo', label: 'Ativar Novo Acordo', descricao: 'Cadastrar um novo acordo sem depender das demais ações', grupo: 'Novo Acordo', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_acordos'] },
  { key: 'ver_campanha_facil', label: 'Ativar Campanha Fácil', descricao: 'Abrir e gerenciar o módulo de campanhas', grupo: 'Campanha Fácil', tenants: ['bookplay'], padrao: LIDERANCA_COMPLETA },
  { key: 'ver_pix_automatico', label: 'Ativar Pix Automático', descricao: 'Abrir a área de Pix automático de forma independente', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: TODOS },
  { key: 'ver_creators_lab', label: 'Ativar Creators Lab', descricao: 'Abrir a área Creators Lab', grupo: 'Creators Lab', padrao: TODOS },

  // ── Acordos BP ─────────────────────────────────────────────────────────
  { key: 'acordos_escopo_individual', label: 'Visão individual', descricao: 'Consultar somente os próprios acordos', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_acordos'] },
  { key: 'acordos_escopo_equipe', label: 'Visão por equipe', descricao: 'Consultar acordos das equipes permitidas', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: LIDERANCA, requer: ['ver_acordos'] },
  { key: 'acordos_escopo_setor', label: 'Visão por setor', descricao: 'Consultar acordos do próprio setor', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_acordos'] },
  { key: 'acordos_escopo_todos_setores', label: 'Todos os setores', descricao: 'Consultar acordos de toda a empresa', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: CUPULA, requer: ['ver_acordos'] },
  { key: 'filtrar_por_tag', label: 'Filtrar por tag', descricao: 'Usar o seletor de tags na lista de acordos', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: SUPER, requer: ['ver_acordos'] },
  { key: 'editar_acordos', label: 'Editar acordos', descricao: 'Alterar acordos permitidos pela visão configurada', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_acordos'] },
  { key: 'alterar_status_acordos', label: 'Alterar status', descricao: 'Marcar acordos como pagos ou desfazer a alteração', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_acordos'] },
  { key: 'excluir_acordos', label: 'Excluir acordos', descricao: 'Mover um acordo para a lixeira', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_acordos'] },
  { key: 'excluir_em_lote', label: 'Excluir em lote', descricao: 'Excluir vários acordos de uma vez', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_acordos'] },
  { key: 'ignorar_fechamento_mes', label: 'Escrever em mês fechado', descricao: 'Criar, editar e excluir dados em mês encerrado', grupo: 'Acordos BP', tenants: ['bookplay'], padrao: NINGUEM, requer: ['ver_acordos'] },

  // ── Lixeira ────────────────────────────────────────────────────────────
  { key: 'lixeira_escopo_individual', label: 'Visão individual', descricao: 'Ver somente os próprios itens excluídos', grupo: 'Lixeira', padrao: TODOS, requer: ['ver_lixeira'] },
  { key: 'lixeira_escopo_equipe', label: 'Visão por equipe', descricao: 'Ver itens excluídos das equipes permitidas', grupo: 'Lixeira', padrao: LIDERANCA, requer: ['ver_lixeira'] },
  { key: 'lixeira_escopo_setor', label: 'Visão por setor', descricao: 'Ver itens excluídos do próprio setor', grupo: 'Lixeira', padrao: LIDERANCA_COMPLETA, requer: ['ver_lixeira'] },
  { key: 'lixeira_escopo_todos_setores', label: 'Todos os setores', descricao: 'Ver itens excluídos de toda a empresa', grupo: 'Lixeira', padrao: CUPULA, requer: ['ver_lixeira'] },
  { key: 'restaurar_lixeira', label: 'Restaurar acordos', descricao: 'Restaurar itens da lixeira', grupo: 'Lixeira', padrao: TODOS, requer: ['ver_lixeira'] },
  { key: 'esvaziar_lixeira', label: 'Esvaziar lixeira', descricao: 'Excluir definitivamente os itens visíveis', grupo: 'Lixeira', padrao: LIDERANCA_COMPLETA, requer: ['ver_lixeira'] },

  // ── Pix Automático ─────────────────────────────────────────────────────
  { key: 'pix_escopo_individual', label: 'Visão individual', descricao: 'Consultar somente os próprios registros Pix', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: TODOS, requer: ['ver_pix_automatico'] },
  { key: 'pix_escopo_equipe', label: 'Visão por equipe', descricao: 'Consultar registros Pix das equipes permitidas', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: LIDERANCA, requer: ['ver_pix_automatico'] },
  { key: 'pix_escopo_setor', label: 'Visão por setor', descricao: 'Consultar registros Pix do próprio setor', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_pix_automatico'] },
  { key: 'pix_escopo_empresa', label: 'Visão da empresa', descricao: 'Consultar registros Pix de toda a empresa', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: CUPULA, requer: ['ver_pix_automatico'] },
  { key: 'editar_configuracoes_pix_automatico', label: 'Editar configurações', descricao: 'Alterar metas e parâmetros do Pix Automático', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: LIDERANCA, requer: ['ver_pix_automatico'] },
  { key: 'aprovar_pix_automatico', label: 'Aprovar registros', descricao: 'Aprovar ou desaprovar registros de Pix', grupo: 'Pix Automático', tenants: ['bookplay'], padrao: LIDERANCA, requer: ['ver_pix_automatico'] },

  // ── Analítico ──────────────────────────────────────────────────────────
  { key: 'analitico_visao_propria', label: 'Visão própria', descricao: 'Consultar somente os próprios resultados', grupo: 'Analítico', padrao: TODOS, requer: ['ver_analitico'] },
  { key: 'analitico_visao_geral', label: 'Visão geral', descricao: 'Consultar o resultado geral permitido pela empresa', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico'] },
  { key: 'analitico_visao_todos_setores', label: 'Geral de todos os setores', descricao: 'Ampliar a visão geral para toda a empresa', grupo: 'Analítico', padrao: CUPULA, requer: ['analitico_visao_geral'] },
  { key: 'ver_analitico_principal', label: 'Subaba Analítico', descricao: 'Abrir o relatório analítico principal', grupo: 'Analítico', padrao: TODOS, requer: ['ver_analitico'] },
  { key: 'ver_analitico_recebimento_diario', label: 'Subaba Recebimento diário', descricao: 'Abrir o recebimento diário', grupo: 'Analítico', padrao: TODOS, requer: ['ver_analitico'] },
  { key: 'ver_analitico_colchao', label: 'Subaba Colchão', descricao: 'Abrir o relatório de colchão', grupo: 'Analítico', padrao: TODOS, requer: ['ver_analitico'] },
  { key: 'ver_analitico_por_operador', label: 'Visão Por operador', descricao: 'Abrir a análise por operador', grupo: 'Analítico', padrao: TODOS, requer: ['ver_analitico_principal'] },
  { key: 'ver_analitico_formas_pagamento', label: 'Visão Formas de pagamento', descricao: 'Abrir a análise por forma de pagamento', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico_principal'] },
  { key: 'ver_analitico_ranking', label: 'Visão Ranking', descricao: 'Abrir o ranking do Analítico', grupo: 'Analítico', padrao: TODOS, requer: ['ver_analitico_principal'] },
  { key: 'ver_analitico_destaques_dia', label: 'Visão Destaques do dia', descricao: 'Abrir os destaques do dia', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico_principal'] },
  { key: 'ver_analitico_sem_operador', label: 'Visão Sem operador', descricao: 'Abrir registros ainda sem operador', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico_principal'] },
  { key: 'importar_analitico', label: 'Importar relatório Analítico', descricao: 'Enviar o relatório mensal do ERP', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico'] },
  { key: 'importar_diario', label: 'Importar recebimento diário', descricao: 'Enviar o relatório diário do ERP', grupo: 'Analítico', padrao: LIDERANCA_COMPLETA, requer: ['ver_analitico'] },
  { key: 'validar_relatorios', label: 'Validar relatórios', descricao: 'Validar ou reabrir relatórios de um setor', grupo: 'Analítico', padrao: ADMIN, requer: ['ver_analitico'] },

  // ── Usuários e subabas ─────────────────────────────────────────────────
  { key: 'ver_usuarios_lista', label: 'Subaba Usuários', descricao: 'Abrir a lista de usuários', grupo: 'Usuários', padrao: LIDERANCA, requer: ['ver_usuarios'] },
  { key: 'usuarios_todos_setores', label: 'Usuários de todos os setores', descricao: 'Ampliar a lista para toda a empresa', grupo: 'Usuários', padrao: CUPULA, requer: ['ver_usuarios_lista'] },
  { key: 'criar_usuarios', label: 'Criar usuários', descricao: 'Cadastrar uma nova pessoa', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_usuarios_lista'] },
  { key: 'editar_usuarios', label: 'Editar usuários', descricao: 'Alterar dados, cargo, setor e foto de outra pessoa', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_usuarios_lista'] },
  { key: 'excluir_usuarios', label: 'Excluir usuários', descricao: 'Remover uma pessoa e tratar os acordos dela', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_usuarios_lista'] },
  { key: 'redefinir_senha_usuarios', label: 'Redefinir senhas', descricao: 'Definir uma senha temporária para outra pessoa', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_usuarios_lista'] },
  { key: 'gerenciar_situacao_usuarios', label: 'Alterar situação', descricao: 'Marcar usuário como ativo, férias ou desligado', grupo: 'Usuários', padrao: LIDERANCA_COMPLETA, requer: ['ver_usuarios_lista'] },
  { key: 'impersonar_usuarios', label: 'Entrar como usuário', descricao: 'Assumir temporariamente a sessão de outra pessoa', grupo: 'Usuários', padrao: SUPER, requer: ['ver_usuarios_lista'] },
  { key: 'ver_setores', label: 'Subaba Setores', descricao: 'Abrir a gestão de setores dentro de Usuários', grupo: 'Usuários', padrao: { gerencia: true, administrador: true, super_admin: true }, requer: ['ver_usuarios'] },
  { key: 'setores_todos_setores', label: 'Setores de toda a empresa', descricao: 'Consultar e administrar setores além do próprio', grupo: 'Usuários', padrao: CUPULA, requer: ['ver_setores'] },
  { key: 'criar_setores', label: 'Criar setores', descricao: 'Cadastrar novos setores', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_setores'] },
  { key: 'editar_setores', label: 'Editar setores', descricao: 'Alterar e excluir setores', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_setores'] },
  { key: 'transferir_usuarios_setor', label: 'Transferir usuário de setor', descricao: 'Mover pessoas entre setores', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_setores', 'setores_todos_setores'] },
  { key: 'ver_equipes', label: 'Subaba Equipes', descricao: 'Abrir a gestão de equipes', grupo: 'Usuários', padrao: LIDERANCA, requer: ['ver_usuarios'] },
  { key: 'equipes_todos_setores', label: 'Equipes de todos os setores', descricao: 'Consultar e administrar equipes fora do próprio setor', grupo: 'Usuários', padrao: CUPULA, requer: ['ver_equipes'] },
  { key: 'editar_equipes', label: 'Criar e editar equipes', descricao: 'Criar, alterar e excluir equipes e membros', grupo: 'Usuários', padrao: ADMIN, requer: ['ver_equipes'] },
  { key: 'ver_operadores', label: 'Ver operadores', descricao: 'Ver detalhes e resultados de outras pessoas no Painel do Líder', grupo: 'Painel Líder', padrao: LIDERANCA_COMPLETA, requer: ['ver_painel_lider'] },
  { key: 'ver_metas', label: 'Subaba Metas', descricao: 'Abrir metas, feriados e quartis', grupo: 'Usuários', padrao: LIDERANCA, requer: ['ver_usuarios'] },
  { key: 'metas_todos_setores', label: 'Metas de todos os setores', descricao: 'Consultar metas da empresa inteira', grupo: 'Usuários', padrao: CUPULA, requer: ['ver_metas'] },
  { key: 'gerenciar_metas', label: 'Editar metas', descricao: 'Definir metas de setor, equipe e operador', grupo: 'Usuários', padrao: { gerencia: true, administrador: true, super_admin: true }, requer: ['ver_metas'] },
  { key: 'editar_dias_uteis', label: 'Editar dias úteis', descricao: 'Alterar feriados e dias úteis do mês', grupo: 'Usuários', padrao: { gerencia: true, administrador: true, super_admin: true }, requer: ['ver_metas'] },
  { key: 'editar_quartis', label: 'Editar quartis', descricao: 'Alterar faixas e referências dos quartis', grupo: 'Usuários', padrao: { gerencia: true, administrador: true, super_admin: true }, requer: ['ver_metas'] },
  { key: 'ver_comemoracoes', label: 'Subaba Comemorações', descricao: 'Abrir e gerenciar comemorações', grupo: 'Usuários', padrao: LIDERANCA, requer: ['ver_usuarios'] },

  // ── Painel do Líder ────────────────────────────────────────────────────
  { key: 'painel_lider_setor_proprio', label: 'Próprio setor', descricao: 'Consultar somente o setor vinculado ao perfil', grupo: 'Painel Líder', padrao: LIDERANCA, requer: ['ver_painel_lider'] },
  { key: 'painel_lider_todos_setores', label: 'Todos os setores', descricao: 'Permitir selecionar qualquer setor no Painel do Líder', grupo: 'Painel Líder', padrao: CUPULA, requer: ['ver_painel_lider'] },
  { key: 'ver_painel_lider_acompanhamento', label: 'Subaba Acompanhamento', descricao: 'Abrir o acompanhamento do time', grupo: 'Painel Líder', padrao: LIDERANCA, requer: ['ver_painel_lider'] },
  { key: 'ver_painel_lider_desempenho_equipes', label: 'Subaba Desempenho de Equipes', descricao: 'Abrir o desempenho comparativo das equipes', grupo: 'Painel Líder', padrao: LIDERANCA, requer: ['ver_painel_lider'] },
  { key: 'ver_painel_lider_quartis', label: 'Subaba Quartis', descricao: 'Abrir a análise de quartis', grupo: 'Painel Líder', padrao: LIDERANCA, requer: ['ver_painel_lider'] },
  { key: 'ver_painel_lider_grafico_recebimento', label: 'Subaba Gráfico de Recebimento', descricao: 'Abrir o gráfico diário de recebimento', grupo: 'Painel Líder', padrao: LIDERANCA, requer: ['ver_painel_lider'] },

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
  { key: 'criar_solicitacao_whatsapp', label: 'Criar solicitações', descricao: 'Criar pedidos de atendimento', grupo: 'Solicitar Atendimento', tenants: ['pagueplay'], padrao: TODOS, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'ver_solicitacoes_whatsapp_geral', label: 'Visualizar todas', descricao: 'Ver pedidos de outras pessoas e setores', grupo: 'Solicitar Atendimento', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'atender_solicitacoes_whatsapp', label: 'Atender solicitações', descricao: 'Enviar mensagens e alterar o andamento dos pedidos', grupo: 'Solicitar Atendimento', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'gerenciar_responsaveis_whatsapp', label: 'Editar responsáveis pelos envios', descricao: 'Definir quem atende solicitações de WhatsApp', grupo: 'Solicitar Atendimento', tenants: ['pagueplay'], padrao: LIDERANCA_COMPLETA, requer: ['ver_solicitacoes_whatsapp'] },
  { key: 'tickets_escopo_individual', label: 'Visão individual', descricao: 'Consultar somente tickets solicitados pela pessoa', grupo: 'Tickets', padrao: ADMIN, requer: ['ver_tickets'] },
  { key: 'tickets_escopo_equipe', label: 'Visão por equipe', descricao: 'Consultar tickets das equipes permitidas', grupo: 'Tickets', padrao: ADMIN, requer: ['ver_tickets'] },
  { key: 'tickets_escopo_setor', label: 'Visão por setor', descricao: 'Consultar tickets do próprio setor', grupo: 'Tickets', padrao: ADMIN, requer: ['ver_tickets'] },
  { key: 'abrir_tickets', label: 'Abrir tickets', descricao: 'Criar novos tickets', grupo: 'Tickets', padrao: LIDERANCA_COMPLETA, requer: ['ver_tickets'] },
  { key: 'atender_tickets', label: 'Iniciar atendimento', descricao: 'Assumir tickets, responder e mudar o status', grupo: 'Tickets', padrao: ADMIN, requer: ['ver_tickets'] },
  { key: 'gerenciar_tickets', label: 'Somente solicitar atendimento', descricao: 'Configurar atendentes e a disponibilidade da aba', grupo: 'Tickets', padrao: ADMIN, requer: ['ver_tickets'] },
];

export const PERMISSOES_POR_CHAVE: Record<string, PermissaoMeta> =
  Object.fromEntries(PERMISSOES.map(p => [p.key, p]));
export const CHAVES_PERMISSAO: string[] = PERMISSOES.map(p => p.key);

const ACOES_ACORDO_DASHBOARD: Record<string, string> = {
  editar_acordos: 'dashboard_editar_acordos',
  alterar_status_acordos: 'dashboard_alterar_status_acordos',
  excluir_acordos: 'dashboard_excluir_acordos',
  excluir_em_lote: 'dashboard_excluir_em_lote',
  ignorar_fechamento_mes: 'dashboard_ignorar_fechamento_mes',
};

/**
 * Mantém componentes compartilhados entre as duas operações sem misturar as
 * permissões que aparecem e são salvas em cada aba.
 */
export function chavePermissaoDoTenant(key: string, slug: string | null | undefined): string {
  return slug === 'pagueplay' ? (ACOES_ACORDO_DASHBOARD[key] ?? key) : key;
}

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
