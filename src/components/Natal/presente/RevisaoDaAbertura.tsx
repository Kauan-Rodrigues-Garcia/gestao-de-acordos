/**
 * RevisaoDaAbertura — ver a abertura do Natal de novo, pelo card da música
 * (09/11/2026).
 *
 * Só o vídeo: não devolve o presente nem desliga o tema (isso é a abertura de
 * verdade, `AberturaNatal.tsx`). Como lá, o vídeo só abre INTEIRO
 * (`baixarVideo.ts`): até lá aparece «Preparando o vídeo…» com a porcentagem.
 * A rádio do Natal fica muda enquanto o vídeo toca e volta ao fechar; a
 * memória do vídeo (~35 MB) é devolvida ao fechar.
 *
 * Leve para PC fraco: fundo preto liso (sem desfoque), sem animação, e os
 * controles do próprio navegador.
 *
 * «Viu inteiro» é ter assistido pelo menos 90% do vídeo de verdade (o que
 * tocou, não onde a barra parou): arrastar até o fim não conta.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { abaixarRadio } from '../musica';
import { baixarVideo, ouvirDownload, soltarVideo, type EstadoDoDownload } from './baixarVideo';
import { PARTE_QUE_CONTA, segundosAssistidos } from './RevisaoDaAbertura.logica';

export function RevisaoDaAbertura({ src, aoFechar, aoAssistirInteiro }: {
  src: string;
  aoFechar: () => void;
  /** Tocou pelo menos `PARTE_QUE_CONTA` do vídeo. Chamado uma vez. */
  aoAssistirInteiro: () => void;
}) {
  const [download, setDownload] = useState<EstadoDoDownload>({ tipo: 'baixando', fracao: 0 });
  const video = useRef<HTMLVideoElement>(null);
  const contou = useRef(false);

  // Baixa (ou reaproveita) e ouve o andamento; ao fechar, devolve a memória.
  useEffect(() => {
    baixarVideo(src);
    const parar = ouvirDownload(src, setDownload);
    return () => { parar(); soltarVideo(src); };
  }, [src]);

  // A rádio fica muda enquanto o vídeo está na tela.
  useEffect(() => {
    abaixarRadio(0);
    return () => abaixarRadio(1);
  }, []);

  // Esc fecha.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  function conferir() {
    const v = video.current;
    if (contou.current || !v || !v.duration || !Number.isFinite(v.duration)) return;
    if (segundosAssistidos(v.played) >= v.duration * PARTE_QUE_CONTA) {
      contou.current = true;
      aoAssistirInteiro();
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Abertura do Natal"
      className="fixed inset-0 flex items-center justify-center bg-black p-4"
      style={{ zIndex: 2147483000 }}>
      <button type="button" onClick={aoFechar} aria-label="Fechar o vídeo"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <X className="h-5 w-5" />
      </button>
      {download.tipo === 'pronto' ? (
        <video
          ref={video}
          src={download.url}
          autoPlay
          controls
          playsInline
          onTimeUpdate={conferir}
          onEnded={conferir}
          className="max-h-full max-w-full"
        />
      ) : download.tipo === 'erro' ? (
        <div className="text-center text-white">
          <p className="text-base font-semibold">Não deu para carregar o vídeo agora.</p>
          <p className="mt-1 text-sm text-white/70">Tente de novo daqui a pouco.</p>
          <button type="button" onClick={aoFechar} className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-black">Fechar</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-white" role="status">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
          <p className="text-sm">
            Preparando o vídeo…{download.fracao !== null ? ` ${Math.round(download.fracao * 100)}%` : ''}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
