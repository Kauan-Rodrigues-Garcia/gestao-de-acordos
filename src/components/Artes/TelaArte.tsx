/**
 * TelaArte — a arte aberta por cima da tela (17/11/2026).
 *
 * A arte no meio, do maior tamanho que cabe; confete nos modelos de festa;
 * «Copiar imagem» (cola direto no WhatsApp; onde não dá, baixa o PNG) e
 * «Fechar». Esc e clique fora também fecham.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Copy, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copiarImagemDoElemento } from '@/lib/copiarImagem';
import { ArteCard, ArteEscalada, LARGURA_DA_ARTE, type PropsDaArte } from './ArteCard';
import { TEMAS, modeloPorId } from './modelos';

const CORES_DO_CONFETE = ['#FFD21F', '#E3172B', '#0F766E', '#5EEAD4', '#FFFFFF', '#F2541B'];

function Confete() {
  // 46 papeizinhos que caem uma vez. Sorteados uma vez por abertura.
  const pecas = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    i, x: Math.random() * 100, atraso: Math.random() * 0.6, duracao: 2.2 + Math.random() * 1.6,
    giro: (Math.random() - 0.5) * 720, cor: CORES_DO_CONFETE[i % CORES_DO_CONFETE.length],
    w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, deriva: (Math.random() - 0.5) * 120,
  })), []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {pecas.map(p => (
        <motion.span key={p.i} className="absolute top-0 block rounded-[2px]"
          style={{ left: `${p.x}%`, width: p.w, height: p.h, background: p.cor }}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.deriva, rotate: p.giro, opacity: [1, 1, 0.9, 0] }}
          transition={{ delay: p.atraso, duration: p.duracao, ease: 'easeIn' }} />
      ))}
    </div>
  );
}

function larguraQueCabe(): number {
  // Cabe na largura (16 px de cada lado) e na altura (botões embaixo); card 4:5.
  const w = window.innerWidth - 32;
  const h = (window.innerHeight - 150) * 0.8;
  return Math.max(240, Math.min(LARGURA_DA_ARTE * 1.15, w, h));
}

export function TelaArte({ arte, titulo, onFechar }: { arte: PropsDaArte; titulo: string; onFechar: () => void }) {
  const [largura, setLargura] = useState(larguraQueCabe);
  const [copiando, setCopiando] = useState(false);
  const foto = useRef<HTMLDivElement>(null);
  const festa = modeloPorId(arte.modelo)?.festa ?? false;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    const medir = () => setLargura(larguraQueCabe());
    window.addEventListener('keydown', tecla);
    window.addEventListener('resize', medir);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('resize', medir); };
  }, [onFechar]);

  async function copiar() {
    if (!foto.current) return;
    setCopiando(true);
    try {
      const nome = titulo.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'arte';
      const r = await copiarImagemDoElemento(foto.current, `${nome}.png`, TEMAS[arte.tema].fundo);
      toast.success(r === 'copiado' ? 'Imagem copiada. É só colar no WhatsApp.' : 'Imagem baixada.');
    } catch {
      toast.error('Não deu para gerar a imagem.');
    } finally {
      setCopiando(false);
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={titulo}
      className="fixed inset-0 z-[94] flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm print:hidden"
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      {festa && <Confete />}

      <motion.div className="relative z-[2]" initial={{ opacity: 0, y: 30, scale: 0.9, rotate: -2 }} animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }} style={{ filter: 'drop-shadow(0 24px 40px rgba(0,0,0,0.45))' }}>
        <ArteEscalada {...arte} largura={largura} />
        <button type="button" onClick={onFechar} aria-label="Fechar"
          className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-background text-foreground shadow-lg hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </motion.div>

      <motion.div className="relative z-[2] flex w-full max-w-sm gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Button variant="outline" className="h-11 flex-1 bg-background" onClick={() => { void copiar(); }} disabled={copiando}>
          {copiando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />} Copiar imagem
        </Button>
        <Button className="h-11 flex-1" onClick={onFechar}>{festa ? 'Bora! 🎉' : 'Entendi'}</Button>
      </motion.div>

      {/* A arte na medida certa, fora da tela, só para virar imagem. */}
      <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <ArteCard ref={foto} {...arte} />
      </div>
    </div>,
    document.body,
  );
}
