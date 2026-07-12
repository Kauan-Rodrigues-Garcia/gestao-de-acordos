import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Sparkles, ScanText, X, Wand2, Monitor, MonitorCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCapturaMundialErp } from '@/hooks/useCapturaMundialErp';
import { canvasParaFile } from '@/lib/ocr/fileToCanvas';
import {
  lerImagensAcordoBP,
  preaquecerOcrAcordo,
  encerrarOcrAcordo,
} from '@/services/acordo-visao/lerImagensAcordo';
import { contarCamposPreenchidos, type DadosExtraidosAcordo } from '@/services/acordo-visao/types';

interface DropzoneImagensAcordoProps {
  onDados: (dados: DadosExtraidosAcordo) => void;
  disabled?: boolean;
  className?: string;
}

interface ImagemSel {
  id: string;
  file: File;
  url: string;
}

const MAX_IMAGENS = 5;

/**
 * Zona de leitura de acordo por imagem (BookPlay) — arrastar-e-soltar, clicar
 * ou colar (Ctrl+V) um ou mais prints. Roda o motor híbrido IA→OCR e devolve
 * os campos via `onDados` para o formulário preencher.
 *
 * Componente puro (sem auth): a restrição de visibilidade (admin-only na fase
 * de testes) é responsabilidade de quem o renderiza — ver FormBP.
 */
export function DropzoneImagensAcordo({ onDados, disabled, className }: DropzoneImagensAcordoProps) {
  const [imagens, setImagens] = useState<ImagemSel[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [fonte, setFonte] = useState<'ia' | 'ocr' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imagensRef = useRef<ImagemSel[]>([]);
  imagensRef.current = imagens;

  // Captura de tela via seletor do navegador (reaproveita o hook do PaguePlay).
  const { ativo, capturarFrame } = useCapturaMundialErp();

  // Pré-aquece o modelo de OCR (usado no fallback) e limpa ao desmontar.
  useEffect(() => {
    preaquecerOcrAcordo();
    return () => {
      imagensRef.current.forEach((i) => URL.revokeObjectURL(i.url));
      encerrarOcrAcordo();
    };
  }, []);

  const adicionar = useCallback((novos: File[]) => {
    const imgs = novos.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setImagens((prev) => {
      const espaco = MAX_IMAGENS - prev.length;
      if (espaco <= 0) {
        toast.warning(`Máximo de ${MAX_IMAGENS} imagens por leitura.`);
        return prev;
      }
      const aceitos = imgs.slice(0, espaco).map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...aceitos];
    });
  }, []);

  const remover = useCallback((id: string) => {
    setImagens((prev) => {
      const alvo = prev.find((i) => i.id === id);
      if (alvo) URL.revokeObjectURL(alvo.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  // Colar imagem (Ctrl+V) em qualquer lugar enquanto o form está aberto.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const arquivos = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (arquivos.length) {
        e.preventDefault();
        adicionar(arquivos);
        toast.info(`${arquivos.length} imagem(ns) colada(s).`);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, adicionar]);

  async function ler() {
    if (!imagens.length || processando) return;
    setProcessando(true);
    setFonte(null);
    try {
      const dados = await lerImagensAcordoBP(imagens.map((i) => i.file));
      setFonte(dados._fonte ?? null);

      if (dados._textoOcr) {
        console.info('[ACORDO-VISAO] Texto/OCR:\n', dados._textoOcr);
        console.info('[ACORDO-VISAO] Campos:', dados);
      }

      const n = contarCamposPreenchidos(dados);
      if (n === 0) {
        toast.warning('Não consegui identificar campos nas imagens. Tente um print mais nítido.');
        return;
      }
      onDados(dados);
      const via = dados._fonte === 'ia' ? 'IA' : 'OCR local';
      toast.success(`${n} campo(s) preenchido(s) via ${via}. Confira antes de salvar.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler as imagens.');
    } finally {
      setProcessando(false);
    }
  }

  async function capturarTela() {
    if (disabled || capturando) return;
    setCapturando(true);
    if (!ativo) {
      toast.info('Escolha a aba/janela/tela para capturar e clique em Compartilhar.', {
        id: 'captura-hint', duration: 6000,
      });
    }
    try {
      const canvas = await capturarFrame();
      toast.dismiss('captura-hint');
      if (!canvas) return; // usuário cancelou o seletor
      const file = await canvasParaFile(canvas, `captura-${Date.now()}.png`);
      adicionar([file]);
      toast.success('Tela capturada. Clique em "Ler" para extrair os campos.');
    } catch (err) {
      toast.dismiss('captura-hint');
      toast.error(err instanceof Error ? err.message : 'Falha ao capturar a tela.');
    } finally {
      setCapturando(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <Wand2 className="w-3 h-3" /> Preencher por imagem
          <span className="font-normal normal-case text-muted-foreground/50 ml-1">
            IA + OCR · admin
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={capturarTela}
          disabled={disabled || capturando || processando}
          className="h-7 gap-1.5 shrink-0"
          title="Captura a aba/janela/tela que você selecionar e joga na fila de leitura"
        >
          {capturando
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : ativo ? <MonitorCheck className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
          {capturando ? 'Capturando…' : ativo ? 'Capturar de novo' : 'Capturar tela'}
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Solte, cole ou clique para adicionar prints do acordo"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          adicionar(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          'rounded-lg border-2 border-dashed transition-colors cursor-pointer',
          'flex flex-col items-center justify-center text-center gap-1 px-4 py-5',
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-primary/25 bg-primary/[0.03] hover:bg-primary/[0.06]',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        <ImagePlus className="w-5 h-5 text-primary/70" />
        <p className="text-xs font-medium text-foreground/80">
          Arraste, <span className="text-primary">cole (Ctrl+V)</span> ou clique para enviar prints
        </p>
        <p className="text-[11px] text-muted-foreground">
          NR, vencimento, valor, status… preenchidos automaticamente · ou use
          {' '}<span className="text-primary">Capturar tela</span> · junte até {MAX_IMAGENS} prints (reparcelamento)
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          adicionar(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      {imagens.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 mt-3">
            {imagens.map((img, idx) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.url}
                  alt={`Print ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-md border border-border"
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remover(img.id); }}
                  disabled={processando}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow hover:bg-destructive/90"
                  title="Remover"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button
              type="button"
              size="sm"
              onClick={ler}
              disabled={processando || disabled}
              className="gap-1.5"
            >
              {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {processando ? 'Lendo…' : `Ler ${imagens.length} imagem(ns)`}
            </Button>
            {fonte && !processando && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5',
                  fonte === 'ia'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
                title={fonte === 'ia' ? 'Lido pela IA de visão' : 'Lido pelo OCR local (Tesseract)'}
              >
                {fonte === 'ia' ? <Sparkles className="w-3 h-3" /> : <ScanText className="w-3 h-3" />}
                {fonte === 'ia' ? 'IA' : 'OCR local'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
