/**
 * EditorDeRecorte — escolher o pedaço da imagem que vai para a tela (23/10/2026).
 *
 * A moldura tem o formato da tela de quem edita. Arrastar move a imagem; o
 * controle (ou a roda do mouse) dá zoom. «Usar este recorte» grava um JPEG novo
 * com só o que está na moldura — é ele que vai para o bucket. A conta está em
 * `recorte.ts`.
 *
 * GIF animado recortado vira imagem parada (o canvas pega um quadro só): para
 * manter a animação, «Usar a imagem inteira» envia o arquivo como veio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Loader2, Maximize, RotateCcw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  ZOOM_MAX, ZOOM_MIN, areaDoRecorte, centrado, escalaBase, limitar, tamanhoDaSaida, zoomNoCentro,
  type Medidas, type Posicao,
} from './recorte';

/** O formato da tela de quem edita (16:9 se não der para saber). */
function proporcaoDaTela(): number {
  const l = window.screen?.width || 16;
  const a = window.screen?.height || 9;
  const p = l / a;
  return Number.isFinite(p) && p > 0.5 && p < 4 ? p : 16 / 9;
}

const MOLDURA_L = 640;

export function EditorDeRecorte({
  arquivo, onFechar, onPronto,
}: {
  /** A imagem original; `null` fecha o editor. */
  arquivo: File | null;
  onFechar: () => void;
  onPronto: (arquivo: File) => void;
}) {
  const proporcao = useMemo(proporcaoDaTela, []);
  const molduraA = Math.round(MOLDURA_L / proporcao);

  const [url, setUrl] = useState<string | null>(null);
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [pos, setPos] = useState<Posicao>({ x: 0, y: 0, zoom: 1 });
  const [gerando, setGerando] = useState(false);
  const arrasto = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!arquivo) { setUrl(null); setImagem(null); return; }
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    const img = new Image();
    img.onload = () => setImagem(img);
    img.src = u;
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  const medidas: Medidas | null = imagem
    ? { molduraL: MOLDURA_L, molduraA, imagemL: imagem.naturalWidth, imagemA: imagem.naturalHeight }
    : null;

  // Abre centrado.
  useEffect(() => {
    if (imagem) setPos(centrado({ molduraL: MOLDURA_L, molduraA, imagemL: imagem.naturalWidth, imagemA: imagem.naturalHeight }));
  }, [imagem, molduraA]);

  const escala = medidas ? escalaBase(medidas) * pos.zoom : 1;

  function aoApertar(e: React.PointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    arrasto.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a || !medidas) return;
    // A moldura pode aparecer menor que 640 px (celular): converte para px dela.
    const fator = MOLDURA_L / (e.currentTarget as HTMLDivElement).getBoundingClientRect().width;
    setPos(p => limitar(medidas, { ...p, x: a.x + (e.clientX - a.px) * fator, y: a.y + (e.clientY - a.py) * fator }));
  }
  function aoSoltar() { arrasto.current = null; }
  function aoRolar(e: React.WheelEvent<HTMLDivElement>) {
    if (!medidas) return;
    setPos(p => zoomNoCentro(medidas, p, p.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  }

  async function usarRecorte() {
    if (!imagem || !medidas || !arquivo) return;
    setGerando(true);
    try {
      const { sx, sy, sl, sa } = areaDoRecorte(medidas, pos);
      const { l, a } = tamanhoDaSaida(sl, proporcao);
      const canvas = document.createElement('canvas');
      canvas.width = l;
      canvas.height = a;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, l, a);
      ctx.drawImage(imagem, sx, sy, sl, sa, 0, 0, l, a);
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) return;
      const nome = arquivo.name.replace(/\.[^.]+$/, '') || 'jumpscare';
      onPronto(new File([blob], `${nome}-recorte.jpg`, { type: 'image/jpeg' }));
    } finally {
      setGerando(false);
    }
  }

  const ehGif = arquivo?.type === 'image/gif';

  return (
    <Dialog open={!!arquivo} onOpenChange={o => { if (!o && !gerando) onFechar(); }}>
      <DialogContent className="w-[96vw] max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crop className="h-4 w-4 text-primary" /> Recortar a imagem</DialogTitle>
          <DialogDescription>
            O que está dentro da moldura é o que aparece na tela de todo mundo. Arraste para mover;
            use o controle ou a roda do mouse para dar zoom.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto w-full max-w-[640px] cursor-grab touch-none select-none overflow-hidden rounded-md bg-black active:cursor-grabbing"
          style={{ aspectRatio: `${MOLDURA_L} / ${molduraA}` }}
          onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
          onWheel={aoRolar}
        >
          {url && imagem ? (
            <img
              src={url} alt="" draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
              style={{
                // Em % da moldura: a mesma conta vale com a moldura menor no celular.
                width: `${(imagem.naturalWidth * escala / MOLDURA_L) * 100}%`,
                left: `${(pos.x / MOLDURA_L) * 100}%`,
                top: `${(pos.y / molduraA) * 100}%`,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          )}
          {/* Grade dos terços: ajuda a centrar o rosto. */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/15" />)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={[pos.zoom]}
            onValueChange={([z]) => { if (medidas) setPos(p => zoomNoCentro(medidas, p, z)); }}
            className="flex-1"
          />
          <Button
            type="button" variant="ghost" size="sm" className="h-8 gap-1.5"
            onClick={() => { if (medidas) setPos(centrado(medidas)); }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Centralizar
          </Button>
        </div>
        {ehGif && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            GIF recortado vira imagem parada. Para manter a animação, use a imagem inteira.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" disabled={gerando} onClick={() => arquivo && onPronto(arquivo)} className="gap-1.5">
            <Maximize className="h-3.5 w-3.5" /> Usar a imagem inteira
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={gerando} onClick={onFechar}>Cancelar</Button>
            <Button type="button" disabled={!imagem || gerando} onClick={() => void usarRecorte()} className="gap-1.5">
              {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />}
              Usar este recorte
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
