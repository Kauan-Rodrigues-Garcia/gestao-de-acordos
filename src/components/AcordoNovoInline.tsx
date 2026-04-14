/**
 * AcordoNovoInline.tsx
 * Formulário de criação de novo acordo embutido na tabela.
 * Design e campos baseados no AcordoForm (página de criação completa).
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
import { X, Save, User, Hash, Calendar, DollarSign, Smartphone, Building2, MapPin, FileText, Link2, Shield } from 'lucide-react';
import {
  ESTADOS_BRASIL, parseCurrencyInput, getMaxParcelas,
  buildObservacoesComEstado, INSTITUICOES_OPTIONS,
} from '@/lib/index';
import { cn } from '@/lib/utils';

const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto' },
  { value: 'pix_automatico',    label: 'PIX Automático' },
  { value: 'cartao_recorrente',  label: 'Cartão Recorrente' },
  { value: 'cartao',            label: 'Cartão de Crédito' },
  { value: 'pix',               label: 'PIX' },
];

const TIPOS_PAGUEPLAY = [
  { value: 'boleto', label: 'Boleto' },
  { value: 'pix',   label: 'PIX' },
];

const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente' },
  { value: 'pago',              label: 'Pago' },
  { value: 'nao_pago',          label: 'Não Pago' },
];

const TIPOS_PARCELADOS_BOOKPLAY  = ['boleto', 'pix_automatico', 'cartao_recorrente'];
const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];

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
  const { empresa, tenantSlug } = useEmpresa();
  const maxParcelas = getMaxParcelas(tenantSlug);

  // Campos do formulário
  const [nomeCliente,    setNomeCliente]    = useState('');
  const [nrCliente,      setNrCliente]      = useState('');
  const [vencimento,     setVencimento]     = useState('');
  const [valorStr,       setValorStr]       = useState('');
  const [tipo,           setTipo]           = useState('boleto');
  const [parcelasStr,    setParcelasStr]    = useState('1');
  const [whatsapp,       setWhatsapp]       = useState('');
  const [instituicao,    setInstituicao]    = useState('');
  const [status,         setStatus]         = useState('verificar_pendente');
  const [observacoes,    setObservacoes]    = useState('');
  const [estadoSel,      setEstadoSel]      = useState('');
  const [link,           setLink]           = useState('');
  const [salvando,       setSalvando]       = useState(false);

  const tipos = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const temParcelas = isTipoParcelado(tipo, isPaguePlay);
  const parcelas = parseInt(parcelasStr) || 1;

  function validar(): string | null {
    if (!isPaguePlay && nomeCliente.trim().length < 3) return 'Nome deve ter pelo menos 3 caracteres';
    if (!nrCliente.trim()) return isPaguePlay ? 'CPF obrigatório' : 'NR obrigatório';
    if (!vencimento) return 'Data de vencimento obrigatória';
    const v = parseCurrencyInput(valorStr);
    if (isNaN(v) || v <= 0) return 'Valor deve ser maior que zero';
    if (isPaguePlay && !instituicao.trim()) return 'Inscrição é obrigatória';
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
      const grupoId  = (temParcelas && parcelas > 1) ? crypto.randomUUID() : null;

      // Construir observacoes com estado (PaguePay) igual ao AcordoForm
      let obsFinal: string | null;
      if (isPaguePlay) {
        obsFinal = buildObservacoesComEstado(estadoSel || '', link.trim() || '') || null;
      } else {
        obsFinal = observacoes.trim() || null;
      }

      const base: Record<string, unknown> = {
        nome_cliente:    nomeCliente.trim() || null,
        nr_cliente:      nrCliente.trim(),
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

      const { data: inserted, error } = await supabase
        .from('acordos')
        .insert(base)
        .select()
        .single();

      if (error) { toast.error(`Erro: ${error.message}`); return; }

      // Criar parcelas extras (igual ao AcordoForm)
      if (grupoId && parcelas > 1 && inserted) {
        const extras: Record<string, unknown>[] = [];
        let dataBase = vencimento;
        for (let i = 2; i <= parcelas; i++) {
          const [y, m, d] = dataBase.split('-').map(Number);
          const nm = m + 1 > 12 ? 1 : m + 1;
          const na = m + 1 > 12 ? y + 1 : y;
          dataBase = `${na}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          extras.push({ ...base, vencimento: dataBase, numero_parcela: i, acordo_grupo_id: grupoId });
        }
        if (extras.length > 0) {
          const { error: e2 } = await supabase.from('acordos').insert(extras);
          if (e2) toast.warning(`Parcelas extras: ${e2.message}`);
        }
      }

      toast.success('Acordo criado com sucesso!');
      onSaved();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <tr className="bg-primary/5 border-b-2 border-primary/30">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="space-y-4">

          {/* ─── Título ─── */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Save className="w-4 h-4 text-primary" />
              Novo Acordo
            </p>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onCancel} disabled={salvando}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* ─── Seção: Dados Principais ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Dados Principais
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isPaguePlay ? 'CPF' : 'NR'} *</Label>
                <Input
                  value={nrCliente}
                  onChange={e => setNrCliente(e.target.value)}
                  placeholder={isPaguePlay ? '000.000.000-00' : 'Número NR'}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vencimento *</Label>
                <input
                  type="date"
                  value={vencimento}
                  onChange={e => setVencimento(e.target.value)}
                  className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor *</Label>
                <Input
                  value={valorStr}
                  onChange={e => setValorStr(e.target.value)}
                  placeholder="0,00"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* ─── Seção: Dados do Cliente ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <User className="w-3 h-3" /> Dados do Cliente
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {!isPaguePlay && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Nome do Cliente *</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isPaguePlay ? 'Inscrição *' : 'Instituição'}</Label>
                {isPaguePlay ? (
                  <Input
                    value={instituicao}
                    onChange={e => setInstituicao(e.target.value)}
                    placeholder="Número de inscrição"
                    className="h-8 text-xs"
                  />
                ) : (
                  <Select value={instituicao} onValueChange={setInstituicao}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUICOES_OPTIONS.map((opt: { value: string; label: string }) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {isPaguePlay && (
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={estadoSel} onValueChange={setEstadoSel}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BRASIL.map((uf: string) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isPaguePlay && (
                <div className="space-y-1 col-span-2 sm:col-span-3 lg:col-span-4">
                  <Label className="text-xs">Nome do Profissional</Label>
                  <Input
                    value={nomeCliente}
                    onChange={e => setNomeCliente(e.target.value)}
                    placeholder="Nome completo"
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ─── Seção: Tipo e Status ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Tipo e Status
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Forma de Pagamento *</Label>
                <Select value={tipo} onValueChange={t => { setTipo(t); if (!isTipoParcelado(t, isPaguePlay)) setParcelasStr('1'); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {temParcelas && (
                <div className="space-y-1">
                  <Label className="text-xs">Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxParcelas}
                    value={parcelasStr}
                    onChange={e => setParcelasStr(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
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

          {/* ─── Seção: Link do Acordo (PaguePay) ─── */}
          {isPaguePlay && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Link do Acordo
              </p>
              <Textarea
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="Cole aqui o link do acordo..."
                className="text-xs resize-none"
                rows={2}
              />
            </div>
          )}

          {/* ─── Seção: Observações (Bookplay) ─── */}
          {!isPaguePlay && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Observações
              </p>
              <Textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Observações opcionais..."
                className="text-xs resize-none"
                rows={2}
              />
            </div>
          )}

          {/* ─── Botões ─── */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="gap-2"
              onClick={salvar}
              disabled={salvando}
            >
              <Save className="w-3.5 h-3.5" />
              {salvando ? 'Salvando...' : 'Salvar Acordo'}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={salvando}>
              Cancelar
            </Button>
          </div>

        </div>
      </td>
    </tr>
  );
}
