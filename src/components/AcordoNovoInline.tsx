/**
 * AcordoNovoInline.tsx
 *
 * CAMPOS OBRIGATÓRIOS:
 *   PaguePay → "Dados Principais": Inscrição, Valor, Vencimento
 *   Bookplay  → "Dados Principais": Valor, Vencimento
 *   "Tipo e Status": tem defaults, sempre válido
 *   Todos os outros campos são OPCIONAIS.
 *
 * PARCELAMENTO:
 *   Salva APENAS 1 registro no banco.
 *   O campo `parcelas` guarda o total como metadado.
 *   O campo `acordo_grupo_id` é gerado para permitir vincular reagendamentos futuros.
 *   Parcelas 2..N são criadas uma a uma via botão "Reagendar" no AcordoDetalheInline.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import { X, Save, User, Hash, DollarSign, FileText, Link2, CalendarIcon, Shield } from 'lucide-react';
import {
  ESTADOS_BRASIL, parseCurrencyInput, buildObservacoesComEstado, INSTITUICOES_OPTIONS,
} from '@/lib/index';
import { cn } from '@/lib/utils';
import { verificarNrDuplicado } from '@/services/acordos.service';
import { criarNotificacao } from '@/services/notificacoes.service';

// Data mínima removida — PaguePlay pode selecionar qualquer data livremente

/** DatePicker compacto — abre calendário ao clicar */
function DatePickerField({
  value, onChange, label, required,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && ' *'}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full h-8 text-xs justify-start gap-2 font-mono px-2',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
            {selected
              ? format(selected, 'dd/MM/yyyy')
              : 'Selecionar data'
            }
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (day) {
                onChange(format(day, 'yyyy-MM-dd'));
                setOpen(false);
              }
            }}
            disabled={undefined}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const TIPOS_PAGUEPLAY = [
  { value: 'boleto_pix', label: 'Boleto / PIX',      parcelado: true  },
  { value: 'cartao',     label: 'Cartão de Crédito',  parcelado: false },
];

const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto',            parcelado: true  },
  { value: 'pix_automatico',    label: 'PIX Automático',    parcelado: true  },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente', parcelado: true  },
  { value: 'cartao',            label: 'Cartão de Crédito', parcelado: false },
  { value: 'pix',               label: 'PIX',               parcelado: false },
];

const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente'  },
  { value: 'pago',               label: 'Pago'       },
  { value: 'nao_pago',           label: 'Não Pago'   },
];

const PARCELAS_PP = Array.from({ length: 12 }, (_, i) => i + 1);

export interface AcordoNovoInlineProps {
  isPaguePlay: boolean;
  colSpan: number;
  /** Recebe o acordo inserido para optimistic update no pai */
  onSaved: (inserido: import('@/lib/supabase').Acordo) => void;
  onCancel: () => void;
}

