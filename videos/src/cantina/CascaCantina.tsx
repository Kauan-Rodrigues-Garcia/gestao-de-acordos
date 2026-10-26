// A casca do app para o vídeo da cantina: a mesma de `app/Casca.tsx` (classes
// do `Layout.tsx` real, tema claro), com o menu de cada lado do balcão —
// quem pede (operador da BookPlay, com «Cantina» no fim do menu) e quem atende
// (o login da empresa Cantina, que só tem o painel).
//
// Cópia em vez de opção na casca comum: a casca comum está sendo mexida no
// vídeo do Pix, ainda fora da main.

import {
  BarChart2, Bell, CalendarDays, Camera, ChefHat, ChevronRight, FileText, HelpCircle, LayoutDashboard, LogOut,
  Menu, MessageCircle, Plus, Send, Smartphone, Sun, Trash2, UtensilsCrossed, Zap,
} from 'lucide-react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { AvatarIniciais } from '../app/Casca';
import { APP_A, APP_L, CABECALHO, LOGO_ALTURA, MENU_PASSO, MENU_TOPO, SIDEBAR } from '../app/layout';
import type { Pessoa } from '../app/pessoa';
import { aperto, entrada, entre, mola, ms } from '../movimento';

type ItemMenu = { id: string; rotulo: string; Icone: React.ElementType };

export const MENU_QUEM_PEDE: ItemMenu[] = [
  { id: 'dashboard', rotulo: 'Dashboard', Icone: LayoutDashboard },
  { id: 'chips', rotulo: 'Meus Chips', Icone: MessageCircle },
  { id: 'acordos', rotulo: 'Acordos', Icone: FileText },
  { id: 'novo', rotulo: 'Novo Acordo', Icone: Plus },
  { id: 'pix', rotulo: 'Pix Automático', Icone: Zap },
  { id: 'lixeira', rotulo: 'Lixeira', Icone: Trash2 },
  { id: 'analitico', rotulo: 'Analítico', Icone: BarChart2 },
  { id: 'campanhas', rotulo: 'Campanha', Icone: Send },
  { id: 'cantina', rotulo: 'Cantina', Icone: UtensilsCrossed },
];

export const MENU_QUEM_ATENDE: ItemMenu[] = [
  { id: 'painel', rotulo: 'Painel da Cantina', Icone: ChefHat },
  { id: 'cantina', rotulo: 'Cantina', Icone: UtensilsCrossed },
];

type Props = {
  pessoa: Pessoa;
  menu: ItemMenu[];
  aparece: number;
  ativo: string;
  anterior: string;
  trocaEm: number;
  cliques: { id: string; f: number }[];
  /** O logo do menu: o da marca, ou o ícone do app (a Cantina não tem marca). */
  logo: string;
  children: React.ReactNode;
  /** Gavetas, diálogos, avisos: por cima de tudo, como os `fixed` do app. */
  sobre?: React.ReactNode;
};

const apertoDe = (f: number, cliques: { id: string; f: number }[], id: string) => {
  const lista = cliques.filter((c) => c.id === id).map((c) => aperto(f, c.f));
  return lista.length ? Math.min(...lista) : 1;
};

