import type { UseFormRegister, FieldErrors, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { DatePickerField } from '@/components/DatePickerField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Hash, DollarSign, MapPin, FileText, User, Smartphone, Link2, ChevronDown, Building2,
} from 'lucide-react';
import { STATUS_LABELS_PAGUEPLAY, ESTADOS_BRASIL } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { FormData } from './schemas';

interface FormPPProps {
  register: UseFormRegister<FormData>;
  errors: FieldErrors<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  isEdit: boolean;
  showObs: boolean;
  setShowObs: (v: boolean) => void;
  estadoSelecionado: string;
  setEstadoSelecionado: (v: string) => void;
}

export function FormPP({
  register, errors, watch, setValue,
  isEdit, showObs, setShowObs,
  estadoSelecionado, setEstadoSelecionado,
}: FormPPProps) {
  return (
    <>
      {/* PP BLOCO 1: Dados Principais */}
      <Card className="border-primary/30 bg-primary/3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
            <Hash className="w-4 h-4" /> Dados Principais
            <span className="text-xs font-normal text-muted-foreground ml-1">campos mais importantes</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-primary">Código *</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
              <Input
                {...register('instituicao')}
                placeholder="Código"
                className={cn(
                  'h-10 text-sm pl-8 border-primary/40 focus:border-primary',
                  errors.instituicao && 'border-destructive'
                )}
              />
            </div>
            {errors.instituicao && <p className="text-xs text-destructive">{errors.instituicao.message}</p>}
          </div>

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

      {/* PP BLOCO 2: Tipo e Status */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" /> Tipo e Status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">

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

          {isEdit && (
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
          )}

        </CardContent>
      </Card>

      {/* PP BLOCO 3: Dados do Profissional */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            Dados do Profissional{' '}
            <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium">Nome do Cliente</Label>
            <Input
              {...register('nome_cliente')}
              placeholder="Nome completo"
              className={cn('h-9 text-sm', errors.nome_cliente && 'border-destructive')}
            />
            {errors.nome_cliente && <p className="text-xs text-destructive">{errors.nome_cliente.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Número</Label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                {...register('whatsapp')}
                placeholder="(89) 99999-9999"
                className={cn('h-9 text-sm pl-8 font-mono', errors.whatsapp && 'border-destructive')}
              />
            </div>
            {errors.whatsapp && <p className="text-xs text-destructive">{errors.whatsapp.message}</p>}
          </div>

        </CardContent>
      </Card>

      {/* PP BLOCO 4: Link do Acordo */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setShowObs(!showObs)}
            className="w-full flex items-center justify-between text-left"
          >
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Link2 className="w-4 h-4" />
              Link do Acordo
              <span className="text-xs font-normal">(opcional)</span>
            </CardTitle>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', showObs && 'rotate-180')} />
          </button>
        </CardHeader>
        {showObs && (
          <CardContent>
            <Textarea
              {...register('observacoes')}
              placeholder="Cole aqui o link do acordo..."
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
