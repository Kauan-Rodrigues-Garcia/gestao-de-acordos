/**
 * TabulacaoCell — botão/badge de estado de tabulação por linha do Analítico
 *
 * Estados:
 *   NÃO TABULADO → botão "Tabular acordo"
 *   TABULADO     → botão "Ver acordo" (abre detalhe no Dashboard)
 *   DIVERGENTE   → botão "Tabular" com alerta do outro operador
 */

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Plus, Loader2 } from 'lucide-react';
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

interface TabulacaoCellProps {
  linha: AnaliticoRecebimento;
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  liderId?: string | null;
  /** Chamado para abrir AcordoNovoInline pré-preenchido */
  onAbrirNovoAcordo: (dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
  }) => void;
  /** Chamado para navegar até o acordo existente no Dashboard */
  onVerAcordo: (acordoId: string) => void;
  onRefetch: () => void;
}

export function TabulacaoCell({
  linha, empresaId, operadorId, operadorNome, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: TabulacaoCellProps) {
  const [carregando,       setCarregando]       = useState(false);
  const [statusLocal,      setStatusLocal]      = useState<StatusTabulacaoAnalitico>(linha.status_tabulacao);
  const [acordoIdLocal,    setAcordoIdLocal]    = useState<string | null>(linha.acordo_id);
  const [divergenteInfo,   setDivergenteInfo]   = useState<{ outroNome: string; outroId: string; acordoId: string } | null>(null);
  const [confirmandoDiv,   setConfirmandoDiv]   = useState(false);

  // Ref para evitar usar status stale dentro do setTimeout
  const statusRef = useRef(statusLocal);
  statusRef.current = statusLocal;

  // Auto-verifica tabulação ao montar, sem exigir clique manual.
  // Stagger aleatório de até 600 ms para não sobrecarregar o banco com
  // centenas de queries simultâneas quando muitas linhas renderizam juntas.
  useEffect(() => {
    if (linha.status_tabulacao !== 'nao_tabulado') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || statusRef.current !== 'nao_tabulado') return;
      const { status, acordoId, outroOperadorId, outroOperadorNome } =
        await verificarStatusTabulacao(empresaId, linha.codigo, operadorId);
      if (cancelled) return;

      if (status === 'tabulado' && acordoId) {
        await atualizarTabulacao(linha.id, 'tabulado', acordoId);
        if (!cancelled) { setStatusLocal('tabulado'); setAcordoIdLocal(acordoId); }
      } else if (status === 'divergente' && acordoId && outroOperadorId && outroOperadorNome) {
        await atualizarTabulacao(linha.id, 'divergente', acordoId);
        if (!cancelled) {
          setStatusLocal('divergente');
          setAcordoIdLocal(acordoId);
          setDivergenteInfo({ outroNome: outroOperadorNome, outroId: outroOperadorId, acordoId });
        }
      }
    }, Math.random() * 600);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linha.id, operadorId, empresaId]);

  async function handleTabular() {
    setCarregando(true);
    const { status, acordoId, outroOperadorId, outroOperadorNome } = await verificarStatusTabulacao(
      empresaId, linha.codigo, operadorId,
    );

    if (status === 'tabulado' && acordoId) {
      await atualizarTabulacao(linha.id, 'tabulado', acordoId);
      setStatusLocal('tabulado');
      setAcordoIdLocal(acordoId);
      toast.success('Acordo já tabulado para você. Registro atualizado.');
      onRefetch();
      setCarregando(false);
      return;
    }

    if (status === 'divergente' && acordoId && outroOperadorId && outroOperadorNome) {
      await atualizarTabulacao(linha.id, 'divergente', acordoId);
      setStatusLocal('divergente');
      setAcordoIdLocal(acordoId);
      setDivergenteInfo({ outroNome: outroOperadorNome, outroId: outroOperadorId, acordoId });
      setConfirmandoDiv(true);
      setCarregando(false);
      return;
    }

    // Não tabulado — abrir formulário pré-preenchido
    await atualizarTabulacao(linha.id, 'nao_tabulado', null);
    setStatusLocal('nao_tabulado');
    setCarregando(false);
    onAbrirNovoAcordo({
      instituicao: linha.codigo,
      nomeCliente: linha.nome_cliente ?? '',
      forma:       linha.forma_pagamento,
      valor:       linha.valor_recebido,
    });
  }

  async function confirmarDivergente() {
    if (!divergenteInfo) return;
    setConfirmandoDiv(false);
    setCarregando(true);

    const { error } = await tabularDivergente({
      linhaId:          linha.id,
      empresaId,
      codigo:           linha.codigo,
      acordoExistenteId: divergenteInfo.acordoId,
      outroOperadorId:  divergenteInfo.outroId,
      outroOperadorNome: divergenteInfo.outroNome,
      novoOperadorId:   operadorId,
      novoOperadorNome: operadorNome,
      liderId,
    });

    if (error) {
      toast.error(`Erro ao transferir: ${error}`);
    } else {
      toast.success(`Acordo transferido de ${divergenteInfo.outroNome}. Agora tabule o seu.`);
      setStatusLocal('nao_tabulado');
      setAcordoIdLocal(null);
      setDivergenteInfo(null);
      onRefetch();
      // Abrir formulário para registrar o novo acordo
      onAbrirNovoAcordo({
        instituicao: linha.codigo,
        nomeCliente: linha.nome_cliente ?? '',
        forma:       linha.forma_pagamento,
        valor:       linha.valor_recebido,
      });
    }
    setCarregando(false);
  }

  // Botão de acordo já tabulado (visualizar)
  if (statusLocal === 'tabulado' && acordoIdLocal) {
    return (
      <Button
        size="sm" variant="outline"
        className="h-7 gap-1.5 text-xs border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
        onClick={() => onVerAcordo(acordoIdLocal)}
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
          <AlertTriangle className="w-3 h-3" />
          Divergente
        </Button>

        <AlertDialog open={confirmandoDiv} onOpenChange={setConfirmandoDiv}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" /> Acordo já tabulado para outro operador
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-left">
                <p>
                  O código <strong>{linha.codigo}</strong> já está tabulado para{' '}
                  <strong>{divergenteInfo.outroNome}</strong>.
                </p>
                <p>
                  Ao confirmar, o acordo será <strong>removido</strong> de{' '}
                  <strong>{divergenteInfo.outroNome}</strong> (enviado para a Lixeira) e você
                  poderá registrar o seu acordo. O operador e o líder serão notificados.
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
