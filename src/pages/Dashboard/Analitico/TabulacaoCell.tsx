/**
 * TabulacaoCell — botão/badge de estado de tabulação por linha do Analítico
 *
 * Estados:
 *   NÃO TABULADO → botão "Tabular acordo"
 *   TABULADO     → botão "Ver acordo" (abre detalhe no Dashboard)
 *   EXTRA        → tabulado também: a linha é «Extra» no relatório e está
 *                  ligada ao acordo DIRETO do colega (20261028180000). O
 *                  botão diz de quem é o direto e abre esse acordo.
 *   PAR          → a linha é Direto, o acordo está com um colega e o relatório
 *                  mostra esse colega recebendo o código como Extra
 *                  (20261116234244). Não é divergência: o botão diz «Entrar
 *                  como Direto»; confirmar deixa o colega Extra e cria o
 *                  Direto do operador da linha. Ninguém perde o acordo.
 *   DIVERGENTE   → botão "Divergente": o acordo do código é de outra pessoa.
 *                  Confirmar passa o acordo DIRETO para o operador da linha —
 *                  o pagamento já entrou em nome dele, então não há autorização
 *                  de líder. Quem decide e executa é o servidor
 *                  (`fn_analitico_status_tabulacao` / `fn_analitico_tabular_divergente`).
 *
 * Os três casos com outra pessoa abrem o mesmo cartão
 * (`CartaoDecisaoTabulacao`). Quem sai ou vira Extra é avisado por um card no
 * chat, na conversa com o operador da linha.
 */