export const CascaCantina: React.FC<Props> = ({ pessoa, menu, aparece, ativo, anterior, trocaEm, cliques, logo, children, sobre }) => {
  const f = useCurrentFrame();
  const cargoClasse = 'bg-role-operador/10 text-role-operador border-role-operador/30';
  const iAtivo = menu.findIndex((m) => m.id === ativo);
  const iAnterior = menu.findIndex((m) => m.id === anterior);
  const desliza = iAtivo === iAnterior ? 1 : mola(f, trocaEm);
  const yDestaque = MENU_TOPO + (iAnterior + (iAtivo - iAnterior) * desliza) * MENU_PASSO;
  const chegou = desliza > 0.55;

  return (
    <div className="absolute left-0 top-0 flex bg-background overflow-hidden font-sans text-foreground" style={{ width: APP_L, height: APP_A }}>
      <aside className="relative flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden flex-shrink-0" style={{ width: SIDEBAR }}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border" style={{ height: LOGO_ALTURA, ...entrada(f, aparece, 0) }}>
          <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
            <Img src={staticFile(logo)} className="w-8 h-8 object-contain" />
          </span>
          <div>
            <p className="font-bold text-sm text-sidebar-foreground leading-none">Gestão de Acordos</p>
            <p className="text-[11px] text-sidebar-foreground/70 leading-none mt-1">{pessoa.marca}</p>
          </div>
        </div>

        <nav className="relative flex-1 px-2 py-3 space-y-0.5">
          {iAtivo >= 0 && (
            <div
              className="absolute left-2 right-2 rounded-lg bg-sidebar-primary"
              style={{ top: yDestaque - LOGO_ALTURA, height: MENU_PASSO - 2, opacity: entre(f, aparece + ms(250), aparece + ms(550), 0, 1) }}
            />
          )}
          {menu.map((m, i) => {
            const aceso = m.id === ativo && chegou;
            return (
              <div
                key={m.id}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                  aceso ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/70',
                )}
                style={{ ...entrada(f, aparece, 1 + i), scale: String(apertoDe(f, cliques, `menu-${m.id}`)) }}
              >
                <m.Icone className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 truncate">{m.rotulo}</span>
              </div>
            );
          })}
        </nav>

        <div className="p-3" style={entrada(f, aparece, 11)}>
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent">
            <AvatarIniciais iniciais={pessoa.iniciais} className="w-8 h-8" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{pessoa.nome}</p>
              <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1">
                <span className={cn('inline-block px-1.5 py-0 rounded text-[10px] font-medium', cargoClasse)}>{pessoa.cargo}</span>
                <span className="truncate">· {pessoa.setor}</span>
              </p>
            </div>
            <span className="inline-flex items-center justify-center rounded-md w-7 h-7 text-sidebar-foreground/50 flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </aside>

      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="relative border-b border-border bg-card flex items-center px-4 gap-3 flex-shrink-0" style={{ height: CABECALHO, ...entrada(f, aparece, 2) }}>
          <span className="inline-flex items-center justify-center rounded-md w-8 h-8 shrink-0">
            <Menu className="w-4 h-4" />
          </span>
          <span className="relative flex h-8 min-w-0 items-center gap-2 rounded-full border border-border bg-background px-2.5 text-xs text-foreground">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold">Outubro</span>
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground"><Bell className="w-4 h-4" /></span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground"><HelpCircle className="w-4 h-4" /></span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8"><Sun className="h-4 w-4" /></span>
            <span className="flex min-w-0 items-center gap-2.5 pl-2 border-l border-border text-left">
              <span className="relative shrink-0">
                <AvatarIniciais iniciais={pessoa.iniciais} className="w-8 h-8" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-background border border-border rounded-full flex items-center justify-center">
                  <Camera className="w-2 h-2 text-muted-foreground" />
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="max-w-[220px] truncate text-xs font-semibold leading-4 text-foreground">{pessoa.nome}</span>
                <span className="flex h-4 min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                  <span className={cn('inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded border px-1.5 text-[10px] font-medium leading-none', cargoClasse)}>{pessoa.cargo}</span>
                  <span className="max-w-[200px] truncate">· {pessoa.setor}</span>
                </span>
              </span>
            </span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground"><Smartphone className="w-4 h-4" /></span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground"><LogOut className="w-4 h-4" /></span>
          </div>
        </header>

        <span
          className="absolute -translate-y-1/2 w-5 h-5 bg-card border border-border rounded-full flex items-center justify-center shadow-sm z-10"
          style={{ left: -12, top: '50%' }}
        >
          <ChevronRight className="w-3 h-3 rotate-180" />
        </span>

        <main className="relative flex-1 overflow-hidden bg-background">{children}</main>
      </div>

      {sobre}
    </div>
  );
};
