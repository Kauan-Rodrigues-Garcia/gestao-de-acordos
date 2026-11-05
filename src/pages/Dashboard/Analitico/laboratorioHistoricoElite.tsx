/**
 * laboratorioHistoricoElite.tsx — a sub-aba «Histórico» do Plantão Elite com
 * dados FICTÍCIOS, só no localhost (http://localhost:8080/lab-historico-elite.html),
 * sem login nem banco. `?escuro=1` tema escuro, `?largura=390` celular,
 * `?membro=1` o que vê quem é de uma dupla.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { montarHistoricoElite, type DiaHistoricoBruto, type RespostaHistoricoElite } from '@/services/plantaoElite/historicoElite';
import { somarDias } from '@/services/plantaoElite/plantaoElite';
import { PainelHistoricoElite } from './HistoricoPlantaoElite';

const url = new URLSearchParams(window.location.search);
if (url.get('escuro') === '1') document.documentElement.classList.add('dark');
const membro = url.get('membro') === '1';

const T = 't', A = 'a', M = 'm', G = 'g';
const HOJE = '2026-11-05';

/** Pseudo-aleatório fixo: o mesmo desenho a cada recarga. */
let semente = 7;
const sorte = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };

const dias: DiaHistoricoBruto[] = [];
for (let d = '2026-09-19'; d <= HOJE; d = somarDias(d, 1)) {
  const impar = Number(d.slice(8, 10)) % 2 === 1;
  const dupla = (d < '2026-11-04') === impar ? [T, A] : [M, G];
  const semana = new Date(`${d}T12:00:00Z`).getUTCDay();
  const peso = semana === 0 ? 0 : semana === 6 ? 0.45 : 1;
  const base = dupla[0] === T ? 4200 : 3600;
  const membros = dupla.map(id => {
    const valor = Math.round(base * peso * (0.55 + sorte() * 0.9) * 100) / 100;
    return { id, valor: d === HOJE ? Math.round(valor * 0.45) : valor, qtd: Math.round(valor / 380) };
  });
  const setor = peso === 0 ? 0 : Math.round(85000 * peso * (0.8 + sorte() * 0.4));
  if (membro && !dupla.includes(T)) continue;
  dias.push({ data: d, plantao: impar ? 'impar' : 'par', membros, setor_total: setor, setor_qtd: Math.round(setor / 210) });
}

const resposta: RespostaHistoricoElite = {
  inicio: '2026-09-19', de: '2026-09-19', ate: HOJE, hoje: HOJE, sou_da_dupla: membro,
  setor: { id: 'rec', nome: 'Receptivo' },
  pessoas: [
    { id: T, nome: 'Tiago Almada', usuario: null },
    { id: A, nome: 'Agatha Rocha', usuario: null },
    { id: M, nome: 'Matheus Souza', usuario: null },
    { id: G, nome: 'Gabriel Oliveira', usuario: null },
  ].filter(p => !membro || p.id === T || p.id === A),
  dias,
};

const largura = Number(url.get('largura')) || null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      <div style={largura ? { width: largura } : { maxWidth: 1200 }} className="mx-auto">
        <PainelHistoricoElite
          historico={montarHistoricoElite(resposta)} resposta={resposta}
          carregando={false} erro={null} onAtualizar={() => undefined}
        />
      </div>
    </div>
  </StrictMode>,
);
