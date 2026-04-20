export const ROUTE_PATHS = {
  LOGIN: '/login',
  DASHBOARD: '/',
  ACORDOS: '/acordos',
  ACORDO_NOVO: '/acordos/novo',
  ACORDO_EDITAR: '/acordos/:id/editar',
  ACORDO_DETALHE: '/acordos/:id',
  PAINEL_LIDER: '/lider',
  PAINEL_LIDER_OPERADOR: '/lider/operador/:id',
  ADMIN_USUARIOS: '/admin/usuarios',
  ADMIN_SETORES: '/admin/setores',
  ADMIN_CONFIGURACOES: '/admin/configuracoes',
  ADMIN_LOGS: '/admin/logs',
  ADMIN_IA: '/admin/ia',
  ADMIN_CARGOS: '/admin/cargos',
  PAINEL_DIRETORIA: '/diretoria',
} as const;

export const STATUS_LABELS: Record<string, string> = {
  verificar_pendente: 'Verificar',
  pago: 'Pago',
  nao_pago: 'Não Pago',
};

export const STATUS_COLORS: Record<string, string> = {
  verificar_pendente: 'bg-warning/15 text-warning border-warning/30',
  pago: 'bg-success/15 text-success border-success/30',
  nao_pago: 'bg-destructive/15 text-destructive border-destructive/30',
};

export const TIPO_LABELS: Record<string, string> = {
  boleto: 'Boleto',
  cartao_recorrente: 'Cartão Recorrente',
  pix_automatico: 'Pix automático',
  cartao: 'Cartão',
  pix: 'Pix',
};

export const TIPO_COLORS: Record<string, string> = {
  boleto: 'bg-chart-1/15 text-chart-1 border-chart-1/30',
  cartao_recorrente: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  pix_automatico: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  cartao: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  pix: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
};

export const PERFIL_LABELS: Record<string, string> = {
  operador: 'Operador',
  lider: 'Líder',
  administrador: 'Administrador',
  super_admin: 'Super Admin',
  elite: 'Elite',
  gerencia: 'Gerência',
  diretoria: 'Diretoria',
};

export const PERFIL_COLORS: Record<string, string> = {
  operador:      'bg-role-operador/10 text-role-operador border-role-operador/30',
  lider:         'bg-role-lider/10 text-role-lider border-role-lider/30',
  elite:         'bg-role-elite/10 text-role-elite border-role-elite/30',
  gerencia:      'bg-role-gerencia/10 text-role-gerencia border-role-gerencia/30',
  diretoria:     'bg-role-diretoria/10 text-role-diretoria border-role-diretoria/30',
  administrador: 'bg-role-admin/10 text-role-admin border-role-admin/30',
  super_admin:   'bg-role-super/10 text-role-super border-role-super/30',
};

// Perfis com acesso de líder (visão de setor + equipe)
export const PERFIS_LIDER = ['lider', 'elite', 'gerencia'] as const;
// Perfis com acesso de admin (visão global)
export const PERFIS_ADMIN = ['administrador', 'super_admin'] as const;
// Perfis com acesso de diretoria (analíticos globais sem edição)
export const PERFIS_DIRETORIA = ['diretoria'] as const;

// Hierarquia numérica de cargos (quanto maior, mais alto)
export const PERFIL_NIVEL: Record<string, number> = {
  operador:      1,
  lider:         2,
  elite:         3,
  gerencia:      4,
  diretoria:     5,
  administrador: 6,
  super_admin:   7,
};

// Perfis que visualizam apenas usuários do próprio setor (abaixo de Gerência)
export const PERFIS_VISAO_SETOR = ['operador', 'lider', 'elite'] as const;
// Perfis que podem ver todos os usuários dentro da empresa mas ficam restritos ao próprio cargo ou acima
export const PERFIS_VISAO_EMPRESA_RESTRITA = ['gerencia', 'diretoria'] as const;

export function isPerfilLider(perfil: string): boolean {
  return PERFIS_LIDER.includes(perfil as typeof PERFIS_LIDER[number]);
}
export function isPerfilAdmin(perfil: string): boolean {
  return PERFIS_ADMIN.includes(perfil as typeof PERFIS_ADMIN[number]);
}
export function isPerfilDiretoria(perfil: string): boolean {
  return PERFIS_DIRETORIA.includes(perfil as typeof PERFIS_DIRETORIA[number]);
}
export function isPerfilAdminOuLider(perfil: string): boolean {
  return isPerfilAdmin(perfil) || isPerfilLider(perfil);
}

export const TODAS_EMPRESAS_SELECT_VALUE = 'all';

export function getTodayISO(): string {
  // Usa timezone do Brasil (America/Sao_Paulo) para evitar diferença de data UTC vs local
  const now = new Date();
  const brtOffset = -3 * 60; // BRT = UTC-3
  const localOffset = now.getTimezoneOffset(); // minutos atrás de UTC
  const brtTime = new Date(now.getTime() + (localOffset + brtOffset) * 60 * 1000);
  return brtTime.toISOString().split('T')[0];
}

