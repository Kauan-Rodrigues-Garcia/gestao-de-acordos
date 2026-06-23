import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, MonitorCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCapturaMundialErp } from '@/hooks/useCapturaMundialErp';
import { lerPrintMundialErp } from '@/services/pagueplay/printOcr';
import type { DadosExtraidosPP } from '@/services/pagueplay/printParser';

interface BotaoCapturaErpPPProps {
  /**
   * Aplica os dados lidos aos campos do formulário. Cada tela faz seu próprio
   * mapeamento (a página usa react-hook-form; o inline usa estado próprio).
   */
  onDados: (dados: DadosExtraidosPP) => void;
  className?: string;
}

/**
 * Botão exclusivo da Pagueplay: captura a janela do Mundial ERP, roda OCR
 * (Tesseract.js) e preenche os campos do acordo. Os campos continuam
 * editáveis e o salvar permanece manual.
 */
export function BotaoCapturaErpPP({ onDados, className }: BotaoCapturaErpPPProps) {
  const { ativo, capturarFrame } = useCapturaMundialErp();
  const [processando, setProcessando] = useState(false);

  async function handleCapturar() {
    setProcessando(true);
    try {
      const canvas = await capturarFrame();
      if (!canvas) return; // usuário cancelou o seletor

      const dados = await lerPrintMundialErp(canvas);
      const n = [
        dados.instituicao,
        dados.tipo,
        dados.parcelas,
        dados.vencimento,
        dados.valor,
      ].filter(Boolean).length;

      if (n === 0) {
        toast.warning(
          'Não consegui ler os dados do print. Reposicione a janela do ERP e tente de novo.',
        );
        return;
      }

      onDados(dados);
      toast.success(`${n} campo(s) preenchido(s) pelo print. Confira antes de salvar.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao capturar/ler o print.';
      toast.error(msg);
    } finally {
      setProcessando(false);
    }
  }

  const Icone = processando ? Loader2 : ativo ? MonitorCheck : Camera;

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
      {processando ? 'Lendo print…' : ativo ? 'Capturar do ERP' : 'Capturar do Mundial ERP'}
    </Button>
  );
}
