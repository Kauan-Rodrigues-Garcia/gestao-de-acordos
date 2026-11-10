/**
 * Laboratório do chalé — `npm run dev` e abrir /lab-chale.html.
 *
 * O alto da aba Acordos de mentira (título, mês, botões e a fileira das abas,
 * como no Nosso produto; `?regra=cofen` imita a mesa da regra Cofen, que desde
 * 10/11/2026 tem a mesma ordem: mês no cabeçalho, abas e depois o «Visualizar
 * acordos de»), dentro de um `<main>`, com a camada do Natal de verdade.
 * `?tema=dark`.
 *
 * Sem StrictMode, como o app (ele roda os efeitos duas vezes e esconde
 * defeito de montagem). Os botões no pé chamam o Grinch na hora; `?grinch=`
 * `invadir` ou `espiar` faz o mesmo ao abrir, e `?duendes=1` chama os
 * duendes assim que a bagunça estiver feita.
 */
import { createRoot } from 'react-dom/client';
import { ChevronLeft, ChevronRight, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import '@/index.css';
import { CamadaNatal } from '../CenaNatal';
import { avisarAcordoSalvo, cenaDaRota } from '../tema';
import { EVENTO_DUENDES, EVENTO_GRINCH_ESPIAR, EVENTO_GRINCH_INVADIR } from './grinch/roteiro';

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
            <div data-natal-cabecalho className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Acordos</h1>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded border"><ChevronLeft className="h-3 w-3" /></span>
                  <span className="min-w-[100px] text-center font-semibold">novembro de 2026</span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded border"><ChevronRight className="h-3 w-3" /></span>
                  <span className="px-2">Mês atual</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">1951 acordo(s) no total</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!cofen && <Botao><MessageSquare className="h-3.5 w-3.5" /> Lembretes do dia (60)</Botao>}
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border"><RefreshCw className="h-3.5 w-3.5" /></span>
                <Botao primario><Plus className="h-4 w-4" /> Novo Acordo</Botao>
              </div>
            </div>
            <div data-natal-chao className="mb-4 flex items-center gap-1 border-b">
              {['Todos', cofen ? 'Pendentes' : 'Verificar', 'Pagos / Quitados', 'Não Pagos'].map((t, i) => (
                <span key={t} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${i === 0 ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{t}</span>
              ))}
            </div>
            <div className="mb-4 flex h-14 items-center gap-2 rounded-xl border bg-card px-4 text-xs">
              <span className="text-muted-foreground">Grinch:</span>
              <button type="button" className="rounded border px-2 py-1" onClick={() => window.dispatchEvent(new Event(EVENTO_GRINCH_INVADIR))}>invadir o chalé</button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => window.dispatchEvent(new Event(EVENTO_GRINCH_ESPIAR))}>só espiar</button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => window.dispatchEvent(new Event(EVENTO_DUENDES))}>chamar os duendes agora</button>
              <button type="button" className="rounded border px-2 py-1" onClick={avisarAcordoSalvo}>salvar acordo (também chama)</button>
            </div>
            <div className="h-14 rounded-xl border bg-card" />
            <div className="mt-4 h-[600px] rounded-xl border bg-card" />
          </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(<Lab />);

// `?grinch=espiar|roubar|feliz`: chama o Grinch logo que o chalé aparece (para fotografar).
const pedido = busca.get('grinch');
if (pedido) {
  window.setTimeout(() => {
    if (pedido === 'espiar') window.dispatchEvent(new Event(EVENTO_GRINCH_ESPIAR));
    if (pedido === 'invadir') window.dispatchEvent(new Event(EVENTO_GRINCH_INVADIR));
  }, 600);
}
// `?duendes=1`: chama os duendes logo que a bagunça termina (para fotografar o conserto).
if (busca.get('duendes')) {
  const tentar = window.setInterval(() => window.dispatchEvent(new Event(EVENTO_DUENDES)), 500);
  window.setTimeout(() => window.clearInterval(tentar), 20000);
}
