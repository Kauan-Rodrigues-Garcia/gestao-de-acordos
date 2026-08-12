/**
 * src/pages/AdminLogs/formatos.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Formatação de data, hora, número e iniciais para a tela de Logs, e a
 * resolução do ícone de cada categoria.
 *
 * Separado de `comum.tsx` porque aquele arquivo exporta componentes: misturar
 * componentes com funções puras no mesmo módulo quebra o Fast Refresh do Vite
 * (a cada edição numa função, o estado de toda a árvore é descartado).
 */
import {
  FileText, DollarSign, Users, LogIn, ShieldAlert, Settings, Upload,
  MessageSquare, Headphones, Target, Trash2, Megaphone, Server,
  type LucideIcon,
} from 'lucide-react';
import { categoriaMeta } from '@/lib/logs-catalogo';

// ═══════════════════════════════════════════════════════════════════════════
// Ícones
// ═══════════════════════════════════════════════════════════════════════════
/**
 * O catálogo (`logs-catalogo.ts`) guarda o NOME do ícone, não o componente:
 * ele é importado pelo serviço e por testes de nó, que não devem arrastar a
 * biblioteca de ícones. A resolução para componente acontece aqui.
 */
const ICONES: Record<string, LucideIcon> = {
  FileText, DollarSign, Users, LogIn, ShieldAlert, Settings, Upload,
  MessageSquare, Headphones, Target, Trash2, Megaphone, Server,
};

export function iconeDaCategoria(categoria: string | null | undefined): LucideIcon {
  return ICONES[categoriaMeta(categoria).icone] ?? Server;
}

// ═══════════════════════════════════════════════════════════════════════════
// Texto
// ═══════════════════════════════════════════════════════════════════════════
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '—';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tempo
// ═══════════════════════════════════════════════════════════════════════════
/** "agora", "há 4 min", "há 3 h", "ontem", "12/08". */
export function tempoRelativo(iso: string): string {
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

  if (seg < 45) return 'agora';
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;

  const d = new Date(iso);
  const ontem = new Date(Date.now() - 86400_000);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** "12/08/2026 14:32:07" — a hora completa, para quando o "há 4 min" não basta. */
export function dataHoraCompleta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** "Hoje", "Ontem", "Segunda-feira, 12 de agosto" — cabeçalho da linha do tempo. */
export function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400_000);

  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';

  const texto = d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    // O ano só aparece quando não é o corrente: "12 de agosto" basta para quem
    // está lendo em agosto, e a data completa polui o cabeçalho de cada dia.
    year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Hora e minuto — usado na coluna de horário da linha do tempo. */
export function horaMinuto(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Números
// ═══════════════════════════════════════════════════════════════════════════
/** 12340 → "12.340". */
export function numeroBr(n: number): string {
  return n.toLocaleString('pt-BR');
}
