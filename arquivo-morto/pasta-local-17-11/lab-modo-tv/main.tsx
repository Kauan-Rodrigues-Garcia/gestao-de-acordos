// Ensaio TEMPORÁRIO do Modo TV (arquivado em 13/10/2026) com dados fictícios,
// sem banco — só para gravar o vídeo demonstrativo. Apagar depois.
//
// Duas vistas montadas ao mesmo tempo, lendo o mesmo estado: a mesa
// (`/modo-tv`) e a parede (`/tv/play-4`). O roteiro de gravação alterna qual
// delas aparece com `window.__labVer('mesa' | 'parede')`.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import ModoTV from './Mesa';
import { Palco } from './Palco';
import { AlertaAoVivo } from './AlertaAoVivo';
import { DURACAO_TRANSICAO_MS, type Fonte, type Transicao } from './geometria';
import { LabProvider, useModoTV } from './useModoTV';

function Parede() {
  const tv = useModoTV();
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const medir = () => setEscala(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  // A mesma transição do TvPalco: a cena que sai fica por cima, sumindo.
  const fontes = tv.fontesPorTela['t1'] ?? [];
  const cenaId = tv.telaId === 't1' ? tv.cenaNoArId : null;
  const anterior = useRef<{ id: string | null; fontes: Fonte[] }>({ id: cenaId, fontes });
  const [saindo, setSaindo] = useState<{ fontes: Fonte[]; transicao: Transicao } | null>(null);
  useEffect(() => {
    const a = anterior.current;
    const transicao = tv.cenaNoAr?.transicao ?? 'corte';
    if (a.id && cenaId && a.id !== cenaId && transicao !== 'corte' && a.fontes.length) {
      setSaindo({ fontes: a.fontes, transicao });
    }
    anterior.current = { id: cenaId, fontes };
  });
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => setSaindo(null), DURACAO_TRANSICAO_MS);
    return () => clearTimeout(t);
  }, [saindo]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0f13', overflow: 'hidden', cursor: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${escala})`, transformOrigin: '0 0' }}>
        <Palco fontes={fontes} aviso={fontes.length === 0 ? 'Nenhuma cena no ar' : null} />
        {saindo && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: `tv-sai-${saindo.transicao} ${DURACAO_TRANSICAO_MS}ms ease forwards` }}>
            <Palco fontes={saindo.fontes} />
          </div>
        )}
        <style>{`
          @keyframes tv-sai-fade    { to { opacity: 0; } }
          @keyframes tv-sai-deslize { to { transform: translateX(-100%); } }
        `}</style>
        <AlertaAoVivo alertas={tv.alertas} audioLiberado={false} />
      </div>
    </div>
  );
}

function Lab() {
  const [vista, setVista] = useState<'mesa' | 'parede'>('mesa');
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__labVer = setVista;
  }, []);
  return (
    <LabProvider>
      <div style={{ display: vista === 'mesa' ? 'block' : 'none', position: 'relative', zIndex: 1 }} className="min-h-screen bg-background">
        <ModoTV />
      </div>
      <div style={{ position: 'fixed', inset: 0, zIndex: vista === 'parede' ? 10 : 0 }}>
        <Parede />
      </div>
    </LabProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
