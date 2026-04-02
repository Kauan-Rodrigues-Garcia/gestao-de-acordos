import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  Save, ArrowLeft, User, Hash, Calendar,
  DollarSign, Smartphone, FileText, Info, AlertCircle, Building2, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase, Perfil } from '@/lib/supabase';
import { ROUTE_PATHS, parseCurrencyInput, getTodayISO } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// data_cadastro: opcional no form — preenchida automaticamente pelo sistema
const schema = z.object({
  nome_cliente: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  nr_cliente:   z.string().min(1, 'NR do cliente é obrigatório').regex(/^\d+$/, 'NR deve conter apenas números'),
  vencimento:   z.string().min(1, 'Data de vencimento é obrigatória'),
  valor: z.string().min(1, 'Valor é obrigatório').refine(v => {
    const n = parseCurrencyInput(v);
    return !isNaN(n) && n > 0;
  }, 'Valor deve ser maior que zero'),
  tipo:        z.enum(['boleto', 'pix', 'cartao', 'cartao_recorrente', 'pix_automatico']),
  parcelas:    z.string().optional().refine(v => !v || (parseInt(v) > 0 && parseInt(v) <= 60), 'Parcelas entre 1 e 60'),
  whatsapp:    z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'WhatsApp deve ter DDD + número'),
  instituicao: z.string().max(100, 'Nome da instituição muito longo').optional(),
  status:      z.enum(['verificar_pendente', 'pago', 'nao_pago']),
  observacoes: z.string().max(500, 'Observações muito longas').optional(),
});

type FormData = z.infer<typeof schema>;