export function formatCurrency(value: unknown): string {
  // Aceita number | string | null | undefined — delega para safeNum internamente
  const n = typeof value === 'number' ? value : Number(String(value ?? '0').replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatDate(date: string): string {
  if (!date) return '-';
  const [year, month, day] = date.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
}

export function formatPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return phone;
}

export function gerarLinkWhatsapp(whatsapp: string, mensagem: string): string {
  const numero = whatsapp.replace(/\D/g, '');
  const texto = encodeURIComponent(mensagem);
  return `https://wa.me/55${numero}?text=${texto}`;
}

export function interpolarMensagem(
  template: string,
  dados: { nome_cliente: string; nr_cliente: string; valor: number; vencimento: string }
): string {
  return template
    .replace(/\{\{nome_cliente\}\}/g, dados.nome_cliente)
    .replace(/\{\{nr_cliente\}\}/g, dados.nr_cliente)
    .replace(/\{\{valor\}\}/g, formatCurrency(dados.valor))
    .replace(/\{\{vencimento\}\}/g, formatDate(dados.vencimento));
}

export function parseCurrencyInput(v: string): number {
  return Number(v.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

export function isAtrasado(vencimento: string, status: string): boolean {
  if (['pago', 'nao_pago'].includes(status)) return false;
  return vencimento < getTodayISO();
}

// ─────────────────────────────────────────────────────────────────────────────
// PaguePlay-specific constants and helpers
// ─────────────────────────────────────────────────────────────────────────────

// PaguePlay salva 'boleto' no banco para Boleto/PIX; 'cartao' para Cartão de Crédito
export const TIPO_OPTIONS_PAGUEPLAY = ['boleto', 'cartao'] as const;
export const PARCELAS_MAX_PAGUEPLAY = 12;
export const ESTADOS_BRASIL = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export const STATUS_LABELS_PAGUEPLAY: Record<string, string> = {
  verificar_pendente: 'Pendente',
  pago: 'Pago',
  nao_pago: 'Não Pago',
};

export const TIPO_LABELS_PAGUEPLAY: Record<string, string> = {
  boleto: 'Boleto / PIX',
  cartao: 'Cartão de Crédito',
  // Manter pix para compatibilidade com registros legados
  pix: 'Boleto / PIX',
};

export function isPaguePlay(slug: string): boolean {
  return slug === 'pagueplay';
}

// ─────────────────────────────────────────────────────────────────────────────
// PaguePlay — Distribuição de receita (Cofen/Coren/H.O.)
// A empresa Pagueplay retém apenas 24,96% do valor total recebido.
// Os outros 75,04% são repassados: 56,28% para o Coren e 18,76% para o Cofen.
// O H.O. (Honorários Operacionais) é a base para cálculo de metas.
// ─────────────────────────────────────────────────────────────────────────────

/** Percentual retido pela PaguePlay (Honorários Operacionais) */
export const PP_HO_PERCENTUAL = 0.2496;
/** Percentual repassado ao Coren */
export const PP_COREN_PERCENTUAL = 0.5628;
/** Percentual repassado ao Cofen */
export const PP_COFEN_PERCENTUAL = 0.1876;

/** Calcula o valor de H.O. a partir do valor bruto de um acordo */
export function calcHO(valorBruto: number): number {
  return valorBruto * PP_HO_PERCENTUAL;
}

/** Calcula o valor do repasse ao Coren a partir do valor bruto */
export function calcCoren(valorBruto: number): number {
  return valorBruto * PP_COREN_PERCENTUAL;
}

/** Calcula o valor do repasse ao Cofen a partir do valor bruto */
export function calcCofen(valorBruto: number): number {
  return valorBruto * PP_COFEN_PERCENTUAL;
}

export function getStatusLabels(slug: string): Record<string, string> {
  return isPaguePlay(slug) ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
}

export function getTipoLabels(slug: string): Record<string, string> {
  return isPaguePlay(slug) ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS;
}

export function getTipoOptions(slug: string): readonly string[] {
  return isPaguePlay(slug) ? TIPO_OPTIONS_PAGUEPLAY : (Object.keys(TIPO_LABELS) as string[]);
}

export const PARCELAS_MAX_DEFAULT = 60;

export const INSTITUICOES_OPTIONS = [
  'MUNDIAL EDITORA',
  'BOOKPLAY',
  'FACULDADE BOOKPLAY',
  'FACULDADE PLAY',
] as const;

export function getMaxParcelas(slug: string): number {
  return isPaguePlay(slug) ? PARCELAS_MAX_PAGUEPLAY : PARCELAS_MAX_DEFAULT;
}

/**
 * Extracts the Brazilian state code stored as a prefix in the observacoes field.
 * Format: "[ESTADO:SP]\nRest of text"
 */
export function extractEstado(observacoes: string | null | undefined): string {
  if (!observacoes) return '';
  const match = observacoes.match(/^\[ESTADO:([A-Z]{2})\]/);
  return match ? match[1] : '';
}

/**
 * Extracts the link/observation text from observacoes, stripping any estado prefix.
 */
export function extractLinkAcordo(observacoes: string | null | undefined): string {
  if (!observacoes) return '';
  return observacoes.replace(/^\[ESTADO:[A-Z]{2}\]\n?/, '');
}

/**
 * Builds the observacoes string from estado + link for PaguePlay storage.
 */
export function buildObservacoesComEstado(estado: string, link: string): string | null {
  const parts: string[] = [];
  if (estado) parts.push(`[ESTADO:${estado}]`);
  if (link?.trim()) parts.push(link.trim());
  return parts.length > 0 ? parts.join('\n') : null;
}
