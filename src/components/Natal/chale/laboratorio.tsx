/**
 * Laboratório do chalé — `npm run dev` e abrir /lab-chale.html.
 *
 * O alto da aba Acordos de mentira (título, mês, botões e a fileira das abas,
 * como no Nosso produto; `?regra=cofen` imita o cabeçalho da regra Cofen, sem
 * abas antes do seletor), dentro de um `<main>`, com a camada do Natal de
 * verdade. `?tema=dark`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronLeft, ChevronRight, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import '@/index.css';
import { CamadaNatal } from '../CenaNatal';
import { cenaDaRota } from '../tema';

const busca = new URLSearchParams(location.search);
if (busca.get('tema') === 'dark') document.documentElement.classList.add('dark');
const cofen = busca.get('regra') === 'cofen';

function Botao({ children, primario }: { children: React.ReactNode; primario?: boolean }) {
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm ${primario ? 'bg-primary text-primary-foreground' : 'border border-success/40 text-success'}`}>{children}</span>
  );
}

function Lab() {
  const cena = cenaDaRota('/acordos', 'detalhado');
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="h-14 shrink-0 border-b bg-card" />
      <main className="relative flex-1 overflow-y-auto bg-background">
        <CamadaNatal cena={cena} />
        <div className="p-6">
          <div className="mx-auto max-w-[1400px]">
            <div data-natal-cabecalho {...(cofen ? { 'data-natal-chao': '' } : {})} className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Acordos</h1>
                {!cofen && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded border"><ChevronLeft className="h-3 w-3" /></span>
                    <span className="min-w-[100px] text-center font-semibold">novembro de 2026</span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded border"><ChevronRight className="h-3 w-3" /></span>
                    <span className="px-2">Mês atual</span>
                  </div>
                )}
                <p className="mt-0.5 text-sm text-muted-foreground">1951 acordo(s) no total</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!cofen && <Botao><MessageSquare className="h-3.5 w-3.5" /> Lembretes do dia (60)</Botao>}
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border"><RefreshCw className="h-3.5 w-3.5" /></span>
                <Botao primario><Plus className="h-4 w-4" /> Novo Acordo</Botao>
              </div>
            </div>
            {!cofen && (
              <div data-natal-chao className="mb-4 flex items-center gap-1 border-b">
                {['Todos', 'Verificar', 'Pagos / Quitados', 'Não Pagos'].map((t, i) => (
                  <span key={t} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${i === 0 ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{t}</span>
                ))}
              </div>
            )}
            <div className="mb-4 h-14 rounded-xl border bg-card" />
            <div className="h-14 rounded-xl border bg-card" />
            <div className="mt-4 h-[600px] rounded-xl border bg-card" />
          </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>);
