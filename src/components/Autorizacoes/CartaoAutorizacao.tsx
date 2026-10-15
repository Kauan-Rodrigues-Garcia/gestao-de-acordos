/**
 * CartaoAutorizacao — um pedido de autorização, com aprovar, recusar e
 * cancelar.
 *
 * Mora aqui desde 15/10/2026, quando as autorizações foram para o chat (a
 * conversa fixa «Autorizações», `components/Chat/AutorizacoesChat`). A gaveta
 * antiga (`AutorizacaoDock`) usa o mesmo cartão para quem não tem chat.
 *
 * ## Aprovar não tem desfazer
 *
 * Aprovar apaga o acordo de alguém e cria outro no lugar. Por isso o botão de
 * aprovar exige uma segunda confirmação NA PRÓPRIA LINHA, com o nome de quem
 * perde o acordo escrito nela — e não um `confirm()`, que a pessoa fecha no
 * automático sem ler.
 *
 * ## Um decide por todos
 *
 * O pedido chega para todos os líderes do setor ao mesmo tempo. Quem decide
 * primeiro vale: o servidor trava a linha e o segundo recebe «já decidido por
 * Fulano». A lista de todos se atualiza pelo sinal `autorizacoes`.
 */

import { useState } from 'react';
import {
  Check, Ban, Loader2, Clock, AlertTriangle, ArrowRightLeft, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import {
  decidirAutorizacao, cancelarAutorizacao, type PedidoAutorizacao,
} from '@/services/autorizacaoPedidos.service';

/** "há 3 min", "há 2 h" — a idade do pedido importa mais que a hora exata. */
function idade(iso: string): string {
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;
  return `há ${Math.round(seg / 86400)} d`;
}

/** Quanto falta para o pedido expirar. Vazio quando ainda sobra muito tempo. */
function restante(iso: string): string | null {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min <= 0) return 'expirado';
  if (min <= 60) return `expira em ${min} min`;
  if (min <= 240) return `expira em ${Math.round(min / 60)} h`;
  return null;
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-[11px] font-medium truncate" title={valor}>{valor}</p>
    </div>
  );
}

export interface CartaoProps {
  pedido: PedidoAutorizacao;
  /**
   * Quem olha pode decidir ESTE pedido? A chave depende do modo:
   * `tornar_direto` tem a própria (`acordos_autorizar_tornar_direto`).
   */
  souAutorizador: boolean;
  meuId: string | null;
  onDecidido: () => void;
}

