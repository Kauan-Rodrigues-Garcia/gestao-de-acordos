/**
 * Laboratório do enfeite dos títulos (`enfeiteDasPaginas.css`) e do gelo do
 * topo — `npm run dev` e abrir /lab-enfeites.html (`?tema=dark`).
 *
 * Os títulos são cópias dos de telas de verdade, um de cada formato: só texto,
 * ícone dentro do título, quadradinho do lado, selo depois do texto.
 */
/* eslint-disable react-refresh/only-export-components -- página de laboratório, não módulo */
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { Radio, TrendingUp, Trash2, Users, Target } from 'lucide-react';
import '@/index.css';
import './enfeiteDasPaginas.css';
import { SincelosDaMarca, SincelosDoTopo } from './Sincelos';

const escuro = new URLSearchParams(location.search).get('tema') === 'dark';

function Bloco({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card/40 p-6">{children}</div>;
}

createRoot(document.getElementById('lab')!).render(
  <ThemeProvider attribute="class" defaultTheme={escuro ? 'dark' : 'light'} enableSystem={false}>
    <div className="flex h-screen bg-background">
      <aside className="w-[240px] shrink-0 border-r border-border bg-sidebar">
        <div className="relative z-[3] flex items-center gap-3 border-b border-sidebar-border px-4 py-5">
          <span className="h-8 w-8 rounded-lg bg-primary/20" />
          <span className="text-sm font-bold text-sidebar-foreground">Gestão de Acordos</span>
          <SincelosDaMarca />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-[12] flex h-14 items-center border-b border-border bg-card px-4 text-xs text-muted-foreground">
          barra do topo
          <SincelosDoTopo />
        </header>
        <main data-natal-enfeite="" className="flex-1 space-y-5 overflow-y-auto p-6">
          <Bloco>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">ícone dentro do título (Usuários, Configurações, Metas)</p>
          </Bloco>
          <Bloco>
            <h1 className="text-2xl font-bold text-foreground">Fechamento</h1>
            <p className="text-sm text-muted-foreground mt-1">só texto, grande (Fechamento, Controle de Números)</p>
          </Bloco>
          <Bloco>
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-border bg-card p-2"><Trash2 className="h-5 w-5 text-muted-foreground" /></div>
              <div>
                <h1 className="text-lg font-semibold leading-tight">Lixeira de Acordos</h1>
                <p className="text-[12px] text-muted-foreground">quadradinho do lado, título pequeno (Lixeira, Vendas)</p>
              </div>
            </div>
          </Bloco>
          <Bloco>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                  Painel do Líder
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success"><Radio className="w-3 h-3" /> ao vivo</span>
                </h1>
                <p className="text-sm text-muted-foreground">selo depois do texto</p>
              </div>
            </div>
          </Bloco>
          <Bloco>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2.5 tracking-tight">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20"><TrendingUp className="w-5 h-5 text-primary" /></div>
              Painel da Diretoria
            </h1>
          </Bloco>
          <Bloco>
            <h1 className="text-xl font-bold flex items-center gap-2"><Target className="w-5 h-5 text-primary" /> Metas</h1>
          </Bloco>
        </main>
      </div>
    </div>
  </ThemeProvider>,
);
