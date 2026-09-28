/**
 * TabulacaoCell — botão/badge de estado de tabulação por linha do Analítico
 *
 * Estados:
 *   NÃO TABULADO → botão "Tabular acordo"
 *   TABULADO     → botão "Ver acordo" (abre detalhe no Dashboard)
 *   DIVERGENTE   → botão "Divergente": o acordo do código é de outra pessoa.
 *                  Confirmar passa o acordo DIRETO para o operador da linha —
 *                  o pagamento já entrou em nome dele, então não há autorização
 *                  de líder. Quem decide e executa é o servidor
 *                  (`fn_analitico_status_tabulacao` / `fn_analitico_tabular_divergente`).
 */

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Plus, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import type { AnaliticoRecebimento, StatusTabulacaoAnalitico } from '@/lib/supabase';
import {
  verificarStatusTabulacao,
  atualizarTabulacao,
  tabularDivergente,
} from '@/services/analitico/analitico.service';
import { ehLinhaDeAjuste } from '@/services/analitico/ajusteManual.service';

interface TabulacaoCellProps {
  linha: AnaliticoRecebimento;
  empresaId: string;
  /** Operador DA LINHA — é para ele que o acordo vai num Divergente. */
  operadorId: string;
  operadorNome: string;
  /** Chamado para abrir AcordoNovoInline pré-preenchido */
  onAbrirNovoAcordo: (dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
    dataPagamento?: string;
  }) => void;
  /** Chamado para navegar até o acordo existente no Dashboard */
  onVerAcordo: (acordoId: string, codigo?: string) => void;
  onRefetch: () => void;
}

