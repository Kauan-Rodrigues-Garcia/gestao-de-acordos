/**
 * Laboratório do tema do GTA VI — `npm run dev` e abrir /lab-vi.html.
 *
 * Um Dashboard de mentira com as camadas de verdade, sem login e sem banco.
 *   `?convite=1`    começa SEM o tema e com o convite fechado no canto: clicar
 *                   abre a mensagem e toca a música; os botões entram 5 s depois
 *   `?dia=18|19`    o texto do convite daquele dia (sem isso, vale a data de hoje)
 *   `?contagem=N`   a contagem embaixo da data acaba daqui a N segundos (0 = já acabou)
 *   `?tema=dark`    tema escuro
 *   `?mensagem=1`   o selo do chat pulsando
 *   `?missao=1`     a faixa de «Missão cumprida» na tela
 *   `?carregando=1` a tela de carregamento no lugar da página
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { MessageCircle } from 'lucide-react';
import '@/index.css';
import { EVENTO_MISSAO } from './tema';
import { FaixaVi, FundoVi, SobreposicaoVi } from './CenaVi';
import { CarregandoVi, MarcaVi, SeloVi } from './MarcaVi';
import { ConviteVi } from './ConviteVi';
import { BotaoMusicaVi } from './BotaoMusicaVi';
import { DinheiroVi } from './DinheiroVi';

const busca = new URLSearchParams(location.search);
const temaInicial = busca.get('tema') === 'dark' ? 'dark' : 'light';
const comConvite = busca.get('convite') === '1';
const diaDoConvite = busca.get('dia') ? `2026-11-${busca.get('dia')}` : undefined;
const fimDaContagem = busca.has('contagem') ? Date.now() + Number(busca.get('contagem')) * 1000 : undefined;

const ABAS = ['Dashboard', 'Acordos', 'Analítico', 'Metas'];
const CARTOES = [
  ['Recebido no mês', 'R$ 412.380,55'], ['Meta do mês', '78%'], ['Acordos hoje', '146'], ['Ticket médio', 'R$ 286,10'],
];

function Lab() {
  const [aba, setAba] = useState(ABAS[0]);
  // Com `?convite=1` o tema começa desligado, como antes de a pessoa responder.
  const [vi, setVi] = useState(!comConvite);
  const [convite, setConvite] = useState(comConvite);
  const [mensagem, setMensagem] = useState(busca.get('mensagem') === '1');
  const [carregando, setCarregando] = useState(busca.get('carregando') === '1');
  useEffect(() => {
    if (busca.get('missao') === '1') window.dispatchEvent(new Event(EVENTO_MISSAO));
  }, []);
  // O `Layout` põe isto no <html> com o tema ligado: é o que troca a fonte dos títulos.
  useEffect(() => {
    if (!vi) return;
    document.documentElement.setAttribute('data-vi', '');
    return () => document.documentElement.removeAttribute('data-vi');
  }, [vi]);
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* A largura e o respiro do menu de verdade (228 px aberto, logo de 32 px). */}
      <aside className="w-[228px] shrink-0 border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
          <img src="/logo-bookplay.png" alt="" className="w-8 h-8 object-contain flex-shrink-0" />
          <div className="overflow-hidden">
            {vi ? <MarcaVi nome="Gestão de Acordos" /> : <p className="font-bold text-sm text-sidebar-foreground leading-none">Gestão de Acordos</p>}
          </div>
        </div>
        <nav className="px-2 py-3 space-y-0.5 text-sm font-medium">
          {ABAS.map(a => (
            <button key={a} onClick={() => setAba(a)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${a === aba ? `bg-sidebar-primary text-sidebar-primary-foreground ${vi ? 'vi-aceso' : ''}` : 'text-sidebar-foreground/70 hover:bg-sidebar-accent'}`}>{a}</button>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className={`relative h-14 border-b border-border bg-card flex items-center px-4 gap-3 flex-shrink-0 ${vi ? 'vi-topo' : ''}`}>
          <span className="flex-1 text-sm text-muted-foreground">barra do topo</span>
          {vi && <BotaoMusicaVi />}
          <button onClick={() => { setVi(v => !v); setConvite(false); }} className="rounded-md border border-border bg-card px-3 py-1.5 text-xs">{vi ? 'desligar o tema' : 'ligar o tema'}</button>
        </header>
        <div className="relative flex-1 min-h-0 flex flex-col bg-background">
          {vi && <FundoVi />}
          <main className="z-[1] flex-1 overflow-y-auto bg-transparent">
            {vi && <FaixaVi lancamento={fimDaContagem} />}
            {carregando ? <CarregandoVi /> : (
              <div className="p-6 max-w-[1400px] mx-auto">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h1 className="flex items-center gap-1.5 text-2xl font-bold text-foreground"><span>Bom dia, Cleber!</span>{vi && <DinheiroVi />}{vi && busca.get('grana') === '1' && <DinheiroVi tamanho={260} />}</h1>
                    <p className="text-sm text-muted-foreground">quinta-feira, 19 de novembro</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setMensagem(m => !m)} className="rounded-md border border-border bg-card px-3 py-1.5">mensagem</button>
                    <button onClick={() => window.dispatchEvent(new Event(EVENTO_MISSAO))} className="rounded-md border border-border bg-card px-3 py-1.5">missão cumprida</button>
                    <button onClick={() => setCarregando(true)} className="rounded-md border border-border bg-card px-3 py-1.5">carregando</button>
                    <button onClick={() => { setVi(false); setConvite(true); }} className="rounded-md border border-border bg-card px-3 py-1.5">convite de novo</button>
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
                  {['Meta do mês', 'Recebimento por dia', 'Ranking'].map(t => (
                    <div key={t} className="h-72 rounded-xl border border-border bg-card p-5 shadow-sm">
                      <p className="text-sm font-semibold">{t}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 h-96 rounded-xl border border-border bg-card shadow-sm" />
              </div>
            )}
          </main>
          {vi && <SobreposicaoVi />}
        </div>
      </div>
      <button className={`group fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl ${vi ? '' : 'bg-primary text-primary-foreground shadow-lg'}`} aria-label="chat">
        {vi ? <SeloVi chamando={mensagem} /> : <MessageCircle className="h-6 w-6" />}
        {mensagem && <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground ring-2 ring-background">3</span>}
      </button>
      {convite && <ConviteVi hoje={diaDoConvite} aoAtivar={() => { setVi(true); setConvite(false); }} aoRecusar={() => setConvite(false)} />}
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" forcedTheme={temaInicial} enableSystem={false}>
      <Lab />
    </ThemeProvider>
  </StrictMode>,
);