import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Link2, Plus, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { rotuloDaForma } from '@/lib/formasPagamento';
import type { AnaliticoRecebimento, StatusTabulacaoAnalitico } from '@/lib/supabase';
import {
  verificarStatusTabulacao,
  verificarStatusTabulacaoEmLote,
  esquecerStatusTabulacao,
  atualizarTabulacao,
  tabularDivergente,
} from '@/services/analitico/analitico.service';
import { ehLinhaDeAjuste } from '@/services/analitico/ajusteManual.service';
import { ehComissaoExtra } from '@/services/analitico/analiticoComum';
import { CartaoDecisaoTabulacao } from './CartaoDecisaoTabulacao';

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
  /** Par pelo relatório: o colega que tem o acordo e é o Extra do código. */
  const [parInfo,          setParInfo]          = useState<{ outroNome: string; acordoId: string } | null>(null);
  const [confirmandoPar,   setConfirmandoPar]   = useState(false);
  /** Dono do acordo direto quando a linha é Extra tabulada nele; `''` = nome não sabido. */
  const [donoDoDireto,     setDonoDoDireto]     = useState<string | null>(null);
  const [vendoExtra,       setVendoExtra]       = useState(false);

  // Ref para evitar usar status stale dentro do setTimeout
  const statusRef = useRef(statusLocal);
  statusRef.current = statusLocal;

  // Auto-verifica tabulação ao montar, sem exigir clique manual.
  //
  // As linhas que montam juntas viram UMA chamada (`verificarStatusTabulacaoEmLote`),
  // e o servidor grava sozinho as que mudaram, num UPDATE só — antes cada linha
  // perguntava e gravava por conta própria, e cada gravação avisava a empresa
  // inteira (05/10/2026).
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
      const { status, acordoId, outroOperadorNome, extraDoDireto, parPeloRelatorio } =
        await verificarStatusTabulacaoEmLote(linha.id);
      if (cancelled) return;
      setStatusLocal(status);
      // No par, o acordo da resposta é o do colega: a linha não aponta para ele.
      setAcordoIdLocal(parPeloRelatorio ? null : acordoId);
      setDonoDoDireto(extraDoDireto ? (outroOperadorNome ?? '') : null);
      setParInfo(
        parPeloRelatorio && acordoId
          ? { outroNome: outroOperadorNome ?? 'outro operador', acordoId }
          : null,
      );
      setDivergenteInfo(
        status === 'divergente' && acordoId
          ? { outroNome: outroOperadorNome ?? 'outro operador', acordoId }
          : null,
      );
    }, 0);
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
    esquecerStatusTabulacao(linha.id);
    const { status, acordoId, outroOperadorNome, extraDoDireto, parPeloRelatorio } =
      await verificarStatusTabulacao(linha.id);

    // Par pelo relatório: nada a gravar na linha — só mostrar o cartão.
    if (parPeloRelatorio && acordoId) {
      setStatusLocal('nao_tabulado');
      setAcordoIdLocal(null);
      setParInfo({ outroNome: outroOperadorNome ?? 'outro operador', acordoId });
      setConfirmandoPar(true);
      setCarregando(false);
      return;
    }
    setParInfo(null);

    if (status === 'tabulado' && acordoId) {
      await atualizarTabulacao(linha.id, 'tabulado', acordoId);
      setStatusLocal('tabulado');
      setAcordoIdLocal(acordoId);
      setDonoDoDireto(extraDoDireto ? (outroOperadorNome ?? '') : null);
      toast.success(extraDoDireto
        ? `Extra: tabulado no acordo direto de ${outroOperadorNome ?? 'outro operador'}.`
        : 'Acordo já tabulado para este operador. Registro atualizado.');
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
    const outro = divergenteInfo ?? parInfo;
    if (!outro) return;
    setConfirmandoDiv(false);
    setConfirmandoPar(false);
    setCarregando(true);

    const r = await tabularDivergente(linha.id);
    esquecerStatusTabulacao(linha.id);
    setCarregando(false);

    if ('error' in r) {
      toast.error(`Não foi possível transferir: ${r.error}`);
      return;
    }

    setDivergenteInfo(null);
    setParInfo(null);

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
    if (r.resultado === 'extra_do_direto') {
      // O servidor recusou a transferência: a linha é Extra e o direto é o par.
      setDonoDoDireto(r.donoDoDiretoNome ?? '');
      toast.success(`Extra: tabulado no acordo direto de ${r.donoDoDiretoNome ?? outro.outroNome}. Nada foi transferido.`);
      onRefetch();
      return;
    }
    if (r.resultado === 'par_formado') {
      toast.success(
        `${r.operadorNovoNome ?? operadorNome} entrou como Direto. ${r.operadorAnteriorNome ?? outro.outroNome} segue com o acordo, como Extra.`,
      );
      onRefetch();
      return;
    }
    toast.success(
      r.resultado === 'transferido'
        ? `Acordo transferido de ${r.operadorAnteriorNome ?? outro.outroNome} para ${r.operadorNovoNome ?? operadorNome}.`
        : 'Este acordo já era deste operador. Registro atualizado.',
    );
    onRefetch();
  }

  /** O que os três cartões têm em comum: a linha do relatório. */
  const dadosDoCartao = {
    codigo:        linha.codigo,
    cliente:       linha.nome_cliente,
    valor:         linha.valor_recebido,
    forma:         rotuloDaForma(linha.forma_pagamento, linha.forma_detalhe),
    dataPagamento: linha.data_pagamento,
  };

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

  /*
   * «Extra»: o acordo ligado é o DIRETO do colega, quase sempre de outro setor.
   * A lista de Acordos só mostra o que a permissão de quem clica deixa ver, e
   * abri-la filtrada pelo NR dava uma página vazia (28/10/2026). Então o
   * botão explica ali mesmo de quem é o direto. Se a conferência disser que o
   * acordo é do próprio operador (um extra registrado por ele), aí abre a lista.
   */
  async function abrirExtra() {
    if (donoDoDireto) { setVendoExtra(true); return; }
    setCarregando(true);
    esquecerStatusTabulacao(linha.id);
    const r = await verificarStatusTabulacao(linha.id);
    setCarregando(false);
    if (r.status === 'tabulado' && r.acordoId && !r.extraDoDireto) {
      onVerAcordo(r.acordoId, linha.codigo);
      return;
    }
    setDonoDoDireto(r.extraDoDireto ? (r.outroOperadorNome ?? '') : '');
    setVendoExtra(true);
  }

  // Extra do relatório: tabulado no direto do colega (ou num extra próprio).
  if (statusLocal === 'tabulado' && acordoIdLocal
      && (donoDoDireto !== null || ehComissaoExtra(linha.tipo_comissao) === true)) {
    return (
      <>
        <Button
          size="sm" variant="outline"
          title="Extra no relatório: o acordo direto é do colega, e este pagamento é o extra dele."
          className="h-7 gap-1.5 text-xs border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
          onClick={abrirExtra}
          disabled={carregando}
        >
          {carregando ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          {donoDoDireto ? `Extra · direto de ${donoDoDireto.split(/\s+/)[0]}` : 'Extra'}
        </Button>

        <CartaoDecisaoTabulacao
          aberto={vendoExtra} onAberto={setVendoExtra}
          tom="extra"
          titulo="Pagamento Extra"
          {...dadosDoCartao}
          de={{ nome: donoDoDireto || 'Outro operador', papel: 'Direto · dono do acordo' }}
          para={{ nome: operadorNome, papel: 'Extra · recebeu este pagamento' }}
          passos={[
            <>O relatório marca este pagamento como <strong>Extra</strong>: o acordo direto do código é de <strong>{donoDoDireto || 'outro operador'}</strong>.</>,
            <>A linha já está tabulada nesse acordo direto. Não é preciso registrar nada.</>,
          ]}
        />
      </>
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

  // Par pelo relatório — o colega é o Extra; o operador da linha entra Direto.
  if (statusLocal !== 'tabulado' && parInfo) {
    return (
      <>
        <Button
          size="sm" variant="outline"
          title="O relatório mostra o colega como Extra deste código: você entra como Direto e ele continua com o acordo."
          className="h-7 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/5"
          onClick={() => setConfirmandoPar(true)}
          disabled={carregando}
        >
          {carregando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
          {carregando ? 'Vinculando…' : 'Entrar como Direto'}
        </Button>

        <CartaoDecisaoTabulacao
          aberto={confirmandoPar} onAberto={setConfirmandoPar}
          tom="par"
          titulo="Direto e Extra no mesmo código"
          {...dadosDoCartao}
          de={{ nome: parInfo.outroNome, papel: 'Tem o acordo · Extra no relatório' }}
          para={{ nome: operadorNome, papel: 'Direto no relatório' }}
          passos={[
            <>O acordo de <strong>{parInfo.outroNome}</strong> continua com essa pessoa e passa a ser <strong>Extra</strong>.</>,
            <><strong>{operadorNome}</strong> ganha o acordo <strong>Direto</strong> desse código, com os mesmos dados, ligado em par.</>,
            <>Ninguém perde o acordo e não há autorização de líder. {parInfo.outroNome} recebe um card no chat; os líderes são notificados.</>,
          ]}
          confirmar={{ rotulo: 'Entrar como Direto', onClick: confirmarDivergente }}
        />
      </>
    );
  }

  // Divergente — o acordo do código é de outra pessoa, e o relatório não a
  // mostra como Extra: confirmar transfere.
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

        <CartaoDecisaoTabulacao
          aberto={confirmandoDiv} onAberto={setConfirmandoDiv}
          tom="transferencia"
          titulo="Acordo registrado por outro operador"
          {...dadosDoCartao}
          de={{ nome: divergenteInfo.outroNome, papel: 'Tem o acordo hoje' }}
          para={{ nome: operadorNome, papel: 'Recebeu o pagamento' }}
          passos={[
            <>O acordo <strong>sai</strong> de <strong>{divergenteInfo.outroNome}</strong> e passa direto para <strong>{operadorNome}</strong>, com os mesmos dados.</>,
            <>Não há autorização de líder: o pagamento já entrou no Analítico em nome de {operadorNome}.</>,
            <>{divergenteInfo.outroNome} recebe um card no chat; os líderes dos dois são notificados.</>,
          ]}
          confirmar={{ rotulo: 'Confirmar transferência', onClick: confirmarDivergente }}
        />
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
