/**
 * AcordoNovoInline — v4 (nr_registros realtime)
 *
 * NR único gerenciado via tabela `nr_registros` (trigger trg_sync_nr_registros v2).
 * Exports: AcordoNovoInline, ModalAutorizacaoNR, ModalAvisoDiretoExtra,
 *          ConflitNR, ModalAutorizacaoNRProps, ModalAvisoDiretoExtraProps, AcordoNovoInlineProps
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase, type Acordo, type Perfil } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import {
  buildObservacoesComEstado, formatarTelefonePP,
  parseCurrencyInput, getTodayISO, ROUTE_PATHS,
} from '@/lib/index';
import { calcularParcelas, totalComEntrada, formatBRL } from '@/lib/money';
import { camposComCpf, ERRO_CPF_NO_CODIGO } from '@/lib/cpf';
import {
  estadoFechamentoDaData, mensagemFechamento, mesDaData,
} from '@/lib/fechamentoMes';
import { ultimoDiaProxMes } from '@/components/ModalReagendar';
import { criarNotificacao }    from '@/services/notificacoes.service';
import { registrarLog }        from '@/services/logs.service';
import { enviarParaLixeira }   from '@/services/lixeira.service';
import { solicitarAutorizacao } from '@/services/autorizacaoPedidos.service';
import { useNrRegistros }           from '@/hooks/useNrRegistros';
import { verificarNrRegistro, mensagemErroNr } from '@/services/nr_registros.service';
import {
  operadorEstaDesligado, transferirAcordoDeDesligado,
  transferirAcordoNoServidor, mensagemErroTransferencia,
} from '@/services/desligamento.service';
import { useDiretoExtraConfig }     from '@/hooks/useDiretoExtraConfig';
import { fetchIsDiretoExtraAtivo }  from '@/services/direto_extra.service';
import { converterParaExtra, vincularExtraAoDireto } from '@/services/diretoExtraRpc';
import { useEmpresaTags }           from '@/hooks/useEmpresaTags';
import { useProfissional }          from '@/hooks/useProfissional';
import { ModalAdicionarParcela }    from '@/components/ModalAdicionarParcela';
import { adicionarParcelasAoGrupo, type NovaParcelaInput } from '@/services/parcelas.service';
import { ehFormaRecorrente, nomeDaFormaRecorrente } from '@/lib/formasRecorrentes';
import { TIPOS_PAGUEPLAY, TIPOS_BOOKPLAY } from './constants';
import { FormPP } from './FormPP';
import { FormBP } from './FormBP';
import type { ConflitNR, AcordoNovoInlineProps, SharedFormState } from './types';

// Re-export public API so callers using `@/components/AcordoNovoInline` keep working
export { ModalAutorizacaoNR } from './ModalAutorizacaoNR';
export { ModalAvisoDiretoExtra } from './ModalAvisoDiretoExtra';
export type {
  ConflitNR,
  ModalAutorizacaoNRProps,
  ModalAvisoDiretoExtraProps,
  AcordoNovoInlineProps,
} from './types';

interface PendingAvisoDiretoExtra {
  payload:          Record<string, unknown>;
  acordoAnteriorId: string;
  operadorAntId:    string;
  operadorAntNome:  string;
  operadorAntSetor?: string;
  nrLabel:          string;
  labelCampo:       string;
}

export function AcordoNovoInline({
  isPaguePlay, colSpan, onSaved, onCancel, onAcordoRemovido,
}: AcordoNovoInlineProps) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const navigate    = useNavigate();
  const { verificarConflito, loading: nrLoading, refetch: nrRefetch } = useNrRegistros();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const { tags: empresaTags }  = useEmpresaTags();
  const usuarioTemLogicaDiretoExtra = isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (typeof perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );

  const storageKey = `acordo-inline-draft::${empresa?.id ?? 'noemp'}::${perfil?.id ?? 'nouser'}::${isPaguePlay ? 'pp' : 'bp'}`;

  interface DraftAcordoInline {
    nomeCliente: string; nrCliente: string; vencimento: string; valorStr: string;
    tipo: string; parcelasStr: string; whatsapp: string; instituicao: string;
    status: string; observacoes: string; estadoSel: string; link: string;
    // Fluxo "Tabular acordo" do analítico PP: parcela sendo paga, regra 40%
    // e flag de origem (habilita nascer no meio do plano + agendar a próxima).
    parcelaAtualStr?: string; quarentaPct?: string; analitico?: string;
    // Entrada BookPlay: '1' quando ligada, e o valor das demais parcelas.
    temEntrada?: string; demaisStr?: string;
  }

  function loadDraft(): Partial<DraftAcordoInline> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<DraftAcordoInline>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  const draftInicial = loadDraft();

  const [nomeCliente,  setNomeCliente]  = useState(draftInicial.nomeCliente  ?? '');
  const [nrCliente,    setNrCliente]    = useState(draftInicial.nrCliente    ?? '');
  const [vencimento,   setVencimento]   = useState(draftInicial.vencimento   ?? '');
  const [valorStr,     setValorStr]     = useState(draftInicial.valorStr     ?? '');
  const [tipo,         setTipo]         = useState(draftInicial.tipo         ?? (isPaguePlay ? 'boleto_pix' : 'boleto'));
  const [parcelasStr,  setParcelasStr]  = useState(draftInicial.parcelasStr  ?? '1');
  const [whatsapp,     setWhatsapp]     = useState(draftInicial.whatsapp     ?? '');
  const [instituicao,  setInstituicao]  = useState(draftInicial.instituicao  ?? '');
  const [status,       setStatus]       = useState(draftInicial.status       ?? 'verificar_pendente');
  const [observacoes,  setObservacoes]  = useState(draftInicial.observacoes  ?? '');
  const [estadoSel,    setEstadoSel]    = useState(draftInicial.estadoSel    ?? '');
  const [link,         setLink]         = useState(draftInicial.link         ?? '');
  const [salvando,     setSalvando]     = useState(false);
  const [isExtra,      setIsExtra]      = useState(false);
  const [tagIds,       setTagIds]       = useState<string[]>([]);
  const [quarentaPct,  setQuarentaPct]  = useState(draftInicial.quarentaPct === '1');
  // Entrada (BookPlay): 1º pagamento com valor próprio, demais iguais entre si.
  const [temEntradaForm, setTemEntradaForm] = useState(draftInicial.temEntrada === '1');
  const [demaisStr,      setDemaisStr]      = useState(draftInicial.demaisStr ?? '');
  // Fluxo analítico PP: qual parcela está sendo paga (1 = fluxo normal)
  const [parcelaAtualStr] = useState(draftInicial.parcelaAtualStr ?? '1');
  const [veioDoAnalitico] = useState(draftInicial.analitico === '1');

  const { profissional, loading: profissionalLoading } = useProfissional(
    isPaguePlay ? instituicao : '',
    empresa?.id,
  );

  useEffect(() => {
    if (!profissional) return;
    setNomeCliente(profissional.nome);
    if (!estadoSel.trim())   setEstadoSel(profissional.estado_uf ?? '');
    if (!whatsapp.trim()) {
      const tel = formatarTelefonePP(profissional.telefone ?? '');
      if (tel) setWhatsapp(tel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profissional]);

  const draftClearedRef = useRef(false);
  const persistRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (persistRafRef.current !== null) cancelAnimationFrame(persistRafRef.current);
    persistRafRef.current = requestAnimationFrame(() => {
      try {
        if (draftClearedRef.current) { sessionStorage.removeItem(storageKey); return; }
        const draft: DraftAcordoInline = {
          nomeCliente, nrCliente, vencimento, valorStr, tipo, parcelasStr,
          whatsapp, instituicao, status, observacoes, estadoSel, link,
          parcelaAtualStr,
          quarentaPct: quarentaPct ? '1' : '',
          analitico:   veioDoAnalitico ? '1' : '',
          temEntrada:  temEntradaForm ? '1' : '',
          demaisStr,
        };
        const temConteudo = Object.values(draft).some(v => typeof v === 'string' && v.trim() !== '' && v !== '1' && v !== 'boleto' && v !== 'boleto_pix' && v !== 'verificar_pendente');
        if (temConteudo) sessionStorage.setItem(storageKey, JSON.stringify(draft));
        else sessionStorage.removeItem(storageKey);
      } catch { /* QuotaExceededError — ignora */ }
    });
    return () => {
      if (persistRafRef.current !== null) { cancelAnimationFrame(persistRafRef.current); persistRafRef.current = null; }
    };
  }, [storageKey, nomeCliente, nrCliente, vencimento, valorStr, tipo, parcelasStr, whatsapp, instituicao, status, observacoes, estadoSel, link, quarentaPct, parcelaAtualStr, veioDoAnalitico, temEntradaForm, demaisStr]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try { sessionStorage.removeItem(storageKey); } catch { /* noop */ }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [storageKey]);

  function limparDraft() {
    draftClearedRef.current = true;
    try { sessionStorage.removeItem(storageKey); } catch { /* noop */ }
  }

  function cancelar() { limparDraft(); onCancel(); }

  function buildSyncPayload(p: Record<string, unknown>): Record<string, unknown> {
    return { valor: p.valor, vencimento: p.vencimento, nome_cliente: p.nome_cliente, tipo: p.tipo, whatsapp: p.whatsapp ?? null, parcelas: p.parcelas };
  }

  function fmtValor(valor: unknown): string {
    return typeof valor === 'number' ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
  }

  function fmtData(data: unknown): string {
    if (typeof data !== 'string') return '—';
    try { return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR }); }
    catch { return String(data); }
  }

  const [conflito,    setConflito]    = useState<ConflitNR | null>(null);
  const [autorizando, setAutorizando] = useState(false);
  const [avisoDiretoExtra, setAvisoDiretoExtra] = useState<PendingAvisoDiretoExtra | null>(null);
  const [confirmandoDiretoExtra, setConfirmandoDiretoExtra] = useState(false);
  /*
   * PIX Automático / Cartão Recorrente gravado → aviso de que falta a aba.
   *
   * Guarda o acordo inserido junto: `onSaved` sai da tela, e chamá-lo antes de
   * mostrar a janela desmontaria a janela no mesmo quadro. Aqui ele espera a
   * pessoa decidir — ver `ModalAvisoPixAutomatico`.
   */
  const [avisoPixAutomatico, setAvisoPixAutomatico] =
    useState<{ nr: string; forma: string; inserido: Acordo } | null>(null);
  // NR já tabulado pelo PRÓPRIO operador → oferta de adicionar parcela
  const [acordoParaParcela, setAcordoParaParcela] = useState<Acordo | null>(null);
  const [salvandoParcela,   setSalvandoParcela]   = useState(false);

  const tipos     = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const tipoAtual = tipos.find((t) => t.value === tipo);
  const temParcelas = !!tipoAtual?.parcelado;
  const parcelas    = Math.max(1, parseInt(parcelasStr) || 1);
  /*
   * PIX Automático e Cartão Recorrente: parcela única, data nunca no passado, e
   * um aviso depois de gravar. Ver `lib/formasRecorrentes.ts`.
   *
   * Só vale na BookPlay — a PaguePlay não tem essas formas em `TIPOS_PAGUEPLAY`.
   */
  const formaRecorrente = !isPaguePlay && ehFormaRecorrente(tipo);

  // Entrada só existe na BookPlay e só faz sentido com mais de uma parcela —
  // com uma parcela só não há "demais" para ter valor diferente.
  const entradaDisponivel = !isPaguePlay && temParcelas && parcelas > 1;
  const entradaAtiva      = entradaDisponivel && temEntradaForm;
  const totalEntrada      = entradaAtiva
    ? totalComEntrada(parseCurrencyInput(valorStr), parseCurrencyInput(demaisStr), parcelas)
    : 0;

  // Trocar para um tipo sem parcelas (ou voltar para 1 parcela) desliga a
  // entrada: deixá-la ligada gravaria valor_entrada num acordo de parcela
  // única, que o CHECK da migration 20260805b recusa.
  useEffect(() => {
    if (!entradaDisponivel && temEntradaForm) setTemEntradaForm(() => false);
  }, [entradaDisponivel, temEntradaForm]);

  function handleChangeTipo(t: string) {
    setTipo(t);
    if (!tipos.find((x) => x.value === t)?.parcelado) { setParcelasStr('1'); setQuarentaPct(false); }
  }

  function validar(): string | null {
    if (!vencimento)                        return 'Data de vencimento obrigatória';
    /*
     * PIX Automático e Cartão Recorrente não se agendam para trás.
     *
     * O calendário já fecha os dias anteriores, mas a data também entra pela
     * leitura de imagem (`DropzoneImagensAcordo`), que não passa por ele. Sem
     * esta linha, um comprovante antigo lido por foto gravava a autorização com
     * vencimento no passado.
     */
    if (formaRecorrente && vencimento < getTodayISO()) {
      return `${nomeDaFormaRecorrente(tipo)} não pode ser agendado para uma data passada — `
        + 'use hoje ou uma data futura.';
    }
    // O mês do acordo é o do VENCIMENTO. Cadastrar hoje com vencimento em mês
    // fechado reescreveria um fechamento já apresentado — ver `lib/fechamentoMes`.
    if (estadoFechamentoDaData({ data: vencimento, cargo: perfil?.perfil }).bloqueado) {
      return mensagemFechamento(mesDaData(vencimento));
    }
    const v = parseCurrencyInput(valorStr);
    if (isNaN(v) || v <= 0)                 return entradaAtiva ? 'Informe o valor da entrada' : 'Informe o valor do acordo';
    if (entradaAtiva) {
      const d = parseCurrencyInput(demaisStr);
      if (isNaN(d) || d <= 0)               return 'Informe o valor das demais parcelas';
    }
    if (isPaguePlay && !instituicao.trim()) return 'Código é obrigatório';
    if (!isPaguePlay && !nrCliente.trim())  return 'NR é obrigatório';
    // CPF em qualquer campo de texto: dado pessoal entrando pela porta de trás
    // (achado em 03/08/2026 no campo de código). O gatilho
    // `trg_acordos_recusa_cpf` recusa no banco nas duas empresas; aqui o
    // operador descobre antes de perder o que digitou, e sabe ONDE está.
    const comCpf = camposComCpf({
      instituicao, nr_cliente: nrCliente, nome_cliente: nomeCliente,
      // PP guarda o link/observação dentro de `observacoes`, junto do estado.
      observacoes: isPaguePlay ? link : observacoes,
    });
    if (comCpf.length) return `${ERRO_CPF_NO_CODIGO} Encontrado em: ${comCpf.join(', ')}.`;
    // O gatilho `trg_acordos_exige_estado` recusa no banco de qualquer forma
    // (migration 20260802c); aqui o operador descobre antes de perder o que
    // digitou, e com uma frase que diz o que fazer.
    if (isPaguePlay && !estadoSel.trim())   return 'Selecione o estado (UF) do cliente';
    return null;
  }

  async function executarSalvar(payload: Record<string, unknown>): Promise<Acordo | null> {
    const { data: inserido, error } = await supabase
      .from('acordos')
      .insert(payload as never)
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .single();

    if (error) {
      const isColErr = String(error.code) === '42703' || String(error.code) === '400' ||
        error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('unknown');
      if (isColErr) {
        // Tier 1: strip only usou_quarenta_pct, preserving valor_total.
        // `valor_entrada` sai junto: é da migration 20260805b, e sem ela o
        // acordo ainda salva — perde só a distinção entre entrada e demais,
        // em vez de o operador perder tudo o que digitou.
        const { usou_quarenta_pct: _qp, valor_entrada: _ve, ...payloadSemQP } = payload;
        const { data: inseridoT1, error: e1 } = await supabase
          .from('acordos').insert(payloadSemQP as never).select('*, perfis(id, nome, email, perfil, setor_id)').single();
        if (!e1) return inseridoT1 as Acordo;
        // Tier 2: strip all newer columns (DB too old — no valor_total, acordo_grupo_id, numero_parcela)
        const { acordo_grupo_id: _g, numero_parcela: _n, valor_total: _vt, ...payloadMin } = payloadSemQP;
        const { data: inseridoMin, error: e2 } = await supabase
          .from('acordos').insert(payloadMin as never).select('*, perfis(id, nome, email, perfil, setor_id)').single();
        if (e2) { toast.error(`Erro ao salvar: ${e2.message}`); return null; }
        return inseridoMin as Acordo;
      }
      toast.error(`Erro ao salvar: ${error.message}`);
      return null;
    }
    return inserido as Acordo;
  }

  async function salvar() {
    const erro = validar();
    if (erro) { toast.error(erro); return; }
    if (!perfil?.id)  { toast.error('Usuário não autenticado'); return; }
    if (!empresa?.id) { toast.error('Empresa não identificada'); return; }

    setSalvando(true);
    try {
      const valorNum       = parseCurrencyInput(valorStr);
      const tipoParaSalvar = tipo === 'boleto_pix' ? 'boleto' : tipo;
      const grupoId        = crypto.randomUUID();

      const obsFinal = isPaguePlay
        ? (buildObservacoesComEstado(estadoSel || '', link.trim() || '') || null)
        : (observacoes.trim() || null);

      const usaValorTotal       = isPaguePlay && temParcelas && parcelas > 1;
      const quarentaPctEfetivo  = quarentaPct && parcelas > 2;
      // Fluxo analítico PP: o acordo pode nascer no meio do plano (ex.: 4ª de 12)
      const parcelaInicial = usaValorTotal && veioDoAnalitico
        ? Math.min(Math.max(1, parseInt(parcelaAtualStr) || 1), parcelas)
        : 1;
      const valorParcelaInicial = usaValorTotal
        ? calcularParcelas(valorNum, parcelas, quarentaPctEfetivo)[parcelaInicial - 1]
        : valorNum;

      // Entrada (BookPlay): `valorStr` é a ENTRADA e `demaisStr` o valor de
      // cada uma das outras. Grava a entrada em `valor_entrada` e a soma em
      // `valor_total`; o valor das demais é derivado de volta na hora de
      // reagendar, por `valorDemaisParcelas`. Ver migration 20260805b.
      const demaisNum = entradaAtiva ? parseCurrencyInput(demaisStr) : 0;

      const payload: Record<string, unknown> = {
        nome_cliente:    nomeCliente.trim() || '',
        nr_cliente:      nrCliente.trim()   || '',
        vencimento,
        valor:           valorParcelaInicial,
        valor_total:      entradaAtiva ? totalComEntrada(valorNum, demaisNum, parcelas)
                        : usaValorTotal ? valorNum : null,
        ...(entradaAtiva ? { valor_entrada: valorNum } : {}),
        usou_quarenta_pct: usaValorTotal ? quarentaPctEfetivo : false,
        tipo:             tipoParaSalvar,
        parcelas:        temParcelas ? parcelas : 1,
        whatsapp:        isPaguePlay ? formatarTelefonePP(whatsapp) : (whatsapp.trim() || null),
        instituicao:     instituicao.trim() || null,
        status,
        // Recebimento é atribuído ao vencimento (acordo já nasce pago no analítico)
        ...(status === 'pago' ? { data_pagamento: vencimento } : {}),
        observacoes:     obsFinal,
        operador_id:     perfil.id,
        empresa_id:      empresa.id,
        data_cadastro:   getTodayISO(),
        acordo_grupo_id: grupoId,
        numero_parcela:  parcelaInicial,
        ...(isExtra ? { tipo_vinculo: 'extra' } : {}),
        tag_ids: tagIds.length > 0 ? tagIds : null,
      };

      // Fluxo analítico: parcela paga agora → próxima já nasce agendada para
      // o último dia do mês seguinte (as anteriores NÃO são criadas — o
      // detalhe as exibe como pagas sem inflar o recebido).
      const agendarProxima = veioDoAnalitico && usaValorTotal
        && status === 'pago' && parcelaInicial < parcelas;
      async function criarProximaParcela(base: Acordo) {
        const todas = calcularParcelas(valorNum, parcelas, quarentaPctEfetivo);
        const { error: errProx } = await supabase.from('acordos').insert({
          nome_cliente:          base.nome_cliente,
          nr_cliente:            base.nr_cliente,
          instituicao:           base.instituicao,
          whatsapp:              base.whatsapp,
          observacoes:           base.observacoes,
          // A UF viaja explicitamente: o prefixo [ESTADO:XX] dentro de
          // observacoes some na fase 2 da migration 20260506, e sem ela a
          // proxima parcela nasceria sem estado (recusada pela 20260802c).
          estado_uf:             base.estado_uf ?? null,
          operador_id:           base.operador_id,
          empresa_id:            base.empresa_id,
          setor_id:              base.setor_id ?? null,
          data_cadastro:         getTodayISO(),
          acordo_grupo_id:       base.acordo_grupo_id ?? grupoId,
          tipo:                  base.tipo,
          parcelas:              base.parcelas,
          valor_total:           base.valor_total ?? (usaValorTotal ? valorNum : null),
          usou_quarenta_pct:     quarentaPctEfetivo,
          tipo_vinculo:          base.tipo_vinculo,
          vinculo_operador_id:   base.vinculo_operador_id,
          vinculo_operador_nome: base.vinculo_operador_nome,
          numero_parcela:        parcelaInicial + 1,
          vencimento:            ultimoDiaProxMes(vencimento),
          valor:                 todas[parcelaInicial] ?? todas[todas.length - 1],
          status:                'verificar_pendente',
        });
        if (errProx) console.warn('[analitico] falha ao agendar próxima parcela:', errProx.message);
      }

      const campoCampo: 'nr_cliente' | 'instituicao' = isPaguePlay ? 'instituicao' : 'nr_cliente';
      const nrParaVerificar = isPaguePlay ? instituicao.trim() : nrCliente.trim();
      const label           = isPaguePlay ? 'Código' : 'NR';

      if (nrParaVerificar && empresa?.id) {
        const conflitoDb    = await verificarNrRegistro(nrParaVerificar, empresa.id, campoCampo);
        const conflitoFinal = conflitoDb ?? verificarConflito(nrParaVerificar, campoCampo);

        if (conflitoFinal) {
          if (conflitoFinal.operadorId === perfil.id) {
            // BookPlay: NR do próprio operador abre a oferta de adicionar os
            // dados preenchidos como nova parcela do acordo existente
            // (ex.: entrada no Pix + boleto do restante).
            // PaguePlay mantém o bloqueio original.
            if (!isPaguePlay) {
              const { data: acordoMeu } = await supabase
                .from('acordos')
                .select('*, perfis(id, nome, email, perfil, setor_id)')
                .eq('id', conflitoFinal.acordoId)
                .maybeSingle();
              if (acordoMeu) {
                setAcordoParaParcela(acordoMeu as Acordo);
                return;
              }
            }
            toast.error(`${label} "${nrParaVerificar}" já existe na sua lista de acordos ativos.`);
            return;
          }

          // ── Dono desligado: assume direto, sem autorização de líder ─────
          // Antes das regras de Direto/Extra: acordo de quem saiu da empresa
          // não vira vínculo de ninguém, muda de dono.
          if (await operadorEstaDesligado(conflitoFinal.operadorId)) {
            const r = await transferirAcordoDeDesligado({
              acordoAnteriorId: conflitoFinal.acordoId,
              empresaId:        empresa.id,
              operadorAntId:    conflitoFinal.operadorId,
              operadorAntNome:  conflitoFinal.operadorNome,
              novoOperadorId:   perfil.id,
              novoOperadorNome: perfil.nome ?? 'Operador',
              labelNr:          label,
              valorNr:          nrParaVerificar,
            });
            if (!r.ok) {
              toast.error(`Erro ao liberar o acordo do operador desligado: ${r.erro}`);
              return;
            }
            onAcordoRemovido?.(conflitoFinal.acordoId);
            const inserido = await executarSalvar(payload);
            if (!inserido) return;
            limparDraft();
            onSaved(inserido);
            toast.success(
              `${label} "${nrParaVerificar}" reatribuído: ${conflitoFinal.operadorNome} está desligado.`,
            );
            return;
          }

          const { data: acordoDireto } = await supabase
            .from('acordos').select('id, tipo_vinculo, vinculo_operador_id, vinculo_operador_nome')
            .eq('id', conflitoFinal.acordoId).maybeSingle();
          const jaTemExtra = Boolean(acordoDireto?.vinculo_operador_id);

          if (jaTemExtra) {
            const { data: acordoExtraAtual } = await supabase
              .from('acordos').select('id, operador_id, vinculo_operador_nome')
              .eq('empresa_id', empresa.id).eq(campoCampo, nrParaVerificar)
              .eq('tipo_vinculo', 'extra').maybeSingle();
            setConflito({
              acordoId: conflitoFinal.acordoId, operadorId: conflitoFinal.operadorId,
              operadorNome: conflitoFinal.operadorNome, payload, modo: 'troca_extra',
              extraAtualId: acordoExtraAtual?.id ?? null,
              extraAtualOpId: acordoExtraAtual?.operador_id ?? acordoDireto?.vinculo_operador_id ?? null,
              extraAtualOpNome: acordoDireto?.vinculo_operador_nome ?? null,
            });
            return;
          }

          const euTemLogica = isAtivoParaUsuario(
            perfil.id, perfil.setor_id ?? null,
            (perfil as Perfil & { equipe_id?: string | null }).equipe_id ?? null,
          );

          let opConflitoData: { id: string; nome: string; setor_id: string | null; equipe_id?: string | null; setores?: { nome?: string } | null } | null = null;
          {
            const r = await supabase.from('perfis').select('id, nome, setor_id, equipe_id, setores(nome)').eq('id', conflitoFinal.operadorId).maybeSingle();
            opConflitoData = (r.data as typeof opConflitoData) ?? null;
            if (!opConflitoData) {
              const r2 = await supabase.from('perfis').select('id, nome, setor_id, equipe_id').eq('id', conflitoFinal.operadorId).maybeSingle();
              opConflitoData = (r2.data as typeof opConflitoData) ?? null;
            }
          }

          const donoTemLogica = await fetchIsDiretoExtraAtivo({ userId: conflitoFinal.operadorId, empresaId: empresa.id });

          // CASO A: EU tem lógica, DONO não → EU = EXTRA
          if (euTemLogica && !donoTemLogica) {
            const payloadExtra = { ...payload, tipo_vinculo: 'extra', vinculo_operador_id: conflitoFinal.operadorId, vinculo_operador_nome: conflitoFinal.operadorNome };
            const inseridoExtra = await executarSalvar(payloadExtra);
            if (inseridoExtra) {
              const rpcErr = await vincularExtraAoDireto({
                diretoId: conflitoFinal.acordoId,
                extraOperadorId: perfil.id,
                extraOperadorNome: perfil.nome ?? 'Operador',
                valor: payload.valor as number,
                vencimento: payload.vencimento as string,
                nomeCliente: (payload.nome_cliente as string) ?? '',
                tipo: (payload.tipo as string) ?? 'boleto',
                nrCliente: (payload.nr_cliente as string | null) ?? '',
                instituicao: (payload.instituicao as string | null) ?? '',
                whatsapp: (payload.whatsapp as string | null) ?? null,
                parcelas: (payload.parcelas as number) ?? 1,
              });
              if (rpcErr) {
                // Nunca contorne a autorização do RPC com escrita direta. Além
                // de esconder falhas de RLS, isso podia deixar apenas metade do
                // par Direto/Extra gravada.
                await supabase.from('acordos').delete().eq('id', inseridoExtra.id);
                toast.error(`Erro ao vincular o acordo: ${rpcErr.message}`);
                return;
              }
              await criarNotificacao({
                usuario_id: conflitoFinal.operadorId,
                titulo: 'Novo vínculo EXTRA no seu acordo',
                mensagem: `O operador ${perfil.nome ?? 'outro operador'} tabulou o ${label} "${nrParaVerificar}" como EXTRA vinculado ao seu acordo. Seu acordo permanece como DIRETO.\nDados atualizados → Valor: ${fmtValor(payload.valor)} | Vencimento: ${fmtData(payload.vencimento)} | Cliente: ${(payload.nome_cliente as string) || '—'}.`,
                empresa_id: empresa.id,
              });
              limparDraft();
              onSaved(inseridoExtra);
              toast.success(`Acordo tabulado como EXTRA (vínculo com ${conflitoFinal.operadorNome}).`);
            }
            return;
          }

          // CASO B: EU não tem lógica, DONO tem → aviso
          if (!euTemLogica && donoTemLogica) {
            setAvisoDiretoExtra({
              payload, acordoAnteriorId: conflitoFinal.acordoId,
              operadorAntId: conflitoFinal.operadorId, operadorAntNome: conflitoFinal.operadorNome,
              operadorAntSetor: opConflitoData?.setores?.nome,
              nrLabel: nrParaVerificar, labelCampo: label,
            });
            return;
          }

          // CASO C/D: autorização completa
          setConflito({ acordoId: conflitoFinal.acordoId, operadorId: conflitoFinal.operadorId, operadorNome: conflitoFinal.operadorNome, payload, modo: 'transferencia_completa' });
          return;
        }
      }
      void nrLoading; void nrRefetch;

      const inserido = await executarSalvar(payload);
      if (inserido) {
        if (agendarProxima) await criarProximaParcela(inserido);
        limparDraft();
        /*
         * Recorrente: a janela primeiro, `onSaved` depois.
         *
         * `onSaved` navega para fora do formulário. Chamando-o aqui, o aviso
         * de que a comissão ainda depende da aba Pix Automático apareceria e
         * sumiria junto com a tela.
         */
        if (formaRecorrente) {
          setAvisoPixAutomatico({ nr: nrCliente.trim(), forma: tipo, inserido });
          return;
        }
        onSaved(inserido);
        toast.success(
          agendarProxima
            ? `Parcela ${parcelaInicial}/${parcelas} registrada como paga. Próxima agendada para ${format(parseISO(ultimoDiaProxMes(vencimento)), 'dd/MM/yyyy', { locale: ptBR })}.`
            : entradaAtiva
              ? `Acordo criado! Entrada de ${formatBRL(valorNum)} + ${parcelas - 1}× ${formatBRL(demaisNum)}.`
              : parcelas > 1 ? `Acordo criado! ${parcelas} parcelas negociadas.` : 'Acordo criado com sucesso!',
        );
      }
    } catch (e) {
      // Os dois erros do fluxo de NR chegam aqui e precisam de frase própria:
      // a verificação que não pôde ser feita (falha FECHADO, nada foi salvo) e
      // a recusa do banco quando outro operador registrou o NR no meio do
      // caminho (migration 20260809d). Sem isto o operador via um erro cru de
      // Postgres e não sabia que podia simplesmente recarregar.
      const doNr = mensagemErroNr(e, isPaguePlay ? 'Código' : 'NR');
      toast.error(doNr ?? (e instanceof Error ? e.message : 'Erro inesperado ao salvar o acordo.'), { duration: 7000 });
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Solicita autorização em vez de pedir a senha do líder.
   *
   * ## O que sai daqui
   *
   * Um pedido em `autorizacoes_pedidos`, carregando o PAYLOAD do acordo. Quem
   * grava é o servidor, na aprovação — o operador não fica esperando de janela
   * aberta, e por isso a janela fecha assim que o pedido sai.
   *
   * ## Por que o payload viaja inteiro
   *
   * O líder pode aprovar minutos depois, com o operador em outra tela ou com o
   * navegador fechado. Se a criação dependesse desta tela estar viva, aprovar
   * não faria nada — e o operador receberia "autorizado" sem acordo nenhum.
   *
   * `operador_id` e `empresa_id` do payload são reescritos no servidor com os do
   * pedido: payload sai do navegador, e navegador não decide de quem é o acordo.
   */
  async function solicitarAutorizacaoConflito() {
    if (!conflito || !perfil?.id || !empresa?.id) return;

    setAutorizando(true);
    try {
      const labelNR    = isPaguePlay ? 'Código' : 'NR';
      const nrLogLabel = ((isPaguePlay ? conflito.payload.instituicao : conflito.payload.nr_cliente) as string | undefined)?.trim() || '—';

      const res = await solicitarAutorizacao({
        modo:     conflito.modo,
        nrLabel:  labelNR,
        nrValor:  nrLogLabel,
        payload:  conflito.payload,
        // O resumo é o que a gaveta do líder mostra sem abrir o acordo. Sai do
        // mesmo payload: uma segunda montagem divergiria do que será gravado.
        resumo: {
          cliente:    (conflito.payload.nome_cliente as string | undefined) ?? null,
          valor:      Number(conflito.payload.valor) || null,
          vencimento: (conflito.payload.vencimento as string | undefined) ?? null,
          parcelas:   Number(conflito.payload.parcelas) || null,
          tipo:       (conflito.payload.tipo as string | undefined) ?? null,
        },
        acordoAlvoId:     conflito.acordoId,
        donoId:           conflito.operadorId,
        donoNome:         conflito.operadorNome,
        extraAtualId:     conflito.extraAtualId ?? null,
        extraAtualOpId:   conflito.extraAtualOpId ?? null,
        extraAtualOpNome: conflito.extraAtualOpNome ?? null,
      });

      // `'erro' in res` e não `!res.ok`: com `strict: false` o TS não estreita
      // união por discriminante booleano. Mesmo idioma de parcelas.service.
      if ('erro' in res) { toast.error(res.erro); return; }

      // A janela fecha e o rascunho fica: se for recusado, o operador reabre o
      // formulário com o que digitou em vez de refazer tudo.
      setConflito(null);
      toast.info(
        res.repetido
          ? 'Você já tem um pedido em análise para este ' + labelNR + '.'
          : 'Pedido enviado. Está sendo avaliado.',
        {
          description: 'Os líderes do seu setor foram avisados. Você recebe a '
            + 'resposta por notificação — pode continuar trabalhando.',
          duration: 8000,
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado ao solicitar autorização');
    } finally {
      setAutorizando(false);
    }
  }

  function cancelarConflito() { setConflito(null); }

  async function confirmarDiretoExtra() {
    if (!avisoDiretoExtra || !perfil?.id || !empresa?.id) return;
    setConfirmandoDiretoExtra(true);
    try {
      const { payload, acordoAnteriorId, operadorAntId, operadorAntNome, nrLabel, labelCampo } = avisoDiretoExtra;

      const logicaAindaAtiva = await fetchIsDiretoExtraAtivo({ userId: operadorAntId, empresaId: empresa.id });
      if (!logicaAindaAtiva) {
        toast.error('A lógica Direto/Extra do operador foi desativada. Atualize e tente novamente.');
        return;
      }

      const rpcErr = await converterParaExtra({
        acordoId: acordoAnteriorId,
        novoDiretoOperadorId: perfil.id,
        novoDiretoOperadorNome: perfil.nome ?? 'Operador',
        valor: payload.valor as number,
        vencimento: payload.vencimento as string,
        nomeCliente: (payload.nome_cliente as string) ?? '',
        tipo: (payload.tipo as string) ?? 'boleto',
        nrCliente: (payload.nr_cliente as string | null) ?? '',
        instituicao: (payload.instituicao as string | null) ?? '',
        whatsapp: (payload.whatsapp as string | null) ?? null,
        parcelas: (payload.parcelas as number) ?? 1,
      });
      if (rpcErr) {
        toast.error(`Erro ao converter acordo: ${rpcErr.message}`);
        return;
      }

      const payloadDireto = { ...payload, tipo_vinculo: 'direto', vinculo_operador_id: operadorAntId, vinculo_operador_nome: operadorAntNome };
      const inserido = await executarSalvar(payloadDireto);
      if (!inserido) return;

      await criarNotificacao({
        usuario_id: operadorAntId,
        titulo: 'Seu acordo foi convertido em EXTRA',
        mensagem: `O ${labelCampo} "${nrLabel}" foi tabulado como DIRETO pelo operador ${perfil.nome ?? 'outro operador'}. Seu acordo continua ativo como EXTRA. Dados sincronizados — Valor: ${fmtValor(payload.valor)}, Vencimento: ${fmtData(payload.vencimento)}.`,
        empresa_id: empresa.id,
      });

      setAvisoDiretoExtra(null);
      limparDraft();
      onSaved(inserido);
      toast.success(`Acordo tabulado como DIRETO. ${operadorAntNome} foi notificado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado ao tabular');
    } finally {
      setConfirmandoDiretoExtra(false);
    }
  }

  function cancelarAvisoDiretoExtra() { setAvisoDiretoExtra(null); }

  // ── Adicionar parcela ao acordo existente (NR do próprio operador) ────────
  async function confirmarAdicionarParcela(inputs: NovaParcelaInput[]) {
    if (!acordoParaParcela) return;
    setSalvandoParcela(true);
    try {
      const r = await adicionarParcelasAoGrupo(acordoParaParcela, inputs, { isPaguePlay });
      // `'erro' in r`, e não `!r.ok`: o tsconfig roda com `strict: false` e o
      // TypeScript não estreita união por discriminante booleano.
      if ('erro' in r) { toast.error(r.erro); return; }
      const novas = r.novasParcelas;
      limparDraft();
      setAcordoParaParcela(null);
      // A tela de acordos recebe a PRIMEIRA: é a que o operador acabou de
      // tabular; as demais aparecem ao abrir o detalhe do grupo.
      if (novas[0]) onSaved(novas[0]);
      toast.success(
        novas.length === 1
          ? `Parcela ${novas[0]?.numero_parcela ?? r.novoTotal}/${r.novoTotal} adicionada ao acordo existente!`
          : `${novas.length} parcelas adicionadas ao acordo existente (total ${r.novoTotal}).`,
      );
    } finally {
      setSalvandoParcela(false);
    }
  }

  /**
   * «Registrar no Pix Automático» — abre a aba com o NR já digitado.
   *
   * O valor fica em branco de propósito: na lista de acordos ele é o valor da
   * PARCELA, e lá é o total do acordo. Herdar um pelo outro gravaria comissão
   * sobre o número errado, que é pior que um campo vazio.
   */
  function irParaPixAutomatico() {
    const nr = avisoPixAutomatico?.nr ?? '';
    setAvisoPixAutomatico(null);
    navigate(`${ROUTE_PATHS.ACORDOS}?tab=pix&novo_nr=${encodeURIComponent(nr)}`);
  }

  /** «Agora não» — segue o caminho normal de quem acabou de salvar. */
  function dispensarAvisoPixAutomatico() {
    const inserido = avisoPixAutomatico?.inserido;
    setAvisoPixAutomatico(null);
    if (inserido) onSaved(inserido);
  }

  const formState: SharedFormState = {
    colSpan, isPaguePlay,
    salvando, salvar, cancelar,
    nomeCliente, setNomeCliente,
    nrCliente, setNrCliente,
    vencimento, setVencimento,
    valorStr, setValorStr,
    tipo, handleChangeTipo,
    parcelasStr, setParcelasStr,
    whatsapp, setWhatsapp,
    instituicao, setInstituicao,
    status, setStatus,
    observacoes, setObservacoes,
    estadoSel, setEstadoSel,
    link, setLink,
    // Entrada só chega ligada ao formulário quando é aplicável (BookPlay,
    // tipo parcelado, mais de uma parcela) — ver `entradaDisponivel`.
    temEntradaForm: entradaAtiva,
    setTemEntradaForm: (fn) => setTemEntradaForm(fn),
    demaisStr, setDemaisStr,
    totalEntrada,
    temParcelas, parcelas,
    parcelaInicial: Math.min(Math.max(1, parseInt(parcelaAtualStr) || 1), parcelas),
    veioDoAnalitico,
    isExtra, setIsExtra: (fn) => setIsExtra(fn),
    usuarioTemLogicaDiretoExtra,
    tagIds, setTagIds,
    quarentaPct, setQuarentaPct: (fn) => setQuarentaPct(fn),
    empresaTags,
    conflito,
    autorizando, solicitarAutorizacaoConflito, cancelarConflito,
    avisoDiretoExtra: avisoDiretoExtra
      ? { operadorAntNome: avisoDiretoExtra.operadorAntNome, operadorAntSetor: avisoDiretoExtra.operadorAntSetor, nrLabel: avisoDiretoExtra.nrLabel, labelCampo: avisoDiretoExtra.labelCampo }
      : null,
    confirmandoDiretoExtra, confirmarDiretoExtra, cancelarAvisoDiretoExtra,
    profissionalLoading,
    profissionalEncontrado: !!profissional,
    formaRecorrente,
    avisoPixAutomatico: avisoPixAutomatico
      ? { nr: avisoPixAutomatico.nr, forma: avisoPixAutomatico.forma }
      : null,
    irParaPixAutomatico,
    dispensarAvisoPixAutomatico,
  };

  const labelCampoNr = isPaguePlay ? 'Código' : 'NR';
  const valorCampoNr = isPaguePlay ? instituicao.trim() : nrCliente.trim();

  return (
    <>
      {isPaguePlay ? <FormPP state={formState} /> : <FormBP state={formState} />}
      <ModalAdicionarParcela
        aberto={!!acordoParaParcela}
        acordo={acordoParaParcela}
        isPaguePlay={isPaguePlay}
        inicial={{
          vencimento,
          valor:  parseCurrencyInput(valorStr),
          tipo:   tipo === 'boleto_pix' ? 'boleto' : tipo,
          status,
        }}
        descricao={`O ${labelCampoNr} "${valorCampoNr}" já está tabulado por você. Revise os dados abaixo para adicioná-los como nova parcela do acordo existente.`}
        salvando={salvandoParcela}
        onConfirm={confirmarAdicionarParcela}
        onClose={() => setAcordoParaParcela(null)}
      />
    </>
  );
}

export default AcordoNovoInline;