export function TabulacaoCell({
  linha, empresaId, operadorId, operadorNome,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: TabulacaoCellProps) {
  const [carregando,       setCarregando]       = useState(false);
  const [statusLocal,      setStatusLocal]      = useState<StatusTabulacaoAnalitico>(linha.status_tabulacao);
  const [acordoIdLocal,    setAcordoIdLocal]    = useState<string | null>(linha.acordo_id);
  const [divergenteInfo,   setDivergenteInfo]   = useState<{ outroNome: string; acordoId: string } | null>(null);
  const [confirmandoDiv,   setConfirmandoDiv]   = useState(false);

  // Ref para evitar usar status stale dentro do setTimeout
  const statusRef = useRef(statusLocal);
  statusRef.current = statusLocal;

  // Auto-verifica tabulação ao montar, sem exigir clique manual.
  // Stagger aleatório de até 600 ms para não sobrecarregar o banco com
  // centenas de queries simultâneas quando muitas linhas renderizam juntas.
  //
  // Linha gravada como 'divergente' também é conferida: o nome do outro
  // operador não fica no banco, e sem ele o botão amarelo não aparece.
  useEffect(() => {
    // Ajuste manual não tem acordo para casar: a linha é sintética e o
    // `codigo` dela é um rótulo, não um NR. A consulta acharia qualquer coisa.
    if (ehLinhaDeAjuste(linha)) return;
    if (linha.status_tabulacao === 'tabulado') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || statusRef.current === 'tabulado') return;
      const { status, acordoId, outroOperadorNome } = await verificarStatusTabulacao(linha.id);
      if (cancelled) return;

      if (status !== linha.status_tabulacao || acordoId !== linha.acordo_id) {
        await atualizarTabulacao(linha.id, status, acordoId);
        if (cancelled) return;
      }
      setStatusLocal(status);
      setAcordoIdLocal(acordoId);
      setDivergenteInfo(
        status === 'divergente' && acordoId
          ? { outroNome: outroOperadorNome ?? 'outro operador', acordoId }
          : null,
      );
    }, Math.random() * 600);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linha.id, operadorId, empresaId]);

  function abrirFormulario() {
    onAbrirNovoAcordo({
      instituicao:    linha.codigo,
      nomeCliente:    linha.nome_cliente ?? '',
      forma:          linha.forma_pagamento,
      valor:          linha.valor_recebido,
      dataPagamento:  linha.data_pagamento,
    });
  }

  async function handleTabular() {
    setCarregando(true);
    const { status, acordoId, outroOperadorNome } = await verificarStatusTabulacao(linha.id);

    if (status === 'tabulado' && acordoId) {
      await atualizarTabulacao(linha.id, 'tabulado', acordoId);
      setStatusLocal('tabulado');
      setAcordoIdLocal(acordoId);
      toast.success('Acordo já tabulado para este operador. Registro atualizado.');
      onRefetch();
      setCarregando(false);
      return;
    }

    if (status === 'divergente' && acordoId) {
      await atualizarTabulacao(linha.id, 'divergente', acordoId);
      setStatusLocal('divergente');
      setAcordoIdLocal(acordoId);
      setDivergenteInfo({ outroNome: outroOperadorNome ?? 'outro operador', acordoId });
      setConfirmandoDiv(true);
      setCarregando(false);
      return;
    }

    // Não tabulado — abrir formulário pré-preenchido
    await atualizarTabulacao(linha.id, 'nao_tabulado', null);
    setStatusLocal('nao_tabulado');
    setCarregando(false);
    abrirFormulario();
  }

  async function confirmarDivergente() {
    if (!divergenteInfo) return;
    setConfirmandoDiv(false);
    setCarregando(true);

    const r = await tabularDivergente(linha.id);
    setCarregando(false);

    if ('error' in r) {
      toast.error(`Não foi possível transferir: ${r.error}`);
      return;
    }

    setDivergenteInfo(null);

    if (r.resultado === 'livre') {
      // O acordo do outro sumiu entre a checagem e o clique: código livre.
      setStatusLocal('nao_tabulado');
      setAcordoIdLocal(null);
      toast.info('O código ficou livre. Tabule o acordo.');
      onRefetch();
      abrirFormulario();
      return;
    }

    setStatusLocal('tabulado');
    setAcordoIdLocal(r.acordoId);
    toast.success(
      r.resultado === 'transferido'
        ? `Acordo transferido de ${r.operadorAnteriorNome ?? divergenteInfo.outroNome} para ${r.operadorNovoNome ?? operadorNome}.`
        : 'Este acordo já era deste operador. Registro atualizado.',
    );
    onRefetch();
  }

  /*
   * Ajuste manual: selo, e não botão.
   *
   * A linha é sintética — não existe em `analitico_recebimentos`, não tem
   * acordo para ver nem código para casar. Sem esta saída ela cairia no ramo
   * «tabulado» e ofereceria «Ver acordo» para um acordo que não existe.
   *
   * O selo é também o aviso que a liderança pediu: em qualquer lugar onde o
   * valor aparece, fica dito que aquele pedaço entrou por lançamento manual.
   * O autor e o motivo estão na aba Ajuste de recebimento.
   */
  if (ehLinhaDeAjuste(linha)) {
    return (
      <span
        title="Lançado manualmente no Painel Líder › Ajuste de recebimento"
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-500 text-[11px] font-semibold"
      >
        <SlidersHorizontal className="w-3 h-3" /> Ajuste manual
      </span>
    );
  }

  // Botão de acordo já tabulado (visualizar)
  if (statusLocal === 'tabulado' && acordoIdLocal) {
    return (
      <Button
        size="sm" variant="outline"
        className="h-7 gap-1.5 text-xs border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
        onClick={() => onVerAcordo(acordoIdLocal, linha.codigo)}
      >
        <CheckCircle2 className="w-3 h-3" /> Ver acordo
      </Button>
    );
  }

  // Divergente — mostrar alerta
  if (statusLocal === 'divergente' && divergenteInfo) {
    return (
      <>
        <Button
          size="sm" variant="outline"
          className="h-7 gap-1.5 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
          onClick={() => setConfirmandoDiv(true)}
          disabled={carregando}
        >
          {carregando ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
          {carregando ? 'Transferindo…' : 'Divergente'}
        </Button>

        <AlertDialog open={confirmandoDiv} onOpenChange={setConfirmandoDiv}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" /> Acordo registrado por outro operador
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-left">
                <p>
                  O código <strong>{linha.codigo}</strong> está registrado para{' '}
                  <strong>{divergenteInfo.outroNome}</strong>, mas o pagamento entrou no
                  Analítico em nome de <strong>{operadorNome}</strong>.
                </p>
                <p>
                  Ao confirmar, o acordo <strong>sai</strong> de{' '}
                  <strong>{divergenteInfo.outroNome}</strong> e <strong>passa direto</strong>{' '}
                  para <strong>{operadorNome}</strong>, com os mesmos dados, sem autorização
                  de líder. {divergenteInfo.outroNome} e os líderes serão notificados.
                </p>
                <p className="text-xs text-muted-foreground">
                  Recebido: <strong>{formatBRL(linha.valor_recebido)}</strong> · Forma:{' '}
                  <strong>{linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'}</strong>
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmarDivergente}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Confirmar transferência
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Não tabulado — botão principal
  return (
    <Button
      size="sm" variant="outline"
      className={cn(
        'h-7 gap-1.5 text-xs',
        !carregando && 'border-primary/40 text-primary hover:bg-primary/5',
      )}
      onClick={handleTabular}
      disabled={carregando}
    >
      {carregando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
      {carregando ? 'Verificando…' : 'Tabular acordo'}
    </Button>
  );
}