export default function AcordoForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { perfil, user, perfilLoading } = useAuth();
  const { empresa } = useEmpresa();
  const navigate = useNavigate();
  const [loading, setLoading]         = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [perfilLocal, setPerfilLocal] = useState<Perfil | null>(null);

  // NR duplicate / leader auth state
  const [nrDuplicado, setNrDuplicado]       = useState(false);
  const [pendingPayload, setPendingPayload]   = useState<Record<string, unknown> | null>(null);
  const [liderEmail, setLiderEmail]           = useState('');
  const [liderSenha, setLiderSenha]           = useState('');
  const [autorizando, setAutorizando]         = useState(false);
  const [nrOriginalEdit, setNrOriginalEdit]   = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
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
    supabase.from('perfis').select('*, setores(id, nome)').eq('id', user.id).single()
      .then(({ data, error }) => {
        if (error) {
          supabase.from('perfis').select('*').eq('id', user.id).single()
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
          observacoes:  data.observacoes || '',
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
    if (!empresa?.id) { toast.error('Tenant do site não carregado.'); return; }

    // Validar data de vencimento apenas em novos acordos
    if (!isEdit) {
      const today = getTodayISO();
      if (data.vencimento < today) {
        toast.error('A data de vencimento não pode ser anterior à data atual');
        return;
      }
    }

    setLoading(true);
    try {
      const valorNum = parseCurrencyInput(data.valor);
      if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); setLoading(false); return; }

      const nrTrimmed = data.nr_cliente.trim();

      // Payload base — colunas que EXISTEM no schema original (01_schema_completo.sql)
      const payload: Record<string, unknown> = {
        nome_cliente:  data.nome_cliente.trim(),
        nr_cliente:    nrTrimmed,
        data_cadastro: new Date().toISOString().split('T')[0],
        vencimento:    data.vencimento,
        valor:         valorNum,
        tipo:          data.tipo,
        parcelas:      (['boleto', 'cartao_recorrente'].includes(data.tipo)) ? parseInt(data.parcelas || '1', 10) : 1,
        whatsapp:      data.whatsapp?.trim() || null,
        status:        data.status,
        observacoes:   data.observacoes?.trim() || null,
        operador_id:   uid,
        empresa_id:    empresa.id,
      };

      // Adicionar colunas extras APENAS se houver valor, e tentar tratar erro se a coluna não existir
      if (data.instituicao?.trim()) payload.instituicao = data.instituicao.trim();
      if (p?.setor_id) payload.setor_id = p.setor_id;

      console.log('[AcordoForm] payload:', payload);

      // Verificar unicidade do NR: só bloquear se NR mudou (ou é novo cadastro)
      const nrMudou = !isEdit || nrTrimmed !== nrOriginalEdit;
      if (nrMudou) {
        let nrQuery = supabase
          .from('acordos')
          .select('id, operador_id, perfis(nome)')
          .eq('nr_cliente', nrTrimmed)
          .neq('operador_id', uid)
          .limit(1);

        // Na edição, excluir o próprio registro
        if (isEdit && id) nrQuery = nrQuery.neq('id', id);

        const { data: existente } = await nrQuery;
        if (existente && existente.length > 0) {
          setPendingPayload(payload);
          setNrDuplicado(true);
          setLoading(false);
          return;
        }
      }

      const resultError = await salvarAcordo(payload, uid);

      if (resultError) {
        console.error('[AcordoForm] error:', resultError);
        toast.error(`Erro ao salvar: ${resultError.message}`);
        return;
      }

      toast.success(isEdit ? 'Acordo atualizado!' : 'Acordo cadastrado com sucesso!');
      navigate(ROUTE_PATHS.ACORDOS);
    } catch (e) {
      console.error('[AcordoForm] unexpected:', e);
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  // ── Autorização do líder para NR duplicado ────────────────────────────
  async function autorizarLider() {
    if (!pendingPayload) return;
    if (!liderEmail || !liderSenha) { toast.error('Informe o email e senha do líder'); return; }
    setAutorizando(true);
    try {
      const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      if (!supabaseUrl || !supabaseAnon) {
        toast.error('Configuração do Supabase ausente. Contate o suporte.');
        return;
      }

      // Verificar credenciais do líder via fetch direto, sem criar uma segunda instância
      // GoTrueClient (que causava "Multiple GoTrueClient instances" e corrupção de sessão)
      const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnon,
        },
        body: JSON.stringify({ email: liderEmail, password: liderSenha }),
      });

      if (!authRes.ok) {
        const errBody = await authRes.json().catch(() => ({}));
        console.error('[autorizarLider] auth error:', authRes.status, errBody);
        if (authRes.status === 400 || authRes.status === 401 || authRes.status === 422) {
          toast.error('Credenciais do líder inválidas');
        } else {
          toast.error(`Erro ao autenticar líder (${authRes.status}). Tente novamente.`);
        }
        return;
      }

      const authData = await authRes.json();
      const liderUid   = authData.user?.id as string | undefined;
      const liderToken = authData.access_token as string | undefined;

      if (!liderUid || !liderToken) {
        toast.error('Credenciais do líder inválidas');
        return;
      }

      // Verificar perfil do líder usando o token do líder via REST direto
      // A sessão do operador (supabase global) não é tocada
      const perfilRes = await fetch(
        `${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`,
        {
          headers: {
            'apikey': supabaseAnon,
            'Authorization': `Bearer ${liderToken}`,
          },
        }
      );

      if (!perfilRes.ok) {
        console.error('[autorizarLider] perfil fetch error:', perfilRes.status);
        toast.error('Erro ao verificar perfil do líder');
        return;
      }

      const perfilArr = await perfilRes.json();
      const liderPerfil = Array.isArray(perfilArr) ? perfilArr[0] : null;

      if (!liderPerfil || !['lider', 'administrador'].includes(liderPerfil.perfil)) {
        toast.error('O usuário informado não tem permissão de líder');
        return;
      }

      const uid = perfilLocal?.id ?? user?.id ?? '';
      const nrCliente = pendingPayload.nr_cliente as string;

      // Registrar log de transferência com a sessão do operador (não alterada)
      await supabase.from('logs_sistema').insert({
        usuario_id: uid,
        acao: 'transferencia_nr',
        tabela: 'acordos',
        registro_id: null,
        empresa_id: empresa?.id ?? null,
        detalhes: {
          nr: nrCliente,
          aprovado_por: liderPerfil.nome,
          aprovado_por_id: liderUid,
          operador_novo: uid,
          transferido_em: new Date().toISOString(),
        },
      });

      // Salvar o acordo com a sessão do operador (intacta, sem refreshSession)
      const resultError = await salvarAcordo(pendingPayload, uid);
      if (resultError) {
        console.error('[autorizarLider] save error:', resultError);
        toast.error(`Erro ao salvar: ${resultError.message}`);
        return;
      }

      // Notificar o operador sobre a autorização
      supabase.from('notificacoes').insert({
        usuario_id: uid,
        titulo: 'NR Autorizado pelo Líder',
        mensagem: `O líder ${liderPerfil.nome} autorizou a tabulação do NR ${nrCliente}.`,
        empresa_id: empresa?.id ?? null,
      }).then(({ error: notifError }) => {
        if (notifError) console.warn('[autorizarLider] notificacao error:', notifError.message);
      });

      // Registrar log detalhado da autorização
      supabase.from('logs_sistema').insert({
        usuario_id: uid,
        acao: 'autorizacao_nr_lider',
        tabela: 'acordos',
        registro_id: null,
        empresa_id: empresa?.id ?? null,
        detalhes: {
          nr_cliente: nrCliente,
          lider_id: liderUid,
          lider_nome: liderPerfil.nome,
          tipo: 'nr_duplicado_autorizado',
        },
      }).then(({ error: logError }) => {
        if (logError) console.warn('[autorizarLider] log error:', logError.message);
      });

      toast.success('NR registrado com autorização do líder');
      setNrDuplicado(false);
      setPendingPayload(null);
      navigate(ROUTE_PATHS.ACORDOS);
    } catch (e) {
      console.error('[autorizarLider] unexpected:', e);
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setAutorizando(false);
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

      {/* Modal de autorização do líder */}
      <Dialog open={nrDuplicado} onOpenChange={open => { if (!open) { setNrDuplicado(false); setPendingPayload(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-warning" />
              NR já vinculado
            </DialogTitle>
            <DialogDescription>
              Este NR já está vinculado a outro operador. Para prosseguir, solicite autorização do líder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email do Líder</Label>
              <Input
                type="email"
                placeholder="lider@empresa.com"
                value={liderEmail}
                onChange={e => setLiderEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Senha do Líder</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={liderSenha}
                onChange={e => setLiderSenha(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setNrDuplicado(false); setPendingPayload(null); }}>
                Cancelar
              </Button>
              <Button className="flex-1 gap-2" onClick={autorizarLider} disabled={autorizando}>
                <Shield className="w-4 h-4" />
                {autorizando ? 'Verificando...' : 'Autorizar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

          {/* ══ BLOCO 1: NR + Vencimento + Valor — campos operacionais prioritários ══ */}
          <Card className="border-primary/30 bg-primary/3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                <Hash className="w-4 h-4" /> Dados Principais
                <span className="text-xs font-normal text-muted-foreground ml-1">campos mais importantes</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* NR — identificador principal */}
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
                <Label className="text-xs font-semibold text-primary">Vencimento *</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                  <input
                    type="date"
                    {...register('vencimento')}
                    min={!isEdit ? getTodayISO() : undefined}
                    className={cn(
                      'w-full h-10 text-sm bg-background border border-primary/40 rounded-md pl-9 pr-3',
                      'text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono',
                      errors.vencimento && 'border-destructive'
                    )}
                  />
                </div>
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
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    {...register('instituicao')}
                    placeholder="Banco, financeira, empresa..."
                    className="h-9 text-sm pl-8"
                  />
                </div>
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

              {(['boleto', 'cartao_recorrente'] as const).includes(tipoAtual as 'boleto' | 'cartao_recorrente') && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Parcelas</Label>
                  <Input
                    type="number" min="1" max="60"
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
                    <SelectItem value="verificar_pendente">🔍 Verificar / Pendente</SelectItem>
                    <SelectItem value="pago">✅ Pago</SelectItem>
                    <SelectItem value="nao_pago">❌ Não Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </CardContent>
          </Card>

          {/* ══ BLOCO 4: Observações (opcional, colapsado visualmente) ══ */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Info className="w-4 h-4" /> Observações <span className="text-xs font-normal">(opcional)</span>
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
