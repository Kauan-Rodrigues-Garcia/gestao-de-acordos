// Novo Acordo — a página `pages/AcordoForm` com o formulário da BookPlay
// (`AcordoNovoInline/FormBP.tsx`): Dados Principais, Tipo e Status, Dados do
// Cliente, Observações e o «Salvar Acordo».

import { ArrowLeft, FileText, Hash, Info, Save, User, Wallet, X } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { aperto, entrada, entre, ms } from '../../movimento';
import { HOJE, NOVO, OPERADORA } from '../dados';
import type { TempoApp } from '../roteiro';
import { BotaoData, Calendario, Campo, digitado, Rotulo, Selecao } from './Campos';

type Props = { t: TempoApp; entra: number };

export const NovoAcordo: React.FC<Props> = ({ t, entra }) => {
  const f = useCurrentFrame();
  const c = t.clique;

  const nr = digitado(NOVO.nr, f, t.digitaNr, 420);
  const valor = digitado(NOVO.valor, f, c.valor + ms(140), 320);
  const parcelas = f >= c.parcelas + ms(160) ? NOVO.parcelas : '1';
  const vencimento = f >= c.dia + ms(60) ? NOVO.vencimento : null;
  const salvando = f >= c.salvar + ms(60) && f < t.toastNovo;

  const foco = (de: number, ate: number) => f >= de + ms(40) && f < ate;
  const calendarioAberto = f >= c.vencimento + ms(60) && f < c.dia + ms(120);
  const cal = entre(f, c.vencimento + ms(60), c.vencimento + ms(260), 0, 1);
  const calSai = entre(f, c.dia + ms(60), c.dia + ms(160), 0, 1);

  const E = (i: number) => entrada(f, entra, i, { passoMs: 45 });

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6" style={E(0)}>
          <span className="inline-flex items-center justify-center rounded-md h-8 w-8"><ArrowLeft className="w-4 h-4" /></span>
          <div>
            <h1 className="text-xl font-bold text-foreground">Novo Acordo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{OPERADORA.nome}</span>
              <span className="text-primary"> · {OPERADORA.setor}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border" style={E(1)} data-alvo="novo-form">
          <div className="bg-primary/5 border-b-2 border-primary/30 rounded-xl px-4 py-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-primary flex items-center gap-2">
                  <Save className="w-4 h-4" /> Novo Acordo — Bookplay
                </p>
                <span className="inline-flex items-center justify-center rounded-md w-7 h-7"><X className="w-4 h-4" /></span>
              </div>

              <div className="relative z-20" style={E(2)}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Hash className="w-3 h-3" /> Dados Principais
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Rotulo>NR *</Rotulo>
                    <Campo alvo="novo-nr" f={f} valor={nr} placeholder="Código do acordo" mono foco={foco(c.nr, c.valor)} />
                  </div>
                  <div className="space-y-1 relative">
                    <Rotulo>Vencimento *</Rotulo>
                    <BotaoData alvo="novo-vencimento" valor={vencimento} foco={calendarioAberto} />
                    {calendarioAberto && (
                      <div
                        className="absolute left-0 z-50 w-auto rounded-md border bg-popover p-0 text-popover-foreground shadow-md"
                        style={{
                          top: 'calc(100% + 4px)',
                          opacity: cal * (1 - calSai),
                          transform: `translateY(${(1 - cal) * -8}px) scale(${0.95 + 0.05 * cal})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        <Calendario hoje={HOJE.dia} marcado={f >= c.dia ? NOVO.vencimentoDia : null} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Rotulo>Valor *</Rotulo>
                    <Campo alvo="novo-valor" f={f} valor={valor} placeholder="0,00" mono foco={foco(c.valor, c.parcelas)} />
                  </div>
                </div>
                {parcelas !== '1' && (
                  <div
                    className="mt-2 h-8 inline-flex items-center gap-2 px-3 rounded-md border text-xs font-medium bg-background text-foreground border-input"
                    style={entrada(f, c.parcelas + ms(160), 0, { deslocY: 6, duracaoMs: 300 })}
                  >
                    <Wallet className="w-3 h-3 shrink-0" />
                    1º pagamento é entrada?
                  </div>
                )}
                <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Preencha o <strong>Valor</strong> com o valor de <strong>cada parcela</strong>, não o valor total do acordo.</span>
                </div>
              </div>

              <div style={E(3)}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Tipo e Status
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Rotulo>Forma de Pagamento</Rotulo>
                    <Selecao valor="Boleto" />
                  </div>
                  <div className="space-y-1">
                    <Rotulo>Parcelas</Rotulo>
                    <Campo alvo="novo-parcelas" f={f} valor={parcelas} mono foco={foco(c.parcelas, c.vencimento)} />
                  </div>
                  <div className="space-y-1">
                    <Rotulo>Status</Rotulo>
                    <Selecao valor="Pendente" />
                  </div>
                </div>
              </div>

              <div style={E(4)}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <User className="w-3 h-3" /> Dados do Cliente
                  <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Rotulo>Nome do Cliente</Rotulo>
                    <Campo f={f} valor="" placeholder="Nome completo" />
                  </div>
                  <div className="space-y-1">
                    <Rotulo>WhatsApp</Rotulo>
                    <Campo f={f} valor="" placeholder="(11) 99999-9999" mono />
                  </div>
                  <div className="space-y-1">
                    <Rotulo>Instituição</Rotulo>
                    <Selecao valor="Selecione..." placeholder />
                  </div>
                </div>
              </div>

              <div style={E(5)}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Observações
                  <span className="font-normal normal-case text-muted-foreground/50 ml-1">(opcional)</span>
                </p>
                <div className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-muted-foreground" style={{ height: 52 }}>
                  Observações opcionais...
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-primary/20" style={E(6)}>
                <span
                  data-alvo="novo-salvar"
                  className={cn(
                    'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 rounded-md px-3 gap-2 bg-primary text-primary-foreground shadow-sm',
                    salvando && 'opacity-50',
                  )}
                  style={{ scale: String(aperto(f, c.salvar)) }}
                >
                  <Save className="w-3.5 h-3.5" />
                  {salvando ? 'Salvando...' : 'Salvar Acordo'}
                </span>
                <span className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 rounded-md px-3 gap-1.5 border border-border bg-transparent">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
