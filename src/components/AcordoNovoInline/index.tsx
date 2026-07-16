/**
 * AcordoNovoInline — v4 (nr_registros realtime)
 *
 * NR único gerenciado via tabela `nr_registros` (trigger trg_sync_nr_registros v2).
 * Exports: AcordoNovoInline, ModalAutorizacaoNR, ModalAvisoDiretoExtra,
 *          ConflitNR, ModalAutorizacaoNRProps, ModalAvisoDiretoExtraProps, AcordoNovoInlineProps
 */

import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase, type Acordo, type Perfil } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import {
  buildObservacoesComEstado, isPerfilAdminOuLider, formatarTelefonePP,
  parseCurrencyInput,
} from '@/lib/index';
import { calcularParcelas } from '@/lib/money';
import { ultimoDiaProxMes } from '@/components/ModalReagendar';
import { celebrarPetAcordoPago } from '@/components/pet/petEvents';
import { criarNotificacao }    from '@/services/notificacoes.service';
import { enviarParaLixeira }   from '@/services/lixeira.service';
import { resolverEmailDeLogin } from '@/services/autorizacao_lider.service';
import { useNrRegistros }           from '@/hooks/useNrRegistros';
import { verificarNrRegistro }      from '@/services/nr_registros.service';
import { useDiretoExtraConfig }     from '@/hooks/useDiretoExtraConfig';
import { fetchIsDiretoExtraAtivo }  from '@/services/direto_extra.service';
import { useEmpresaTags }           from '@/hooks/useEmpresaTags';
import { useProfissional }          from '@/hooks/useProfissional';
import { ModalAdicionarParcela }    from '@/components/ModalAdicionarParcela';
import { adicionarParcelaAoGrupo, type NovaParcelaInput } from '@/services/parcelas.service';
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
        };
        const temConteudo = Object.values(draft).some(v => typeof v === 'string' && v.trim() !== '' && v !== '1' && v !== 'boleto' && v !== 'boleto_pix' && v !== 'verificar_pendente');
        if (temConteudo) sessionStorage.setItem(storageKey, JSON.stringify(draft));
        else sessionStorage.removeItem(storageKey);
      } catch { /* QuotaExceededError — ignora */ }
    });
    return () => {
      if (persistRafRef.current !== null) { cancelAnimationFrame(persistRafRef.current); persistRafRef.current = null; }
    };
  }, [storageKey, nomeCliente, nrCliente, vencimento, valorStr, tipo, parcelasStr, whatsapp, instituicao, status, observacoes, estadoSel, link, quarentaPct, parcelaAtualStr, veioDoAnalitico]);

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
  const [liderEmail,  setLiderEmail]  = useState('');
  const [liderSenha,  setLiderSenha]  = useState('');
  const [autorizando, setAutorizando] = useState(false);
  const [avisoDiretoExtra, setAvisoDiretoExtra] = useState<PendingAvisoDiretoExtra | null>(null);
  const [confirmandoDiretoExtra, setConfirmandoDiretoExtra] = useState(false);
  // NR já tabulado pelo PRÓPRIO operador → oferta de adicionar parcela
  const [acordoParaParcela, setAcordoParaParcela] = useState<Acordo | null>(null);
  const [salvandoParcela,   setSalvandoParcela]   = useState(false);

  const tipos     = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const tipoAtual = tipos.find((t) => t.value === tipo);
  const temParcelas = !!tipoAtual?.parcelado;
  const parcelas    = Math.max(1, parseInt(parcelasStr) || 1);

  function handleChangeTipo(t: string) {
    setTipo(t);
    if (!tipos.find((x) => x.value === t)?.parcelado) { setParcelasStr('1'); setQuarentaPct(false); }
  }

  function validar(): string | null {
    if (!vencimento)                        return 'Data de vencimento obrigatória';
    const v = parseCurrencyInput(valorStr);
    if (isNaN(v) || v <= 0)                 return 'Informe o valor do acordo';
    if (isPaguePlay && !instituicao.trim()) return 'Código é obrigatório';
    if (!isPaguePlay && !nrCliente.trim())  return 'NR é obrigatório';
    return null;
  }

  async function executarSalvar(payload: Record<string, unknown>): Promise<Acordo | null> {
    const { data: inserido, error } = await supabase
      .from('acordos')
      .insert(payload)
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .single();

    if (error) {
      const isColErr = String(error.code) === '42703' || String(error.code) === '400' ||
        error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('unknown');
      if (isColErr) {
        // Tier 1: strip only usou_quarenta_pct, preserving valor_total
        const { usou_quarenta_pct: _qp, ...payloadSemQP } = payload;
        const { data: inseridoT1, error: e1 } = await supabase
          .from('acordos').insert(payloadSemQP).select('*, perfis(id, nome, email, perfil, setor_id)').single();
        if (!e1) return inseridoT1 as Acordo;
        // Tier 2: strip all newer columns (DB too old — no valor_total, acordo_grupo_id, numero_parcela)
        const { acordo_grupo_id: _g, numero_parcela: _n, valor_total: _vt, ...payloadMin } = payloadSemQP;
        const { data: inseridoMin, error: e2 } = await supabase
          .from('acordos').insert(payloadMin).select('*, perfis(id, nome, email, perfil, setor_id)').single();
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

      const payload: Record<string, unknown> = {
        nome_cliente:    nomeCliente.trim() || '',
        nr_cliente:      nrCliente.trim()   || '',
        vencimento,
        valor:           valorParcelaInicial,
        valor_total:      usaValorTotal ? valorNum : null,
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
        data_cadastro:   new Date().toISOString().split('T')[0],
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
          operador_id:           base.operador_id,
          empresa_id:            base.empresa_id,
          setor_id:              base.setor_id ?? null,
          data_cadastro:         new Date().toISOString().split('T')[0],
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
              const { error: rpcErr } = await supabase.rpc('fn_vincular_extra_ao_direto', {
                p_direto_id: conflitoFinal.acordoId, p_extra_op_id: perfil.id, p_extra_op_nome: perfil.nome ?? 'Operador',
                p_valor: payload.valor as number, p_vencimento: payload.vencimento as string,
                p_nome_cliente: (payload.nome_cliente as string) ?? '', p_tipo: (payload.tipo as string) ?? 'boleto',
                p_whatsapp: (payload.whatsapp as string | null) ?? null, p_parcelas: (payload.parcelas as number) ?? 1,
              });
              if (rpcErr) {
                console.warn('[Caso A] RPC falhou, tentando update direto:', rpcErr.message);
                await supabase.from('acordos').update({ ...buildSyncPayload(payload), vinculo_operador_id: perfil.id, vinculo_operador_nome: perfil.nome ?? 'Operador' }).eq('id', conflitoFinal.acordoId);
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
        if (payload.status === 'pago') celebrarPetAcordoPago();
        if (agendarProxima) await criarProximaParcela(inserido);
        limparDraft();
        onSaved(inserido);
        toast.success(
          agendarProxima
            ? `Parcela ${parcelaInicial}/${parcelas} registrada como paga. Próxima agendada para ${format(parseISO(ultimoDiaProxMes(vencimento)), 'dd/MM/yyyy', { locale: ptBR })}.`
            : parcelas > 1 ? `Acordo criado! ${parcelas} parcelas negociadas.` : 'Acordo criado com sucesso!',
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  async function autorizarTransferencia() {
    if (!conflito || !perfil?.id || !empresa?.id) return;
    if (!liderEmail.trim() || !liderSenha.trim()) { toast.error('Informe o e-mail e a senha do líder'); return; }

    setAutorizando(true);
    try {
      const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      // Aceita usuário OU e-mail: o líder digita o próprio usuário (como no
      // login) e o grant_type=password do GoTrue só aceita e-mail.
      const liderLogin = await resolverEmailDeLogin(liderEmail);

      const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseAnon },
        body: JSON.stringify({ email: liderLogin, password: liderSenha }),
      });

      if (!authRes.ok) {
        const s = authRes.status;
        toast.error(s === 400 || s === 401 || s === 422 ? 'Credenciais do líder inválidas' : `Erro ao autenticar líder (${s})`);
        return;
      }

      const authData   = await authRes.json() as { user?: { id: string }; access_token?: string };
      const liderUid   = authData.user?.id;
      const liderToken = authData.access_token;
      if (!liderUid || !liderToken) { toast.error('Credenciais do líder inválidas'); return; }

      const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`, {
        headers: { apikey: supabaseAnon, Authorization: `Bearer ${liderToken}` },
      });
      if (!perfilRes.ok) { toast.error('Erro ao verificar perfil do líder'); return; }

      const perfilArr   = await perfilRes.json() as Array<{ perfil: string; nome: string }>;
      const liderPerfil = Array.isArray(perfilArr) && perfilArr.length > 0 ? perfilArr[0] : null;
      if (!liderPerfil || !isPerfilAdminOuLider(liderPerfil.perfil)) {
        toast.error('O usuário informado não tem permissão de líder/elite/gerência/administrador');
        return;
      }

      const labelNR    = isPaguePlay ? 'Código' : 'NR';
      const nrLogLabel = ((isPaguePlay ? conflito.payload.instituicao : conflito.payload.nr_cliente) as string | undefined)?.trim() || '—';
      const nomeNovoOp = perfil.nome ?? 'Operador';

      // MODO: troca_extra
      if (conflito.modo === 'troca_extra') {
        const { extraAtualId, extraAtualOpId, extraAtualOpNome } = conflito;

        const { data: acordoExtraAnt } = await supabase
          .from('acordos').select('id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao')
          .eq('id', extraAtualId!).maybeSingle();

        const valorExtFmt = acordoExtraAnt?.valor != null ? `R$ ${Number(acordoExtraAnt.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
        const vencExtFmt  = acordoExtraAnt?.vencimento ? format(parseISO(acordoExtraAnt.vencimento), 'dd/MM/yyyy', { locale: ptBR }) : '—';

        if (acordoExtraAnt) {
          await enviarParaLixeira({
            acordo: acordoExtraAnt as Acordo, motivo: 'troca_extra',
            operadorNome: extraAtualOpNome ?? '—',
            autorizadoPorId: liderUid, autorizadoPorNome: liderPerfil.nome,
            transferidoParaId: perfil.id, transferidoParaNome: nomeNovoOp,
          });
        }

        const { error: errDelExt } = await supabase.from('acordos').delete().eq('id', extraAtualId!);
        if (errDelExt) { toast.error(`Erro ao remover vínculo extra anterior: ${errDelExt.message}`); return; }
        onAcordoRemovido?.(extraAtualId!);

        const payloadExtra = { ...conflito.payload, tipo_vinculo: 'extra', vinculo_operador_id: conflito.operadorId, vinculo_operador_nome: conflito.operadorNome };
        const inserido = await executarSalvar(payloadExtra);
        if (!inserido) return;

        await supabase.from('acordos').update({ ...buildSyncPayload(conflito.payload), vinculo_operador_id: perfil.id, vinculo_operador_nome: nomeNovoOp }).eq('id', conflito.acordoId);

        await supabase.from('logs_sistema').insert({
          usuario_id: perfil.id, acao: 'troca_extra', tabela: 'acordos', registro_id: extraAtualId,
          empresa_id: empresa.id,
          detalhes: {
            nr: nrLogLabel, aprovado_por: liderPerfil.nome, aprovado_por_id: liderUid,
            operador_extra_anterior: extraAtualOpId, operador_extra_ant_nome: extraAtualOpNome,
            operador_extra_novo: perfil.id, operador_extra_novo_nome: nomeNovoOp,
          },
        });

        if (extraAtualOpId) {
          await criarNotificacao({
            usuario_id: extraAtualOpId,
            titulo: `Seu vínculo EXTRA foi transferido`,
            mensagem: `O ${labelNR} "${nrLogLabel}" (EXTRA): Valor ${valorExtFmt} | Vencimento ${vencExtFmt} foi transferido para ${nomeNovoOp}. Autorizado por ${liderPerfil.nome}.`,
            empresa_id: empresa.id,
          });
        }

        limparDraft();
        onSaved(inserido);
        toast.success('Troca de vínculo EXTRA autorizada! Acordo registrado.');
        setConflito(null); setLiderEmail(''); setLiderSenha('');
        return;
      }

      // MODO: transferencia_completa
      const { data: acordoAnt } = await supabase
        .from('acordos').select('id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao')
        .eq('id', conflito.acordoId).maybeSingle();

      if (!acordoAnt) { toast.error('Acordo anterior não encontrado'); return; }

      const valorFmt     = acordoAnt.valor != null ? `R$ ${Number(acordoAnt.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
      const vencimentoFmt = acordoAnt.vencimento ? format(parseISO(acordoAnt.vencimento), 'dd/MM/yyyy', { locale: ptBR }) : '—';
      const statusAnt     = acordoAnt.status ?? '—';

      await enviarParaLixeira({
        acordo: acordoAnt as Acordo, motivo: 'transferencia_nr',
        operadorNome: conflito.operadorNome,
        autorizadoPorId: liderUid, autorizadoPorNome: liderPerfil.nome,
        transferidoParaId: perfil.id, transferidoParaNome: nomeNovoOp,
      });

      const { error: errDel } = await supabase.from('acordos').delete().eq('id', conflito.acordoId);
      if (errDel) { toast.error(`Erro ao remover acordo anterior: ${errDel.message}`); return; }
      onAcordoRemovido?.(conflito.acordoId);

      const inserido = await executarSalvar(conflito.payload);
      if (!inserido) return;

      await supabase.from('logs_sistema').insert({
        usuario_id: perfil.id, acao: 'transferencia_nr', tabela: 'acordos', registro_id: conflito.acordoId,
        empresa_id: empresa.id,
        detalhes: {
          nr: nrLogLabel, aprovado_por: liderPerfil.nome, aprovado_por_id: liderUid,
          operador_anterior: conflito.operadorId, operador_anterior_nome: conflito.operadorNome,
          operador_novo: perfil.id, operador_novo_nome: nomeNovoOp,
        },
      });

      await criarNotificacao({
        usuario_id: conflito.operadorId,
        titulo: `Seu ${labelNR} "${nrLogLabel}" foi transferido`,
        mensagem: `O ${labelNR} "${nrLogLabel}" foi transferido para ${nomeNovoOp} com autorização de ${liderPerfil.nome}. Seu acordo foi movido para a lixeira. Detalhes: Valor ${valorFmt} | Vencimento ${vencimentoFmt} | Status: ${statusAnt}.`,
        empresa_id: empresa.id,
      });

      limparDraft();
      onSaved(inserido);
      toast.success('Transferência autorizada! Acordo registrado com sucesso.');
      setConflito(null); setLiderEmail(''); setLiderSenha('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado na autorização');
    } finally {
      setAutorizando(false);
    }
  }

  function cancelarConflito() { setConflito(null); setLiderEmail(''); setLiderSenha(''); }

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

      const { error: rpcErr } = await supabase.rpc('fn_converter_para_extra', {
        p_acordo_id: acordoAnteriorId, p_novo_direto_op_id: perfil.id, p_novo_direto_op_nome: perfil.nome ?? 'Operador',
        p_valor: payload.valor as number, p_vencimento: payload.vencimento as string,
        p_nome_cliente: (payload.nome_cliente as string) ?? '', p_tipo: (payload.tipo as string) ?? 'boleto',
        p_whatsapp: (payload.whatsapp as string | null) ?? null, p_parcelas: (payload.parcelas as number) ?? 1,
      });
      if (rpcErr) {
        console.warn('[Caso B] RPC falhou, usando fallback:', rpcErr.message);
        await supabase.from('nr_registros').delete().eq('acordo_id', acordoAnteriorId);
        const { error: errReb } = await supabase.from('acordos')
          .update({ ...buildSyncPayload(payload), tipo_vinculo: 'extra', vinculo_operador_id: perfil.id, vinculo_operador_nome: perfil.nome ?? 'Operador' })
          .eq('id', acordoAnteriorId);
        if (errReb) { toast.error(`Erro ao converter acordo: ${errReb.message}`); return; }
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
  async function confirmarAdicionarParcela(input: NovaParcelaInput) {
    if (!acordoParaParcela) return;
    setSalvandoParcela(true);
    try {
      const r = await adicionarParcelaAoGrupo(acordoParaParcela, input, { isPaguePlay });
      if (!r.ok) { toast.error(r.erro); return; }
      limparDraft();
      setAcordoParaParcela(null);
      onSaved(r.novaParcela);
      if (r.novaParcela.status === 'pago') celebrarPetAcordoPago();
      toast.success(`Parcela ${r.novaParcela.numero_parcela ?? r.novoTotal}/${r.novoTotal} adicionada ao acordo existente!`);
    } finally {
      setSalvandoParcela(false);
    }
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
    temParcelas, parcelas,
    parcelaInicial: Math.min(Math.max(1, parseInt(parcelaAtualStr) || 1), parcelas),
    veioDoAnalitico,
    isExtra, setIsExtra: (fn) => setIsExtra(fn),
    usuarioTemLogicaDiretoExtra,
    tagIds, setTagIds,
    quarentaPct, setQuarentaPct: (fn) => setQuarentaPct(fn),
    empresaTags,
    conflito, liderEmail, setLiderEmail, liderSenha, setLiderSenha,
    autorizando, autorizarTransferencia, cancelarConflito,
    avisoDiretoExtra: avisoDiretoExtra
      ? { operadorAntNome: avisoDiretoExtra.operadorAntNome, operadorAntSetor: avisoDiretoExtra.operadorAntSetor, nrLabel: avisoDiretoExtra.nrLabel, labelCampo: avisoDiretoExtra.labelCampo }
      : null,
    confirmandoDiretoExtra, confirmarDiretoExtra, cancelarAvisoDiretoExtra,
    profissionalLoading,
    profissionalEncontrado: !!profissional,
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
