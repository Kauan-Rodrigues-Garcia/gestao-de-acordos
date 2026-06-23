import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, MonitorCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { isPerfilAdmin } from '@/lib/index';
import { useCapturaMundialErp } from '@/hooks/useCapturaMundialErp';
import { lerPrintMundialErp, preaquecerOcr, encerrarOcr } from '@/services/pagueplay/printOcr';
import type { DadosExtraidosPP } from '@/services/pagueplay/printParser';

interface BotaoCapturaErpPPProps {
  onDados: (dados: DadosExtraidosPP) => void;
  className?: string;
}

export function BotaoCapturaErpPP({ onDados, className }: BotaoCapturaErpPPProps) {
  const { perfil } = useAuth();
  const { ativo, capturarFrame } = useCapturaMundialErp();
  const [processando, setProcessando] = useState(false);
  const [modeloPronto, setModeloPronto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    preaquecerOcr();
    // marca o modelo como pronto assim que o worker estiver disponível
    import('tesseract.js').then(({ createWorker }) =>
      createWorker('por').then(() => { if (!cancelado) setModeloPronto(true); }).catch(() => {})
    ).catch(() => {});
    return () => {
      cancelado = true;
      encerrarOcr();
    };
  }, []);

  // Visível somente para admins — teste controlado antes do rollout geral
  if (!isPerfilAdmin(perfil?.perfil ?? '')) return null;

  async function handleCapturar() {
    setProcessando(true);
    if (!modeloPronto) {
      toast.info('Carregando modelo de OCR pela primeira vez (~20s)…', { id: 'ocr-init', duration: 20000 });
    }
    try {
      const canvas = await capturarFrame();
      if (!canvas) return;

      const dados = await lerPrintMundialErp(canvas, true);
      toast.dismiss('ocr-init');
      setModeloPronto(true);

      const n = [
        dados.instituicao,
        dados.tipo,
        dados.parcelas,
        dados.vencimento,
        dados.valor,
        dados.nome_cliente,
      ].filter(Boolean).length;

      if (n === 0) {
        // Modo debug: exibe o texto bruto para diagnóstico (admin only)
        if (dados._textoOcr) {
          console.warn('[OCR-DEBUG] Texto bruto capturado:\n', dados._textoOcr);
          toast.warning(
            `Nenhum campo reconhecido. Texto capturado pelo OCR (primeiros 300 chars):\n"${dados._textoOcr.slice(0, 300)}"`,
            { duration: 15000 },
          );
        } else {
          toast.warning('Não consegui ler os dados do print. Reposicione a janela do ERP e tente de novo.');
        }
        return;
      }

      onDados(dados);
      toast.success(`${n} campo(s) preenchido(s) pelo print. Confira antes de salvar.`);
    } catch (err) {
      toast.dismiss('ocr-init');
      const msg = err instanceof Error ? err.message : 'Falha ao capturar/ler o print.';
      toast.error(msg);
    } finally {
      setProcessando(false);
    }
  }

  const Icone = processando ? Loader2 : ativo ? MonitorCheck : Camera;
  const label = processando
    ? (modeloPronto ? 'Lendo print…' : 'Carregando OCR…')
    : ativo
    ? 'Capturar do ERP'
    : 'Capturar do Mundial ERP';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCapturar}
      disabled={processando}
      className={className}
      title="Captura a janela do Mundial ERP e preenche os campos automaticamente"
    >
      <Icone className={`w-4 h-4 ${processando ? 'animate-spin' : ''}`} />
      {label}
    </Button>
  );
}
