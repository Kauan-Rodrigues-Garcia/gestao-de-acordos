// Acordos — `pages/Acordos/index.tsx` da BookPlay: cabeçalho com o mês,
// abas (Todos · Verificar · Pagos / Quitados · Não Pagos · Pix Automático),
// filtros e a tabela agrupada por dia (`AcordosTableBody` + `LinhaDoDiaAcordos`).
// Por cima, quando a narração pede: o ModalReagendar e a escolha da mensagem
// de WhatsApp (`EscolherMensagemWhatsapp`).

import {
  CalendarClock, CalendarDays, CalendarIcon, CheckCircle, ChevronDown, ChevronLeft, ChevronRight,
  Edit, MessageSquare, MessageSquareText, Plus, RefreshCw, Search, Send, Trash2, Undo2, X, Zap,
} from 'lucide-react';
import { Fragment } from 'react';
import { useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { aperto, entrada, entre, ms } from '../../movimento';
import { ACORDOS_AMANHA, ACORDOS_HOJE, MENSAGENS, type Acordo, type Status } from '../dados';
import type { TempoApp } from '../roteiro';
import { CodigoNR, Destaque, formatBRL, SeloStatus, SeloTipo } from '../ui';

type Props = { t: TempoApp; entra: number; visita: 1 | 2 };

const CELULA = 'px-3 py-2 align-middle';
const CABECALHO = 'px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide';

export const Acordos: React.FC<Props> = ({ t, entra, visita }) => {
  const f = useCurrentFrame();
  const c = t.clique;

  // estado das linhas no frame atual
  const pagoA3 = f >= c.pago + ms(90);
  const reagendouA2 = f >= c.confirmar + ms(450);
  const statusDe = (a: Acordo): Status => (a.id === 'a3' && pagoA3 ? 'pago' : a.status);

  const destaquePendente = visita === 1 ? Math.min(entre(f, t.pendente, t.pendente + ms(240), 0, 1), entre(f, c.reagendar - ms(400), c.reagendar - ms(150), 1, 0)) : 0;

  const E = (i: number) => entrada(f, entra, i, { passoMs: 45 });

  const linha = (a: Acordo, noDia: number, i: number) => {
    const status = statusDe(a);
    const desfazivel = a.id === 'a3' && pagoA3;
    const podeAgendar = a.id === 'a2' && !reagendouA2;
    const virou = a.id === 'a3' ? entre(f, c.pago + ms(60), c.pago + ms(360), 0, 1) : 1;
    return (
      <tr
        key={a.id}
        data-alvo={`linha-${a.id}`}
        className={cn('h-[52px] border-b border-border/50', noDia % 2 === 0 && 'bg-muted/10')}
        style={E(4 + i)}
      >
        <td className={CELULA}><input type="checkbox" readOnly className="rounded border-border" /></td>
        <td className={cn(CELULA, 'overflow-hidden')}><CodigoNR codigo={a.nr} /></td>
        <td className={cn(CELULA, 'overflow-hidden')}>
          <p className="min-w-0 truncate font-medium text-foreground">{a.cliente}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
            {a.instituicao} · <span className="font-mono">{a.whatsapp}</span>
          </p>
        </td>
        <td className={cn(CELULA, 'whitespace-nowrap')}>
          <span className={cn('font-mono', a.vencimento === '13/10/2026' && status !== 'pago' && 'text-warning font-semibold')}>{a.vencimento}</span>
        </td>
        <td className={cn(CELULA, 'text-right font-mono font-semibold text-foreground whitespace-nowrap')}>{formatBRL(a.valor)}</td>
        <td className={cn(CELULA, 'overflow-hidden')}><SeloTipo tipo={a.tipo} /></td>
        <td className={cn(CELULA, 'text-center font-mono text-muted-foreground')}>{a.parcela}</td>
        <td className={CELULA}>
          <span className="relative inline-flex">
            <SeloStatus
              alvo={`status-${a.id}`}
              status={status}
              style={a.id === 'a3' && pagoA3 ? { transform: `scale(${1 + 0.18 * Math.sin(virou * Math.PI)})` } : undefined}
            />
            {a.id === 'a1' && <Destaque forca={destaquePendente} raio={10} folga={4} />}
          </span>
        </td>
        <td className={CELULA}>
          <div className="flex items-center justify-end gap-0.5">
            {status !== 'pago' && (
              <span data-alvo={`acao-pago-${a.id}`} className="inline-flex items-center justify-center rounded-md w-8 h-8 text-success" style={{ scale: String(a.id === 'a3' ? aperto(f, c.pago) : 1) }}>
                <CheckCircle className="w-4 h-4" />
              </span>
            )}
            {desfazivel && (
              <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-amber-600" style={entrada(f, c.pago + ms(60), 0, { deslocY: 6, duracaoMs: 260 })}>
                <Undo2 className="w-4 h-4" />
              </span>
            )}
            {podeAgendar && (
              <span data-alvo={`acao-reagendar-${a.id}`} className="inline-flex items-center justify-center rounded-md w-8 h-8 text-blue-600" style={{ scale: String(aperto(f, c.reagendar)) }}>
                <CalendarClock className="w-4 h-4" />
              </span>
            )}
            <span data-alvo={`acao-whats-${a.id}`} className="inline-flex items-center justify-center rounded-md w-8 h-8 text-success" style={{ scale: String(a.id === 'a1' ? aperto(f, c.whats) : 1) }}>
              <MessageSquare className="w-4 h-4" />
            </span>
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8"><Edit className="w-4 h-4" /></span>
            <span className="w-px h-5 bg-border mx-1 shrink-0" />
            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 text-destructive/60"><Trash2 className="w-4 h-4" /></span>
            <span className="ml-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground"><ChevronDown className="h-4 w-4" /></span>
          </div>
        </td>
      </tr>
    );
  };

  const grupo = (rotulo: string, hoje: boolean, lista: Acordo[], i0: number) => {
    const st = lista.map(statusDe);
    const pend = st.filter((s) => s === 'verificar_pendente').length;
    const pagos = st.filter((s) => s === 'pago').length;
    const nao = st.filter((s) => s === 'nao_pago').length;
    return (
      <Fragment key={rotulo}>
        <tr className={cn('border-b border-border', hoje ? 'bg-primary/10' : 'bg-muted/40')} style={E(i0)}>
          <td colSpan={9} className="px-3 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-6">
                <input type="checkbox" readOnly className="rounded border-border" />
                <span className={cn('flex items-center gap-1.5 font-semibold', hoje ? 'text-primary' : 'text-foreground')}>
                  <CalendarDays className={cn('h-3.5 w-3.5', hoje ? 'text-primary' : 'text-muted-foreground')} />
                  {rotulo}
                </span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {lista.length} acordos
                {' · '}<strong className="font-semibold text-warning">{pend} pendente{pend === 1 ? '' : 's'}</strong>
                {' · '}<strong className="font-semibold text-success">{pagos} pago{pagos === 1 ? '' : 's'}</strong>
                {' · '}<strong className="font-semibold text-destructive">{nao} não pago{nao === 1 ? '' : 's'}</strong>
              </span>
            </div>
          </td>
        </tr>
        {lista.map((a, k) => linha(a, k, i0 + 1 + k))}
      </Fragment>
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="p-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-5" style={E(0)}>
            <div>
              <h1 className="text-xl font-bold text-foreground">Acordos</h1>
              <div className="flex items-center gap-1 mt-2">
                <span className="inline-flex items-center justify-center rounded-md border border-input h-6 w-6"><ChevronLeft className="w-3 h-3" /></span>
                <span className="text-xs font-semibold min-w-[100px] text-center text-muted-foreground">outubro de 2026</span>
                <span className="inline-flex items-center justify-center rounded-md border border-input h-6 w-6"><ChevronRight className="w-3 h-3" /></span>
                <span className="inline-flex items-center rounded-md h-6 text-xs text-muted-foreground px-2">Mês atual</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">38 acordo(s) no total</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <span className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 rounded-md px-3 gap-1.5 border border-success/40 text-success">
                <MessageSquare className="w-3.5 h-3.5" /> Lembretes do dia (4)
              </span>
              <span className="inline-flex items-center justify-center rounded-md border border-input w-8 h-8 relative">
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green-500" />
              </span>
              <span className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 rounded-md px-3 gap-1.5 shadow-sm bg-primary text-primary-foreground">
                <Plus className="w-4 h-4" /> Novo Acordo
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-4 border-b border-border" style={E(1)}>
            {['Todos', 'Verificar', 'Pagos / Quitados', 'Não Pagos'].map((r, i) => (
              <span key={r} className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px', i === 0 ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
                {r}
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px border-transparent text-muted-foreground">
              <Zap className="w-3.5 h-3.5" /> Pix Automático
            </span>
          </div>

          <div className="rounded-lg border bg-card text-card-foreground shadow-sm border-border mb-4" style={E(2)}>
            <div className="p-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <div className="flex w-full items-center rounded-md border border-input bg-background px-3 py-2 pl-8 h-8 text-sm text-muted-foreground">Buscar NR, nome, WhatsApp...</div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 w-32 h-8 text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </div>
                <div className="flex items-center gap-1">
                  <div className="inline-flex items-center rounded-md border border-input w-40 h-8 text-xs justify-start gap-2 font-mono px-2 text-muted-foreground">
                    <CalendarIcon className="w-3 h-3 shrink-0" /> Filtrar data
                  </div>
                  <span className="h-8 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground">
                    <MessageSquareText className="h-3.5 w-3.5 text-success" /> Mensagens
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card text-card-foreground shadow-sm border-border" style={E(3)}>
            <table className="w-full min-w-[1000px] table-fixed text-xs caption-bottom">
              <colgroup>
                <col className="w-[40px]" />
                <col className="w-[120px]" />
                <col />
                <col className="w-[100px]" />
                <col className="w-[110px]" />
                <col className="w-[132px]" />
                <col className="w-[80px]" />
                <col className="w-[104px]" />
                <col className="w-[232px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className={CABECALHO}><input type="checkbox" readOnly className="rounded border-border" /></th>
                  <th className={cn(CABECALHO, 'text-left')}>NR</th>
                  <th className={cn(CABECALHO, 'text-left')}>Cliente</th>
                  <th className={cn(CABECALHO, 'text-left')}>Vencimento</th>
                  <th className={cn(CABECALHO, 'text-right')}>Valor</th>
                  <th className={cn(CABECALHO, 'text-left')}>Tipo</th>
                  <th className={cn(CABECALHO, 'text-center')}>Parcelas</th>
                  <th className={cn(CABECALHO, 'text-left')}>Status</th>
                  <th className={cn(CABECALHO, 'text-right')}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {grupo('Hoje · 13/10/2026', true, ACORDOS_HOJE, 4)}
                {grupo('Amanhã · 14/10/2026', false, ACORDOS_AMANHA, 9)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Os diálogos (Radix Dialog no app: fundo preto a 80% e o card no meio) ─

const Dialogo: React.FC<{ f: number; abre: number; fecha: number; largura: number; alvo: string; children: React.ReactNode }> = ({ f, abre, fecha, largura, alvo, children }) => {
  if (f < abre || f >= fecha + ms(200)) return null;
  const p = entre(f, abre, abre + ms(200), 0, 1);
  const s = entre(f, fecha, fecha + ms(160), 0, 1);
  const vis = p * (1 - s);
  return (
    <div className="absolute inset-0" style={{ zIndex: 60 }}>
      <div className="absolute inset-0 bg-black/80" style={{ opacity: vis }} />
      <div
        data-alvo={alvo}
        className="absolute left-1/2 top-1/2 grid w-full gap-4 border bg-background p-6 shadow-lg rounded-lg font-sans"
        style={{
          maxWidth: largura,
          opacity: vis,
          transform: `translate(-50%, -50%) scale(${0.95 + 0.05 * p - 0.05 * s})`,
        }}
      >
        {children}
        <span className="absolute right-4 top-4 rounded-sm opacity-70"><X className="h-4 w-4" /></span>
      </div>
    </div>
  );
};

export const DialogosAcordos: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const c = t.clique;
  const salvando = f >= c.confirmar + ms(60);
  return (
    <>
      <Dialogo f={f} abre={c.reagendar + ms(60)} fecha={c.confirmar + ms(420)} largura={384} alvo="reagendar-modal">
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="flex items-center gap-2 text-primary text-sm font-semibold leading-none tracking-tight">
            <CalendarClock className="w-4 h-4 shrink-0" />
            Reagendar Próxima Parcela
          </h2>
          <div className="pt-1 space-y-1">
            <p className="text-sm text-foreground/80">
              Parcela <strong className="font-mono text-foreground">3/4</strong> — defina data e valor.
            </p>
            <p className="text-xs text-muted-foreground">
              Parcela atual (2/4) venceu em <strong>13/10/2026</strong>.
            </p>
          </div>
        </div>
        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <label className="text-xs font-medium leading-none">Vencimento da próxima parcela *</label>
            <div className="inline-flex items-center rounded-md border border-input w-full h-8 text-xs justify-start gap-2 font-mono px-2 font-medium">
              <CalendarIcon className="w-3 h-3 shrink-0 text-muted-foreground" /> 13/11/2026
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium leading-none">Valor (R$) *</label>
            <div className="flex w-full items-center rounded-md border border-input bg-background px-3 py-2 h-8 text-xs font-mono">312,40</div>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 pt-1">
          <span className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 rounded-md px-3 border border-input bg-transparent">Cancelar</span>
          <span
            data-alvo="reagendar-confirmar"
            className={cn('inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 rounded-md px-3 gap-1.5 bg-primary text-primary-foreground', salvando && 'opacity-50')}
            style={{ scale: String(aperto(f, c.confirmar)) }}
          >
            {salvando ? <RefreshCw className="w-3 h-3" style={{ rotate: `${(f - c.confirmar) * 8}deg` }} /> : <CalendarClock className="w-3 h-3" />}
            {salvando ? 'Reagendando...' : 'Confirmar'}
          </span>
        </div>
      </Dialogo>

      <Dialogo f={f} abre={c.whats + ms(60)} fecha={c.mensagem + ms(80)} largura={512} alvo="msg-dialogo">
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <Send className="h-4 w-4 text-success" /> Qual mensagem mandar?
          </h2>
          <p className="text-sm text-muted-foreground">Para Marcos Oliveira. O texto já está com os dados do cliente.</p>
        </div>
        <div className="space-y-2">
          {MENSAGENS.map((m, i) => {
            const acesa = i === 0 && f >= t.whatsApp + ms(100);
            return (
              <div
                key={m.titulo}
                data-alvo={`msg-opcao-${i}`}
                className={cn('w-full rounded-lg border border-border p-3 text-left', acesa && 'border-success/50 bg-success/5')}
                style={{ scale: String(i === 0 ? aperto(f, c.mensagem) : 1) }}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {m.titulo}
                  {i === 0 && <span className="text-[10px] font-medium text-success">· padrão</span>}
                </p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] text-muted-foreground">{m.texto}</p>
              </div>
            );
          })}
        </div>
      </Dialogo>
    </>
  );
};

