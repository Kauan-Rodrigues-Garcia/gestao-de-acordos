import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';
import { X, Save } from 'lucide-react';

const TIPOS_BOOKPLAY = [
  { value: 'boleto',           label: 'Boleto' },
  { value: 'pix_automatico',   label: 'PIX Automático' },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente' },
  { value: 'cartao',           label: 'Cartão' },
  { value: 'pix',              label: 'PIX' },
];

const TIPOS_PAGUEPLAY = [
  { value: 'boleto', label: 'Boleto' },
  { value: 'pix',   label: 'PIX' },
];

const TIPOS_PARCELADOS_BOOKPLAY = ['boleto', 'pix_automatico', 'cartao_recorrente'];
const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];

function isTipoParcelado(tipo: string, isPP: boolean): boolean {
  return isPP
    ? TIPOS_PARCELADOS_PAGUEPLAY.includes(tipo)
    : TIPOS_PARCELADOS_BOOKPLAY.includes(tipo);
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

  const [nomeCliente, setNomeCliente]   = useState('');
  const [nrCliente, setNrCliente]       = useState('');
  const [vencimento, setVencimento]     = useState('');
  const [valor, setValor]               = useState('');
  const [tipo, setTipo]                 = useState(isPaguePlay ? 'boleto' : 'boleto');
  const [parcelas, setParcelas]         = useState(1);
  const [whatsapp, setWhatsapp]         = useState('');
  const [observacoes, setObservacoes]   = useState('');
  const [salvando, setSalvando]         = useState(false);

  const tipos = isPaguePlay ? TIPOS_PAGUEPLAY : TIPOS_BOOKPLAY;
  const temParcelas = isTipoParcelado(tipo, isPaguePlay);

  async function salvar() {
    if (!nomeCliente.trim()) { toast.error('Nome do cliente obrigatório'); return; }
    if (!nrCliente.trim())   { toast.error('NR / CPF obrigatório'); return; }
    if (!vencimento)         { toast.error('Vencimento obrigatório'); return; }
    const valorNum = parseFloat(valor);
    if (isNaN(valorNum) || valorNum <= 0) { toast.error('Valor inválido'); return; }
    if (!perfil?.id)   { toast.error('Usuário não autenticado'); return; }
    if (!empresa?.id)  { toast.error('Empresa não identificada'); return; }

    setSalvando(true);
    try {
      const grupoId = (temParcelas && parcelas > 1) ? crypto.randomUUID() : null;

      const base = {
        nome_cliente:    nomeCliente.trim(),
        nr_cliente:      nrCliente.trim(),
        vencimento,
        valor:           valorNum,
        tipo,
        parcelas:        temParcelas ? parcelas : 1,
        whatsapp:        whatsapp.trim() || null,
        observacoes:     observacoes.trim() || null,
        status:          'verificar_pendente' as const,
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

      // Atualizar acordo_grupo_id na parcela 1 (caso criado) e criar demais parcelas
      if (grupoId && parcelas > 1 && inserted) {
        await supabase.from('acordos').update({ acordo_grupo_id: grupoId }).eq('id', inserted.id);

        const extras = [];
        let dataBase = vencimento;
        for (let i = 2; i <= parcelas; i++) {
          const [y, m, d] = dataBase.split('-').map(Number);
          const novoMes = m + 1 > 12 ? 1 : m + 1;
          const novoAno = m + 1 > 12 ? y + 1 : y;
          dataBase = `${novoAno}-${String(novoMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          extras.push({
            ...base,
            vencimento: dataBase,
            numero_parcela: i,
          });
        }
        if (extras.length > 0) {
          const { error: errExtras } = await supabase.from('acordos').insert(extras);
          if (errExtras) toast.warning(`Parcelas extras: ${errExtras.message}`);
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
      <td colSpan={colSpan} className="px-3 py-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">{isPaguePlay ? 'Profissional' : 'Cliente'}</label>
            <Input
              value={nomeCliente}
              onChange={e => setNomeCliente(e.target.value)}
              placeholder="Nome completo"
              className="h-7 text-xs w-40"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">{isPaguePlay ? 'CPF' : 'NR'}</label>
            <Input
              value={nrCliente}
              onChange={e => setNrCliente(e.target.value)}
              placeholder="NR / CPF"
              className="h-7 text-xs w-28 font-mono"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">Vencimento</label>
            <input
              type="date"
              value={vencimento}
              onChange={e => setVencimento(e.target.value)}
              className="h-7 text-xs bg-background border border-input rounded px-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">Valor</label>
            <Input
              type="number"
              step="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0,00"
              className="h-7 text-xs w-24 font-mono"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-7 text-xs w-36">
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
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium uppercase">Parcelas</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={parcelas}
                onChange={e => setParcelas(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-7 text-xs w-16 font-mono"
              />
            </div>
          )}
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">WhatsApp</label>
            <Input
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              placeholder="(00) 00000-0000"
              className="h-7 text-xs w-32 font-mono"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase">Observações</label>
            <Input
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Obs..."
              className="h-7 text-xs w-40"
            />
          </div>
          <div className="flex gap-1 pb-0">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={salvar}
              disabled={salvando}
            >
              <Save className="w-3 h-3" />
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onCancel}
              disabled={salvando}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
