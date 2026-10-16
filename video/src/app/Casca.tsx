// A casca do app: menu lateral e cabeçalho — as mesmas classes do
// `src/components/Layout.tsx`, no tema claro, para um operador da BookPlay.
//
// Diferença de propósito: o item aceso do menu DESLIZA de um para o outro (no
// app ele troca na hora). É um detalhe de movimento do vídeo.

import {
  BarChart2, Bell, Camera, ChevronRight, FileText, HelpCircle, LayoutDashboard, LogOut,
  Menu, MessageCircle, Plus, Send, Smartphone, Sun, Trash2, CalendarDays,
} from 'lucide-react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { aperto, entrada, entre, mola, ms } from '../movimento';
import { usePessoa } from './pessoa';
import { APP_A, APP_L, CABECALHO, type IdMenu, LOGO_ALTURA, MENU_PASSO, MENU_TOPO, SIDEBAR } from './layout';

export const MENU: { id: IdMenu; rotulo: string; Icone: React.ElementType }[] = [
  { id: 'dashboard', rotulo: 'Dashboard', Icone: LayoutDashboard },
  { id: 'chips', rotulo: 'Meus Chips', Icone: MessageCircle },
  { id: 'acordos', rotulo: 'Acordos', Icone: FileText },
  { id: 'novo', rotulo: 'Novo Acordo', Icone: Plus },
  { id: 'lixeira', rotulo: 'Lixeira', Icone: Trash2 },
  { id: 'analitico', rotulo: 'Analítico', Icone: BarChart2 },
  { id: 'campanhas', rotulo: 'Campanhas de WhatsApp', Icone: Send },
];

type Props = {
  aparece: number;
  ativo: IdMenu;
  anterior: IdMenu;
  trocaEm: number;
  cliques: { id: string; f: number }[];
  desempenhoAberto: boolean;
  children: React.ReactNode;
  /** Gavetas, chat, avisos: por cima de tudo, como os `fixed` do app. */
  sobre?: React.ReactNode;
};

const apertoDe = (f: number, cliques: { id: string; f: number }[], id: string) => {
  const lista = cliques.filter((c) => c.id === id).map((c) => aperto(f, c.f));
  return lista.length ? Math.min(...lista) : 1;
};

export const AvatarIniciais: React.FC<{ iniciais: string; className?: string; style?: React.CSSProperties }> = ({ iniciais, className, style }) => (
  <span className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)} style={style}>
    <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{iniciais}</span>
  </span>
);

