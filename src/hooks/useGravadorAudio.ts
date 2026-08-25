/**
 * useGravadorAudio.ts — gravar um recado pelo microfone.
 *
 * `MediaRecorder` é nativo do navegador: nenhuma biblioteca, nenhum KB no
 * pacote. Em opus, um minuto de fala dá cerca de 60 KB — contra os 10 MB do
 * limite de anexo, cabem quase três horas.
 *
 * ## O formato muda conforme o navegador, e isso importa
 *
 * Chrome e Firefox gravam `audio/webm;codecs=opus`. O Safari não conhece webm e
 * grava `audio/mp4` (AAC). Não dá para fixar um: pedir webm no Safari faz o
 * `MediaRecorder` nascer com o tipo padrão dele e o arquivo sair com extensão
 * mentindo sobre o conteúdo — que é o jeito de o áudio não tocar em outra
 * máquina. Por isso o formato é ESCOLHIDO entre os que o navegador declara
 * suportar, e a extensão sai do que ele de fato usou.
 *
 * ## O microfone precisa ser desligado na mão
 *
 * Parar o `MediaRecorder` não solta o microfone: a luzinha da câmera/mic fica
 * acesa até alguém chamar `stop()` em cada faixa. Sem isso, quem gravasse um
 * recado ficaria com o indicador ligado o resto do dia — e com razão para
 * desconfiar do sistema.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Do preferido ao aceitável. O primeiro que o navegador suportar vence. */
const FORMATOS = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm',             ext: 'webm' },
  { mime: 'audio/mp4',              ext: 'm4a'  },  // Safari
  { mime: 'audio/ogg;codecs=opus',  ext: 'ogg'  },
] as const;

function escolherFormato(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const f of FORMATOS) {
    if (MediaRecorder.isTypeSupported(f.mime)) return { mime: f.mime, ext: f.ext };
  }
  // O navegador tem MediaRecorder mas não declara nenhum tipo: deixa ele
  // escolher sozinho. Acontece em versões antigas do Safari.
  return { mime: '', ext: 'webm' };
}

export interface UseGravadorAudio {
  /** Está gravando agora? */
  gravando:  boolean;
  /** Segundos decorridos, para o cronômetro. */
  segundos:  number;
  /** Erro legível — permissão negada, sem microfone, navegador sem suporte. */
  erro:      string | null;
  /** O navegador consegue gravar? */
  suportado: boolean;
  iniciar:   () => Promise<void>;
  /** Encerra e devolve o arquivo pronto para virar anexo. */
  parar:     () => Promise<File | null>;
  /** Encerra e joga fora. */
  cancelar:  () => void;
}

export function useGravadorAudio(): UseGravadorAudio {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos  = useRef<Blob[]>([]);
  const trilha   = useRef<MediaStream | null>(null);
  const relogio  = useRef<ReturnType<typeof setInterval> | null>(null);
  const formato  = useRef<{ mime: string; ext: string } | null>(null);
  /** Descartar sem entregar arquivo — é o que separa cancelar de parar. */
  const jogarFora = useRef(false);

  const suportado = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';

  const soltarTudo = useCallback(() => {
    if (relogio.current) { clearInterval(relogio.current); relogio.current = null; }
    // Solta o microfone. Sem isto o indicador do navegador fica aceso.
    trilha.current?.getTracks().forEach(t => t.stop());
    trilha.current = null;
    gravador.current = null;
    setGravando(false);
  }, []);

  // Sair da tela no meio de uma gravação não pode deixar o microfone aberto.
  useEffect(() => soltarTudo, [soltarTudo]);

  const iniciar = useCallback(async () => {
    setErro(null);
    if (!suportado) { setErro('Este navegador não grava áudio.'); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      trilha.current = stream;
      formato.current = escolherFormato();
      jogarFora.current = false;
      pedacos.current = [];

      const mr = new MediaRecorder(
        stream,
        formato.current?.mime ? { mimeType: formato.current.mime } : undefined,
      );
      mr.ondataavailable = e => { if (e.data.size > 0) pedacos.current.push(e.data); };
      gravador.current = mr;
      mr.start();

      setSegundos(0);
      setGravando(true);
      relogio.current = setInterval(() => setSegundos(s => s + 1), 1000);
    } catch (e) {
      const nome = (e as { name?: string })?.name ?? '';
      setErro(
        nome === 'NotAllowedError' ? 'Você precisa liberar o microfone no navegador.'
        : nome === 'NotFoundError' ? 'Nenhum microfone encontrado.'
        : 'Não foi possível abrir o microfone.',
      );
      soltarTudo();
    }
  }, [suportado, soltarTudo]);

  const parar = useCallback(async (): Promise<File | null> => {
    const mr = gravador.current;
    if (!mr || mr.state === 'inactive') { soltarTudo(); return null; }

    return new Promise<File | null>(resolve => {
      mr.onstop = () => {
        const ext = formato.current?.ext ?? 'webm';
        const tipo = mr.mimeType || formato.current?.mime || 'audio/webm';
        const blob = new Blob(pedacos.current, { type: tipo });
        pedacos.current = [];
        soltarTudo();

        if (jogarFora.current || blob.size === 0) { resolve(null); return; }

        const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        resolve(new File([blob], `audio-${carimbo}.${ext}`, { type: tipo }));
      };
      mr.stop();
    });
  }, [soltarTudo]);

  const cancelar = useCallback(() => {
    jogarFora.current = true;
    const mr = gravador.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    else soltarTudo();
    setSegundos(0);
  }, [soltarTudo]);

  return { gravando, segundos, erro, suportado, iniciar, parar, cancelar };
}
