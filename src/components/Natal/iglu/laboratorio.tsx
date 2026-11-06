/**
 * Laboratório do iglu — `npm run dev` e abrir /lab-iglu.html.
 *
 * O iglu de verdade, sozinho, no alto de uma página de mentira (sem login e
 * sem banco). Clicar no urso/iglu conversa (com o limite de 10); clicar na
 * janelinha, com ele em casa, espia. `?tema=dark`, `?atividade=lendo` fixa o
 * que ele está fazendo lá dentro. Sem StrictMode, como o app.
 */
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { IgluDoUrso } from './IgluDoUrso';

const busca = new URLSearchParams(location.search);
if (busca.get('tema') === 'dark') document.documentElement.classList.add('dark');
try { if (busca.get('limpar')) localStorage.removeItem('natal-urso-cortina-ate'); } catch { /* sem armazenamento */ }

createRoot(document.getElementById('lab')!).render(
  <div className="min-h-screen bg-background p-6 text-foreground">
    <h1 className="text-xl font-bold">Analítico</h1>
    <p className="text-sm text-muted-foreground">O iglu fica no alto, à direita, como na faixa do trem.</p>
    <div className="relative mt-6 h-40 rounded-xl border bg-card">
      <div className="absolute bottom-4 right-6"><IgluDoUrso /></div>
    </div>
    <div className="mt-4 h-[500px] rounded-xl border bg-card" />
  </div>,
);
