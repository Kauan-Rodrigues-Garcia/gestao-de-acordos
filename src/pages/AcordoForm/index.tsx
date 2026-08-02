import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase, Perfil } from '@/lib/supabase';
import {
  ROUTE_PATHS, parseCurrencyInput,
  getEstadoFromAcordo, extractLinkAcordo, buildObservacoesComEstado,
  formatarTelefonePP,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { criarNotificacao }  from '@/services/notificacoes.service';
import { enviarParaLixeira }  from '@/services/lixeira.service';
// nr_registros é gerenciado pelo trigger trg_sync_nr_registros (v2) no banco
import { useNrRegistros }           from '@/hooks/useNrRegistros';
import { verificarNrRegistro }      from '@/services/nr_registros.service';
import {
  operadorEstaDesligado, transferirAcordoDeDesligado,
  transferirAcordoNoServidor, mensagemErroTransferencia,
} from '@/services/desligamento.service';
import { AcordoNovoInline, ModalAutorizacaoNR, ModalAvisoDiretoExtra, type ConflitNR } from '@/components/AcordoNovoInline';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { fetchIsDiretoExtraAtivo } from '@/services/direto_extra.service';
import { toast } from 'sonner';
import { ehCpf, ERRO_CPF_NO_CODIGO } from '@/lib/cpf';
import { schemaBase, schemaPP, type FormData } from './schemas';
import { FormPP } from './FormPP';
import { FormBP } from './FormBP';

export default function AcordoForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { perfil, user, perfilLoading } = useAuth();
  const { empresa } = useEmpresa();
  const navigate = useNavigate();
  const tenant = useTenant();
  const [loading, setLoading]         = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [perfilLocal, setPerfilLocal] = useState<Perfil | null>(null);
  const [estadoSelecionado, setEstadoSelecionado] = useState('');
  const [showObs, setShowObs] = useState(isEdit);

  const isPP = tenant.isPaguePlay;
  const maxParcelas = tenant.maxParcelas;

  // NR duplicate / leader auth state
  const [conflito, setConflito]               = useState<ConflitNR | null>(null);
  const [liderEmail, setLiderEmail]           = useState('');
  const [liderSenha, setLiderSenha]           = useState('');
  const [autorizando, setAutorizando]         = useState(false);
  const [nrOriginalEdit, setNrOriginalEdit]   = useState<string | null>(null);
  const { verificarConflito, loading: nrLoading, refetch: nrRefetch } = useNrRegistros();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();

  // Aviso Direto/Extra (CASO B) — usuário atual NÃO tem a lógica mas o operador do conflito TEM
  interface PendingAvisoDiretoExtra {
    payload:          Record<string, unknown>;
    acordoAnteriorId: string;
    operadorAntId:    string;
    operadorAntNome:  string;
    operadorAntSetor?: string;
    nrLabel:          string;
    labelCampo:       string;
  }
  const [avisoDiretoExtra, setAvisoDiretoExtra] = useState<PendingAvisoDiretoExtra | null>(null);
  const [confirmandoDiretoExtra, setConfirmandoDiretoExtra] = useState(false);
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(isPP ? schemaPP : schemaBase),
    defaultValues: {
      tipo:     'boleto',
      status:   'verificar_pendente',
      parcelas: '1',
    },
  });

  // ── Garantir perfil disponível ────────────────────────────────────────
  useEffect(() => {
    if (perfil) { setPerfilLocal(perfil); return; }
    if (!user) return;
    supabase.from('perfis').select('*, setores(id, nome)').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          supabase.from('perfis').select('*').eq('id', user.id).maybeSingle()
            .then(({ data: d2 }) => { if (d2) setPerfilLocal(d2 as Perfil); });
          return;
        }
        if (data) setPerfilLocal(data as Perfil);
      });
  }, [perfil, user]);

  // ── Carregar dados para edição ────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return;
    supabase.from('acordos').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) { toast.error('Erro ao carregar acordo'); navigate(ROUTE_PATHS.ACORDOS); return; }
      if (data) {
        setNrOriginalEdit(data.nr_cliente);
        const obs    = data.observacoes || '';
        const estado = getEstadoFromAcordo(data);
        const link   = extractLinkAcordo(obs);
        if (tenant.isPaguePlay) {
          setEstadoSelecionado(estado || '');
        }
        reset({
          nome_cliente: data.nome_cliente,
          nr_cliente:   data.nr_cliente,
          vencimento:   data.vencimento,
          valor:        Number(data.valor).toFixed(2).replace('.', ','),
          tipo:         data.tipo,
          parcelas:     String(data.parcelas || 1),
          whatsapp:     data.whatsapp || '',
          instituicao:  data.instituicao || '',
          status:       data.status,
          observacoes:  tenant.isPaguePlay ? link : (data.observacoes || ''),
        });
      }
      setLoadingData(false);
    });
  }, [id, isEdit, reset, navigate]);

  // ── Helpers ───────────────────────────────────────────────────────────
  function buildSyncPayload(p: Record<string, unknown>): Record<string, unknown> {
    return {
      valor:        p.valor,
      vencimento:   p.vencimento,
      nome_cliente: p.nome_cliente,
      tipo:         p.tipo,
      whatsapp:     p.whatsapp ?? null,
      parcelas:     p.parcelas,
    };
  }

  function fmtValor(valor: unknown): string {
    return typeof valor === 'number'
      ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : '—';
  }

  function fmtData(data: unknown): string {
    if (typeof data !== 'string') return '—';
    try {
      return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
    } catch { return String(data); }
  }

  // ── Salvar acordo (após autorização ou direto) ────────────────────────
  async function salvarAcordo(payload: Record<string, unknown>, uid: string) {
    const isEditMode = isEdit && !!id;
    let resultError = null;

    if (isEditMode) {
      const { error } = await supabase.from('acordos').update(payload).eq('id', id!);
      if (error && (error.code === '42703' || error.message.includes('column'))) {
        const { instituicao: _i, setor_id: _s, ...cleanPayload } = payload;
        const { error: e2 } = await supabase.from('acordos').update(cleanPayload).eq('id', id!);
        resultError = e2;
      } else {
        resultError = error;
      }
    } else {
      const { error } = await supabase.from('acordos').insert(payload as never);
      if (error && (error.code === '42703' || error.message.includes('column'))) {
        const { instituicao: _i, setor_id: _s, ...cleanPayload } = payload;
        const { error: e2 } = await supabase.from('acordos').insert(cleanPayload as never);
        resultError = e2;
      } else {
        resultError = error;
      }
    }
    return resultError;
  }

  // ── Submit ────────────────────────────────────────────────────────────
  async function onSubmit(data: FormData) {
    const p   = perfilLocal ?? perfil;
    const uid = p?.id ?? user?.id;
    if (!uid) { toast.error('Não foi possível identificar o usuário. Recarregue a página.'); return; }
    if (!empresa?.id) { toast.error('Empresa não identificada. Recarregue a página.'); return; }
    // O estado não vive no schema do react-hook-form (é state à parte, porque
    // vai para dentro de `observacoes`), então a checagem é aqui. O gatilho
    // `trg_acordos_exige_estado` recusa no banco de qualquer forma — isto só
    // avisa antes de o operador perder o que digitou (migration 20260802c).
    if (isPP && !estadoSelecionado.trim()) {
      toast.error('Selecione o estado (UF) do cliente');
      return;
    }
    // CPF no campo de código — recusado no banco pelo `trg_acordos_recusa_cpf`
    // nas duas empresas (migration 20260803a).
    if (ehCpf(data.instituicao) || ehCpf(data.nr_cliente)) {
      toast.error(ERRO_CPF_NO_CODIGO);
      return;
    }

    setLoading(true);
    try {
      const valorNum = parseCurrencyInput(data.valor);
      if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); setLoading(false); return; }

      const nrTrimmed = (data.nr_cliente ?? '').trim();

      const payload: Record<string, unknown> = {
        nome_cliente:  (data.nome_cliente ?? '').trim(),
        nr_cliente:    nrTrimmed,
        data_cadastro: new Date().toISOString().split('T')[0],
        vencimento:    data.vencimento,
        valor:         valorNum,
        tipo:          data.tipo,
        parcelas:      isPP
          ? parseInt(data.parcelas || '1', 10)
          : (['boleto', 'cartao_recorrente', 'pix_automatico'].includes(data.tipo))
            ? parseInt(data.parcelas || '1', 10)
            : 1,
        whatsapp:      isPP ? formatarTelefonePP(data.whatsapp || '') : (data.whatsapp?.trim() || null),
        status:        data.status,
        observacoes:   isPP
          ? buildObservacoesComEstado(estadoSelecionado, data.observacoes || '')
          : (data.observacoes?.trim() || null),
        operador_id:   uid,
        empresa_id:    empresa.id,
      };

      if (data.instituicao?.trim()) payload.instituicao = data.instituicao.trim();
      if (p?.setor_id) payload.setor_id = p.setor_id;

      // ── Verificação de NR único ───────────────────────────────────────
      const campoCampo: 'nr_cliente' | 'instituicao' = isPP ? 'instituicao' : 'nr_cliente';
      const nrParaVerificar = isPP
        ? (data.instituicao ?? '').trim()
        : nrTrimmed;
      const labelNr = isPP ? 'Código' : 'NR';

      const nrOriginal = isPP ? null : nrOriginalEdit;
      const nrMudou = nrParaVerificar && (!isEdit || nrParaVerificar !== nrOriginal);

      if (nrMudou && empresa?.id) {
        const conflitoDb = await verificarNrRegistro(
          nrParaVerificar,
          empresa.id,
          campoCampo,
          isEdit ? id : undefined,
        );

        const conflitoFinal = conflitoDb ??
          verificarConflito(nrParaVerificar, campoCampo, isEdit ? id : undefined);

        if (conflitoFinal) {
          if (conflitoFinal.operadorId === uid) {
            toast.error(`${labelNr} "${nrParaVerificar}" já existe na sua lista de acordos ativos.`);
            setLoading(false);
            return;
          }

          // ── Dono desligado: assume direto, sem autorização de líder ─────
          // Vem antes das regras de Direto/Extra de propósito: acordo de quem
          // saiu da empresa não deve virar vínculo de ninguém, e sim mudar de
          // dono. O acordo antigo vai pra lixeira e some da lista dele.
          if (await operadorEstaDesligado(conflitoFinal.operadorId)) {
            const r = await transferirAcordoDeDesligado({
              acordoAnteriorId: conflitoFinal.acordoId,
              empresaId:        empresa.id,
              operadorAntId:    conflitoFinal.operadorId,
              operadorAntNome:  conflitoFinal.operadorNome,
              novoOperadorId:   uid,
              novoOperadorNome: p?.nome ?? 'Operador',
              labelNr,
              valorNr:          nrParaVerificar,
            });
            if (!r.ok) {
              toast.error(`Erro ao liberar o acordo do operador desligado: ${r.erro}`);
              setLoading(false);
              return;
            }
            const errSalvar = await salvarAcordo(payload, uid);
            if (errSalvar) { toast.error(`Erro ao salvar: ${errSalvar.message}`); setLoading(false); return; }
            toast.success(
              `${labelNr} "${nrParaVerificar}" reatribuído: ${conflitoFinal.operadorNome} está desligado.`,
            );
            navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
            return;
          }

          const { data: acordoDireto } = await supabase
            .from('acordos')
            .select('id, tipo_vinculo, vinculo_operador_id, vinculo_operador_nome')
            .eq('id', conflitoFinal.acordoId)
            .maybeSingle();

          const jaTemExtra = Boolean(acordoDireto?.vinculo_operador_id);

          if (jaTemExtra) {
            const campoCampo2: 'nr_cliente' | 'instituicao' = isPP ? 'instituicao' : 'nr_cliente';
            const { data: acordoExtraAtual } = await supabase
              .from('acordos')
              .select('id, operador_id, vinculo_operador_nome')
              .eq('empresa_id', empresa.id)
              .eq(campoCampo2, nrParaVerificar)
              .eq('tipo_vinculo', 'extra')
              .maybeSingle();

            setConflito({
              acordoId:         conflitoFinal.acordoId,
              operadorId:       conflitoFinal.operadorId,
              operadorNome:     conflitoFinal.operadorNome,
              payload,
              modo:             'troca_extra',
              extraAtualId:     acordoExtraAtual?.id ?? null,
              extraAtualOpId:   acordoExtraAtual?.operador_id ?? acordoDireto?.vinculo_operador_id ?? null,
              extraAtualOpNome: acordoDireto?.vinculo_operador_nome ?? null,
            });
            setLoading(false);
            return;
          }

          const euTemLogica = isAtivoParaUsuario(
            uid,
            p?.setor_id ?? null,
            (p as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
          );

          let opConflitoDataEff: { id: string; nome: string; setor_id: string | null; equipe_id?: string | null; setores?: { nome?: string } | null } | null = null;
          {
            const r = await supabase
              .from('perfis').select('id, nome, setor_id, equipe_id, setores(nome)')
              .eq('id', conflitoFinal.operadorId).maybeSingle();
            opConflitoDataEff = (r.data as typeof opConflitoDataEff) ?? null;
            if (!opConflitoDataEff) {
              const r2 = await supabase
                .from('perfis').select('id, nome, setor_id, equipe_id')
                .eq('id', conflitoFinal.operadorId).maybeSingle();
              opConflitoDataEff = (r2.data as typeof opConflitoDataEff) ?? null;
            }
          }

          const donoTemLogica = await fetchIsDiretoExtraAtivo({ userId: conflitoFinal.operadorId, empresaId: empresa.id });

          // CASO A: EU tem lógica, DONO não → EU = EXTRA, DONO continua DIRETO
          if (euTemLogica && !donoTemLogica) {
            const payloadExtra = {
              ...payload,
              tipo_vinculo:          'extra',
              vinculo_operador_id:   conflitoFinal.operadorId,
              vinculo_operador_nome: conflitoFinal.operadorNome,
            };
            const resultErr = await salvarAcordo(payloadExtra, uid);
            if (resultErr) { toast.error(`Erro ao salvar: ${resultErr.message}`); setLoading(false); return; }

            const { error: rpcErr } = await supabase.rpc('fn_vincular_extra_ao_direto', {
              p_direto_id:     conflitoFinal.acordoId,
              p_extra_op_id:   uid,
              p_extra_op_nome: p?.nome ?? 'Operador',
              p_valor:         payload.valor as number,
              p_vencimento:    payload.vencimento as string,
              p_nome_cliente:  (payload.nome_cliente as string) ?? '',
              p_tipo:          (payload.tipo as string) ?? 'boleto',
              p_whatsapp:      (payload.whatsapp as string | null) ?? null,
              p_parcelas:      (payload.parcelas as number) ?? 1,
            });
            if (rpcErr) {
              console.warn('[Caso A Form] RPC falhou, tentando update direto:', rpcErr.message);
              await supabase.from('acordos')
                .update({
                  ...buildSyncPayload(payload),
                  vinculo_operador_id:   uid,
                  vinculo_operador_nome: p?.nome ?? 'Operador',
                })
                .eq('id', conflitoFinal.acordoId);
            }

            await criarNotificacao({
              usuario_id: conflitoFinal.operadorId,
              titulo:     'Novo vínculo EXTRA no seu acordo',
              mensagem:
                `O operador ${p?.nome ?? 'outro operador'} tabulou o ${labelNr} "${nrParaVerificar}" ` +
                `como EXTRA vinculado ao seu acordo. Seu acordo permanece como DIRETO.\n` +
                `Dados atualizados → Valor: ${fmtValor(payload.valor)} | Vencimento: ${fmtData(payload.vencimento)} | ` +
                `Cliente: ${(payload.nome_cliente as string || '').trim() || '—'}.`,
              empresa_id: empresa.id,
            });
            toast.success(`Acordo tabulado como EXTRA (vínculo com ${conflitoFinal.operadorNome}).`);
            navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
            return;
          }

          // CASO B: EU não tem lógica, DONO tem → aviso (EU=DIRETO, DONO→EXTRA)
          if (!euTemLogica && donoTemLogica) {
            setAvisoDiretoExtra({
              payload,
              acordoAnteriorId: conflitoFinal.acordoId,
              operadorAntId:    conflitoFinal.operadorId,
              operadorAntNome:  conflitoFinal.operadorNome,
              operadorAntSetor: opConflitoDataEff?.setores?.nome,
              nrLabel:          nrParaVerificar,
              labelCampo:       labelNr,
            });
            setLoading(false);
            return;
          }

          // CASO C/D: ambos têm lógica OU nenhum tem → autorização completa
          setConflito({
            acordoId:     conflitoFinal.acordoId,
            operadorId:   conflitoFinal.operadorId,
            operadorNome: conflitoFinal.operadorNome,
            payload,
            modo:         'transferencia_completa',
          });
          setLoading(false);
          return;
        }
      }
      void nrLoading; void nrRefetch;

      const resultError = await salvarAcordo(payload, uid);

      if (resultError) {
        console.error('[AcordoForm] error:', resultError);
        toast.error(`Erro ao salvar: ${resultError.message}`);
        return;
      }

      // ── Auto-criar parcelas ao salvar novo acordo ─────────────────────
      const TIPOS_PARCELADOS_BOOKPLAY = ['boleto', 'cartao_recorrente', 'pix_automatico'];
      const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];
      const tiposParcelados = isPP ? TIPOS_PARCELADOS_PAGUEPLAY : TIPOS_PARCELADOS_BOOKPLAY;
      const parcelasNum = parseInt(payload.parcelas as string, 10) || 1;
      const deveCriarParcelas =
        !isEdit &&
        tiposParcelados.includes(payload.tipo as string) &&
        parcelasNum > 1;

      if (deveCriarParcelas) {
        const grupoId = crypto.randomUUID();
        const { data: acordoCriado } = await supabase
          .from('acordos')
          .select('id')
          .eq('nr_cliente', payload.nr_cliente as string)
          .eq('empresa_id', empresa.id)
          .eq('vencimento', payload.vencimento as string)
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (acordoCriado?.id) {
          await supabase
            .from('acordos')
            .update({ acordo_grupo_id: grupoId, numero_parcela: 1 })
            .eq('id', acordoCriado.id);
        }

        const baseVencimento = payload.vencimento as string;
        const [baseYear, baseMonth, baseDay] = baseVencimento.split('-').map(Number);
        const parcelasParaCriar = [];

        for (let n = 2; n <= parcelasNum; n++) {
          const totalMeses = baseMonth - 1 + (n - 1);
          const anoVenc = baseYear + Math.floor(totalMeses / 12);
          const mesVenc = (totalMeses % 12) + 1;
          const vencimentoN = `${anoVenc}-${String(mesVenc).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;
          parcelasParaCriar.push({
            nome_cliente:    payload.nome_cliente,
            nr_cliente:      payload.nr_cliente,
            data_cadastro:   new Date().toISOString().split('T')[0],
            vencimento:      vencimentoN,
            valor:           payload.valor,
            tipo:            payload.tipo,
            parcelas:        parcelasNum,
            whatsapp:        payload.whatsapp ?? null,
            status:          'verificar_pendente',
            observacoes:     payload.observacoes ?? null,
            instituicao:     payload.instituicao ?? null,
            operador_id:     uid,
            setor_id:        payload.setor_id ?? null,
            empresa_id:      empresa.id,
            acordo_grupo_id: grupoId,
            numero_parcela:  n,
          });
        }

        const { error: errParcelas } = await supabase.from('acordos').insert(parcelasParaCriar as never);
        if (errParcelas) {
          console.warn('[AcordoForm] erro ao criar parcelas adicionais:', errParcelas.message);
          toast.warning(`Acordo salvo, mas houve erro ao criar ${parcelasNum - 1} parcelas: ${errParcelas.message}`);
        } else {
          toast.success(`Acordo cadastrado com ${parcelasNum} parcelas criadas automaticamente!`);
        }
      } else {
        toast.success(isEdit ? 'Acordo atualizado!' : 'Acordo cadastrado com sucesso!');
      }
      if (!isEdit && p?.lider_id) {
        criarNotificacao({
          usuario_id: p.lider_id,
          titulo: 'Novo acordo cadastrado',
          mensagem: `${p.nome} cadastrou o acordo NR ${nrTrimmed} - ${(data.nome_cliente ?? '').trim()}`,
          empresa_id: empresa?.id,
        });
      }
      navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
    } catch (e) {
      console.error('[AcordoForm] unexpected:', e);
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  // ── Autorização do líder para NR duplicado ────────────────────────────
  async function autorizarTransferencia() {
    if (!conflito) return;
    if (!liderEmail || !liderSenha) { toast.error('Informe o email e senha do líder'); return; }
    setAutorizando(true);
    const uid = perfilLocal?.id ?? user?.id ?? '';
    try {
      const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnon },
        body: JSON.stringify({ email: liderEmail, password: liderSenha }),
      });
      if (!authRes.ok) {
        const s = authRes.status;
        toast.error(s === 400 || s === 401 || s === 422 ? 'Credenciais do líder inválidas' : `Erro ao autenticar líder (${s})`);
        return;
      }
      const authData   = await authRes.json();
      const liderUid   = authData.user?.id as string | undefined;
      const liderToken = authData.access_token as string | undefined;
      if (!liderUid || !liderToken) { toast.error('Credenciais do líder inválidas'); return; }

      const perfilRes = await fetch(
        `${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`,
        { headers: { 'apikey': supabaseAnon, 'Authorization': `Bearer ${liderToken}` } }
      );
      if (!perfilRes.ok) { toast.error('Erro ao verificar perfil do líder'); return; }
      const perfilArr   = await perfilRes.json();
      const liderPerfil = Array.isArray(perfilArr) ? perfilArr[0] : null;
      if (!liderPerfil || !['lider', 'administrador', 'super_admin'].includes(liderPerfil.perfil)) {
        toast.error('O usuário informado não tem permissão de líder ou administrador');
        return;
      }

      const labelNR    = isPP ? 'Código' : 'NR';
      const nrLogLabel = ((isPP ? conflito.payload.instituicao : conflito.payload.nr_cliente) as string | undefined)?.trim() || '—';
      const nomeNovoOp = (perfilLocal ?? perfil)?.nome ?? 'Operador';

      // ── MODO troca_extra ──────────────────────────────────────────────
      if (conflito.modo === 'troca_extra') {
        const { extraAtualId, extraAtualOpId, extraAtualOpNome } = conflito;

        const { data: acordoExtraAnt } = await supabase
          .from('acordos')
          .select('id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao')
          .eq('id', extraAtualId!)
          .maybeSingle();

        const valorExtFmt = acordoExtraAnt?.valor != null
          ? `R$ ${Number(acordoExtraAnt.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
        const vencExtFmt  = acordoExtraAnt?.vencimento
          ? new Date(acordoExtraAnt.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

        if (acordoExtraAnt) {
          await enviarParaLixeira({
            acordo:              acordoExtraAnt as import('@/lib/supabase').Acordo,
            motivo:              'troca_extra',
            operadorNome:        extraAtualOpNome ?? '—',
            autorizadoPorId:     liderUid,
            autorizadoPorNome:   liderPerfil.nome,
            transferidoParaId:   uid,
            transferidoParaNome: nomeNovoOp,
          });
        }

        const { error: errDelExt } = await supabase.from('acordos').delete().eq('id', extraAtualId!);
        if (errDelExt) { toast.error(`Erro ao remover vínculo extra anterior: ${errDelExt.message}`); return; }

        const payloadExtra = {
          ...conflito.payload,
          tipo_vinculo:          'extra',
          vinculo_operador_id:   conflito.operadorId,
          vinculo_operador_nome: conflito.operadorNome,
        };
        const resultError2 = await salvarAcordo(payloadExtra, uid);
        if (resultError2) { toast.error(`Erro ao salvar: ${resultError2.message}`); return; }

        await supabase.from('acordos')
          .update({
            ...buildSyncPayload(conflito.payload),
            vinculo_operador_id:   uid,
            vinculo_operador_nome: nomeNovoOp,
          })
          .eq('id', conflito.acordoId);

        await supabase.from('logs_sistema').insert({
          usuario_id: uid, acao: 'troca_extra', tabela: 'acordos',
          registro_id: extraAtualId, empresa_id: empresa?.id ?? null,
          detalhes: {
            nr: nrLogLabel, aprovado_por: liderPerfil.nome, aprovado_por_id: liderUid,
            operador_extra_anterior: extraAtualOpId, operador_extra_ant_nome: extraAtualOpNome,
            operador_extra_novo: uid, operador_extra_novo_nome: nomeNovoOp,
            operador_direto: conflito.operadorId, operador_direto_nome: conflito.operadorNome,
            empresa_id: empresa?.id ?? null,
          },
        });

        if (extraAtualOpId) {
          await criarNotificacao({
            usuario_id: extraAtualOpId,
            titulo: 'Vínculo EXTRA transferido',
            mensagem:
              `Seu acordo EXTRA do ${labelNR} "${nrLogLabel}" foi transferido para ${nomeNovoOp} ` +
              `com autorização de ${liderPerfil.nome}. Detalhes: Valor ${valorExtFmt} | Vencimento ${vencExtFmt}.`,
            empresa_id: empresa?.id,
          });
        }
        await criarNotificacao({
          usuario_id: conflito.operadorId,
          titulo: 'Vínculo EXTRA do seu acordo foi atualizado',
          mensagem:
            `O vínculo EXTRA do ${labelNR} "${nrLogLabel}" mudou de ${extraAtualOpNome ?? 'operador anterior'} ` +
            `para ${nomeNovoOp} com autorização de ${liderPerfil.nome}. Seu acordo DIRETO continua inalterado.`,
          empresa_id: empresa?.id,
        });

        toast.success('Vínculo EXTRA transferido com sucesso!');
        setConflito(null); setLiderEmail(''); setLiderSenha('');
        navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
        return;
      }

      // ── MODO transferencia_completa ───────────────────────────────────
      //
      // Vai pela RPC com o TOKEN DO LÍDER. Antes o select e o delete saíam com
      // a sessão do operador, que a RLS fail-closed (20260723f) barra — o
      // acordo alheio voltava nulo e a tela dizia "Acordo anterior não
      // encontrado", mesmo com a senha do líder correta.
      const rt = await transferirAcordoNoServidor({
        acordoId:       conflito.acordoId,
        novoOperadorId: uid,
        token:          liderToken,
      });
      if (!rt.ok) { toast.error(mensagemErroTransferencia(rt.erro)); return; }

      const nomeClienteAnt = rt.nome_cliente ?? '—';
      const valorFmt       = rt.valor != null
        ? `R$ ${Number(rt.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
      const vencimentoFmt  = rt.vencimento
        ? new Date(rt.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const statusAnt      = rt.status ?? '—';

      const resultError = await salvarAcordo(conflito.payload, uid);
      if (resultError) { toast.error(`Erro ao salvar: ${resultError.message}`); return; }

      await criarNotificacao({
        usuario_id: conflito.operadorId,
        titulo: 'Acordo transferido pelo líder',
        mensagem:
          `O ${labelNR} "${nrLogLabel}" (${nomeClienteAnt}) foi transferido para ${nomeNovoOp} ` +
          `com autorização de ${liderPerfil.nome}. Seu acordo foi movido para a lixeira. ` +
          `Detalhes: Valor ${valorFmt} | Vencimento ${vencimentoFmt} | Status: ${statusAnt}.`,
        empresa_id: empresa?.id,
      });

      toast.success('Transferência autorizada! Acordo registrado com sucesso.');
      setConflito(null); setLiderEmail(''); setLiderSenha('');
      navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setAutorizando(false);
    }
  }

  // ── Direto/Extra (CASO B): tabula como DIRETO e rebaixa anterior a EXTRA ──
  async function confirmarDiretoExtraForm() {
    if (!avisoDiretoExtra) return;
    const uid = perfilLocal?.id ?? user?.id ?? '';
    if (!uid || !empresa?.id) return;
    setConfirmandoDiretoExtra(true);
    try {
      const { payload, acordoAnteriorId, operadorAntId, operadorAntNome, nrLabel: nrL, labelCampo } = avisoDiretoExtra;
      const p = perfilLocal ?? perfil;

      const logicaAindaAtiva = await fetchIsDiretoExtraAtivo({ userId: operadorAntId, empresaId: empresa.id });
      if (!logicaAindaAtiva) {
        toast.error('A lógica Direto/Extra do operador foi desativada. Atualize e tente novamente.');
        return;
      }

      const { error: rpcErr } = await supabase.rpc('fn_converter_para_extra', {
        p_acordo_id:           acordoAnteriorId,
        p_novo_direto_op_id:   uid,
        p_novo_direto_op_nome: p?.nome ?? 'Operador',
        p_valor:               payload.valor as number,
        p_vencimento:          payload.vencimento as string,
        p_nome_cliente:        (payload.nome_cliente as string) ?? '',
        p_tipo:                (payload.tipo as string) ?? 'boleto',
        p_whatsapp:            (payload.whatsapp as string | null) ?? null,
        p_parcelas:            (payload.parcelas as number) ?? 1,
      });
      if (rpcErr) {
        console.warn('[Caso B Form] RPC falhou, usando fallback:', rpcErr.message);
        await supabase.from('nr_registros').delete().eq('acordo_id', acordoAnteriorId);
        const { error: errReb } = await supabase.from('acordos')
          .update({
            ...buildSyncPayload(payload),
            tipo_vinculo:          'extra',
            vinculo_operador_id:   uid,
            vinculo_operador_nome: p?.nome ?? 'Operador',
          })
          .eq('id', acordoAnteriorId);
        if (errReb) { toast.error(`Erro ao converter acordo: ${errReb.message}`); return; }
      }

      const payloadDireto = {
        ...payload,
        tipo_vinculo:          'direto',
        vinculo_operador_id:   operadorAntId,
        vinculo_operador_nome: operadorAntNome,
      };
      const resultErr = await salvarAcordo(payloadDireto, uid);
      if (resultErr) { toast.error(`Erro ao salvar: ${resultErr.message}`); return; }

      await criarNotificacao({
        usuario_id: operadorAntId,
        titulo:     'Seu acordo foi convertido em EXTRA',
        mensagem:
          `O ${labelCampo} "${nrL}" foi tabulado como DIRETO pelo operador ${p?.nome ?? 'outro operador'}. ` +
          `Seu acordo continua ativo como EXTRA. ` +
          `Dados sincronizados — Valor: ${fmtValor(payload.valor)}, Vencimento: ${fmtData(payload.vencimento)}.`,
        empresa_id: empresa.id,
      });

      setAvisoDiretoExtra(null);
      toast.success(`Acordo tabulado como DIRETO. ${operadorAntNome} foi notificado.`);
      navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setConfirmandoDiretoExtra(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (loadingData) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;
  if (!perfilLocal && perfilLoading) return <div className="p-6 text-center text-muted-foreground">Carregando perfil...</div>;

  const hasErrors = Object.keys(errors).length > 0;
  const p = perfilLocal ?? perfil;
  const nomeSetor = (p?.setores as { nome?: string } | undefined)?.nome;

  // ── Novo acordo: delega 100% ao MESMO componente do botão inline ────────
  // A aba "Novo Acordo" deve fazer exatamente o que o botão inline faz.
  // Renderizando o próprio AcordoNovoInline garantimos fonte única de verdade
  // (mesma lógica de conflito NR, Direto/Extra CASO A/B/C, rascunho, tags e
  // fallback de insert). A edição continua usando o formulário abaixo.
  if (!isEdit) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Novo Acordo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{p?.nome ?? user?.email}</span>
              {nomeSetor && <span className="text-primary"> · {nomeSetor}</span>}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <tbody>
              <AcordoNovoInline
                isPaguePlay={isPP}
                colSpan={1}
                onSaved={() => navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS)}
                onCancel={() => navigate(-1)}
              />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">

      <ModalAutorizacaoNR
        conflito={conflito}
        liderEmail={liderEmail}
        liderSenha={liderSenha}
        autorizando={autorizando}
        onEmailChange={setLiderEmail}
        onSenhaChange={setLiderSenha}
        onAutorizar={autorizarTransferencia}
        onCancel={() => { setConflito(null); setLiderEmail(''); setLiderSenha(''); }}
      />

      <ModalAvisoDiretoExtra
        aberto={!!avisoDiretoExtra}
        operadorNome={avisoDiretoExtra?.operadorAntNome ?? ''}
        operadorSetor={avisoDiretoExtra?.operadorAntSetor}
        nrLabel={avisoDiretoExtra?.nrLabel ?? ''}
        labelCampo={avisoDiretoExtra?.labelCampo ?? ''}
        confirmando={confirmandoDiretoExtra}
        onConfirmar={confirmarDiretoExtraForm}
        onCancel={() => setAvisoDiretoExtra(null)}
      />

      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {isEdit ? 'Editar Acordo' : 'Novo Acordo'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-medium text-foreground">{p?.nome ?? user?.email}</span>
            {nomeSetor && <span className="text-primary"> · {nomeSetor}</span>}
          </p>
        </div>
      </div>

      {/* Erros */}
      {hasErrors && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="text-xs text-destructive">
            <p className="font-semibold mb-1">Corrija os campos obrigatórios:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {Object.entries(errors).map(([k, err]) => <li key={k}>{err?.message as string}</li>)}
            </ul>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {isPP ? (
            <FormPP
              register={register}
              errors={errors}
              watch={watch}
              setValue={setValue}
              isEdit={isEdit}
              showObs={showObs}
              setShowObs={setShowObs}
              estadoSelecionado={estadoSelecionado}
              setEstadoSelecionado={setEstadoSelecionado}
            />
          ) : (
            <FormBP
              register={register}
              errors={errors}
              watch={watch}
              setValue={setValue}
              isEdit={isEdit}
              showObs={showObs}
              setShowObs={setShowObs}
              maxParcelas={maxParcelas}
            />
          )}

          {/* Ações */}
          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 min-w-[160px]">
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : isEdit ? 'Atualizar Acordo' : 'Cadastrar Acordo'}
            </Button>
          </div>

        </motion.div>
      </form>
    </div>
  );
}
