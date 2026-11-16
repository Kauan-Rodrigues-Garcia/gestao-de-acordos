/**
 * Laboratório da tela de abertura — `npm run dev` e abrir /lab-preloader.html.
 *
 * A tela fica em laço, com os botões embaixo: tema claro/escuro, a cor de cada
 * marca, o tamanho, e «simular abertura» (a tela aparece, a página de mentira
 * chega e ela esmaece). No endereço: `?tema=dark`, `?marca=pagueplay`,
 * `?tamanho=128`, `?quadro=1400` (congela o ciclo nesse instante, em ms).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { Preloader } from './Preloader';

const busca = new URLSearchParams(location.search);
const quadro = busca.get('quadro');

function Lab() {
  const [escuro, setEscuro] = useState(busca.get('tema') === 'dark');
  const [marca, setMarca] = useState(busca.get('marca') === 'pagueplay' ? 'pagueplay' : 'bookplay');
  const [tamanho, setTamanho] = useState(Number(busca.get('tamanho')) || 120);
  const [fase, setFase] = useState<'laco' | 'saindo' | 'fora'>(busca.get('sem') === '1' ? 'fora' : 'laco');
  const [vez, setVez] = useState(0);

  useEffect(() => { document.documentElement.classList.toggle('dark', escuro); }, [escuro]);
  useEffect(() => {
    if (marca === 'pagueplay') document.documentElement.setAttribute('data-tenant', 'pagueplay');
    else document.documentElement.removeAttribute('data-tenant');
  }, [marca]);

  // `?quadro=`: para o ciclo num instante, para conferir o desenho parado.
  useEffect(() => {
    if (!quadro) return;
    const relogio = window.setTimeout(() => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = Number(quadro); }
    }, 60);
    return () => window.clearTimeout(relogio);
  }, [vez]);

  const simular = () => {
    setVez(v => v + 1);
    setFase('laco');
    window.setTimeout(() => setFase('saindo'), 3000);
    window.setTimeout(() => setFase('fora'), 3400);
  };

  const botao = 'rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground';
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* A página de mentira, por baixo. */}
      <div className="p-6 max-w-[1100px] mx-auto">
        <h1 className="text-2xl font-bold">Bom dia, Cleber!</h1>
        <p className="text-sm text-muted-foreground">a página que estava carregando</p>
        <div className="mt-6 grid grid-cols-4 gap-4">
          {['Recebido no mês', 'Meta do mês', 'Acordos hoje', 'Ticket médio'].map(t => (
            <div key={t} className="h-28 rounded-xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">{t}</p></div>
          ))}
        </div>
      </div>
      {fase !== 'fora' && <Preloader key={vez} tamanho={tamanho} saindo={fase === 'saindo'} />}
      <div className="fixed bottom-5 left-1/2 z-[10000] flex -translate-x-1/2 gap-2">
        <button className={botao} onClick={() => setEscuro(e => !e)}>{escuro ? 'tema claro' : 'tema escuro'}</button>
        <button className={botao} onClick={() => setMarca(m => (m === 'bookplay' ? 'pagueplay' : 'bookplay'))}>{marca === 'bookplay' ? 'cor PaguePlay' : 'cor BookPlay'}</button>
        <button className={botao} onClick={() => setTamanho(t => (t === 120 ? 160 : t === 160 ? 88 : 120))}>tamanho {tamanho}</button>
        <button className={botao} onClick={simular}>simular abertura</button>
        <button className={botao} onClick={() => { setVez(v => v + 1); setFase('laco'); }}>em laço</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>);
