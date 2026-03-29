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
} as const;

export const STATUS_LABELS: Record<string, string> = {
  verificar_pendente: 'Verificar / Pendente',
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
};

export const PERFIL_COLORS: Record<string, string> = {
  operador: 'bg-primary/10 text-primary border-primary/30',
  lider: 'bg-warning/10 text-warning border-warning/30',
  administrador: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
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
