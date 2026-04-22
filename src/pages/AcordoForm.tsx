import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  Save, ArrowLeft, User, Hash,
  DollarSign, Smartphone, FileText, Info, AlertCircle, Building2, MapPin, Link2
} from 'lucide-react';
import { DatePickerField } from '@/components/DatePickerField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase, Perfil } from '@/lib/supabase';
import {
  ROUTE_PATHS, parseCurrencyInput,
  isPaguePlay, ESTADOS_BRASIL, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS_PAGUEPLAY,
  getMaxParcelas, extractEstado, extractLinkAcordo, buildObservacoesComEstado,
  INSTITUICOES_OPTIONS,
} from '@/lib/index';
import { criarNotificacao }  from '@/services/notificacoes.service';
import { enviarParaLixeira }  from '@/services/lixeira.service';
// nr_registros é gerenciado pelo trigger trg_sync_nr_registros (v2) no banco
import { useNrRegistros }           from '@/hooks/useNrRegistros';
import { verificarNrRegistro }      from '@/services/nr_registros.service';
import { ModalAutorizacaoNR, ModalAvisoDiretoExtra } from '@/components/AcordoNovoInline';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Schema base (Bookplay / !isPP) ─────────────────────────────────────
const schemaBase = z.object({
  nome_cliente: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  nr_cliente:   z.string().min(1, 'Campo obrigatório').regex(/^\d+$/, 'Deve conter apenas números'),
  vencimento:   z.string().min(1, 'Data de vencimento é obrigatória'),
  valor: z.string().min(1, 'Valor é obrigatório').refine(v => {
    const n = parseCurrencyInput(v);
    return !isNaN(n) && n > 0;
  }, 'Valor deve ser maior que zero'),
  tipo:        z.enum(['boleto', 'pix', 'cartao', 'cartao_recorrente', 'pix_automatico']),
  parcelas:    z.string().optional().refine(v => !v || (parseInt(v) > 0 && parseInt(v) <= 60), 'Parcelas inválidas'),
  whatsapp:    z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'WhatsApp deve ter DDD + número'),
  instituicao: z.string().max(100, 'Nome da instituição muito longo').optional(),
  status:      z.enum(['verificar_pendente', 'pago', 'nao_pago']),
  observacoes: z.string().max(500, 'Campo muito longo').optional(),
});

// ── Schema PaguePay (isPP) — nr_cliente opcional, instituicao obrigatória ──
const schemaPP = z.object({
  nome_cliente: z.string().max(100, 'Nome muito longo').optional().or(z.literal('')),
  nr_cliente:   z.string().optional().or(z.literal('')),
  vencimento:   z.string().min(1, 'Data de vencimento é obrigatória')
    .refine(v => v >= '2026-01-01', 'A data não pode ser anterior a 01/01/2026'),
  valor: z.string().min(1, 'Valor é obrigatório').refine(v => {
    const n = parseCurrencyInput(v);
    return !isNaN(n) && n > 0;
  }, 'Valor deve ser maior que zero'),
  tipo:        z.enum(['boleto', 'pix', 'cartao', 'cartao_recorrente', 'pix_automatico']),
  parcelas:    z.string().optional().refine(v => !v || (parseInt(v) > 0 && parseInt(v) <= 60), 'Parcelas inválidas'),
  whatsapp:    z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'WhatsApp deve ter DDD + número'),
  instituicao: z.string().min(1, 'Inscrição é obrigatória').max(100, 'Nome da instituição muito longo'),
  status:      z.enum(['verificar_pendente', 'pago', 'nao_pago']),
  observacoes: z.string().max(500, 'Campo muito longo').optional(),
});

// data_cadastro: opcional no form — preenchida automaticamente pelo sistema
const schema = schemaBase; // usado como type base; resolvido condicionalmente no useForm

type FormData = z.infer<typeof schemaBase>;

