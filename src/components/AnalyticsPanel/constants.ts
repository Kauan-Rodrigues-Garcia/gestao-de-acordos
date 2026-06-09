export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const BREAKDOWN_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6',
];

export const CHART_RECEBIDO = '#22c55e';
export const CHART_AGENDADO = '#6366f1';

export const MEDAL_STYLES = [
  { bg: 'bg-amber-400/20', text: 'text-amber-500', border: 'border-amber-400/40', label: '1' },
  { bg: 'bg-slate-300/20', text: 'text-slate-400', border: 'border-slate-300/40', label: '2' },
  { bg: 'bg-orange-400/20', text: 'text-orange-500', border: 'border-orange-400/40', label: '3' },
];

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};
