/**
 * laboratorio.tsx — a Corrida da Sorte sem banco, no `npm run dev`
 * (`/lab-corrida.html`): o teste do super admin (lobby, gravação, largada,
 * corrida e festa), a escolha do bichinho, o convite e o card de divulgação.
 */
/* eslint-disable react-refresh/only-export-components -- entrada de página avulsa (como o index.html), não um módulo de componentes. */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import TesteCorrida from './TesteCorrida';
import CardDivulgacao from './CardDivulgacao';
import EscolhaBichinho from './EscolhaBichinho';
import { destravarAudio } from './nome';
import type { CorridaJson } from './banco';

const CORRIDA: CorridaJson = {
  id: 7, nome: 'Corrida da Sorte', premio: 'R$ 30', estado: 'preparando', versao: 1, criada_em: new Date().toISOString(),
  aberta_em: null, gravada_em: null, inicia_em: null, encerrada_em: null, gravacao: null, vencedor: null, vencedor_nome: null,
  corredores: 24, chamados: 60, escolheram: 3, no_lobby: 0,
};

function Lab() {
  const [aberto, setAberto] = useState<'teste' | 'escolha' | 'card' | null>(null);
  return (
    <div style={{ padding: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button id="lab-teste" type="button" onClick={() => { destravarAudio(); setAberto('teste'); }}>Testar a corrida</button>
      <button id="lab-escolha" type="button" onClick={() => setAberto('escolha')}>Escolha do bichinho</button>
      <button id="lab-card" type="button" onClick={() => setAberto('card')}>Card de divulgação</button>
      {aberto === 'teste' && <TesteCorrida premio="R$ 30" onFechar={() => setAberto(null)} />}
      {aberto === 'escolha' && <EscolhaBichinho corrida={CORRIDA} usuario="lab-usuario" escolhaAtual={null} onDepois={() => setAberto(null)} />}
      {aberto === 'card' && <CardDivulgacao teste divulgacao={{ id: 0, titulo: 'Vem aí a Corrida da Sorte!', mensagem: 'Fica de olho: logo mais tem corrida de bichinhos valendo prêmio, e o seu nome pode estar no grid de largada. Boa sorte!', premio: 'R$ 30', criada_em: new Date().toISOString() }} onFechou={() => setAberto(null)} />}
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>);
