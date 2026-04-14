/**
 * AcordoNovoInline.tsx
 * Formulário inline de criação de novo acordo na tabela.
 * PaguePay: Inscrição/Valor/Vencimento/Estado → Tipo/Parcelas/Status → Profissional → Link
 * Bookplay: NR/Vencimento/Valor → Cliente/Instituição → Tipo/Parcelas/Status → Obs
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import { X, Save, User, Hash, DollarSign, FileText, Link2 } from 'lucide-react';
import {
  ESTADOS_BRASIL, parseCurrencyInput, buildObservacoesComEstado, INSTITUICOES_OPTIONS,
} from '@/lib/index';

const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto' },
  { value: 'pix_automatico',    label: 'PIX Automático' },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente' },
  { value: 'cartao',            label: 'Cartão de Crédito' },
  { value: 'pix',               label: 'PIX' },
];
const TIPOS_PAGUEPLAY = [
  { value: 'boleto', label: 'Boleto' },
  { value: 'pix',   label: 'PIX' },
];
const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente' },
  { value: 'pago',               label: 'Pago' },
  { value: 'nao_pago',           label: 'Não Pago' },
];
const TIPOS_PARCELADOS_BOOKPLAY  = ['boleto', 'pix_automatico', 'cartao_recorrente'];
const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];
// Parcelas limitadas a 12 para PaguePay
const PARCELAS_PP = Array.from({ length: 12 }, (_, i) => i + 1);

function isTipoParcelado(tipo: string, isPP: boolean): boolean {
  return isPP ? TIPOS_PARCELADOS_PAGUEPLAY.includes(tipo) : TIPOS_PARCELADOS_BOOKPLAY.includes(tipo);
}

export interface AcordoNovoInlineProps {
  isPaguePlay: boolean;
  colSpan: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function AcordoNovoInline({ isPaguePlay, colSpan, onSaved, onCancel }: AcordoNovoInlineProps) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [nomeCliente,  setNomeCliente]  = useState('');
  const [nrCliente,    setNrCliente]    = useState('');
  const [vencimento,   setVencimento]   = useState('');
  const [valorStr,     setValorStr]     = useState('');
  const [tipo,         setTipo]         = useState('boleto');
  const [parcelasStr,  setParcelasStr]  = useState('1');
  const [whatsapp,     setWhatsapp]     = useState('');
  const [instituicao,  setInstituicao]  = useState('');
  const [status,       setStatus]       = useState('verificar_pendente');
  const [observacoes,  setObservacoes]  = useState('');
  const [estadoSel,    setEstadoSel]    = useState('');
  const [link,         setLink]         = useState('');
  const [salvando,     setSalvando]     = useState(false);

  const tipos = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const temParcelas = isTipoParcelado(tipo, isPaguePlay);
  const parcelas = parseInt(parcelasStr) || 1;

  function validar(): string | null {
    if (!vencimento) return 'Data de vencimento obrigatória';
    const v = parseCurrencyInput(valorStr);
    if (isNaN(v) || v <= 0) return 'Valor deve ser maior que zero';
    if (isPaguePlay && !instituicao.trim()) return 'Inscrição é obrigatória';
    if (!isPaguePlay && nomeCliente.trim().length < 3) return 'Nome deve ter pelo menos 3 caracteres';
    return null;
  }

  async function salvar() {
    const erro = validar();
    if (erro) { toast.error(erro); return; }
    if (!perfil?.id)  { toast.error('Usuário não autenticado'); return; }
    if (!empresa?.id) { toast.error('Empresa não identificada'); return; }

    setSalvando(true);
    try {
      const valorNum = parseCurrencyInput(valorStr);
      // PaguePay: sem grupo — parcelas são apenas um número informativo no registro
      const grupoId = null;

      let obsFinal: string | null;
      if (isPaguePlay) {
        obsFinal = buildObservacoesComEstado(estadoSel || '', link.trim() || '') || null;
      } else {
        obsFinal = observacoes.trim() || null;
      }

      const base: Record<string, unknown> = {
        nome_cliente:    isPaguePlay ? (nomeCliente.trim() || null) : nomeCliente.trim(),
        nr_cliente:      nrCliente.trim() || null,
        vencimento,
        valor:           valorNum,
        tipo,
        parcelas:        temParcelas ? parcelas : 1,
        whatsapp:        whatsapp.trim() || null,
        instituicao:     instituicao.trim() || null,
        status,
        observacoes:     obsFinal,
        operador_id:     perfil.id,
        setor_id:        (perfil as { setor_id?: string }).setor_id ?? null,
        empresa_id:      empresa.id,
        acordo_grupo_id: grupoId,
        numero_parcela:  1,
        data_cadastro:   new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase.from('acordos').insert(base);
      if (error) { toast.error(`Erro: ${error.message}`); return; }
      // PaguePay: NÃO cria registros extras por parcela.
      // O campo "parcelas" no registro já indica quantas parcelas existem.
      // Cada parcela é reagendada individualmente pelo operador ao marcar como paga.

      toast.success('Acordo criado com sucesso!');
      onSaved();
    } finally {
      setSalvando(false);
    }
  }

  /* ─── Render PaguePay ──────────────────────────────────────────────────── */
  if (isPaguePlay) {
    return (
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

            {/* ── Seção 1: Dados Principais ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Dados Principais
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Inscrição */}
                <div className="space-y-1">
                  <Label className="text-xs">Inscrição *</Label>
                  <Input
                    value={instituicao}
                    onChange={e => setInstituicao(e.target.value)}
                    placeholder="Número de inscrição"
                    className="h-8 text-xs"
                  />
                </div>
                {/* Valor */}
                <div className="space-y-1">
                  <Label className="text-xs">Valor *</Label>
                  <Input
                    value={valorStr}
                    onChange={e => setValorStr(e.target.value)}
                    placeholder="0,00"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                {/* Vencimento */}
                <div className="space-y-1">
                  <Label className="text-xs">Vencimento *</Label>
                  <input
                    type="date"
                    value={vencimento}
                    onChange={e => setVencimento(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {/* Estado */}
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={estadoSel} onValueChange={setEstadoSel}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {(ESTADOS_BRASIL as string[]).map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Seção 2: Tipo e Status ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Tipo e Status
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Forma de pagamento */}
                <div className="space-y-1">
                  <Label className="text-xs">Forma de Pagamento *</Label>
                  <Select value={tipo} onValueChange={t => { setTipo(t); if (!isTipoParcelado(t, true)) setParcelasStr('1'); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_PAGUEPLAY.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Parcelas 1–12 */}
                <div className="space-y-1">
                  <Label className="text-xs">Parcelas (1–12)</Label>
                  <Select value={parcelasStr} onValueChange={setParcelasStr}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARCELAS_PP.map(n => (
                        <SelectItem key={n} value={String(n)}>{n === 1 ? '1 (à vista)' : `${n}x`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Status */}
                <div className="space-y-1">
                  <Label className="text-xs">Status *</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Seção 3: Dados do Profissional (Opcional) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Dados do Profissional <span className="font-normal normal-case text-muted-foreground/60">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Nome Completo</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome do profissional"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CPF</Label>
                  <Input
                    value={nrCliente}
                    onChange={e => setNrCliente(e.target.value)}
                    placeholder="000.000.000-00"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* ── Seção 4: Link do Acordo (Opcional) ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Link do Acordo <span className="font-normal normal-case text-muted-foreground/60">(opcional)</span>
              </p>
              <Textarea
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="Cole aqui o link do acordo..."
                className="text-xs resize-none"
                rows={2}
              />
            </div>

            {/* Botões */}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="gap-2" onClick={salvar} disabled={salvando}>
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando...' : 'Salvar Acordo'}
              </Button>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={salvando}>Cancelar</Button>
            </div>

          </div>
        </td>
      </tr>
    );
  }

  /* ─── Render Bookplay ──────────────────────────────────────────────────── */
  return (
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

          {/* Dados Principais */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Dados Principais
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">NR *</Label>
                <Input value={nrCliente} onChange={e => setNrCliente(e.target.value)} placeholder="Número NR" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vencimento *</Label>
                <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}
                  className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor *</Label>
                <Input value={valorStr} onChange={e => setValorStr(e.target.value)} placeholder="0,00" className="h-8 text-xs font-mono" />
              </div>
            </div>
          </div>

          {/* Dados do Cliente */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <User className="w-3 h-3" /> Dados do Cliente
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Nome do Cliente *</Label>
                <Input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome completo" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp</Label>
                <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" className="h-8 text-xs font-mono" />
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

          {/* Tipo e Status */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Tipo e Status
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Forma de Pagamento *</Label>
                <Select value={tipo} onValueChange={t => { setTipo(t); if (!isTipoParcelado(t, false)) setParcelasStr('1'); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_BOOKPLAY.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {temParcelas && (
                <div className="space-y-1">
                  <Label className="text-xs">Parcelas</Label>
                  <Input type="number" min={1} max={60} value={parcelasStr} onChange={e => setParcelasStr(e.target.value)} className="h-8 text-xs font-mono" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Status *</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Observações
            </p>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações opcionais..." className="text-xs resize-none" rows={2} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="gap-2" onClick={salvar} disabled={salvando}>
              <Save className="w-3.5 h-3.5" />
              {salvando ? 'Salvando...' : 'Salvar Acordo'}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={salvando}>Cancelar</Button>
          </div>

        </div>
      </td>
    </tr>
  );
}
