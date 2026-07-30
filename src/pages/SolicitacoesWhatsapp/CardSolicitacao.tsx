/**
 * CardSolicitacao — um pedido na lista. Clicar expande os detalhes.
 *
 * Fechado mostra o essencial (cliente, categoria, status, quem atende).
 * Aberto mostra a mensagem completa, a linha do tempo de status e a conversa.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, MessageSquare, Clock, User, MapPin, Hash, Phone,
  Trash2, Loader2, PlayCircle, CheckCircle2, HelpCircle, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatarTelefonePP } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  CATEGORIA_LABEL, STATUS_LABEL,
  type SolicitacaoWhatsapp, type StatusSolicitacao, type EventoSolicitacao,
} from '@/services/solicitacoesWhatsapp.service';
import { primeiroNome } from './formatacao';

const STATUS_ESTILO: Record<StatusSolicitacao, string> = {
  pendente:     'bg-sky-500/10 text-sky-500 border-sky-500/30',
  em_andamento: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  feito:        'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  falta_info:   'bg-destructive/10 text-destructive border-destructive/30',
};

function dataHora(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function Pessoa({ nome, foto, tamanho = 'w-5 h-5' }: { nome: string | null | undefined; foto: string | null | undefined; tamanho?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <Avatar className={cn(tamanho, 'shrink-0')}>
        {foto && <AvatarImage src={foto} alt={nome ?? ''} className="object-cover" />}
        <AvatarFallback className="bg-muted text-[9px] font-bold">
          {(nome ?? '?').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{primeiroNome(nome)}</span>
    </span>
  );
}

export function CardSolicitacao({
  solicitacao: s, expandido, eventos, naoLidas, podeEditar, ehDono, salvando,
  onAlternar, onMudarStatus, onExcluir, onAbrirChat, chatAberto, children,
}: {
  solicitacao: SolicitacaoWhatsapp;
  expandido:   boolean;
  eventos:     EventoSolicitacao[];
  naoLidas:    number;
  /** Responsável ou líder+: pode mudar status e excluir. */
  podeEditar:  boolean;
  /** É o solicitante — vê o card como "meu pedido". */
  ehDono:      boolean;
  salvando:    boolean;
  onAlternar:  () => void;
  onMudarStatus: (status: StatusSolicitacao) => void;
  onExcluir:   () => void;
  onAbrirChat: () => void;
  chatAberto:  boolean;
  /** O painel de chat, montado pelo pai só quando aberto. */
  children?:   React.ReactNode;
}) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  return (
    <div className={cn(
      'rounded-xl border bg-card overflow-hidden transition-colors',
      expandido ? 'border-primary/40 shadow-sm' : 'border-border hover:border-border/80',
    )}>
      {/* ── Cabeçalho clicável ── */}
      <button
        type="button"
        onClick={onAlternar}
        className="w-full text-left px-3.5 py-3 flex items-center gap-3 hover:bg-accent/40 transition-colors"
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
              <Hash className="w-2.5 h-2.5" />{s.codigo_cliente}
            </span>
            <p className="font-medium text-sm truncate">{s.nome_cliente || 'Sem nome'}</p>
            {s.estado_uf && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />{s.estado_uf}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              {CATEGORIA_LABEL[s.categoria]}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />{dataHora(s.criado_em)}
            </span>
            {!ehDono && s.solicitante && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                <Pessoa nome={s.solicitante.nome} foto={s.solicitante.foto_url} tamanho="w-4 h-4" />
              </span>
            )}
            {/* Quem está atendendo — o solicitante precisa saber com quem está. */}
            {s.responsavel && (
              <span className="inline-flex items-center gap-1 text-foreground/80">
                com <Pessoa nome={s.responsavel.nome} foto={s.responsavel.foto_url} tamanho="w-4 h-4" />
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {naoLidas > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold text-white">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
          <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', STATUS_ESTILO[s.status])}>
            {STATUS_LABEL[s.status]}
          </Badge>
          <ChevronDown className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            expandido && 'rotate-180',
          )} />
        </div>
      </button>

      {/* ── Detalhes ── */}
      <AnimatePresence initial={false}>
        {expandido && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-border"
          >
            <div className="px-3.5 py-3 space-y-3">
              {/* WhatsApp */}
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono">{formatarTelefonePP(s.whatsapp) || s.whatsapp}</span>
              </div>

              {/* Mensagem pedida */}
              <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Mensagem a enviar
                </p>
                <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">
                  {s.mensagem}
                </p>
              </div>

              {/* Linha do tempo */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Histórico
                </p>
                <div className="space-y-1">
                  {eventos.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Carregando…</p>
                  )}
                  {eventos.map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="tabular-nums shrink-0">{dataHora(ev.criado_em)}</span>
                      <span className="truncate">
                        {ev.status_anterior
                          ? `${STATUS_LABEL[ev.status_anterior]} → ${STATUS_LABEL[ev.status_novo]}`
                          : `Aberta como ${STATUS_LABEL[ev.status_novo]}`}
                        {ev.autor?.nome && ` · ${primeiroNome(ev.autor.nome)}`}
                      </span>
                    </div>
                  ))}
                </div>
                {(s.iniciado_em || s.finalizado_em) && (
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    {s.iniciado_em   && <>Iniciado {dataHora(s.iniciado_em)}. </>}
                    {s.finalizado_em && <>Finalizado {dataHora(s.finalizado_em)}.</>}
                  </p>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <Button
                  size="sm" variant={chatAberto ? 'secondary' : 'outline'}
                  className="h-7 text-xs gap-1.5"
                  onClick={onAbrirChat}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {chatAberto ? 'Fechar conversa' : 'Conversar'}
                  {naoLidas > 0 && !chatAberto && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-white">
                      {naoLidas > 9 ? '9+' : naoLidas}
                    </span>
                  )}
                </Button>

                {podeEditar && s.status !== 'em_andamento' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    disabled={salvando} onClick={() => onMudarStatus('em_andamento')}>
                    {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                    Assumir
                  </Button>
                )}
                {podeEditar && s.status !== 'falta_info' && s.status !== 'feito' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    disabled={salvando} onClick={() => onMudarStatus('falta_info')}>
                    <HelpCircle className="w-3.5 h-3.5" /> Falta informação
                  </Button>
                )}
                {podeEditar && s.status !== 'feito' && (
                  <Button size="sm" className="h-7 text-xs gap-1.5"
                    disabled={salvando} onClick={() => onMudarStatus('feito')}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Marcar feito
                  </Button>
                )}
                {podeEditar && s.status === 'feito' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    disabled={salvando} onClick={() => onMudarStatus('em_andamento')}>
                    <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                  </Button>
                )}

                {/* Excluir: o dono só enquanto ninguém pegou; líder+ sempre.
                    A RLS decide de verdade — aqui é só não oferecer em vão. */}
                {(podeEditar || (ehDono && s.status === 'pendente')) && (
                  confirmandoExclusao ? (
                    <span className="inline-flex items-center gap-1.5 ml-auto">
                      <span className="text-[11px] text-muted-foreground">Excluir?</span>
                      <Button size="sm" variant="destructive" className="h-7 text-xs"
                        onClick={() => { setConfirmandoExclusao(false); onExcluir(); }}>
                        Sim
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setConfirmandoExclusao(false)}>
                        Não
                      </Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost"
                      className="h-7 text-xs gap-1.5 ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmandoExclusao(true)}>
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </Button>
                  )
                )}
              </div>

              {/* Conversa */}
              {chatAberto && <div className="pt-1">{children}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
