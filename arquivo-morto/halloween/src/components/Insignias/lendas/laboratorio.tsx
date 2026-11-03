/**
 * laboratorio.tsx — as Lendas de Outubro (`Lendas.tsx`), SÓ no localhost.
 *
 * Abre em http://localhost:8080/lab-lendas.html (com o `npm run dev`). Sem
 * login e sem banco: a foto de cada lugar entra pelo campo da página (ou por
 * `window.definirFotos`, que o script de exportar chama). Para baixar, o
 * script tira a foto de cada peça (`#podio`, `#cartao-1`…`#cartao-3`).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { carregarFonte, carregarFontesPixel } from '@/components/Halloween/fonte';
import { CartaoDaLenda, LENDAS, PodioDasLendas } from './Lendas';

type Fotos = Partial<Record<1 | 2 | 3, string>>;

declare global {
  interface Window { definirFotos?: (f: Fotos) => void }
}

function Laboratorio() {
  const [fotos, setFotos] = useState<Fotos>({});
  useEffect(() => {
    window.definirFotos = setFotos;
    carregarFonte();
    carregarFontesPixel();
    void Promise.all([
      document.fonts.load('500 40px "Pixelify Sans"'),
      document.fonts.load('20px "Press Start 2P"'),
      document.fonts.load('40px "Creepster"'),
    ]).then(() => { document.body.dataset.pronto = '1'; });
  }, []);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 24, color: '#ccd' }}>
        {LENDAS.map(l => (
          <label key={l.posicao}>
            {l.posicao}º {l.nome}{' '}
            <input
              type="file"
              accept="image/*"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) setFotos(atual => ({ ...atual, [l.posicao]: URL.createObjectURL(f) }));
              }}
            />
          </label>
        ))}
      </div>
      <PodioDasLendas fotos={fotos} />
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {LENDAS.map(l => <CartaoDaLenda key={l.posicao} lenda={l} foto={fotos[l.posicao]} />)}
      </div>
    </div>
  );
}

document.body.style.cssText = 'margin:0;background:#11151c;font-family:system-ui';
createRoot(document.getElementById('root')!).render(<StrictMode><Laboratorio /></StrictMode>);
