import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Calendar, DollarSign, Smartphone, Building2,
  FileText, User, Layers, MapPin, Link2, CheckCircle2, RefreshCw, Clock,
  ArrowLeftRight, Link as LinkIcon, CalendarClock, MessageCircle, Plus,
} from 'lucide-react';
import { DatePickerField } from '@/components/DatePickerField';
import { celebrarPetAcordoPago } from '@/components/pet/petEvents';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { criarNotificacao } from '@/services/notificacoes.service';
import { ModalReagendar, type ReagendarParams } from '@/components/ModalReagendar';
import { ModalConfirmarPagamento } from '@/components/ModalConfirmarPagamento';
import { ModalAdicionarParcela } from '@/components/ModalAdicionarParcela';
import { adicionarParcelaAoGrupo, type NovaParcelaInput } from '@/services/parcelas.service';
import { temVisaoAmpla } from '@/lib/deduplicarVinculados';
import { transferirNr, liberarNrPorAcordoId } from '@/services/nr_registros.service';
import {
  formatCurrency, formatDate,
  STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  TIPO_COLORS, STATUS_LABELS_PAGUEPLAY,
  extractLinkAcordo, getEstadoFromAcordo, isAtrasado,
} from '@/lib/index';
import { abrirChatplay } from '@/lib/chatplay';
import { calcularParcelas, foiUsadoQuarentaPct } from '@/lib/money';
import { isTipoParcelado, addMonths } from './helpers';
import { ModalExtraParaDireto } from './ModalExtraParaDireto';
import { ModalEditarAcordoParcelado } from './ModalEditarAcordoParcelado';

// Re-export for external consumers
export { ModalEditarAcordoParcelado } from './ModalEditarAcordoParcelado';

export interface AcordoDetalheInlineProps {
  acordo: Acordo;
  isPaguePlay: boolean;
  colSpan: number;
  onClose: () => void;
  onSaved?: (atualizado: Acordo) => void;
  onAcordoRemovido?: (id: string) => void;
}

