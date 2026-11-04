/**
 * Laboratório do Natal — `npm run dev` e abrir /lab-natal.html.
 *
 * Um Dashboard de mentira com as camadas de verdade, sem login e sem banco:
 * para olhar o tema claro e o escuro, o estilo simples e o detalhado, e o
 * globo de neve com e sem mensagem. `?estilo=simples|detalhado&tema=dark`.
 */
/* eslint-disable react-refresh/only-export-components -- entrada de página avulsa (como o index.html), não um módulo de componentes. */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import '@/index.css';
import { cenaDaRota, EVENTO_FESTA, EVENTO_TRENO, TemaNatalContext, type EstiloNatal } from './tema';
import { CamadaNatal, FundoNatal, RevoadaNatal, SobreposicaoNatal } from './CenaNatal';
import { ComGorro, GloboDeNeve } from './Desenhos';
import { MarcaNatal } from './MarcaNatal';
import { TopoNevado } from './BonecoDeNeve';
import { BotaoMusicaNatal } from './BotaoMusicaNatal';
import { BolaDaSaudacao } from './BolaDaSaudacao';
import { CardMetaDonut } from '@/components/PainelMetas/CardMetaDonut';

const busca = new URLSearchParams(location.search);
const temaInicial = busca.get('tema') === 'dark' ? 'dark' : 'light';
const estiloInicial: EstiloNatal = busca.get('estilo') === 'simples' ? 'simples' : 'detalhado';
const metaInicial = Number(busca.get('meta') ?? 64);
const FORMAS = { pix: { valor: 41000, qtd: 160 }, boleto: { valor: 18000, qtd: 52 } };

const CARTOES = [
  ['Recebido no mês', 'R$ 412.380,55'], ['Meta do mês', '78%'], ['Acordos hoje', '146'], ['Ticket médio', 'R$ 286,10'],
];
const PESSOAS = ['Ana Paula', 'Bruno Lima', 'Carla Souza', 'Diego Alves'];

function Lab() {
  const [estilo, setEstilo] = useState<EstiloNatal>(estiloInicial);
  const [mensagem, setMensagem] = useState(false);
  const [pctMeta, setPctMeta] = useState(metaInicial);
  const cena = cenaDaRota('/', estilo);
  return (
    <TemaNatalContext.Provider value={estilo}>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-border bg-sidebar p-4">
          <MarcaNatal nome="Gestão de Acordos" />
          <nav className="mt-8 space-y-2 text-sm text-sidebar-foreground/80">
            {['Dashboard', 'Acordos', 'Analítico', 'Metas'].map(i => <p key={i} className="rounded-md px-2 py-1.5 hover:bg-sidebar-accent">{i}</p>)}
          </nav>
        </aside>
        <div className="relative flex-1 min-h-0 flex flex-col bg-background">
          <FundoNatal cena={cena} />
          <main className="relative z-[1] flex-1 overflow-y-auto bg-transparent">
            <CamadaNatal cena={cena} />
            <div className="p-6 max-w-[1400px] mx-auto">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h1 className="flex items-center gap-1.5 text-2xl font-bold"><span>Bom dia, Cleber!</span><BolaDaSaudacao /></h1>
                  <p className="text-sm text-muted-foreground">segunda-feira, 3 de novembro</p>
                </div>
                <div className="flex gap-2 text-xs">
                  {(['simples', 'detalhado'] as const).map(e => (
                    <button key={e} onClick={() => setEstilo(e)} className={`rounded-md border border-border px-3 py-1.5 ${estilo === e ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{e}</button>
                  ))}
                  <button onClick={() => setMensagem(m => !m)} className="rounded-md border border-border bg-card px-3 py-1.5">mensagem</button>
                  <button onClick={() => window.dispatchEvent(new Event(EVENTO_FESTA))} className="rounded-md border border-border bg-card px-3 py-1.5">festa</button>
                  <button onClick={() => window.dispatchEvent(new Event(EVENTO_TRENO))} className="rounded-md border border-border bg-card px-3 py-1.5">trenó</button>
                  <BotaoMusicaNatal />
                </div>
              </div>
              {/* O card do recorte (`FiltroEscopo`), com a neve e o boneco. */}
              <div className="relative mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <TopoNevado />
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
                  {['Minha visão', 'Minha equipe', 'Meu setor'].map((r, i) => (
                    <span key={r} className={`rounded-md px-3 py-1.5 font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{r}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {CARTOES.map(([t, v]) => (
                  <div key={t} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs text-muted-foreground">{t}</p>
                    <p className="mt-2 text-2xl font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4">
                {/* O card de verdade, com a árvore; a régua muda o quanto da meta foi batido. */}
                <div className="space-y-2">
                  <CardMetaDonut recebido={pctMeta * 1000} meta={100000} escopoRotulo="individual" porForma={FORMAS} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    meta
                    <input type="range" min={0} max={110} value={pctMeta} onChange={e => setPctMeta(Number(e.target.value))} className="flex-1" />
                    <span className="w-9 tabular-nums">{pctMeta}%</span>
                  </label>
                </div>
                <div className="h-72 rounded-xl border border-border bg-card p-5 shadow-sm">
                  <p className="text-sm font-semibold">Recebimento por dia</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <p className="mb-4 text-sm font-semibold">Ranking</p>
                  {PESSOAS.map(n => (
                    <div key={n} className="mb-4 flex items-center gap-3">
                      <ComGorro chave={n} tamanho={36}>
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">{n.split(' ').map(p => p[0]).join('')}</div>
                      </ComGorro>
                      <span className="text-sm">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 h-96 rounded-xl border border-border bg-card shadow-sm" />
            </div>
          </main>
          <SobreposicaoNatal cena={cena} />
          <RevoadaNatal cena={cena} />
        </div>
        <button className="group fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl" aria-label="chat">
          <GloboDeNeve nevando={mensagem} />
          {mensagem && <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground ring-2 ring-background">3</span>}
        </button>
      </div>
    </TemaNatalContext.Provider>
  );
}

createRoot(document.getElementById('lab')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" forcedTheme={temaInicial} enableSystem={false}>
      <Lab />
    </ThemeProvider>
  </StrictMode>,
);
