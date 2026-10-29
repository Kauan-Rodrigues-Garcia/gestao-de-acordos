/**
 * laboratorio.tsx — o Portal de Outubro por cima de um Gestão de mentira, SÓ
 * no localhost (http://localhost:8080/lab-portal.html). Sem login e sem
 * banco: serve para ver o bueiro, os balões e o mural com o painel do
 * relógio. No app de verdade o portal monta no `Layout`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { PortalDeOutubro } from './PortalDeOutubro';
import { ABERTURA } from './fases';

function GestaoDeMentira() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-60 border-r border-border bg-sidebar p-4 space-y-3">
        {['Dashboard', 'Acordos', 'Analítico', 'Pix', 'Campanha', 'Configurações'].map(t => (
          <div key={t} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">{t}</div>
        ))}
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3">
          <span className="font-semibold">Gestão de Acordos</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6 grid grid-cols-3 gap-4 content-start">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 h-32">
              <p className="text-sm text-muted-foreground">Indicador {i + 1}</p>
              <p className="text-2xl font-bold mt-2">R$ {(12345 * (i + 1)).toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </main>
      </div>
      <PortalDeOutubro temaLigado liberado abertura={ABERTURA} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><GestaoDeMentira /></StrictMode>);