// ── Campo somente-leitura ─────────────────────────────────────────────────────
function Campo({
  icon: Icon, label, value, mono = false, full = false, children,
}: {
  icon?: React.ElementType;
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-2', full && 'col-span-full')}>
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {children ?? (
          <p className={cn('text-sm font-medium text-foreground', mono && 'font-mono')}>
            {value ?? '—'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function AcordoDetalheInline({
  acordo, isPaguePlay, colSpan, onClose, onSaved, onAcordoRemovido,
}: AcordoDetalheInlineProps) {
  const statusLabels  = isPaguePlay ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS;
  const tipoLabels    = isPaguePlay ? TIPO_LABELS_PAGUEPLAY   : TIPO_LABELS;
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [registrosReais,        setRegistrosReais]        = useState<Acordo[]>([]);
  const [loadingParc,           setLoadingParc]            = useState(false);
  const [marcandoPago,          setMarcandoPago]           = useState<string | null>(null);
  const [confirmarPgtoParc,     setConfirmarPgtoParc]      = useState<Acordo | null>(null);
  const [salvandoConfirmarPgto, setSalvandoConfirmarPgto]  = useState(false);
  const [modalEditParcOpen,     setModalEditParcOpen]      = useState(false);
  const [modalExtraDiretoOpen,  setModalExtraDiretoOpen]   = useState(false);
  const [executandoExtraDireto, setExecutandoExtraDireto]  = useState(false);
  const [reagendarParcela,      setReagendarParcela]       = useState<Acordo | null>(null);
  const [salvandoReagendar,     setSalvandoReagendar]      = useState(false);
  const [modalAddParcela,       setModalAddParcela]        = useState(false);
  const [salvandoAddParcela,    setSalvandoAddParcela]     = useState(false);
  const [acordoLocal,           setAcordoLocal]            = useState<Acordo>(acordo);

  const atrasado      = isAtrasado(acordoLocal.vencimento, acordoLocal.status);
  const totalParcelas = acordoLocal.parcelas ?? 1;
  // BookPlay: independe da forma de pagamento — parcelas adicionadas
  // manualmente podem misturar formas (ex.: entrada no Pix + boleto do
  // restante). PaguePlay mantém a regra original por tipo parcelado.
  const deveExibirParcelas = isPaguePlay
    ? isTipoParcelado(acordoLocal.tipo, true) && totalParcelas > 1
    : totalParcelas > 1;
  // Adicionar parcela manual é recurso BookPlay (dono ou visão ampla).
  const podeAdicionarParcela = !isPaguePlay &&
    (perfil?.id === acordoLocal.operador_id || temVisaoAmpla(perfil?.perfil));

  // "Link do Acordo" é conceito PaguePlay (observacoes = [ESTADO]+link). Na
  // BookPlay observacoes é texto livre e extractLinkAcordo devolveria o texto
  // inteiro, duplicando o bloco de Observações como "Link do Acordo".
  const link   = isPaguePlay ? extractLinkAcordo(acordoLocal.observacoes) : '';
  const estado = getEstadoFromAcordo(acordoLocal);
  const nomeOp = (acordoLocal.perfis as { nome?: string } | undefined)?.nome ?? '—';

  useEffect(() => {
    if (!deveExibirParcelas || !acordoLocal.acordo_grupo_id) return;
    setLoadingParc(true);
    supabase
      .from('acordos')
      .select('*')
      .eq('acordo_grupo_id', acordoLocal.acordo_grupo_id)
      .order('numero_parcela', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao buscar parcelas');
        else setRegistrosReais((data ?? []) as Acordo[]);
        setLoadingParc(false);
      });
  }, [deveExibirParcelas, acordoLocal.acordo_grupo_id]);

  // ── Marcar como pago ──────────────────────────────────────────────────────
  function marcarPago(p: Acordo) {
    if (p.status === 'nao_pago') {
      setConfirmarPgtoParc(p);
    } else {
      // Pendente → pago sem caixa: mantém o vencimento tabulado do acordo
      void executarMarcarPago(p, p.vencimento);
    }
  }

  async function executarMarcarPago(p: Acordo, dataPagamento: string) {
    setMarcandoPago(p.id);
    // Recebimento é atribuído ao vencimento → grava a data escolhida no vencimento
    const updatePayload: Record<string, unknown> = {
      status: 'pago', data_pagamento: dataPagamento, vencimento: dataPagamento,
    };
    let { error } = await supabase.from('acordos').update(updatePayload).eq('id', p.id);
    if (error && (String(error.code) === '42703' || String(error.code) === '400' || error.message?.toLowerCase().includes('column'))) {
      ({ error } = await supabase.from('acordos').update({ status: 'pago', vencimento: dataPagamento }).eq('id', p.id));
    }
    if (error) {
      toast.error(`Erro: ${error.message}`);
    } else {
      celebrarPetAcordoPago();
      toast.success('Parcela marcada como paga!');
      const parcelaAtualizada = { ...p, status: 'pago' as const, data_pagamento: dataPagamento, vencimento: dataPagamento };
      setRegistrosReais(prev => prev.map(x => x.id === p.id ? parcelaAtualizada : x));
      if (acordoLocal.tipo_vinculo === 'extra' || acordoLocal.vinculo_operador_id) {
        await supabase.rpc('fn_sync_par_vinculo', {
          p_acordo_id:    p.id,
          p_valor:        p.valor,
          p_vencimento:   dataPagamento,
          p_nome_cliente: p.nome_cliente,
          p_tipo:         p.tipo,
          p_whatsapp:     p.whatsapp,
          p_parcelas:     p.parcelas,
          p_status:       'pago',
        });
      }
      // Reagenda a próxima parcela de acordos parcelados — vale para os dois
      // tenants (PaguePlay e BookPlay usam a mesma lógica em handleReagendar).
      // Se a próxima parcela já existe (adicionada manualmente), não reabre.
      const proximaJaExiste = registrosReais.some(
        r => (r.numero_parcela ?? 1) === (p.numero_parcela ?? 1) + 1,
      );
      if (deveExibirParcelas && (p.numero_parcela ?? 1) < totalParcelas && !proximaJaExiste) {
        setReagendarParcela(parcelaAtualizada);
      }
    }
    setMarcandoPago(null);
  }

  // ── Reagendar próxima parcela ─────────────────────────────────────────────
  async function handleReagendar(params: ReagendarParams) {
    if (!reagendarParcela || !empresa?.id) return;
    setSalvandoReagendar(true);
    try {
      const parcelaAtual  = reagendarParcela;
      const proximaNumero = (parcelaAtual.numero_parcela ?? 1) + 1;
      const quantToCreate = 1;

      // Evita criar a próxima parcela em duplicado (ex.: reagendar duas vezes)
      if (parcelaAtual.acordo_grupo_id) {
        const { data: jaExiste } = await supabase
          .from('acordos').select('id')
          .eq('empresa_id', empresa.id)
          .eq('acordo_grupo_id', parcelaAtual.acordo_grupo_id)
          .eq('numero_parcela', proximaNumero)
          .maybeSingle();
        if (jaExiste) {
          toast.info(`Parcela ${proximaNumero}/${totalParcelas} já foi reagendada.`);
          setReagendarParcela(null);
          return;
        }
      }

      const usou40Base = parcelaAtual.usou_quarenta_pct ?? foiUsadoQuarentaPct(parcelaAtual);
      let valorProximaParcela = params.novoValor;
      if (isPaguePlay && parcelaAtual.valor_total != null && parcelaAtual.parcelas) {
        const todas  = calcularParcelas(parcelaAtual.valor_total, parcelaAtual.parcelas, usou40Base);
        const idx    = (parcelaAtual.numero_parcela ?? 1);
        valorProximaParcela = todas[idx] ?? params.novoValor;
      }

      const basePayload = {
        nome_cliente:          parcelaAtual.nome_cliente,
        nr_cliente:            parcelaAtual.nr_cliente,
        tipo:                  parcelaAtual.tipo,
        parcelas:              parcelaAtual.parcelas,
        whatsapp:              parcelaAtual.whatsapp,
        instituicao:           parcelaAtual.instituicao,
        observacoes:           parcelaAtual.observacoes,
        operador_id:           parcelaAtual.operador_id,
        empresa_id:            parcelaAtual.empresa_id,
        setor_id:              parcelaAtual.setor_id ?? null,
        data_cadastro:         new Date().toISOString().split('T')[0],
        acordo_grupo_id:       parcelaAtual.acordo_grupo_id,
        tipo_vinculo:          parcelaAtual.tipo_vinculo,
        vinculo_operador_id:   parcelaAtual.vinculo_operador_id,
        vinculo_operador_nome: parcelaAtual.vinculo_operador_nome,
        valor_total:           parcelaAtual.valor_total ?? null,
        usou_quarenta_pct:     usou40Base,
        status:                'verificar_pendente' as const,
        valor:                 valorProximaParcela,
      };

      const todasPP = (isPaguePlay && parcelaAtual.valor_total != null && parcelaAtual.parcelas)
        ? calcularParcelas(parcelaAtual.valor_total, parcelaAtual.parcelas, usou40Base)
        : null;

      const novasParcelas: Acordo[] = [];
      for (let i = 0; i < quantToCreate; i++) {
        const numero   = proximaNumero + i;
        const vencCalc = i === 0 ? params.novoVencimento : addMonths(params.novoVencimento, i);
        const valorI   = todasPP ? (todasPP[(parcelaAtual.numero_parcela ?? 1) + i] ?? valorProximaParcela) : valorProximaParcela;
        const { data: novo, error: errIns } = await supabase
          .from('acordos')
          .insert({ ...basePayload, numero_parcela: numero, vencimento: vencCalc, valor: valorI })
          .select('*')
          .single();
        if (errIns) { toast.error(`Erro ao criar parcela ${numero}: ${errIns.message}`); return; }
        novasParcelas.push(novo as Acordo);
      }

      if (parcelaAtual.vinculo_operador_id && parcelaAtual.acordo_grupo_id) {
        const campoChave: 'instituicao' | 'nr_cliente' = isPaguePlay ? 'instituicao' : 'nr_cliente';
        const valorChave = isPaguePlay ? parcelaAtual.instituicao : parcelaAtual.nr_cliente;
        if (valorChave) {
          const { data: parInstall } = await supabase
            .from('acordos')
            .select('*')
            .eq('empresa_id', empresa.id)
            .eq('operador_id', parcelaAtual.vinculo_operador_id)
            .eq(campoChave, valorChave)
            .eq('numero_parcela', parcelaAtual.numero_parcela ?? 1)
            .maybeSingle();

          if (parInstall) {
            const parInst = parInstall as Acordo;
            const usou40p = parInst.usou_quarenta_pct ?? foiUsadoQuarentaPct(parInst);
            let valorParcelaParc = params.novoValor;
            if (isPaguePlay && parInst.valor_total != null && parInst.parcelas) {
              const todasP  = calcularParcelas(parInst.valor_total, parInst.parcelas, usou40p);
              const idxP    = (parInst.numero_parcela ?? 1);
              valorParcelaParc = todasP[idxP] ?? params.novoValor;
            }
            const todasPInst = (isPaguePlay && parInst.valor_total != null && parInst.parcelas)
              ? calcularParcelas(parInst.valor_total, parInst.parcelas, usou40p)
              : null;
            for (let i = 0; i < quantToCreate; i++) {
              const numero   = proximaNumero + i;
              const vencCalc = i === 0 ? params.novoVencimento : addMonths(params.novoVencimento, i);
              const valorI   = (todasPInst && i > 0)
                ? (todasPInst[(parInst.numero_parcela ?? 1) + i] ?? valorParcelaParc)
                : valorParcelaParc;
              await supabase.from('acordos').insert({
                nome_cliente:          parInst.nome_cliente,
                nr_cliente:            parInst.nr_cliente,
                tipo:                  parInst.tipo,
                parcelas:              parInst.parcelas,
                whatsapp:              parInst.whatsapp,
                instituicao:           parInst.instituicao,
                observacoes:           parInst.observacoes,
                operador_id:           parInst.operador_id,
                empresa_id:            parInst.empresa_id,
                setor_id:              parInst.setor_id ?? null,
                data_cadastro:         new Date().toISOString().split('T')[0],
                acordo_grupo_id:       parInst.acordo_grupo_id,
                tipo_vinculo:          parInst.tipo_vinculo,
                vinculo_operador_id:   parInst.vinculo_operador_id,
                vinculo_operador_nome: parInst.vinculo_operador_nome,
                valor_total:           parInst.valor_total ?? null,
                usou_quarenta_pct:     usou40p,
                status:                'verificar_pendente',
                valor:                 valorI,
                numero_parcela:        numero,
                vencimento:            vencCalc,
              });
            }
          }
        }
      }

      setRegistrosReais(prev => [...prev, ...novasParcelas]);
      setReagendarParcela(null);
      toast.success(`Parcela ${proximaNumero}/${totalParcelas} agendada para ${formatDate(params.novoVencimento)}!`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reagendar parcela');
    } finally {
      setSalvandoReagendar(false);
    }
  }

  // ── Adicionar parcela manualmente (mesmo NR, formas podem variar) ─────────
  async function confirmarAdicionarParcela(input: NovaParcelaInput) {
    setSalvandoAddParcela(true);
    try {
      const r = await adicionarParcelaAoGrupo(acordoLocal, input, { isPaguePlay });
      if (!r.ok) { toast.error(r.erro); return; }

      const grupoId = r.novaParcela.acordo_grupo_id ?? acordoLocal.acordo_grupo_id ?? null;
      const baseAtualizado: Acordo = {
        ...acordoLocal,
        parcelas:        r.novoTotal,
        acordo_grupo_id: grupoId,
        numero_parcela:  acordoLocal.numero_parcela ?? 1,
      };
      setAcordoLocal(baseAtualizado);
      setRegistrosReais(prev => {
        const antigas = prev
          .filter(p => p.id !== r.novaParcela.id)
          .map(p => ({ ...p, parcelas: r.novoTotal }));
        const comBase = antigas.some(p => p.id === baseAtualizado.id)
          ? antigas
          : [baseAtualizado, ...antigas];
        return [...comBase, r.novaParcela]
          .sort((a, b) => (a.numero_parcela ?? 1) - (b.numero_parcela ?? 1));
      });
      setModalAddParcela(false);
      onSaved?.(baseAtualizado);
      if (r.novaParcela.status === 'pago') celebrarPetAcordoPago();
      toast.success(`Parcela ${r.novaParcela.numero_parcela ?? r.novoTotal}/${r.novoTotal} adicionada!`);
    } finally {
      setSalvandoAddParcela(false);
    }
  }

  // ── Extra → Direto ────────────────────────────────────────────────────────
  async function handleExtraDireto(liderCreds: { email: string; senha: string } | null) {
    if (!perfil || !empresa) return;
    setExecutandoExtraDireto(true);
    try {
      let liderNomeAutorizador: string | null = null;
      if (liderCreds) {
        const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
        const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const authRes = await fetch(
          `${supabaseUrl}/auth/v1/token?grant_type=password`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', apikey: supabaseAnon },
            body:    JSON.stringify({ email: liderCreds.email.trim(), password: liderCreds.senha }),
          },
        );
        if (!authRes.ok) {
          toast.error('Credenciais de líder inválidas.');
          setExecutandoExtraDireto(false);
          return;
        }
        const authData = await authRes.json() as { user?: { id: string }; access_token?: string };
        const liderUid   = authData.user?.id;
        const liderToken = authData.access_token;
        if (!liderUid || !liderToken) {
          toast.error('Credenciais de líder inválidas.');
          setExecutandoExtraDireto(false);
          return;
        }

        const perfilRes = await fetch(
          `${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`,
          { headers: { apikey: supabaseAnon, Authorization: `Bearer ${liderToken}` } },
        );
        if (!perfilRes.ok) {
          toast.error('Erro ao verificar perfil do líder.');
          setExecutandoExtraDireto(false);
          return;
        }
        const perfilArr = await perfilRes.json() as Array<{ perfil: string; nome: string }>;
        const liderPerfilData = Array.isArray(perfilArr) && perfilArr.length > 0 ? perfilArr[0] : null;
        if (!liderPerfilData || !['lider', 'administrador', 'super_admin', 'elite', 'gerencia', 'diretoria'].includes(liderPerfilData.perfil)) {
          toast.error('O usuário informado não tem permissão de líder ou administrador.');
          setExecutandoExtraDireto(false);
          return;
        }
        liderNomeAutorizador = liderPerfilData.nome;
      }

      const campoChave: 'instituicao' | 'nr_cliente' = isPaguePlay ? 'instituicao' : 'nr_cliente';
      const valorChave = isPaguePlay ? acordoLocal.instituicao : acordoLocal.nr_cliente;
      if (!valorChave || !String(valorChave).trim()) {
        toast.error('Não foi possível identificar o registro deste acordo (chave de vínculo vazia).');
        setExecutandoExtraDireto(false);
        return;
      }

      const { data: acordoDiretoOriginal, error: errBuscaDireto } = await supabase
        .from('acordos')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq(campoChave, valorChave)
        .eq('tipo_vinculo', 'direto')
        .neq('id', acordoLocal.id)
        .maybeSingle();

      if (errBuscaDireto) {
        console.error(errBuscaDireto);
        toast.error('Erro ao localizar o acordo direto original.');
        setExecutandoExtraDireto(false);
        return;
      }

      if (acordoDiretoOriginal) {
        const { error: errDel } = await supabase.from('acordos').delete().eq('id', acordoDiretoOriginal.id);
        if (errDel) {
          console.error(errDel);
          toast.error('Erro ao remover o acordo original do outro operador.');
          setExecutandoExtraDireto(false);
          return;
        }
        try {
          await criarNotificacao({
            usuario_id: acordoDiretoOriginal.operador_id,
            empresa_id: empresa.id,
            titulo: 'Acordo convertido em direto',
            mensagem:
              `O operador ${perfil.nome} assumiu como direto o acordo do ` +
              `${isPaguePlay ? `Código ${valorChave}` : `NR ${valorChave}`}. ` +
              `O acordo foi removido do seu painel.` +
              (liderNomeAutorizador ? ` (Autorizado por ${liderNomeAutorizador})` : ''),
          });
        } catch (e) {
          console.warn('Falha ao notificar operador original', e);
        }
      }

      const { data: acordoAtualizado, error: errUpdate } = await supabase
        .from('acordos')
        .update({ tipo_vinculo: 'direto', vinculo_operador_id: null, vinculo_operador_nome: null })
        .eq('id', acordoLocal.id)
        .select()
        .single();

      if (errUpdate) {
        console.error(errUpdate);
        toast.error('Erro ao converter acordo para direto.');
        setExecutandoExtraDireto(false);
        return;
      }

      try {
        await transferirNr({
          empresaId:        empresa.id,
          nrValue:          String(valorChave).trim(),
          campo:            campoChave,
          novoOperadorId:   perfil.id,
          novoOperadorNome: perfil.nome ?? '',
          novoAcordoId:     acordoLocal.id,
        });
      } catch (e) {
        console.warn('[extra->direto] falha ao transferir nr_registros', e);
      }

      if (acordoDiretoOriginal) {
        try {
          await liberarNrPorAcordoId(acordoDiretoOriginal.id);
        } catch (e) {
          console.warn('[extra->direto] falha ao liberar nr_registros antigo', e);
        }
      }

      setAcordoLocal(acordoAtualizado as Acordo);
      onSaved?.(acordoAtualizado as Acordo);
      if (acordoDiretoOriginal) onAcordoRemovido?.(acordoDiretoOriginal.id);
      setModalExtraDiretoOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Erro inesperado ao converter para direto.');
    } finally {
      setExecutandoExtraDireto(false);
    }
  }

  // ── Valores calculados para parcelas virtuais ─────────────────────────────
  const valoresParcelas: number[] | null =
    isPaguePlay && acordo.valor_total != null && acordo.parcelas
      ? calcularParcelas(acordo.valor_total, acordo.parcelas, acordo.usou_quarenta_pct ?? foiUsadoQuarentaPct(acordo))
      : null;

  type LinhaTabela = { index: number; real: Acordo | null; dataCalc: string; };
  // Âncora: primeira parcela REAL do grupo (acordos vindos do analítico podem
  // nascer no meio do plano — ex.: 4ª de 12; as anteriores são virtuais pagas).
  const numeroBase = registrosReais[0]?.numero_parcela ?? acordoLocal.numero_parcela ?? 1;
  const vencBase   = registrosReais[0]?.vencimento ?? acordoLocal.vencimento;
  const linhas: LinhaTabela[] = Array.from({ length: totalParcelas }, (_, i) => {
    const index = i + 1;
    const real  = registrosReais.find(r => (r.numero_parcela ?? 1) === index) ?? null;
    const dataCalc = addMonths(vencBase, index - numeroBase);
    return { index, real, dataCalc };
  });

  return (
    <>
      <tr>
        <td colSpan={colSpan} className="p-0">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="p-5 bg-accent/30 border-t-2 border-b border-primary/20 shadow-inner">

              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-foreground tracking-tight">
                    {isPaguePlay ? (acordoLocal.instituicao || acordoLocal.nr_cliente || '—') : acordoLocal.nome_cliente}
                  </h3>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[acordoLocal.status])}>
                    {statusLabels[acordoLocal.status] ?? acordoLocal.status}
                  </span>
                  {atrasado && <Badge variant="destructive" className="text-xs">Atrasado</Badge>}
                  {acordoLocal.tipo_vinculo === 'extra' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/30 shadow-sm">
                      <LinkIcon className="w-3 h-3" />
                      Extra
                    </span>
                  )}
                  {deveExibirParcelas && (
                    <span className="text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                      Parcela {acordoLocal.numero_parcela ?? 1}/{totalParcelas}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isPaguePlay && acordoLocal.whatsapp && (
                    perfil?.tampermonkey_configured ? (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5 border-violet-500/40 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
                        onClick={() => abrirChatplay(acordoLocal.whatsapp!)}
                      >
                        <MessageCircle className="w-3 h-3" />
                        Chatplay
                      </Button>
                    ) : (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5 border-muted text-muted-foreground cursor-not-allowed opacity-60"
                        disabled
                        title="Configure a integração Chatplay pelo ícone no topo da página"
                      >
                        <MessageCircle className="w-3 h-3" />
                        Chatplay
                      </Button>
                    )
                  )}
                  {acordoLocal.tipo_vinculo === 'extra' && perfil?.id === acordoLocal.operador_id && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => setModalExtraDiretoOpen(true)}
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      Acordo direto
                    </Button>
                  )}
                  {podeAdicionarParcela && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => setModalAddParcela(true)}
                    >
                      <Plus className="w-3 h-3" />
                      Adicionar parcela
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Aviso vínculo Extra */}
              {acordoLocal.tipo_vinculo === 'extra' && acordoLocal.vinculo_operador_nome && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-primary/8 border border-primary/25 flex items-start gap-2">
                  <LinkIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-semibold text-primary leading-tight">Acordo Extra</p>
                    <p className="text-foreground/80 leading-tight">
                      Vínculo com operador: <strong className="text-foreground">{acordoLocal.vinculo_operador_nome || (acordoLocal as any)._vinculoExtraOperadorNome}</strong>
                    </p>
                  </div>
                </div>
              )}
              {( (acordoLocal.tipo_vinculo === 'direto' || !acordoLocal.tipo_vinculo) && (acordoLocal.vinculo_operador_id || (acordoLocal as any)._vinculoExtraOperadorId) ) && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-success/8 border border-success/25 flex items-start gap-2">
                  <LinkIcon className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-semibold text-success leading-tight">Acordo Direto (com Extra vinculado)</p>
                    <p className="text-foreground/80 leading-tight">
                      Existe um acordo EXTRA vinculado com o operador:{' '}
                      <strong className="text-foreground">{acordoLocal.vinculo_operador_nome || (acordoLocal as any)._vinculoExtraOperadorNome}</strong>
                    </p>
                  </div>
                </div>
              )}

              {/* Grid de campos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                {isPaguePlay && acordoLocal.instituicao && (
                  <Campo icon={Building2} label="Código" value={acordoLocal.instituicao} />
                )}
                {isPaguePlay && acordoLocal.nome_cliente && (
                  <Campo icon={User} label="Nome do Profissional" value={acordoLocal.nome_cliente} />
                )}
                {isPaguePlay && estado && (
                  <Campo icon={MapPin} label="Estado" value={estado} />
                )}
                <Campo icon={Calendar} label="Vencimento" value={
                  <span className={cn(atrasado && 'text-destructive font-semibold')}>
                    {formatDate(acordoLocal.vencimento)}
                  </span>
                } />
                <Campo icon={DollarSign} label="Valor" value={formatCurrency(acordoLocal.valor)} mono />
                <Campo label="Forma de Pagamento">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5', TIPO_COLORS[acordoLocal.tipo])}>
                    {tipoLabels[acordoLocal.tipo] ?? acordoLocal.tipo}
                  </span>
                </Campo>
                {deveExibirParcelas && (
                  <Campo icon={Layers} label="Total de Parcelas" value={String(totalParcelas)} mono />
                )}
                {acordoLocal.whatsapp && (
                  <Campo icon={Smartphone} label={isPaguePlay ? 'Número' : 'WhatsApp'} value={acordoLocal.whatsapp} mono />
                )}
                {!isPaguePlay && acordoLocal.instituicao && (
                  <Campo icon={Building2} label="Instituição" value={acordoLocal.instituicao} />
                )}
                <Campo icon={User} label="Operador" value={nomeOp} />
              </div>

              {/* Observações */}
              {!isPaguePlay && acordoLocal.observacoes && (
                <>
                  <Separator className="my-4" />
                  <Campo icon={FileText} label="Observações" full>
                    <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3 mt-0.5">
                      {acordoLocal.observacoes}
                    </p>
                  </Campo>
                </>
              )}

              {/* Link */}
              {link && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-start gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Link do Acordo</p>
                      <a href={link.startsWith('http') ? link : `https://${link}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all">
                        {link}
                      </a>
                    </div>
                  </div>
                </>
              )}

              {/* Sub-tabela de Parcelas */}
              {deveExibirParcelas && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Parcelas</span>
                      <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">{totalParcelas}x</span>
                    </div>

                    {loadingParc ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/60 border-b border-border">
                              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">#</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Vencimento</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Valor</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Status</th>
                              <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Próxima</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linhas.map(({ index, real, dataCalc }) => {
                              const isAtualAcordo = real?.id === acordo.id;
                              return (
                                <tr key={index}
                                  className={cn(
                                    'border-b border-border/40 hover:bg-primary/5 transition-colors duration-100',
                                    isAtualAcordo && 'bg-primary/8'
                                  )}
                                >
                                  <td className="px-3 py-2.5 font-mono font-bold text-primary text-xs">{index}</td>
                                  <td className="px-3 py-2.5 font-mono text-xs">
                                    {real ? formatDate(real.vencimento) : (
                                      <span className="text-muted-foreground/50 italic">{formatDate(dataCalc)}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-xs">
                                    {real ? formatCurrency(real.valor) : (
                                      <span className="text-muted-foreground/50">
                                        {formatCurrency(valoresParcelas ? (valoresParcelas[index - 1] ?? acordo.valor) : acordo.valor)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {real ? (
                                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-sm', STATUS_COLORS[real.status])}>
                                        {statusLabels[real.status] ?? real.status}
                                      </span>
                                    ) : index < numeroBase ? (
                                      // Parcela anterior à 1ª real: paga antes da tabulação
                                      // via analítico (não existe no banco de propósito).
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-dashed border-success/30">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> Paga
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/40 px-2 py-0.5 rounded-full border border-dashed border-border">
                                        <Clock className="w-2.5 h-2.5" /> A vencer
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    {index >= totalParcelas ? (
                                      <span className="text-muted-foreground/30 text-[10px] font-mono">—</span>
                                    ) : real && real.status === 'pago' ? (
                                      linhas[index]?.real ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                                          <CheckCircle2 className="w-2.5 h-2.5" /> Agendada
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/30">
                                          <Clock className="w-2.5 h-2.5" /> Não agendada
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-muted-foreground/30 text-[10px] font-mono">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </motion.div>
        </td>
      </tr>

      {deveExibirParcelas && !isPaguePlay && (
        <ModalEditarAcordoParcelado
          acordo={acordoLocal}
          isPaguePlay={isPaguePlay}
          registrosReais={registrosReais}
          open={modalEditParcOpen}
          onClose={() => setModalEditParcOpen(false)}
          onSaved={(principal, todasAtualizadas) => {
            setAcordoLocal(principal);
            setRegistrosReais(todasAtualizadas);
            onSaved?.(principal);
          }}
        />
      )}

      {confirmarPgtoParc && (
        <ModalConfirmarPagamento
          aberto={!!confirmarPgtoParc}
          salvando={salvandoConfirmarPgto}
          dataInicial={confirmarPgtoParc.vencimento}
          onConfirm={async (data) => {
            setSalvandoConfirmarPgto(true);
            await executarMarcarPago(confirmarPgtoParc, data);
            setSalvandoConfirmarPgto(false);
            setConfirmarPgtoParc(null);
          }}
          onClose={() => setConfirmarPgtoParc(null)}
        />
      )}

      {reagendarParcela && (
        <ModalReagendar
          aberto={!!reagendarParcela}
          parcelaAtual={reagendarParcela}
          proximaNumero={(reagendarParcela.numero_parcela ?? 1) + 1}
          totalParcelas={totalParcelas}
          salvando={salvandoReagendar}
          valorProxima={(() => {
            if (!reagendarParcela.valor_total || !reagendarParcela.parcelas) return undefined;
            const usou40 = reagendarParcela.usou_quarenta_pct ?? foiUsadoQuarentaPct(reagendarParcela);
            return calcularParcelas(reagendarParcela.valor_total, reagendarParcela.parcelas, usou40)[reagendarParcela.numero_parcela ?? 1];
          })()}
          onConfirm={handleReagendar}
          onClose={() => setReagendarParcela(null)}
        />
      )}

      <ModalAdicionarParcela
        aberto={modalAddParcela}
        acordo={acordoLocal}
        isPaguePlay={isPaguePlay}
        inicial={{
          valor:  acordoLocal.valor,
          tipo:   acordoLocal.tipo,
          status: 'verificar_pendente',
        }}
        salvando={salvandoAddParcela}
        onConfirm={confirmarAdicionarParcela}
        onClose={() => setModalAddParcela(false)}
      />

      <ModalExtraParaDireto
        open={modalExtraDiretoOpen}
        onClose={() => setModalExtraDiretoOpen(false)}
        executando={executandoExtraDireto}
        operadorDiretoNome={acordoLocal.vinculo_operador_nome || 'outro operador'}
        nrLabel={isPaguePlay ? `Código ${acordoLocal.instituicao ?? '—'}` : `NR ${acordoLocal.nr_cliente ?? '—'}`}
        precisaAutorizacao={!perfil || !['administrador', 'super_admin', 'lider', 'elite', 'gerencia', 'diretoria'].includes(String(perfil.perfil || '').toLowerCase())}
        onConfirmar={handleExtraDireto}
      />
    </>
  );
}