export const Casca: React.FC<Props> = ({ aparece, ativo, anterior, trocaEm, cliques, desempenhoAberto, children, sobre }) => {
  const f = useCurrentFrame();
  const OPERADORA = usePessoa();
  const cargoClasse = OPERADORA.papel === 'lider'
    ? 'bg-role-lider/10 text-role-lider border-role-lider/30'
    : 'bg-role-operador/10 text-role-operador border-role-operador/30';
  const iAtivo = MENU.findIndex((m) => m.id === ativo);
  const iAnterior = MENU.findIndex((m) => m.id === anterior);
  const desliza = iAtivo === iAnterior ? 1 : mola(f, trocaEm);
  const yDestaque = MENU_TOPO + (iAnterior + (iAtivo - iAnterior) * desliza) * MENU_PASSO;
  const destaqueVisivel = iAtivo >= 0;
  // a cor do texto troca junto com a chegada do destaque
  const chegou = desliza > 0.55;

  return (
    <div className="absolute left-0 top-0 flex bg-background overflow-hidden font-sans text-foreground" style={{ width: APP_L, height: APP_A }}>
      {/* ── menu lateral ── */}
      <aside className="relative flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden flex-shrink-0" style={{ width: SIDEBAR }}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border" style={{ height: LOGO_ALTURA, ...entrada(f, aparece, 0) }}>
          <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded">
            <Img src={staticFile('marca/logo-bookplay.png')} className="w-8 h-8 object-contain" />
          </span>
          <div>
            <p className="font-bold text-sm text-sidebar-foreground leading-none">Gestão de Acordos</p>
            <p className="text-[11px] text-sidebar-foreground/70 leading-none mt-1">{OPERADORA.marca}</p>
          </div>
        </div>

        <nav className="relative flex-1 px-2 py-3 space-y-0.5">
          {destaqueVisivel && (
            <div
              className="absolute left-2 right-2 rounded-lg bg-sidebar-primary"
              style={{ top: yDestaque - LOGO_ALTURA, height: MENU_PASSO - 2, opacity: entre(f, aparece + ms(250), aparece + ms(550), 0, 1) }}
            />
          )}
          {MENU.map((m, i) => {
            const aceso = m.id === ativo && chegou;
            return (
              <div
                key={m.id}
                data-alvo={`menu-${m.id}`}
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

        <div className="h-px w-full bg-sidebar-border shrink-0" />

        <div className="px-2 pt-2" style={entrada(f, aparece, 9)}>
          <div
            data-alvo="menu-desempenho"
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              desempenhoAberto ? 'bg-violet-500/15 text-violet-500' : 'text-sidebar-foreground/70',
            )}
            style={{ scale: String(apertoDe(f, cliques, 'menu-desempenho')) }}
          >
            <BarChart2 className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 truncate text-left">Desempenho do Dia</span>
          </div>
        </div>

        <label className="flex items-center gap-2 px-5 pt-2 select-none text-[11px] text-sidebar-foreground/45" style={entrada(f, aparece, 10)}>
          <input type="checkbox" checked readOnly className="h-3 w-3 accent-primary" />
          Recolher automaticamente
        </label>

        <div className="p-3" style={entrada(f, aparece, 11)}>
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent">
            <AvatarIniciais iniciais={OPERADORA.iniciais} className="w-8 h-8" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{OPERADORA.nome}</p>
              <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1">
                <span className={cn('inline-block px-1.5 py-0 rounded text-[10px] font-medium', cargoClasse)}>
                  {OPERADORA.cargo}
                </span>
                <span className="truncate">· {OPERADORA.setor}</span>
              </p>
            </div>
            <span className="inline-flex items-center justify-center rounded-md w-7 h-7 text-sidebar-foreground/50 flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </aside>

      {/* ── coluna principal ── */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="relative border-b border-border bg-card flex items-center px-4 gap-3 flex-shrink-0" style={{ height: CABECALHO, ...entrada(f, aparece, 2) }}>
          <span className="inline-flex items-center justify-center rounded-md w-8 h-8 shrink-0">
            <Menu className="w-4 h-4" />
          </span>
          <div className="relative min-w-0 shrink">
            <span className="relative flex h-8 min-w-0 items-center gap-2 rounded-full border border-border bg-background px-2.5 text-xs text-foreground">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-semibold">Outubro</span>
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="h-3 w-px shrink-0 bg-border" />
                <span className="shrink-0">Hoje:</span>
                <span className="max-w-[16rem] truncate font-medium text-foreground">Reunião do setor · 9h</span>
              </span>
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground relative">
              <Bell className="w-4 h-4" />
            </span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground">
              <HelpCircle className="w-4 h-4" />
            </span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8">
              <Sun className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 items-center gap-2.5 pl-2 border-l border-border text-left">
              <span className="relative shrink-0">
                <AvatarIniciais iniciais={OPERADORA.iniciais} className="w-8 h-8" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-background border border-border rounded-full flex items-center justify-center">
                  <Camera className="w-2 h-2 text-muted-foreground" />
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="max-w-[220px] truncate text-xs font-semibold leading-4 text-foreground">{OPERADORA.nome}</span>
                <span className="flex h-4 min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                  <span className={cn('inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded border px-1.5 text-[10px] font-medium leading-none', cargoClasse)}>
                    {OPERADORA.cargo}
                  </span>
                  <span className="max-w-[200px] truncate">· {OPERADORA.setor}</span>
                </span>
              </span>
            </span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground">
              <Smartphone className="w-4 h-4" />
            </span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </span>
          </div>
        </header>

        {/* botão de recolher o menu, na borda */}
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
