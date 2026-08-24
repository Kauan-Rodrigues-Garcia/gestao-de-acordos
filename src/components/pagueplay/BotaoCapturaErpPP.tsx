import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, MonitorCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { logger } from '@/lib/logger';
import { useCapturaMundialErp } from '@/hooks/useCapturaMundialErp';
import { lerPrintMundialErp, preaquecerOcr, encerrarOcr } from '@/services/pagueplay/printOcr';
import type { DadosExtraidosPP } from '@/services/pagueplay/printParser';

interface BotaoCapturaErpPPProps {
  onDados: (dados: DadosExtraidosPP) => void;
  className?: string;
}

export function BotaoCapturaErpPP({ onDados, className }: BotaoCapturaErpPPProps) {
  const { temPermissao } = useCargoPermissoes();
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

  // Quem dispara a captura sai do painel. Era `isPerfilAdmin`, escrito aqui no
  // rollout controlado — e liberar mais alguém exigia um deploy.
  if (!temPermissao('acordos_capturar_erp')) return null;

  async function handleCapturar() {
    setProcessando(true);
    if (!modeloPronto) {
      toast.info('Carregando modelo de OCR pela primeira vez (~20s)…', { id: 'ocr-init', duration: 20000 });
    }
    // Orienta o usuário antes do seletor do Chrome abrir
    if (!ativo) {
      toast.info(
        'Na janela do Chrome: escolha a aba "Tela inteira" — o ERP pode aparecer em preto na aba "Janela".',
        { id: 'ocr-hint', duration: 8000 },
      );
    }
    try {
      const canvas = await capturarFrame();
      toast.dismiss('ocr-hint');
      if (!canvas) return;

      const dados = await lerPrintMundialErp(canvas, true);
      toast.dismiss('ocr-init');
      setModeloPronto(true);

      /*
       * Diagnóstico do OCR — só em desenvolvimento.
       *
       * Até 16/08/2026 estes dois logs eram `console.log` incondicional, com o
       * comentário "sempre loga para facilitar diagnóstico". O que sai daqui é
       * o texto BRUTO da captura da tela do ERP: nome do cliente, valores, e o
       * que mais estivesse visível no momento. Em produção isso ficava no
       * console do navegador — legível por qualquer extensão instalada e
       * preservado no devtools.
       *
       * `logger.debug` já existe e só escreve quando `import.meta.env.DEV`.
       */
      if (dados._textoOcr) {
        logger.debug('[OCR] Texto capturado:\n', dados._textoOcr);
        logger.debug('[OCR] Campos extraídos:', {
          instituicao: dados.instituicao,
          tipo: dados.tipo,
          parcelas: dados.parcelas,
          vencimento: dados.vencimento,
          valor: dados.valor,
          nome_cliente: dados.nome_cliente,
          quarentaPct: dados.quarentaPct,
        });
      }

      const n = [
        dados.instituicao,
        dados.tipo,
        dados.parcelas,
        dados.vencimento,
        dados.valor,
        dados.nome_cliente,
      ].filter(Boolean).length;

      if (n === 0) {
        toast.warning('Não consegui ler os dados do print. Reposicione a janela do ERP e tente de novo.');
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