export default function AcordoForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { perfil, user, perfilLoading } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const navigate = useNavigate();
  const [loading, setLoading]         = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [perfilLocal, setPerfilLocal] = useState<Perfil | null>(null);
  const [estadoSelecionado, setEstadoSelecionado] = useState('');

  const isPP = isPaguePlay(tenantSlug);
  const maxParcelas = getMaxParcelas(tenantSlug);

  // NR duplicate / leader auth state
  interface ConflitNRForm {
    acordoId: string;
    operadorId: string;
    operadorNome: string;
    payload: Record<string, unknown>;
  }
  const [conflito, setConflito]               = useState<ConflitNRForm | null>(null);
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

  const tipoAtual = watch('tipo');

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
        // For PaguePlay, parse estado from observacoes prefix
        const obs = data.observacoes || '';
        const estado = extractEstado(obs);
        const link   = extractLinkAcordo(obs);
        if (isPaguePlay(tenantSlug)) {
          setEstadoSelecionado(estado || '');
        }
        reset({
          nome_cliente: data.nome_cliente,
          nr_cliente:   data.nr_cliente,
          vencimento:   data.vencimento,
          valor:        String(data.valor),
          tipo:         data.tipo,
          parcelas:     String(data.parcelas || 1),
          whatsapp:     data.whatsapp || '',
          instituicao:  data.instituicao || '',
          status:       data.status,
          // For PaguePlay show only the link part (strip [ESTADO:XX] prefix)
          observacoes:  isPaguePlay(tenantSlug) ? link : (data.observacoes || ''),
        });
      }
      setLoadingData(false);
    });
  }, [id, isEdit, reset, navigate]);

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
      const { error } = await supabase.from('acordos').insert(payload);
      if (error && (error.code === '42703' || error.message.includes('column'))) {
        const { instituicao: _i, setor_id: _s, ...cleanPayload } = payload;
        const { error: e2 } = await supabase.from('acordos').insert(cleanPayload);
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

    setLoading(true);
    try {
      const valorNum = parseCurrencyInput(data.valor);
      if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); setLoading(false); return; }

      const nrTrimmed = (data.nr_cliente ?? '').trim();

      // Payload base — colunas que EXISTEM no schema original (01_schema_completo.sql)
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
        whatsapp:      data.whatsapp?.trim() || null,
        status:        data.status,
        // For PaguePlay: combine [ESTADO:XX] prefix + link text in observacoes
        observacoes:   isPP
          ? buildObservacoesComEstado(estadoSelecionado, data.observacoes || '')
          : (data.observacoes?.trim() || null),
        operador_id:   uid,
        empresa_id:    empresa.id,
      };

      // Adicionar colunas extras APENAS se houver valor, e tentar tratar erro se a coluna não existir
      if (data.instituicao?.trim()) payload.instituicao = data.instituicao.trim();
      if (p?.setor_id) payload.setor_id = p.setor_id;

      // ── VERIFICAÇÃO DE NR ÚNICO ────────────────────────────────────────────
      // PaguePay: NR único = "Inscrição" (instituicao) | Bookplay: NR único = "NR" (nr_cliente)
      // FONTE DE VERDADE: sempre query direta ao banco (nr_registros).
      // O cache local (Realtime) complementa como fallback extra.
      const campoCampo: 'nr_cliente' | 'instituicao' = isPP ? 'instituicao' : 'nr_cliente';
      const nrParaVerificar = isPP
        ? (data.instituicao ?? '').trim()
        : nrTrimmed;
      const labelNr = isPP ? 'Inscrição' : 'NR';

      const nrOriginal = isPP ? null : nrOriginalEdit;
      const nrMudou = nrParaVerificar && (!isEdit || nrParaVerificar !== nrOriginal);

      if (nrMudou && empresa?.id) {
        // 1. Query direta ao banco (fonte de verdade garantida)
        const conflitoDb = await verificarNrRegistro(
          nrParaVerificar,
          empresa.id,
          campoCampo,
          isEdit ? id : undefined,
        );

        // 2. Fallback: se banco não encontrou, checar cache local (lag do trigger)
        const conflitoFinal = conflitoDb ??
          verificarConflito(nrParaVerificar, campoCampo, isEdit ? id : undefined);

        if (conflitoFinal) {
          if (conflitoFinal.operadorId === uid) {
            toast.error(`${labelNr} "${nrParaVerificar}" já existe na sua lista de acordos ativos.`);
            setLoading(false);
            return;
          }

          // ── NOVA LÓGICA: Direto e Extra ────────────────────────────────────
          const atualTemLogica = isAtivoParaUsuario(
            uid,
            p?.setor_id ?? null,
            (p as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
          );

          const { data: opConflitoData } = await supabase
            .from('perfis')
            .select('id, nome, setor_id, equipe_id, setores(nome)')
            .eq('id', conflitoFinal.operadorId)
            .maybeSingle() as { data: { id: string; nome: string; setor_id: string | null; equipe_id?: string | null; setores?: { nome?: string } | null } | null };

          // Fallback sem join (caso RLS bloqueie o join em setores na Bookplay)
          let opConflitoDataEff = opConflitoData;
          if (!opConflitoDataEff) {
            const r2 = await supabase
              .from('perfis')
              .select('id, nome, setor_id, equipe_id')
              .eq('id', conflitoFinal.operadorId)
              .maybeSingle();
            opConflitoDataEff = (r2.data as typeof opConflitoData) ?? null;
          }

          const opConflitoTemLogica = opConflitoDataEff
            ? isAtivoParaUsuario(opConflitoDataEff.id, opConflitoDataEff.setor_id ?? null, opConflitoDataEff.equipe_id ?? null)
            : false;

          console.info('[direto-extra/form]', {
            atualTemLogica,
            opConflitoTemLogica,
            opConflitoDataEff,
            conflitoFinal,
          });

          // CASO A: usuário atual tem a lógica → tabula como EXTRA
          if (atualTemLogica) {
            const payloadExtra = {
              ...payload,
              tipo_vinculo:          'extra',
              vinculo_operador_id:   conflitoFinal.operadorId,
              vinculo_operador_nome: conflitoFinal.operadorNome,
            };
            const resultErr = await salvarAcordo(payloadExtra, uid);
            if (resultErr) {
              toast.error(`Erro ao salvar: ${resultErr.message}`);
              setLoading(false);
              return;
            }
            // Atualiza o acordo DIRETO (do outro operador) para referenciar este EXTRA,
            // permitindo que a UI exiba a tag "Existe um acordo EXTRA vinculado" para ele.
            await supabase
              .from('acordos')
              .update({
                vinculo_operador_id:   uid,
                vinculo_operador_nome: p?.nome ?? 'Operador',
              })
              .eq('id', conflitoFinal.acordoId);

            await criarNotificacao({
              usuario_id: conflitoFinal.operadorId,
              titulo:     '📎 Novo acordo EXTRA vinculado ao seu',
              mensagem:
                `O ${labelNr} "${nrParaVerificar}" ((${(data.nome_cliente ?? '').trim() || '—'})) ` +
                `agora possui um acordo EXTRA tabulado pelo operador ${p?.nome ?? 'outro operador'}.`,
              empresa_id: empresa.id,
            });
            toast.success(`Acordo tabulado como EXTRA (vínculo com ${conflitoFinal.operadorNome}).`);
            navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);
            return;
          }

          // CASO B: usuário atual NÃO tem; operador do conflito TEM → aviso
          if (opConflitoTemLogica) {
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

          // CASO C: fluxo antigo — autorização do líder
          setConflito({
            acordoId:     conflitoFinal.acordoId,
            operadorId:   conflitoFinal.operadorId,
            operadorNome: conflitoFinal.operadorNome,
            payload,
          });
          setLoading(false);
          return;
        }
      }
      // Suprimir lint: nrLoading/nrRefetch mantidos para refetch futuro
      void nrLoading; void nrRefetch;

      const resultError = await salvarAcordo(payload, uid);

      if (resultError) {
        console.error('[AcordoForm] error:', resultError);
        toast.error(`Erro ao salvar: ${resultError.message}`);
        return;
      }

      // ⚠ O trigger trg_sync_nr_registros (v2) registra/atualiza o NR em nr_registros
      // automaticamente via INSERT/UPDATE — não precisamos chamar registrarNr() aqui.

      // ── Auto-criar parcelas ao salvar novo acordo ───────────────────────
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
        // Atualizar o acordo recém-criado com grupo_id e numero_parcela = 1
        // (buscar pelo nr_cliente + empresa_id + vencimento para encontrar o id)
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

        // Criar parcelas 2..N
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

        const { error: errParcelas } = await supabase.from('acordos').insert(parcelasParaCriar);
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
      // FIX: PaguePay não tem rota /acordos — redirecionar para Dashboard
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

      // ── Campo NR correto por empresa ──────────────────────────────────────
      // PaguePay → NR único = instituicao | Bookplay → NR único = nr_cliente
      const campoNr: 'nr_cliente' | 'instituicao' = isPP ? 'instituicao' : 'nr_cliente';
      const nrLabel =
        ((isPP
          ? conflito.payload.instituicao
          : conflito.payload.nr_cliente) as string | undefined)?.trim() || '—';

      const nomeNovoOp = (perfilLocal ?? perfil)?.nome ?? 'Operador';

      // 1. Buscar acordo anterior completo ANTES de qualquer delete
      // Usar maybeSingle() para não lançar erro se não encontrar (RLS ou já deletado)
      const { data: acordoAntData, error: errBusca } = await supabase
        .from('acordos')
        .select('id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao')
        .eq('id', conflito.acordoId)
        .maybeSingle();

      if (errBusca) {
        console.warn('[transferência] erro ao buscar acordo anterior:', errBusca.message);
      }

      // Guardar dados para notificação mesmo após o delete
      const nomeClienteAnt = acordoAntData?.nome_cliente ?? '—';
      const valorFmt = acordoAntData?.valor != null
        ? `R$ ${Number(acordoAntData.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '—';
      const vencimentoFmt = acordoAntData?.vencimento
        ? new Date(acordoAntData.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
        : '—';
      const statusAnt = acordoAntData?.status ?? '—';

      // 2. Salvar acordo anterior na lixeira
      if (acordoAntData) {
        await enviarParaLixeira({
          acordo: acordoAntData as import('@/lib/supabase').Acordo,
          motivo: 'transferencia_nr',
          operadorNome: conflito.operadorNome,
          autorizadoPorId: liderUid,
          autorizadoPorNome: liderPerfil.nome,
          transferidoParaId: uid,
          transferidoParaNome: nomeNovoOp,
        });
      }

      // 3. Excluir acordo anterior do banco
      //    ⚠ O trigger trg_sync_nr_registros remove nr_registros automaticamente
      //    NÃO chamar transferirNr() depois — evita duplicidade no nr_registros
      const { error: errDelete } = await supabase
        .from('acordos').delete().eq('id', conflito.acordoId);
      if (errDelete) { toast.error(`Erro ao remover acordo anterior: ${errDelete.message}`); return; }

      // 4. Registrar log
      await supabase.from('logs_sistema').insert({
        usuario_id: uid, acao: 'transferencia_nr', tabela: 'acordos',
        registro_id: conflito.acordoId, empresa_id: empresa?.id ?? null,
        detalhes: {
          nr: nrLabel, nome_cliente: nomeClienteAnt,
          valor: valorFmt, vencimento: vencimentoFmt, status_anterior: statusAnt,
          aprovado_por: liderPerfil.nome, aprovado_por_id: liderUid,
          operador_anterior: conflito.operadorId, operador_anterior_nome: conflito.operadorNome,
          operador_novo: uid, operador_novo_nome: nomeNovoOp,
          empresa_id: empresa?.id ?? null,
        },
      });

      // 5. Salvar novo acordo
      //    ⚠ O trigger trg_sync_nr_registros fará INSERT em nr_registros automaticamente
      const resultError = await salvarAcordo(conflito.payload, uid);
      if (resultError) { toast.error(`Erro ao salvar: ${resultError.message}`); return; }

      // 6. Notificar operador anterior com TODOS os detalhes do acordo removido
      await criarNotificacao({
        usuario_id: conflito.operadorId,
        titulo: '⚠️ Seu acordo foi transferido pelo líder',
        mensagem:
          `O ${isPP ? 'Inscrição' : 'NR'} "${nrLabel}" ` +
          `(${nomeClienteAnt}) foi transferido para ${nomeNovoOp} ` +
          `com autorização de ${liderPerfil.nome}. ` +
          `Seu acordo foi movido para a lixeira. ` +
          `Detalhes do acordo removido: ` +
          `Valor ${valorFmt} | Vencimento ${vencimentoFmt} | Status: ${statusAnt}.`,
        empresa_id: empresa?.id,
      });

      toast.success('Transferência autorizada! Acordo registrado com sucesso.');
      setConflito(null); setLiderEmail(''); setLiderSenha('');
      // Suprimir aviso lint
      void campoNr;
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

      // 1. Rebaixar anterior para extra
      const { error: errReb } = await supabase.from('acordos')
        .update({
          tipo_vinculo:          'extra',
          vinculo_operador_id:   uid,
          vinculo_operador_nome: p?.nome ?? 'Operador',
        })
        .eq('id', acordoAnteriorId);
      if (errReb) { toast.error(`Erro ao rebaixar acordo: ${errReb.message}`); return; }

      // 2. Liberar NR antigo
      await supabase.from('nr_registros').delete().eq('acordo_id', acordoAnteriorId);

      // 3. Inserir novo como direto
      const payloadDireto = {
        ...payload,
        tipo_vinculo: 'direto',
        vinculo_operador_id:   operadorAntId,
        vinculo_operador_nome: operadorAntNome,
      };
      const resultErr = await salvarAcordo(payloadDireto, uid);
      if (resultErr) { toast.error(`Erro ao salvar: ${resultErr.message}`); return; }

      // 4. Buscar dados do anterior para a notificação
      const { data: acData } = await supabase
        .from('acordos')
        .select('nome_cliente')
        .eq('id', acordoAnteriorId)
        .maybeSingle();

      // 5. Notificar o operador anterior
      await criarNotificacao({
        usuario_id: operadorAntId,
        titulo:     '🔄 Seu acordo foi convertido em EXTRA',
        mensagem:
          `O ${labelCampo} "${nrL}" (${acData?.nome_cliente ?? '—'}) foi tabulado como DIRETO ` +
          `pelo operador ${p?.nome ?? 'outro operador'}. Seu acordo continua ativo, porém agora como EXTRA.`,
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
            /* ══════════════════════════════════════════════════════════════
               LAYOUT PAGUEPLAY
               Ordem: 1) Dados Principais  2) Tipo e Status  3) Dados do Profissional  4) Link do Acordo
            ══════════════════════════════════════════════════════════════ */
            <>
              {/* ── PP BLOCO 1: Dados Principais (Inscrição, Vencimento, Valor, Estado) ── */}
              <Card className="border-primary/30 bg-primary/3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                    <Hash className="w-4 h-4" /> Dados Principais
                    <span className="text-xs font-normal text-muted-foreground ml-1">campos mais importantes</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Inscrição — obrigatório no PP */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-primary">Inscrição *</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                      <Input
                        {...register('instituicao')}
                        placeholder="Número de inscrição"
                        className={cn(
                          'h-10 text-sm pl-8 border-primary/40 focus:border-primary',
                          errors.instituicao && 'border-destructive'
                        )}
                      />
                    </div>
                    {errors.instituicao && <p className="text-xs text-destructive">{errors.instituicao.message}</p>}
                  </div>

                  {/* Vencimento — calendário visual (mesmo componente do Inline) */}
                  <div className="space-y-1.5">
                    <DatePickerField
                      value={watch('vencimento') || ''}
                      onChange={(v) => setValue('vencimento', v, { shouldValidate: true })}
                      label="Vencimento"
                      required
                      size="md"
                      minDate="2026-01-01"
                      triggerClassName={cn(
                        'border-primary/40',
                        errors.vencimento && 'border-destructive',
                      )}
                      labelClassName="font-semibold text-primary"
                    />
                    {errors.vencimento && <p className="text-xs text-destructive">{errors.vencimento.message}</p>}
                  </div>

                  {/* Valor */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-primary">Valor *</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                      <Input
                        {...register('valor')}
                        placeholder="0.00"
                        className={cn(
                          'h-10 text-sm pl-8 font-mono border-primary/40 focus:border-primary',
                          errors.valor && 'border-destructive'
                        )}
                      />
                    </div>
                    {errors.valor && <p className="text-xs text-destructive">{errors.valor.message}</p>}
                  </div>

                  {/* Estado — obrigatório no PP */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-primary">Estado *</Label>
                    <Select value={estadoSelecionado} onValueChange={setEstadoSelecionado}>
                      <SelectTrigger className="h-10 text-sm border-primary/40 focus:border-primary">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-primary/60" />
                          <SelectValue placeholder="Selecione o estado" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_BRASIL.map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
              </Card>

              {/* ── PP BLOCO 2: Tipo e Status ── */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" /> Tipo e Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                  {/* Forma de Pagamento — apenas boleto e cartao para PP */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Forma de Pagamento *</Label>
                    <Select
                      value={watch('tipo')}
                      onValueChange={v => setValue('tipo', v as FormData['tipo'], { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boleto">Boleto / PIX</SelectItem>
                        <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Parcelas — Select 1-12 para PP (sempre visível para boleto e cartao) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Parcelas</Label>
                    <Select
                      value={watch('parcelas') || '1'}
                      onValueChange={v => setValue('parcelas', v, { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Status *</Label>
                    <Select
                      value={watch('status')}
                      onValueChange={v => setValue('status', v as FormData['status'], { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verificar_pendente">{STATUS_LABELS_PAGUEPLAY.verificar_pendente}</SelectItem>
                        <SelectItem value="pago">{STATUS_LABELS_PAGUEPLAY.pago}</SelectItem>
                        <SelectItem value="nao_pago">{STATUS_LABELS_PAGUEPLAY.nao_pago}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
              </Card>

              {/* ── PP BLOCO 3: Dados do Profissional (opcional) ── */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Dados do Profissional{' '}
                    <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Nome do Cliente — opcional, sem asterisco */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium">Nome do Cliente</Label>
                    <Input
                      {...register('nome_cliente')}
                      placeholder="Nome completo"
                      className={cn('h-9 text-sm', errors.nome_cliente && 'border-destructive')}
                    />
                    {errors.nome_cliente && <p className="text-xs text-destructive">{errors.nome_cliente.message}</p>}
                  </div>

                  {/* WhatsApp — oculto visualmente, mas presente no formulário */}
                  <div style={{ display: 'none' }}>
                    <Label className="text-xs font-medium">WhatsApp</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        {...register('whatsapp')}
                        placeholder="(11) 99999-9999"
                        className="h-9 text-sm pl-8 font-mono"
                      />
                    </div>
                  </div>

                  {/* CPF (nr_cliente) — opcional no PP */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">CPF</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        {...register('nr_cliente')}
                        placeholder="000.000.000-00"
                        className={cn(
                          'h-9 text-sm pl-8 font-mono',
                          errors.nr_cliente && 'border-destructive'
                        )}
                      />
                    </div>
                    {errors.nr_cliente && <p className="text-xs text-destructive">{errors.nr_cliente.message}</p>}
                  </div>

                </CardContent>
              </Card>

              {/* ── PP BLOCO 4: Link do Acordo ── */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <Link2 className="w-4 h-4" />
                    Link do Acordo
                    <span className="text-xs font-normal">(opcional)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    {...register('observacoes')}
                    placeholder="Cole aqui o link do acordo..."
                    className="text-sm resize-none"
                    rows={2}
                  />
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                    📅 Data de cadastro registrada automaticamente pelo sistema
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            /* ══════════════════════════════════════════════════════════════
               LAYOUT BOOKPLAY (!isPP) — IDÊNTICO AO ORIGINAL, SEM ALTERAÇÕES
            ══════════════════════════════════════════════════════════════ */
            <>
              {/* ══ BLOCO 1: NR + Vencimento + Valor — campos operacionais prioritários ══ */}
              <Card className="border-primary/30 bg-primary/3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                    <Hash className="w-4 h-4" /> Dados Principais
                    <span className="text-xs font-normal text-muted-foreground ml-1">campos mais importantes</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                  {/* NR / CPF — identificador principal */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-primary">NR do Cliente *</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                      <Input
                        {...register('nr_cliente')}
                        placeholder="000000"
                        className={cn(
                          'h-10 text-sm pl-8 font-mono font-bold border-primary/40 focus:border-primary',
                          errors.nr_cliente && 'border-destructive'
                        )}
                      />
                    </div>
                    {errors.nr_cliente && <p className="text-xs text-destructive">{errors.nr_cliente.message}</p>}
                  </div>

                  {/* Vencimento — campo prioritário */}
                  <div className="space-y-1.5">
                    <DatePickerField
                      value={watch('vencimento') || ''}
                      onChange={(v) => setValue('vencimento', v, { shouldValidate: true })}
                      label="Vencimento"
                      required
                      size="md"
                      minDate="2026-01-01"
                      triggerClassName={cn(
                        'border-primary/40',
                        errors.vencimento && 'border-destructive',
                      )}
                      labelClassName="font-semibold text-primary"
                    />
                    {errors.vencimento && <p className="text-xs text-destructive">{errors.vencimento.message}</p>}
                  </div>

                  {/* Valor */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-primary">Valor *</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                      <Input
                        {...register('valor')}
                        placeholder="0.00"
                        className={cn(
                          'h-10 text-sm pl-8 font-mono border-primary/40 focus:border-primary',
                          errors.valor && 'border-destructive'
                        )}
                      />
                    </div>
                    {errors.valor && <p className="text-xs text-destructive">{errors.valor.message}</p>}
                  </div>

                </CardContent>
              </Card>

              {/* ══ BLOCO 2: Dados do cliente ══ */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" /> Dados do Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium">Nome do Cliente *</Label>
                    <Input
                      {...register('nome_cliente')}
                      placeholder="Nome completo"
                      className={cn('h-9 text-sm', errors.nome_cliente && 'border-destructive')}
                    />
                    {errors.nome_cliente && <p className="text-xs text-destructive">{errors.nome_cliente.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">WhatsApp</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        {...register('whatsapp')}
                        placeholder="(11) 99999-9999"
                        className="h-9 text-sm pl-8 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Instituição</Label>
                    <Select
                      value={watch('instituicao') || ''}
                      onValueChange={v => setValue('instituicao', v, { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <SelectValue placeholder="Selecione a instituição" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {INSTITUICOES_OPTIONS.map(inst => (
                          <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
              </Card>

              {/* ══ BLOCO 3: Tipo, parcelas e status ══ */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" /> Tipo e Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Tipo *</Label>
                    <Select
                      value={watch('tipo')}
                      onValueChange={v => setValue('tipo', v as FormData['tipo'], { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="cartao_recorrente">Cartão Recorrente</SelectItem>
                        <SelectItem value="pix_automatico">Pix automático</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                        <SelectItem value="pix">Pix</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(['boleto', 'cartao_recorrente', 'pix_automatico'] as const).includes(tipoAtual as 'boleto' | 'cartao_recorrente' | 'pix_automatico') && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Parcelas</Label>
                      <Input
                        type="number" min="1" max={maxParcelas}
                        {...register('parcelas')}
                        placeholder="1"
                        className="h-9 text-sm font-mono"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Status *</Label>
                    <Select
                      value={watch('status')}
                      onValueChange={v => setValue('status', v as FormData['status'], { shouldValidate: true })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verificar_pendente">🔍 Verificar</SelectItem>
                        <SelectItem value="pago">✅ Pago</SelectItem>
                        <SelectItem value="nao_pago">❌ Não Pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
              </Card>

              {/* ══ BLOCO 4: Observações ══ */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <Info className="w-4 h-4" />
                    Observações
                    <span className="text-xs font-normal">(opcional)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    {...register('observacoes')}
                    placeholder="Informações adicionais..."
                    className="text-sm resize-none"
                    rows={2}
                  />
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                    📅 Data de cadastro registrada automaticamente pelo sistema
                  </p>
                </CardContent>
              </Card>
            </>
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
