import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, DollarSign, FileText, Link2, Loader2, Save, User, X } from 'lucide-react';
import { ESTADOS_BRASIL, parseCurrencyInput } from '@/lib/index';
import { calcularParcelas, formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { TagsSelector } from '@/components/TagsSelector';
import { BotaoCapturaErpPP } from '@/components/pagueplay/BotaoCapturaErpPP';
import { TIPOS_PAGUEPLAY, PARCELAS_PP, DatePickerField } from './constants';
import { ModalAutorizacaoNR } from './ModalAutorizacaoNR';
import { ModalAvisoDiretoExtra } from './ModalAvisoDiretoExtra';
import type { SharedFormState } from './types';

export function FormPP({ state }: { state: SharedFormState }) {
  const {
    colSpan, cancelar, salvar, salvando,
    instituicao, setInstituicao,
    valorStr, setValorStr,
    vencimento, setVencimento,
    estadoSel, setEstadoSel,
    tipo, handleChangeTipo,
    parcelasStr, setParcelasStr,
    quarentaPct, setQuarentaPct,
    temParcelas, parcelas,
    parcelaInicial, veioDoAnalitico,
    usuarioTemLogicaDiretoExtra,
    isExtra, setIsExtra,
    nomeCliente, setNomeCliente,
    whatsapp, setWhatsapp,
    link, setLink,
    tagIds, setTagIds,
    empresaTags,
    conflito,
    autorizando, solicitarAutorizacaoConflito, cancelarConflito,
    avisoDiretoExtra, confirmandoDiretoExtra, confirmarDiretoExtra, cancelarAvisoDiretoExtra,
    profissionalLoading, profissionalEncontrado,
  } = state;

  return (
    <>
      <tr className="bg-primary/5 border-b-2 border-primary/30">
        <td colSpan={colSpan} className="px-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary flex items-center gap-2">
                <Save className="w-4 h-4" /> Novo Acordo — PaguePay
              </p>
              <div className="flex items-center gap-1">
                <BotaoCapturaErpPP
                  onDados={(d) => {
                    if (d.instituicao) setInstituicao(d.instituicao);
                    if (d.tipo) handleChangeTipo(d.tipo === 'boleto' ? 'boleto_pix' : 'cartao');
                    if (d.tipo === 'boleto' && d.parcelas) setParcelasStr(d.parcelas);
                    if (d.vencimento) setVencimento(d.vencimento);
                    if (d.valor) setValorStr(d.valor);
                    if (d.nome_cliente) setNomeCliente(d.nome_cliente);
                    if (d.quarentaPct) setQuarentaPct(() => true);
                  }}
                />
                <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-destructive/10 hover:text-destructive" onClick={cancelar} disabled={salvando}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Dados Principais
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Código *</Label>
                  <div className="relative">
                    <Input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="Código" className="h-8 text-xs pr-7" />
                    {profissionalLoading && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    )}
                    {!profissionalLoading && profissionalEncontrado && (
                      <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{temParcelas ? 'Valor total *' : 'Valor *'}</Label>
                  <Input value={valorStr} onChange={(e) => setValorStr(e.target.value)} placeholder="0,00" className="h-8 text-xs font-mono" />
                </div>
                <DatePickerField label="Vencimento" required value={vencimento} onChange={setVencimento} />
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={estadoSel} onValueChange={setEstadoSel}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar Estado" /></SelectTrigger>
                    <SelectContent>
                      {([...ESTADOS_BRASIL] as string[]).map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

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
                      {TIPOS_PAGUEPLAY.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Parcelas{' '}
                    {!temParcelas && <span className="text-muted-foreground/50 font-normal">(não se aplica)</span>}
                  </Label>
                  <Select
                    value={parcelasStr}
                    onValueChange={(v) => { setParcelasStr(v); if (parseInt(v) <= 2) setQuarentaPct(() => false); }}
                    disabled={!temParcelas}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARCELAS_PP.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n === 1 ? '1 (à vista)' : `${n}x`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {usuarioTemLogicaDiretoExtra && (
                  <div className="space-y-1">
                    <Label className="text-xs">Vínculo</Label>
                    <button
                      type="button" onClick={() => setIsExtra(v => !v)} disabled={salvando}
                      title={isExtra ? 'Clique para marcar como Direto' : 'Clique para marcar como Extra'}
                      className={cn(
                        'h-8 w-full flex items-center gap-2 px-3 rounded-md border text-xs font-medium transition-all cursor-pointer',
                        isExtra
                          ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/25 dark:text-amber-400'
                          : 'bg-background text-foreground border-input hover:bg-accent/50',
                      )}
                    >
                      <Link2 className="w-3 h-3 shrink-0" />
                      {isExtra ? 'Extra' : 'Direto'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {veioDoAnalitico && temParcelas && parcelaInicial > 1 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Tabulando a <strong>{parcelaInicial}ª de {parcelas} parcelas</strong> (via analítico).
                  As anteriores aparecem como pagas no detalhe sem serem recriadas, e a próxima
                  será agendada automaticamente ao salvar.
                </span>
              </div>
            )}

            {temParcelas && parcelas > 2 && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none w-fit">
                  <input
                    type="checkbox" checked={quarentaPct}
                    onChange={e => setQuarentaPct(() => e.target.checked)}
                    className="accent-primary"
                  />
                  Primeira parcela com 40% do total
                </label>
                {parseCurrencyInput(valorStr) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {calcularParcelas(parseCurrencyInput(valorStr), parcelas, quarentaPct && parcelas > 2).map((v, i) => (
                      <span key={i} className="text-xs bg-muted rounded px-2 py-0.5 font-mono">
                        {i + 1}ª {formatBRL(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {empresaTags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  Tags <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
                </p>
                <TagsSelector tags={empresaTags} selectedIds={tagIds} onChange={setTagIds} disabled={salvando} />
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Link do Acordo
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <Textarea value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole aqui o link do acordo..." className="text-xs resize-none" rows={1} />
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Dados do Profissional
                <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Nome Completo</Label>
                  <Input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} placeholder="Nome do profissional" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número</Label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(89) 99999-9999" className="h-8 text-xs font-mono" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-primary/20">
              <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80 shadow-sm" onClick={salvar} disabled={salvando}>
                <Save className="w-3.5 h-3.5" />
                {salvando ? 'Salvando...' : 'Salvar Acordo'}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 border-border hover:bg-muted" onClick={cancelar} disabled={salvando}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </Button>
            </div>
          </div>
        </td>
      </tr>

      <ModalAutorizacaoNR
        conflito={conflito} autorizando={autorizando}

        onSolicitar={solicitarAutorizacaoConflito} onCancel={cancelarConflito}
      />
      <ModalAvisoDiretoExtra
        aberto={!!avisoDiretoExtra}
        operadorNome={avisoDiretoExtra?.operadorAntNome ?? ''}
        operadorSetor={avisoDiretoExtra?.operadorAntSetor}
        nrLabel={avisoDiretoExtra?.nrLabel ?? ''}
        labelCampo={avisoDiretoExtra?.labelCampo ?? ''}
        confirmando={confirmandoDiretoExtra}
        onConfirmar={confirmarDiretoExtra}
        onCancel={cancelarAvisoDiretoExtra}
      />
    </>
  );
}
