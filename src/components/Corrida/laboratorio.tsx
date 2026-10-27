/**
 * laboratorio.tsx — a Corrida da Sorte sem banco, no `npm run dev`
 * (`/lab-corrida.html`). Por trás, uma tela de sistema de mentira, para ver a
 * janelinha da corrida como ela aparece para o pessoal; no canto, o cenário do
 * lobby, a visão (quem corre ou quem só assiste) e o palpite de mentira.
 */
/* eslint-disable react-refresh/only-export-components -- entrada de página avulsa (como o index.html), não um módulo de componentes. */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import TesteCorrida from './TesteCorrida';
import CardDivulgacao from './CardDivulgacao';
import EscolhaBichinho from './EscolhaBichinho';
import { destravarAudio } from './nome';
import { TEMAS, type TemaLobby } from './lobbies/cena';
import type { CorridaJson } from './banco';

const CORRIDA: CorridaJson = {
  id: 7, nome: 'Corrida da Sorte', premio: 'R$ 30', estado: 'preparando', versao: 1, criada_em: new Date().toISOString(),
  aberta_em: null, gravada_em: null, inicia_em: null, encerrada_em: null, gravacao: null, vencedor: null, vencedor_nome: null,
  corredores: 24, chamados: 60, escolheram: 3, no_lobby: 0,
};

/** O sistema de mentira, atrás da janelinha. */
function SistemaDeMentira() {
  return (
    <div className="pointer-events-none fixed inset-0 flex select-none bg-[#f4f6fb] text-[#1d2433]" aria-hidden="true">
      <aside className="w-56 shrink-0 space-y-2 bg-[#1d2433] p-4 max-md:hidden">
        <div className="mb-6 h-6 w-32 rounded bg-white/20" />
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="h-4 rounded bg-white/10" style={{ width: `${60 + (i * 17) % 35}%` }} />)}
      </aside>
      <main className="flex-1 space-y-4 p-6">
        <div className="h-7 w-64 rounded bg-[#d9deea]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-white shadow-sm" />)}</div>
        <div className="h-72 rounded-xl bg-white shadow-sm" />
        <div className="grid grid-cols-2 gap-4">{Array.from({ length: 2 }, (_, i) => <div key={i} className="h-40 rounded-xl bg-white shadow-sm" />)}</div>
      </main>
    </div>
  );
}

function Lab() {
  const [aberto, setAberto] = useState<'teste' | 'escolha' | 'card' | null>(null);
  const [tema, setTema] = useState<TemaLobby>('f1');
  const [visao, setVisao] = useState<'corredor' | 'torcida'>('corredor');
  const [palpite, setPalpite] = useState(true);
  const [especial, setEspecial] = useState(false);
  const chip = (ativo: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${ativo ? 'bg-[#ffd84d] text-[#1b1405]' : 'bg-white/10 hover:bg-white/20'}`;
  return (
    <>
      <SistemaDeMentira />
      <div className="fixed left-4 top-20 z-[95] w-[280px] space-y-3 rounded-2xl bg-[#0b1022]/95 p-4 text-[#e8eefc] shadow-2xl ring-1 ring-white/10">
        <h1 className="text-sm font-bold uppercase tracking-wider text-[#ffd84d]">Laboratório da corrida</h1>
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[#9fb0d8]">Cenário do lobby</p>
          <div className="flex flex-wrap gap-1.5">{TEMAS.map(t => <button key={t.id} type="button" className={chip(tema === t.id)} onClick={() => setTema(t.id)}>{t.nome}</button>)}</div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-[#9fb0d8]">Visão</p>
          <div className="flex gap-1.5">
            <button type="button" className={chip(visao === 'corredor')} onClick={() => { setVisao('corredor'); setAberto(null); }}>Quem corre</button>
            <button type="button" className={chip(visao === 'torcida')} onClick={() => { setVisao('torcida'); setAberto(null); }}>Quem assiste</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={palpite} onChange={ev => setPalpite(ev.target.checked)} /> Palpite no vencedor</label>
        <label className="flex items-center gap-2 text-xs"><input id="lab-especial" type="checkbox" checked={especial} onChange={ev => { setEspecial(ev.target.checked); setAberto(null); }} /> Corrida especial (Fliperama Turbo)</label>
        <button id="lab-teste" type="button" className="w-full rounded-full bg-[#ffd84d] py-2 text-sm font-bold text-[#1b1405] hover:brightness-110" onClick={() => { destravarAudio(); setAberto('teste'); }}>
          {aberto === 'teste' ? 'Abrir de novo' : 'Assistir à corrida'}
        </button>
        <div className="flex gap-1.5">
          <button id="lab-escolha" type="button" className={chip(false)} onClick={() => setAberto('escolha')}>Escolha do bichinho</button>
          <button id="lab-card" type="button" className={chip(false)} onClick={() => setAberto('card')}>Card</button>
        </div>
      </div>
      {aberto === 'teste' && <TesteCorrida key={visao} premio="R$ 30" onFechar={() => setAberto(null)} tema={tema} visao={visao} palpiteDemo={palpite} especial={especial} />}
      {aberto === 'escolha' && <EscolhaBichinho corrida={CORRIDA} usuario="lab-usuario" escolhaAtual={null} onDepois={() => setAberto(null)} />}
      {aberto === 'card' && <CardDivulgacao teste divulgacao={{ id: 0, titulo: 'Vem aí a Corrida da Sorte!', mensagem: 'Fica de olho: logo mais tem corrida de bichinhos valendo prêmio, e o seu nome pode estar no grid de largada. Boa sorte!', premio: 'R$ 30', criada_em: new Date().toISOString() }} onFechou={() => setAberto(null)} />}
    </>
  );
}

createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>);