export function CartaoAutorizacao({ pedido, souAutorizador, meuId, onDecidido }: CartaoProps) {
  // 'confirmar' é o estado entre clicar em Aprovar e aprovar de verdade.
  const [fase, setFase] = useState<'normal' | 'confirmar' | 'recusar'>('normal');
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const r = pedido.resumo ?? {};
  const ehTrocaExtra = pedido.modo === 'troca_extra';
  const ehTornarDireto = pedido.modo === 'tornar_direto';
  const perde = ehTrocaExtra ? pedido.extra_atual_op_nome : pedido.dono_nome;
  const souSolicitante = meuId !== null && pedido.solicitante_id === meuId;
  const expira = restante(pedido.expira_em);

  async function decidir(aprovar: boolean) {
    setOcupado(true);
    const res = await decidirAutorizacao({ id: pedido.id, aprovar, motivo });
    setOcupado(false);
    if ('erro' in res) { toast.error(res.erro); onDecidido(); return; }
    toast.success(
      res.status === 'aprovado'
        ? ehTornarDireto
          ? `Autorizado. O acordo agora é DIRETO de ${pedido.solicitante_nome}.`
          : `Autorizado. O acordo foi tabulado para ${pedido.solicitante_nome}.`
        : 'Pedido recusado. O operador foi avisado.',
    );
    setFase('normal'); setMotivo('');
    onDecidido();
  }

  /**
   * O solicitante desiste do próprio pedido.
   *
   * Cancelar NÃO é decidir — é retirar o pedido da fila antes que alguém gaste
   * tempo com ele. Por isso aparece justamente onde «ninguém decide o próprio
   * pedido» continua valendo: o botão some assim que o status sai de
   * `pendente`.
   *
   * A tela esconder é conveniência. A garantia é da RPC
   * `fn_autorizacao_cancelar`, que exige sessão e filtra por
   * `solicitante_id = auth.uid() AND status = 'pendente'` — pedido de outra
   * pessoa, ou já decidido, não muda nada e volta `ok: false`.
   */
  async function cancelar() {
    setOcupado(true);
    const ok = await cancelarAutorizacao(pedido.id);
    setOcupado(false);
    toast[ok ? 'success' : 'error'](
      ok ? 'Pedido cancelado.' : 'Não foi possível cancelar — talvez já tenha sido decidido.',
    );
    onDecidido();
  }


  return (
    <div className={cn(
      'rounded-xl border p-3 space-y-2',
      pedido.status === 'pendente' ? 'border-border bg-card' : 'border-border/60 bg-muted/30',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">
            {pedido.solicitante_nome}
            <span className="font-normal text-muted-foreground">
              {ehTornarDireto ? ' quer tornar DIRETO' : ' quer registrar'}
            </span>
          </p>
          <p className="text-sm font-mono font-bold truncate" title={pedido.nr_valor}>
            {pedido.nr_label} {pedido.nr_valor}
          </p>
        </div>
        <span className={cn(
          'shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
          ehTornarDireto ? 'bg-primary/15 text-primary'
            : ehTrocaExtra ? 'bg-amber-500/15 text-amber-600' : 'bg-destructive/15 text-destructive',
        )}>
          {ehTrocaExtra || ehTornarDireto ? <ArrowRightLeft className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
          {ehTornarDireto ? 'tornar direto' : ehTrocaExtra ? 'troca extra' : 'transferência'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Cliente" valor={r.cliente || '—'} />
        <Campo rotulo="Valor" valor={r.valor != null ? formatBRL(Number(r.valor)) : '—'} />
        <Campo rotulo="Vencimento"
          valor={r.vencimento ? new Date(`${r.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : '—'} />
        <Campo rotulo={ehTrocaExtra ? 'EXTRA hoje de' : ehTornarDireto ? 'DIRETO hoje de' : 'Hoje é de'} valor={perde || '—'} />
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        {idade(pedido.criado_em)}
        {r.setorNome && <> · {r.setorNome}</>}
        {pedido.status === 'pendente' && expira && (
          <span className="text-warning font-medium">· {expira}</span>
        )}
      </div>

      {/* ── Já decidido: o registro fica até a virada do dia ───────────────
          Não é enfeite: é o que impede duas pessoas de perguntarem a mesma
          coisa, e o que mostra ao solicitante que já foi resolvido. À
          meia-noite a faxina apaga a linha e a lista amanhece só com
          pendentes. */}
      {pedido.status !== 'pendente' && (
        <div className="rounded-lg bg-muted/50 px-2 py-1.5">
          <p className="text-[11px]">
            {pedido.status === 'aprovado' && <strong className="text-success">Autorizado</strong>}
            {pedido.status === 'recusado' && <strong className="text-destructive">Recusado</strong>}
            {pedido.status === 'cancelado' && <strong className="text-muted-foreground">Cancelado</strong>}
            {pedido.status === 'falhou' && <strong className="text-destructive">Falhou</strong>}
            {pedido.decidido_por_nome && <> por <strong>{pedido.decidido_por_nome}</strong></>}
            {pedido.decidido_em && <> · {idade(pedido.decidido_em)}</>}
          </p>
          {pedido.motivo_recusa && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{pedido.motivo_recusa}</p>
          )}
          {pedido.erro && (
            <p className="text-[10px] text-destructive mt-0.5">Erro técnico: {pedido.erro}</p>
          )}
        </div>
      )}

      {/* ── Pendente, e quem olha decide ──────────────────────────────────── */}
      {pedido.status === 'pendente' && souAutorizador && !souSolicitante && (
        <>
          {fase === 'normal' && (
            <div className="flex gap-2">
              <button
                onClick={() => setFase('recusar')} disabled={ocupado}
                className="flex-1 h-8 rounded-lg border border-border text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Recusar
              </button>
              <button
                onClick={() => setFase('confirmar')} disabled={ocupado}
                className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Aprovar
              </button>
            </div>
          )}

          {/* Segunda confirmação: o nome de quem perde o acordo fica escrito no
              próprio aviso. Um `confirm()` genérico seria fechado no automático. */}
          {fase === 'confirmar' && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 space-y-2">
              <p className="text-[11px] flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <span>
                  <strong className="text-destructive">Não tem como desfazer.</strong>{' '}
                  O acordo de <strong>{perde || 'outro operador'}</strong> vai para a
                  lixeira e o {pedido.nr_label} passa para{' '}
                  <strong>{pedido.solicitante_nome}</strong>
                  {ehTornarDireto ? ', que deixa de ser EXTRA e vira DIRETO' : ''}. Os dois são notificados.
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFase('normal')} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg border border-border bg-background text-[11px] font-medium disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={() => decidir(true)} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmar autorização
                </button>
              </div>
            </div>
          )}

          {fase === 'recusar' && (
            <div className="rounded-lg border border-border bg-muted/40 p-2 space-y-2">
              <input
                value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={160}
                placeholder="Motivo (opcional) — o operador vai ler"
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-[11px]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setFase('normal'); setMotivo(''); }} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg border border-border bg-background text-[11px] font-medium disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={() => decidir(false)} disabled={ocupado}
                  className="flex-1 h-8 rounded-lg bg-foreground text-background text-[11px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  Recusar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Um pedido PRÓPRIO aparece aqui só quando quem olha também autoriza.
          Decidir continua fora: ninguém aprova nem recusa o próprio pedido.
          Cancelar é outra coisa — é retirar o pedido da fila, e só o dono
          pode. Para o operador comum a gaveta não existe; ele acompanha por
          notificação. */}
      {souSolicitante && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Seu pedido. A decisão é de outro autorizador.
          </p>
          {pedido.status === 'pendente' && (
            <button
              onClick={() => void cancelar()} disabled={ocupado}
              className="w-full h-8 rounded-lg border border-border text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {ocupado
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Ban className="w-3.5 h-3.5" />}
              Cancelar pedido
            </button>
          )}
        </div>
      )}
    </div>
  );
}
