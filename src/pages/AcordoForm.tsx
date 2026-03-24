import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  Save, ArrowLeft, User, Hash, Calendar,
  DollarSign, Smartphone, FileText, Info, AlertCircle, Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase, Perfil } from '@/lib/supabase';
import { ROUTE_PATHS, parseCurrencyInput } from '@/lib/index';
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
  tipo:        z.enum(['boleto', 'pix', 'cartao']),
  parcelas:    z.string().optional().refine(v => !v || (parseInt(v) > 0 && parseInt(v) <= 60), 'Parcelas entre 1 e 60'),
  whatsapp:    z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'WhatsApp deve ter DDD + número'),
  instituicao: z.string().optional().max(100, 'Nome da instituição muito longo'),
  status:      z.enum(['pendente', 'pago', 'verificar', 'vencido', 'cancelado', 'em_acompanhamento']),
  observacoes: z.string().optional().max(500, 'Observações muito longas'),
});

type FormData = z.infer<typeof schema>;

export default function AcordoForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { perfil, user, perfilLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading]         = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [perfilLocal, setPerfilLocal] = useState<Perfil | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo:     'boleto',
      status:   'pendente',
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

  // ── Submit ────────────────────────────────────────────────────────────
  async function onSubmit(data: FormData) {
    const p   = perfilLocal ?? perfil;
    const uid = p?.id ?? user?.id;
    if (!uid) { toast.error('Não foi possível identificar o usuário. Recarregue a página.'); return; }

    setLoading(true);
    try {
      const valorNum = parseCurrencyInput(data.valor);
      if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); setLoading(false); return; }

      const payload = {
        nome_cliente:  data.nome_cliente.trim(),
        nr_cliente:    data.nr_cliente.trim(),
        data_cadastro: new Date().toISOString().split('T')[0],
        vencimento:    data.vencimento,
        valor:         valorNum,
        tipo:          data.tipo,
        parcelas:      data.tipo === 'boleto' ? parseInt(data.parcelas || '1', 10) : 1,
        whatsapp:      data.whatsapp?.trim() || null,
        status:        data.status,
        observacoes:   data.observacoes?.trim() || null,
        operador_id:   uid,
        setor_id:      p?.setor_id ?? null,
      };

      // Tentar incluir `instituicao` — só funciona após a migration ser aplicada
      const payloadFinal: Record<string, unknown> = { ...payload };
      const instVal = data.instituicao?.trim() || null;
      if (instVal) payloadFinal.instituicao = instVal;

      console.log('[AcordoForm] payload:', payloadFinal);

      let resultError = null;
      let resultData: { id: string } | null = null;

      if (isEdit && id) {
        const { error, data: upd } = await supabase
          .from('acordos').update(payloadFinal).eq('id', id).select('id').single();
        // fallback: se falhou por coluna instituicao, retentar sem ela
        if (error?.message.includes('instituicao')) {
          const { instituicao: _i, ...semInst } = payloadFinal;
          const { error: e2, data: u2 } = await supabase.from('acordos').update(semInst).eq('id', id).select('id').single();
          resultError = e2; resultData = u2;
        } else { resultError = error; resultData = upd; }
      } else {
        const { error, data: ins } = await supabase
          .from('acordos').insert(payloadFinal).select('id').single();
        // fallback: se falhou por coluna instituicao, retentar sem ela
        if (error?.message.includes('instituicao')) {
          const { instituicao: _i, ...semInst } = payloadFinal;
          const { error: e2, data: i2 } = await supabase.from('acordos').insert(semInst).select('id').single();
          resultError = e2; resultData = i2;
        } else { resultError = error; resultData = ins; }
      }

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

  // ── Render ────────────────────────────────────────────────────────────
  if (loadingData) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;
  if (!perfilLocal && perfilLoading) return <div className="p-6 text-center text-muted-foreground">Carregando perfil...</div>;

  const hasErrors = Object.keys(errors).length > 0;
  const p = perfilLocal ?? perfil;
  const nomeSetor = (p?.setores as { nome?: string } | undefined)?.nome;

  return (
    <div className="p-6 max-w-2xl mx-auto">

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
                  onValueChange={v => setValue('tipo', v as 'boleto'|'pix'|'cartao', { shouldValidate: true })}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {tipoAtual === 'boleto' && (
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
                    <SelectItem value="pendente">⏳ Pendente</SelectItem>
                    <SelectItem value="pago">✅ Pago</SelectItem>
                    <SelectItem value="verificar">🔍 Verificar</SelectItem>
                    <SelectItem value="vencido">❌ Vencido</SelectItem>
                    <SelectItem value="cancelado">🚫 Cancelado</SelectItem>
                    <SelectItem value="em_acompanhamento">👀 Em Acompanhamento</SelectItem>
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
