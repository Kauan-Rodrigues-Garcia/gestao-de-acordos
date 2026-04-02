import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit, MessageSquare, CheckCircle2, Clock, Hash, User, Calendar, DollarSign, Smartphone, FileText, AlertCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase, Acordo, HistoricoAcordo } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import {
  STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_COLORS,
  formatCurrency, formatDate, isAtrasado
} from '@/lib/index';
import { cn } from '@/lib/utils';

export default function AcordoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const navigate = useNavigate();
  const [acordo, setAcordo] = useState<Acordo | null>(null);
  const [historico, setHistorico] = useState<HistoricoAcordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function fetchAcordo() {
    if (!id) return;
    const { data } = await supabase.from('acordos').select('*, perfis(id,nome,email,perfil)').eq('id', id).single();
    if (data) setAcordo(data as Acordo);
    const { data: hist } = await supabase
      .from('historico_acordos')
      .select('*, perfis(nome)')
      .eq('acordo_id', id)
      .order('criado_em', { ascending: false });
    setHistorico((hist as HistoricoAcordo[]) || []);
    setLoading(false);
  }

  useEffect(() => { fetchAcordo(); }, [id]);

  async function atualizarStatus(novoStatus: string) {
    if (!acordo || !perfil) return;
    setAtualizando(true);
    const statusAnterior = acordo.status;
    const { error } = await supabase.from('acordos').update({ status: novoStatus }).eq('id', acordo.id);
    if (!error) {
      await supabase.from('historico_acordos').insert({
        acordo_id: acordo.id,
        usuario_id: perfil.id,
        empresa_id: empresa?.id ?? null,
        campo_alterado: 'status',
        valor_anterior: statusAnterior,
        valor_novo: novoStatus,
      });
      toast.success('Status atualizado!');
      fetchAcordo();
    } else toast.error('Erro ao atualizar status');
    setAtualizando(false);
  }

  function enviarWhatsapp() {
    if (!acordo?.whatsapp) { toast.warning('WhatsApp não cadastrado'); return; }
    const msg = `Olá, ${acordo.nome_cliente}, passando para lembrar do seu acordo NR ${acordo.nr_cliente}, no valor de ${formatCurrency(acordo.valor)}, com vencimento em ${formatDate(acordo.vencimento)}. Qualquer dúvida, estamos à disposição.`;
    window.open(`https://wa.me/55${acordo.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  if (loading) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;
  if (!acordo) return <div className="p-6 text-center text-destructive">Acordo não encontrado</div>;

  const atrasado = isAtrasado(acordo.vencimento, acordo.status);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{acordo.nome_cliente}</h1>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[acordo.status])}>
              {STATUS_LABELS[acordo.status]}
            </span>
            {atrasado && <Badge variant="destructive" className="text-xs">Atrasado</Badge>}
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">NR: {acordo.nr_cliente}</p>
        </div>
        <div className="flex gap-2">
          {acordo.whatsapp && (
            <Button variant="outline" size="sm" onClick={enviarWhatsapp} className="gap-2 text-success border-success/30 hover:bg-success/10">
              <MessageSquare className="w-4 h-4" /> WhatsApp
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to={`/acordos/${acordo.id}/editar`}>
              <Edit className="w-4 h-4 mr-2" /> Editar
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dados principais */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Detalhes do Acordo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: 'Cliente', value: acordo.nome_cliente, icon: User },
                  { label: 'NR', value: acordo.nr_cliente, icon: Hash, mono: true },
                  { label: 'Cadastrado', value: formatDate(acordo.data_cadastro), icon: Calendar },
                  { label: 'Vencimento', value: formatDate(acordo.vencimento), icon: Calendar, danger: atrasado },
                  { label: 'Valor', value: formatCurrency(acordo.valor), icon: DollarSign, mono: true },
                  { label: 'WhatsApp', value: acordo.whatsapp || '-', icon: Smartphone, mono: true },
                  { label: 'Instituição', value: acordo.instituicao || '-', icon: Building2 },
                  { label: 'Empresa', value: empresa?.nome || '-', icon: Building2 },
                ].map(({ label, value, icon: Icon, mono, danger }) => (
                  <div key={label} className="flex items-start gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={cn('font-medium', mono && 'font-mono', danger && 'text-destructive')}>{value}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', TIPO_COLORS[acordo.tipo])}>
                      {TIPO_LABELS[acordo.tipo]}
                    </span>
                    {(['boleto', 'cartao_recorrente'] as const).includes(acordo.tipo as 'boleto' | 'cartao_recorrente') && <p className="text-xs text-muted-foreground mt-0.5">{acordo.parcelas}x parcela(s)</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Operador</p>
                    <p className="font-medium">{(acordo.perfis as { nome?: string } | undefined)?.nome || '-'}</p>
                  </div>
                </div>
              </div>
              {acordo.observacoes && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3">{acordo.observacoes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Histórico de Alterações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma alteração registrada</p>
              ) : (
                <div className="space-y-3">
                  {historico.map(h => (
                    <div key={h.id} className="flex gap-3 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">{(h.perfis as { nome?: string } | undefined)?.nome || 'Sistema'}</span>
                          {' '} alterou <span className="font-mono text-primary">{h.campo_alterado}</span>
                          {h.valor_anterior && <> de <span className="line-through text-muted-foreground">{h.valor_anterior}</span></>}
                          {h.valor_novo && <> para <span className="font-medium text-foreground">{h.valor_novo}</span></>}
                        </p>
                        <p className="text-muted-foreground/60 mt-0.5">{new Date(h.criado_em).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ações rápidas */}
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Atualizar Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={acordo.status} onValueChange={atualizarStatus} disabled={atualizando}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full gap-2 bg-success hover:bg-success/90 text-white"
                size="sm"
                disabled={acordo.status === 'pago' || atualizando}
                onClick={() => atualizarStatus('pago')}
              >
                <CheckCircle2 className="w-4 h-4" />
                Marcar como Pago
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">WhatsApp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {acordo.whatsapp ? (
                <>
                  <p className="text-xs text-muted-foreground font-mono">{acordo.whatsapp}</p>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-success border-success/30 hover:bg-success/10" onClick={enviarWhatsapp}>
                    <MessageSquare className="w-4 h-4" /> Enviar Lembrete
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>WhatsApp não cadastrado</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
