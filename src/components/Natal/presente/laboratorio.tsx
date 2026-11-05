/**
 * laboratorio.tsx — a abertura do Natal sem login (http://localhost:8080/lab-presente.html):
 * um Gestão de mentira com o botão de tema de verdade, a bolha do chat de
 * mentira (o presente fica em cima dela) e o botão da música de verdade,
 * para ver a espera, o aviso do tema (o lab começa no escuro), o vídeo, o
 * voo, o estouro, o bilhete e a nevasca. Quando o bilhete entra, o lab liga
 * as camadas de Natal de verdade. Os botões embaixo são os da prévia.
 */
/* eslint-disable react-refresh/only-export-components -- entrada de página avulsa (como o index.html), não um módulo de componentes. */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import '@/index.css';
import { NOMES_TEMAS } from '@/lib/temas';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CamadaNatal, FundoNatal } from '../CenaNatal';
import { BolaDaSaudacao } from '../BolaDaSaudacao';
import { BotaoMusicaNatal } from '../BotaoMusicaNatal';
import { ligarMusica } from '../musica';
import { pularAbertura } from '../previa';
import { cenaDaRota } from '../tema';
import { AberturaNatal } from './AberturaNatal';

function Lab() {
  const [natal, setNatal] = useState(false);
  const [aberta, setAberta] = useState(true);
  const [chave, setChave] = useState(0);
  const [oculto, setOculto] = useState(false);
  const cena = cenaDaRota('/', 'detalhado');
  // `?pulo=bilhete` ou `?pulo=fim-do-video`: para as fotos automáticas.
  useEffect(() => {
    const pulo = new URLSearchParams(location.search).get('pulo');
    if (pulo === 'bilhete' || pulo === 'fim-do-video') window.setTimeout(() => pularAbertura(pulo), 400);
  }, []);
  const reiniciar = () => { ligarMusica(false); setNatal(false); setAberta(true); setOculto(false); setChave(k => k + 1); };
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
          <span className="ml-auto flex items-center gap-1">
            {natal && <BotaoMusicaNatal />}
            <ThemeToggle />
          </span>
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
      {/* A bolha do chat, no lugar da de verdade (`BolhaChat.tsx`: 56 px, a 24 px do canto). */}
      <div className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">💬</div>
      {aberta && (
        <AberturaNatal
          key={chave}
          oculto={oculto}
          aoPreparar={() => new Promise(r => window.setTimeout(r, 300))}
          aoTemaEntrar={() => setNatal(true)}
          aoTerminar={() => setAberta(false)}
        />
      )}
      {/* Por cima da abertura (que fica no z-index mais alto do app), como a prévia. */}
      <div className="fixed bottom-4 left-4 flex gap-1 text-xs" style={{ zIndex: 2147483600 }}>
        {[
          ['Começar de novo', reiniciar],
          [oculto ? 'Mostrar o presente' : 'Esconder o presente', () => setOculto(v => !v)],
          ['Fim do vídeo', () => pularAbertura('fim-do-video')],
          ['Direto ao bilhete', () => pularAbertura('bilhete')],
        ].map(([rotulo, acao]) => (
          <button key={rotulo as string} type="button" onClick={acao as () => void} className="rounded-md border border-border bg-card px-3 py-1.5 shadow">
            {rotulo as string}
          </button>
        ))}
      </div>
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
