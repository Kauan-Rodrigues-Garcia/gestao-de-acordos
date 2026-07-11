/**
 * ModalRecortarFoto — recorte quadrado da foto de perfil antes do upload.
 *
 * Abre quando `arquivo` chega do input de foto: o usuário arrasta para
 * posicionar e ajusta o zoom (controle ou roda do mouse); a máscara circular
 * mostra como o avatar vai aparecer. A saída é um JPEG quadrado 512×512,
 * então a foto não fica esticada nos avatares.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ZoomIn, ZoomOut, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const VIEW     = 288;   // lado do quadro de recorte (px)
const SAIDA    = 512;   // lado da imagem final (px)
const ZOOM_MAX = 3;

interface ModalRecortarFotoProps {
  /** Arquivo escolhido no input; null mantém o modal fechado */
  arquivo: File | null;
  /** Recebe o JPEG recortado — faz o upload */
  onConfirmar: (foto: File) => void | Promise<void>;
  onCancelar: () => void;
}

export function ModalRecortarFoto({ arquivo, onConfirmar, onCancelar }: ModalRecortarFotoProps) {
  const [img,      setImg]      = useState<HTMLImageElement | null>(null);
  const [url,      setUrl]      = useState<string | null>(null);
  const [erro,     setErro]     = useState<string | null>(null);
  const [zoom,     setZoom]     = useState(1);
  const [off,      setOff]      = useState({ x: 0, y: 0 });
  const [salvando, setSalvando] = useState(false);
  const dragRef     = useRef<{ x: number; y: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef     = useRef(1);
  zoomRef.current = zoom;

  // Carrega a imagem quando o arquivo chega; revoga a URL ao fechar/trocar
  useEffect(() => {
    if (!arquivo) { setImg(null); setUrl(null); setErro(null); return; }
    const u  = URL.createObjectURL(arquivo);
    const el = new Image();
    el.onload  = () => { setImg(el); setZoom(1); setOff({ x: 0, y: 0 }); };
    el.onerror = () => setErro('Não foi possível abrir esta imagem. Tente outro formato (JPG ou PNG).');
    el.src = u;
    setUrl(u);
    setErro(null);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  // Escala "cover" × zoom — a imagem sempre cobre o quadro inteiro
  const escala = img ? Math.max(VIEW / img.width, VIEW / img.height) * zoom : 1;
  const dispW  = img ? img.width  * escala : 0;
  const dispH  = img ? img.height * escala : 0;

  const clampOff = useCallback((o: { x: number; y: number }, z: number) => {
    if (!img) return o;
    const esc  = Math.max(VIEW / img.width, VIEW / img.height) * z;
    const maxX = Math.max(0, (img.width  * esc - VIEW) / 2);
    const maxY = Math.max(0, (img.height * esc - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  }, [img]);

  const mudarZoom = useCallback((z: number) => {
    const nz = Math.min(ZOOM_MAX, Math.max(1, z));
    setZoom(nz);
    setOff(o => clampOff(o, nz));
  }, [clampOff]);

  // Roda do mouse: listener nativo (onWheel do React é passivo — preventDefault não funciona)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !img) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      mudarZoom(zoomRef.current + (e.deltaY < 0 ? 0.15 : -0.15));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [img, mudarZoom]);

  async function confirmar() {
    if (!img) return;
    setSalvando(true);
    try {
      const canvas  = document.createElement('canvas');
      canvas.width  = SAIDA;
      canvas.height = SAIDA;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível neste navegador.');
      // Top-left do quadro em coordenadas da imagem original
      const sx = (dispW / 2 - VIEW / 2 - off.x) / escala;
      const sy = (dispH / 2 - VIEW / 2 - off.y) / escala;
      const s  = VIEW / escala;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, s, s, 0, 0, SAIDA, SAIDA);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Falha ao gerar a imagem recortada.');
      await onConfirmar(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!arquivo} onOpenChange={aberto => { if (!aberto && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-primary" /> Recortar foto
          </DialogTitle>
          <DialogDescription>
            Arraste para posicionar e ajuste o zoom. A área circular é como o avatar vai aparecer.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-destructive text-center py-8">{erro}</p>
        ) : (
          <>
            <div
              ref={viewportRef}
              className="relative mx-auto rounded-xl overflow-hidden bg-muted cursor-move select-none touch-none"
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={e => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={e => {
                if (!dragRef.current) return;
                const dx = e.clientX - dragRef.current.x;
                const dy = e.clientY - dragRef.current.y;
                dragRef.current = { x: e.clientX, y: e.clientY };
                setOff(o => clampOff({ x: o.x + dx, y: o.y + dy }, zoomRef.current));
              }}
              onPointerUp={() => { dragRef.current = null; }}
              onPointerCancel={() => { dragRef.current = null; }}
            >
              {url && img ? (
                <img
                  src={url} alt="" draggable={false}
                  className="absolute max-w-none"
                  style={{
                    width:  dispW,
                    height: dispH,
                    left:   VIEW / 2 - dispW / 2 + off.x,
                    top:    VIEW / 2 - dispH / 2 + off.y,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
              {/* Máscara circular: escurece o que fica fora do avatar */}
              <div
                className="absolute rounded-full pointer-events-none border border-white/60"
                style={{ inset: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
            </div>

            <div className="flex items-center gap-3 px-1">
              <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="range" min={1} max={ZOOM_MAX} step={0.01} value={zoom}
                onChange={e => mudarZoom(Number(e.target.value))}
                className="flex-1 accent-primary"
                disabled={!img}
                aria-label="Zoom"
              />
              <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={!img || salvando || !!erro} className="gap-1.5">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {salvando ? 'Enviando…' : 'Usar foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
