import type { UseFormRegister, FieldErrors, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { DatePickerField } from '@/components/DatePickerField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Hash, DollarSign, FileText, User, Smartphone, Info, Building2, ChevronDown,
} from 'lucide-react';
import { INSTITUICOES_OPTIONS } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { FormData } from './schemas';

interface FormBPProps {
  register: UseFormRegister<FormData>;
  errors: FieldErrors<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  isEdit: boolean;
  showObs: boolean;
  setShowObs: (v: boolean) => void;
  maxParcelas: number;
}

export function FormBP({
  register, errors, watch, setValue,
  isEdit, showObs, setShowObs, maxParcelas,
}: FormBPProps) {
  const tipoAtual = watch('tipo');

  return (
    <>
      {/* BP BLOCO 1: Dados Principais */}
      <Card className="border-primary/30 bg-primary/3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
            <Hash className="w-4 h-4" /> Dados Principais
            <span className="text-xs font-normal text-muted-foreground ml-1">campos mais importantes</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <div className="space-y-1.5">
            <DatePickerField
              value={watch('vencimento') || ''}
              onChange={(v) => setValue('vencimento', v, { shouldValidate: true })}
              label="Vencimento"
              required
              size="md"
              minDate="2026-01-01"
              triggerClassName={cn('border-primary/40', errors.vencimento && 'border-destructive')}
              labelClassName="font-semibold text-primary"
            />
            {errors.vencimento && <p className="text-xs text-destructive">{errors.vencimento.message}</p>}
          </div>

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

      {/* BP BLOCO 2: Dados do cliente */}
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

      {/* BP BLOCO 3: Tipo, parcelas e status */}
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

          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status *</Label>
              <Select
                value={watch('status')}
                onValueChange={v => setValue('status', v as FormData['status'], { shouldValidate: true })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="verificar_pendente">Verificar</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="nao_pago">Não Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

        </CardContent>
      </Card>

      {/* BP BLOCO 4: Observações */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setShowObs(!showObs)}
            className="w-full flex items-center justify-between text-left"
          >
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Info className="w-4 h-4" />
              Observações
              <span className="text-xs font-normal">(opcional)</span>
            </CardTitle>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', showObs && 'rotate-180')} />
          </button>
        </CardHeader>
        {showObs && (
          <CardContent>
            <Textarea
              {...register('observacoes')}
              placeholder="Informações adicionais..."
              className="text-sm resize-none"
              rows={2}
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              Data de cadastro registrada automaticamente pelo sistema
            </p>
          </CardContent>
        )}
      </Card>
    </>
  );
}