export function AcordoNovoInline({ isPaguePlay, colSpan, onSaved, onCancel }: AcordoNovoInlineProps) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [nomeCliente,  setNomeCliente]  = useState('');
  const [nrCliente,    setNrCliente]    = useState('');
  const [vencimento,   setVencimento]   = useState('');
  const [valorStr,     setValorStr]     = useState('');
  const [tipo,         setTipo]         = useState(isPaguePlay ? 'boleto_pix' : 'boleto');
  const [parcelasStr,  setParcelasStr]  = useState('1');
  const [whatsapp,     setWhatsapp]     = useState('');
  const [instituicao,  setInstituicao]  = useState('');
  const [status,       setStatus]       = useState('verificar_pendente');
  const [observacoes,  setObservacoes]  = useState('');
  const [estadoSel,    setEstadoSel]    = useState('');
  const [link,         setLink]         = useState('');
  const [salvando,     setSalvando]     = useState(false);
  // ── NR duplicado + autorização líder ─────────────────────────────────
  const [nrDuplicado,   setNrDuplicado]   = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [liderEmail,    setLiderEmail]    = useState('');
  const [liderSenha,    setLiderSenha]    = useState('');
  const [autorizando,   setAutorizando]   = useState(false);

  const tipos      = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const tipoAtual  = tipos.find(t => t.value === tipo);
  const temParcelas = !!tipoAtual?.parcelado;
  const parcelas    = Math.max(1, parseInt(parcelasStr) || 1);

  function handleChangeTipo(t: string) {
    setTipo(t);
    if (!tipos.find(x => x.value === t)?.parcelado) setParcelasStr('1');
  }

  // ── Validação: obrigatório apenas Dados Principais ─────────────────────
  function validar(): string | null {
    if (!vencimento)                        return 'Data de vencimento obrigatória';
    const v = parseCurrencyInput(valorStr);
    if (isNaN(v) || v <= 0)                 return 'Informe o valor do acordo';
    if (isPaguePlay && !instituicao.trim()) return 'Inscrição é obrigatória';
    return null;
  }

  async function executarSalvar(payload: Record<string, unknown>) {
    const { data: inserido, error } = await supabase
      .from('acordos')
      .insert(payload)
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .single();
    if (error) {
      const isColErr =
        String(error.code) === '42703' ||
        String(error.code) === '400'   ||
        error.message?.toLowerCase().includes('column') ||
        error.message?.toLowerCase().includes('unknown');
      if (isColErr) {
        const { acordo_grupo_id: _g, numero_parcela: _n, ...payloadMin } = payload;
        const { data: inseridoMin, error: e2 } = await supabase
          .from('acordos').insert(payloadMin)
          .select('*, perfis(id, nome, email, perfil, setor_id)').single();
        if (e2) { toast.error(`Erro ao salvar: ${e2.message}`); return false; }
        onSaved(inseridoMin as import('@/lib/supabase').Acordo);
        return true;
      }
      toast.error(`Erro ao salvar: ${error.message}`);
      return false;
    }
    onSaved(inserido as import('@/lib/supabase').Acordo);
    return true;
  }

  async function salvar() {
    const erro = validar();
    if (erro) { toast.error(erro); return; }
    if (!perfil?.id)  { toast.error('Usuário não autenticado'); return; }
    if (!empresa?.id) { toast.error('Empresa não identificada'); return; }

    setSalvando(true);
    try {
      const valorNum = parseCurrencyInput(valorStr);
      const obsFinal = isPaguePlay
        ? (buildObservacoesComEstado(estadoSel || '', link.trim() || '') || null)
        : (observacoes.trim() || null);

      const tipoParaSalvar = tipo === 'boleto_pix' ? 'boleto' : tipo;
      const grupoId = crypto.randomUUID();

      const payload: Record<string, unknown> = {
        nome_cliente:    nomeCliente.trim() || '',
        nr_cliente:      nrCliente.trim()   || '',
        vencimento,
        valor:           valorNum,
        tipo:            tipoParaSalvar,
        parcelas:        temParcelas ? parcelas : 1,
        whatsapp:        whatsapp.trim()    || null,
        instituicao:     instituicao.trim() || null,
        status,
        observacoes:     obsFinal,
        operador_id:     perfil.id,
        empresa_id:      empresa.id,
        data_cadastro:   new Date().toISOString().split('T')[0],
        acordo_grupo_id: grupoId,
        numero_parcela:  1,
      };

      // ── Verificar NR duplicado ─────────────────────────────────────
      const nrTrimmed = nrCliente.trim();
      if (nrTrimmed) {
        const { duplicado } = await verificarNrDuplicado(nrTrimmed, empresa.id);
        if (duplicado) {
          // Verificar se é de outro operador (requer autorização do líder)
          const { data: existente } = await supabase
            .from('acordos')
            .select('id, operador_id')
            .eq('nr_cliente', nrTrimmed)
            .eq('empresa_id', empresa.id)
            .neq('operador_id', perfil.id)
            .limit(1);
          if (existente && existente.length > 0) {
            // NR pertence a outro operador → pedir autorização do líder
            setPendingPayload(payload);
            setNrDuplicado(true);
            setSalvando(false);
            return;
          } else {
            toast.error(`NR ${nrTrimmed} já existe nesta empresa. Não é possível criar duplicatas.`);
            setSalvando(false);
            return;
          }
        }
      }

      const ok = await executarSalvar(payload);
      if (ok) {
        toast.success(parcelas > 1 ? `Acordo criado! ${parcelas} parcelas gerenciadas pelo Reagendar.` : 'Acordo criado com sucesso!');
      }
    } finally {
      setSalvando(false);
    }
  }

  // ── Autorização do líder para NR duplicado ─────────────────────────────
  async function autorizarLider() {
    if (!pendingPayload) return;
    if (!liderEmail || !liderSenha) { toast.error('Informe o email e senha do líder'); return; }
    setAutorizando(true);
    try {
      const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!supabaseUrl || !supabaseAnon) { toast.error('Configuração do Supabase ausente.'); return; }

      const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnon },
        body: JSON.stringify({ email: liderEmail, password: liderSenha }),
      });
      if (!authRes.ok) {
        const status = authRes.status;
        if (status === 400 || status === 401 || status === 422) toast.error('Credenciais do líder inválidas');
        else toast.error(`Erro ao autenticar líder (${status})`);
        return;
      }
      const authData = await authRes.json();
      const liderUid = authData.user?.id as string | undefined;
      const liderToken = authData.access_token as string | undefined;
      if (!liderUid || !liderToken) { toast.error('Credenciais do líder inválidas'); return; }

      const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`, {
        headers: { 'apikey': supabaseAnon, 'Authorization': `Bearer ${liderToken}` },
      });
      if (!perfilRes.ok) { toast.error('Erro ao verificar perfil do líder'); return; }
      const perfilArr = await perfilRes.json();
      const liderPerfil = Array.isArray(perfilArr) ? perfilArr[0] : null;
      if (!liderPerfil || !['lider', 'administrador'].includes(liderPerfil.perfil)) {
        toast.error('O usuário informado não tem permissão de líder');
        return;
      }

      const uid = perfil?.id ?? '';
      const nrCliente = pendingPayload.nr_cliente as string;

      // Log de transferência
      await supabase.from('logs_sistema').insert({
        usuario_id: uid,
        acao: 'transferencia_nr',
        tabela: 'acordos',
        registro_id: null,
        empresa_id: empresa?.id ?? null,
        detalhes: { nr: nrCliente, aprovado_por: liderPerfil.nome, aprovado_por_id: liderUid, operador_novo: uid },
      });

      const ok = await executarSalvar(pendingPayload);
      if (!ok) return;

      // Notificação para o operador
      criarNotificacao({
        usuario_id: uid,
        titulo: 'NR Autorizado pelo Líder',
        mensagem: `O líder ${liderPerfil.nome} autorizou a tabulação do NR ${nrCliente}.`,
        empresa_id: empresa?.id ?? null,
      });

      toast.success('NR registrado com autorização do líder');
      setNrDuplicado(false);
      setPendingPayload(null);
      setLiderEmail('');
      setLiderSenha('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setAutorizando(false);
    }
  }

  /* ─── Render PaguePay ──────────────────────────────────────────────────── */
  if (isPaguePlay) {
    return (
      <>
      <tr className="bg-primary/5 border-b-2 border-primary/30">
        <td colSpan={colSpan} className="px-4 py-4">
          <div className="space-y-4">

            {/* Título */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Save className="w-4 h-4 text-primary" /> Novo Acordo
              </p>
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onCancel} disabled={salvando}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* ── Dados Principais (obrigatórios: Inscrição, Valor, Vencimento) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Dados Principais
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Inscrição *</Label>
                  <Input value={instituicao} onChange={e => setInstituicao(e.target.value)}
                    placeholder="Número de inscrição" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor *</Label>
                  <Input value={valorStr} onChange={e => setValorStr(e.target.value)}
                    placeholder="0,00" className="h-8 text-xs font-mono" />
                </div>
                <DatePickerField
                  label="Vencimento"
                  required
                  value={vencimento}
                  onChange={setVencimento}
                />
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={estadoSel} onValueChange={setEstadoSel}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>
                      {(ESTADOS_BRASIL as string[]).map(uf => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Tipo e Status (tem defaults, sempre válido) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Tipo e Status
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Forma de Pagamento</Label>
                  <Select value={tipo} onValueChange={handleChangeTipo}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_PAGUEPLAY.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Parcelas {!temParcelas && <span className="text-muted-foreground/50 font-normal">(não se aplica)</span>}
                  </Label>
                  <Select value={parcelasStr} onValueChange={setParcelasStr} disabled={!temParcelas}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARCELAS_PP.map(n => (
                        <SelectItem key={n} value={String(n)}>{n === 1 ? '1 (à vista)' : `${n}x`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Dados do Profissional (opcional) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Dados do Profissional
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Nome Completo</Label>
                  <Input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome do profissional" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CPF</Label>
                  <Input value={nrCliente} onChange={e => setNrCliente(e.target.value)}
                    placeholder="000.000.000-00" className="h-8 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* ── Link (opcional) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Link do Acordo
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <Textarea value={link} onChange={e => setLink(e.target.value)}
                placeholder="Cole aqui o link do acordo..." className="text-xs resize-none" rows={2} />
            </div>

            {/* Botões */}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={salvar} disabled={salvando}>
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando...' : 'Salvar Acordo'}
              </Button>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={salvando}>Cancelar</Button>
            </div>

          </div>
        </td>
      </tr>

      {/* Dialog autorização líder — PaguePay */}
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
              <Input type="email" placeholder="lider@empresa.com" value={liderEmail}
                onChange={e => setLiderEmail(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Senha do Líder</Label>
              <Input type="password" placeholder="••••••••" value={liderSenha}
                onChange={e => setLiderSenha(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setNrDuplicado(false); setPendingPayload(null); }}>Cancelar</Button>
              <Button className="flex-1 gap-2" onClick={autorizarLider} disabled={autorizando}>
                <Shield className="w-4 h-4" />{autorizando ? 'Verificando...' : 'Autorizar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
    );
  }

  /* ─── Render Bookplay ──────────────────────────────────────────────────── */
  return (
    <>
      <tr className="bg-primary/5 border-b-2 border-primary/30">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="space-y-4">

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Save className="w-4 h-4 text-primary" /> Novo Acordo
            </p>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onCancel} disabled={salvando}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* ── Dados Principais (obrigatórios: Valor, Vencimento) ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Dados Principais
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">NR</Label>
                <Input value={nrCliente} onChange={e => setNrCliente(e.target.value)}
                  placeholder="Número NR" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vencimento *</Label>
                <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}
                  className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor *</Label>
                <Input value={valorStr} onChange={e => setValorStr(e.target.value)}
                  placeholder="0,00" className="h-8 text-xs font-mono" />
              </div>
            </div>
          </div>

          {/* ── Dados do Cliente (opcional) ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <User className="w-3 h-3" /> Dados do Cliente
              <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Nome do Cliente</Label>
                <Input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)}
                  placeholder="Nome completo" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp</Label>
                <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instituição</Label>
                <Select value={instituicao} onValueChange={setInstituicao}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(INSTITUICOES_OPTIONS as { value: string; label: string }[]).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Tipo e Status ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Tipo e Status
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={tipo} onValueChange={handleChangeTipo}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_BOOKPLAY.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {temParcelas && (
                <div className="space-y-1">
                  <Label className="text-xs">Parcelas</Label>
                  <Input type="number" min={1} max={60} value={parcelasStr}
                    onChange={e => setParcelasStr(e.target.value)} className="h-8 text-xs font-mono" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Observações (opcional) ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Observações
              <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
            </p>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="Observações opcionais..." className="text-xs resize-none" rows={2} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={salvar} disabled={salvando}>
              <Save className="w-3.5 h-3.5" />
              {salvando ? 'Salvando...' : 'Salvar Acordo'}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={salvando}>Cancelar</Button>
          </div>

        </div>
      </td>
    </tr>

    {/* ── Dialog autorização líder (NR duplicado) ── */}
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
            <Input type="email" placeholder="lider@empresa.com" value={liderEmail}
              onChange={e => setLiderEmail(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Senha do Líder</Label>
            <Input type="password" placeholder="••••••••" value={liderSenha}
              onChange={e => setLiderSenha(e.target.value)} className="h-9 text-sm" />
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
  </>
  );
}
