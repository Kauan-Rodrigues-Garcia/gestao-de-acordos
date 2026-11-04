/**
 * laboratorio.tsx — a abertura do Natal sem login (http://localhost:8080/lab-presente.html):
 * um Gestão de mentira com o botão de tema de verdade, para ver o presente, o
 * aviso do tema (o lab começa no escuro), o vídeo, a nevasca e o cartão.
 * Quando a nevasca solta o tema, o lab liga as camadas de Natal de verdade.
 * «Pular para o fim do vídeo» leva aos últimos segundos; recarregar devolve o presente.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import '@/index.css';
import { NOMES_TEMAS } from '@/lib/temas';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CamadaNatal, FundoNatal } from '../CenaNatal';
import { BolaDaSaudacao } from '../BolaDaSaudacao';
import { cenaDaRota } from '../tema';
import { AberturaNatal } from './AberturaNatal';

function pularParaOFim() {
  const v = document.querySelector<HTMLVideoElement>('.np-video');
  if (v && v.duration) v.currentTime = Math.max(0, v.duration - 3);
}

function Lab() {
  const [natal, setNatal] = useState(false);
  const [aberta, setAberta] = useState(true);
  const cena = cenaDaRota('/', 'detalhado');
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-60 border-r border-border bg-sidebar p-4 space-y-2">
        {['Dashboard', 'Acordos', 'Analítico', 'Pix', 'Campanha', 'Configurações'].map(t => (
          <div key={t} className="rounded-md px-3 py-2 text-sm text-muted-foreground">{t}</div>
        ))}
      </aside>
      <div className="relative flex-1 flex flex-col">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3">
          <span className="font-semibold">Gestão de Acordos</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </header>
        <div className="relative flex-1 min-h-0">
          {natal && <FundoNatal cena={cena} />}
          <main className="relative z-[1] h-full overflow-y-auto">
            {natal && <CamadaNatal cena={cena} />}
            <div className="p-6">
              <h1 className="mb-6 flex items-center gap-1.5 text-2xl font-bold">
                <span>Bom dia, Cleber!</span>
                {natal && <BolaDaSaudacao />}
              </h1>
              <div className="grid grid-cols-3 gap-4 content-start">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 h-28">
                    <p className="text-sm text-muted-foreground">Indicador {i + 1}</p>
                    <p className="text-2xl font-bold mt-2">R$ {(12345 * (i + 1)).toLocaleString('pt-BR')}</p>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
      {aberta && <AberturaNatal aoTemaEntrar={() => setNatal(true)} aoTerminar={() => setAberta(false)} />}
      {/* Por cima da abertura (que fica no z-index mais alto do app). */}
      {aberta && (
        <button
          type="button"
          onClick={pularParaOFim}
          className="fixed bottom-4 left-4 rounded-md border border-border bg-card px-3 py-1.5 text-xs shadow"
          style={{ zIndex: 2147483600 }}
        >
          Pular para o fim do vídeo
        </button>
      )}
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" themes={NOMES_TEMAS} enableColorScheme={false} storageKey="lab-presente-tema">
      <Lab />
    </ThemeProvider>
  </StrictMode>,
);
