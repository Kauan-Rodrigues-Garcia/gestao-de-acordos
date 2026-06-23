import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Gerencia a captura da janela do Mundial ERP via Screen Capture API.
 *
 * Importante: o navegador NÃO permite escolher uma janela específica por
 * código — o seletor nativo sempre aparece e o usuário escolhe a janela.
 * Aqui, o usuário seleciona a janela do ERP UMA vez por sessão; o stream
 * permanece ativo e as capturas seguintes são instantâneas (sem reabrir o
 * seletor).
 */
export function useCapturaMundialErp() {
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [iniciando, setIniciando] = useState(false);

  const pararCaptura = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    setAtivo(false);
  }, []);

  /** Abre o seletor do navegador e ativa o stream. Retorna false se cancelado. */
  const iniciarCaptura = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Captura de tela não é suportada neste navegador.');
    }
    setIniciando(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      // Usuário pode encerrar o compartilhamento pela UI do navegador.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => pararCaptura());

      streamRef.current = stream;
      videoRef.current = video;
      setAtivo(true);
      return true;
    } catch (err) {
      // Cancelar o seletor não é um erro fatal.
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'AbortError')
      ) {
        return false;
      }
      throw err;
    } finally {
      setIniciando(false);
    }
  }, [pararCaptura]);

  /** Captura um frame do stream ativo. Inicia a captura se ainda não houver. */
  const capturarFrame = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    if (!streamRef.current || !videoRef.current) {
      const ok = await iniciarCaptura();
      if (!ok) return null;
    }
    const video = videoRef.current;
    if (!video) return null;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas;
  }, [iniciarCaptura]);

  // Encerra o stream ao desmontar.
  useEffect(() => () => pararCaptura(), [pararCaptura]);

  return { ativo, iniciando, iniciarCaptura, capturarFrame, pararCaptura };
}
