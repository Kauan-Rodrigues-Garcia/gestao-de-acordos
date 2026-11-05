/**
 * Laboratório do bloco de gelo — `npm run dev` e abrir /lab-gelo.html.
 *
 * O cabeçalho do Analítico de mentira (com o trilho do trem por cima, para
 * ver a folga), o bloco de verdade e uma régua de «quanto derreteu».
 * `?d=0.5` abre já meio derretido; `?tema=dark`.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart2 } from 'lucide-react';
import '@/index.css';
import BlocoDeGelo from './BlocoDeGelo';
import { DIAS_DE_GELO, quantoDerreteu } from './degelo';
import { relogioNatal } from '../musica';

const busca = new URLSearchParams(location.search);
if (busca.get('tema') === 'dark') document.documentElement.classList.add('dark');

function Laboratorio() {
  const hoje = quantoDerreteu(relogioNatal());
  const [derreteu, setDerreteu] = useState(busca.get('d') !== null ? Number(busca.get('d')) : hoje);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-3 border-b p-3 text-xs">
        <label className="flex items-center gap-2">
          Derreteu
          <input type="range" min={0} max={1} step={0.01} value={derreteu} onChange={e => setDerreteu(Number(e.target.value))} />
          <b>{Math.round(derreteu * 100)}%</b> · dia {Math.round(derreteu * DIAS_DE_GELO)} de {DIAS_DE_GELO}
        </label>
        <button className="rounded border px-2 py-1" onClick={() => setDerreteu(hoje)}>hoje ({Math.round(hoje * 100)}%)</button>
        <button className="rounded border px-2 py-1" onClick={() => setDerreteu(1)}>Natal (100%)</button>
      </div>
      {/* O trilho, como a faixa do alto do Analítico. */}
      <div className="relative mx-auto h-[150px] max-w-[1400px] px-6">
        <div className="absolute inset-x-6 bottom-6 h-2 rounded bg-[repeating-linear-gradient(90deg,#7a5a3a_0_6px,transparent_6px_12px)]" />
      </div>
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight tracking-tight">Analítico</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Recebimentos do relatório do ERP</p>
            </div>
            <BlocoDeGelo derreteuNoTeste={derreteu} />
          </div>
        </header>
        <div className="h-12 rounded-xl border bg-card" />
        <div className="h-24 rounded-xl border bg-card" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(<StrictMode><Laboratorio /></StrictMode>);
