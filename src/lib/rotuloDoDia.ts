/**
 * «Hoje · 28/09/2026», «Terça-feira · 15/09/2026» — o título de uma linha-dia.
 *
 * Nasceu na lista de Vendas e passou a servir também às listas de acordos da
 * cobrança (BookPlay e PaguePlay), que agrupam pelo vencimento. Por isso o
 * «Amanhã»: venda é sempre passado, vencimento quase sempre é futuro.
 */
import { formatDate, getTodayISO } from '@/lib/index';

function deslocar(diaIso: string, dias: number): string {
  const d = new Date(`${diaIso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function rotuloDoDia(dia: string, hoje: string = getTodayISO()): string {
  const semana = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
  const prefixo =
    dia === hoje                ? 'Hoje'
    : dia === deslocar(hoje, -1) ? 'Ontem'
    : dia === deslocar(hoje, 1)  ? 'Amanhã'
    : semana;
  return `${prefixo.charAt(0).toUpperCase()}${prefixo.slice(1)} · ${formatDate(dia)}`;
}
