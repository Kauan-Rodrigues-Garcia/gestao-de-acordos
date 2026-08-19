/**
 * DetalheTicket — o ticket aberto: cabeçalho, conversa e trilha.
 *
 * A conversa NÃO é privada entre duas pessoas, ao contrário da Ouvidoria: quem
 * enxerga o ticket fala nele. Foi pedido assim, e faz sentido — o assunto é da
 * liderança do setor, não de um indivíduo, e travar a conversa em dois obrigaria
 * a repetir por fora tudo o que já foi dito aqui.
 *
 * O que muda por quem está olhando são as AÇÕES: só quem atende assume, muda
 * estado e prioridade. Quem abriu cancela, e só enquanto o ticket não fechou. A
 * RLS repete essas duas regras — esconder botão não é proteção.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, Loader2, X, FileText, UserCheck, Ban, History,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { assinarTabela } from '@/lib/realtime';
import {
  listarMensagens, listarEventos, enviarMensagem, mudarStatus, assumirTicket,
  mudarPrioridade, subirAnexo,
  type Ticket, type MensagemTicket, type EventoTicket, type AnexoTicket,
} from '@/services/tickets.service';
import {
  STATUS_TICKET, STATUS_FECHADOS, PRIORIDADES, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';

interface Props {
  ticket: Ticket;
  podeAtender: boolean;
  onMudou: () => void;
}

/** 10 MB — o mesmo teto do bucket (migration 20260819120000). */
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export default function DetalheTicket({ ticket, podeAtender, onMudou }: Props) {
  const { perfil } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemTicket[]>([]);
  const [eventos, setEventos] = useState<EventoTicket[]>([]);
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [mostrarTrilha, setMostrarTrilha] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const souAutor = perfil?.id === ticket.abertoPor;
  const fechado = STATUS_FECHADOS.includes(ticket.status);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [m, e] = await Promise.all([listarMensagens(ticket.id), listarEventos(ticket.id)]);
      if (!vivo) return;
      setMensagens(m); setEventos(e);
    })();
    return () => { vivo = false; };
  }, [ticket.id, ticket.atualizadoEm]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens.length]);

  /*
   * A conversa chega sozinha.
   *
   * O filtro por `ticket_id` vale para INSERT, que é o único evento que este
   * chat produz — mensagem não é editada nem apagada. A RLS continua de pé no
   * canal: quem não pode ler o ticket não recebe a linha.
   */
  useEffect(() => {
    return assinarTabela(
      {
        topico: `rt-ticket-${ticket.id}`,
        escutas: [
          { tabela: 'tickets_mensagens', evento: 'INSERT', filtro: `ticket_id=eq.${ticket.id}` },
          { tabela: 'tickets_eventos',   evento: 'INSERT', filtro: `ticket_id=eq.${ticket.id}` },
        ],
      },
      {
        onEvento: () => {
          void listarMensagens(ticket.id).then(setMensagens);
          void listarEventos(ticket.id).then(setEventos);
        },
        onReconectado: () => {
          void listarMensagens(ticket.id).then(setMensagens);
          void listarEventos(ticket.id).then(setEventos);
        },
      },
    );
  }, [ticket.id]);

  /*
   * Prévia do que está para ser enviado.
   *
   * `URL.createObjectURL` reserva memória até alguém revogar — sem a limpeza,
   * cada print anexado e removido ficaria pendurado pelo resto da sessão.
   */
  const previas = useMemo(
    () => pendentes.map(f => (
      f.type.startsWith('image/') ? { arquivo: f, url: URL.createObjectURL(f) } : { arquivo: f, url: null }
    )),
    [pendentes],
  );

  useEffect(() => {
    return () => { for (const p of previas) if (p.url) URL.revokeObjectURL(p.url); };
  }, [previas]);

  function anexar(lista: FileList | null) {
    if (!lista) return;
    const bons: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > TAMANHO_MAXIMO) {
        toast.error(`"${f.name}" passa de 10 MB e não pode ser enviado.`);
        continue;
      }
      bons.push(f);
    }
    setPendentes(p => [...p, ...bons]);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function enviar() {
    if (!perfil?.id) return;
    if (!texto.trim() && !pendentes.length) return;

    setEnviando(true);
    try {
      // Os arquivos sobem ANTES da mensagem: se um deles falhar, nada é gravado
      // e a pessoa tenta de novo com o texto ainda na caixa.
      const anexos: AnexoTicket[] = [];
      for (const f of pendentes) {
        anexos.push(await subirAnexo(f, ticket.empresaId, ticket.id));
      }

      const r = await enviarMensagem({
        ticketId: ticket.id,
        autorId: perfil.id,
        autorNome: perfil.nome ?? 'Sem nome',
        autorFoto: (perfil as { foto_url?: string | null }).foto_url ?? null,
        texto, anexos,
      });
      if (r.erro) { toast.error(r.erro); return; }

      setTexto(''); setPendentes([]);
      setMensagens(await listarMensagens(ticket.id));
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setEnviando(false); }
  }

  async function aplicar(acao: () => Promise<{ erro: string | null }>, ok: string) {
    const r = await acao();
    if (r.erro) { toast.error(r.erro); return; }
    toast.success(ok);
    setEventos(await listarEventos(ticket.id));
    onMudou();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="border-b border-border p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              #{ticket.numero} · {rotuloCategoria(ticket.categoria)} ·
              aberto por {ticket.abertoPorNome ?? 'alguém'}
            </p>
            <h2 className="text-base font-semibold leading-tight mt-0.5">{ticket.assunto}</h2>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_TICKET[ticket.status].cor}`}>
            {STATUS_TICKET[ticket.status].label}
          </span>
        </div>

        {ticket.descricao && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.descricao}</p>
        )}

        {!!Object.keys(ticket.campos).length && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ticket.campos).map(([k, v]) => (
              <span key={k} className="text-[11px] bg-muted px-2 py-0.5 rounded-full">
                <span className="text-muted-foreground">{k}:</span> {v}
              </span>
            ))}
          </div>
        )}

        {/* ── Ações ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {podeAtender && (
            <>
              <Select value={ticket.status}
                onValueChange={v => aplicar(
                  () => mudarStatus(ticket.id, v as StatusTicket),
                  `Ticket movido para ${STATUS_TICKET[v as StatusTicket].label}.`,
                )}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_TICKET) as StatusTicket[])
                    .filter(s => s !== 'cancelado')
                    .map(s => (
                      <SelectItem key={s} value={s}>{STATUS_TICKET[s].label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Select value={ticket.prioridade}
                onValueChange={v => aplicar(
                  () => mudarPrioridade(ticket.id, v as PrioridadeTicket),
                  'Prioridade alterada.',
                )}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORIDADES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {ticket.responsavelId === perfil?.id ? (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => aplicar(
                    () => assumirTicket({
                      ticketId: ticket.id, responsavelId: null, responsavelNome: null,
                      statusAtual: ticket.status,
                    }),
                    'Ticket devolvido à fila.',
                  )}>
                  <UserCheck className="w-3.5 h-3.5" /> Largar
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => aplicar(
                    () => assumirTicket({
                      ticketId: ticket.id,
                      responsavelId: perfil?.id ?? null,
                      responsavelNome: perfil?.nome ?? null,
                      statusAtual: ticket.status,
                    }),
                    'Ticket assumido.',
                  )}>
                  <UserCheck className="w-3.5 h-3.5" /> Assumir
                </Button>
              )}
            </>
          )}

          {souAutor && !fechado && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive"
              onClick={() => aplicar(
                () => mudarStatus(ticket.id, 'cancelado'), 'Ticket cancelado.',
              )}>
              <Ban className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {ticket.responsavelNome ? `Com ${ticket.responsavelNome}` : 'Sem responsável'}
          </span>

          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => setMostrarTrilha(v => !v)}>
            <History className="w-3.5 h-3.5" /> {mostrarTrilha ? 'Ocultar' : 'Histórico'}
          </Button>
        </div>

        {mostrarTrilha && (
          <ul className="text-[11px] text-muted-foreground space-y-0.5 border-t border-border pt-2">
            {eventos.map(e => (
              <li key={e.id}>
                {quando(e.criadoEm)} · {e.autorNome ?? 'Sistema'} —{' '}
                {e.tipo === 'aberto' ? 'abriu o ticket'
                  : e.tipo === 'status' ? `estado: ${e.de ?? '—'} → ${e.para ?? '—'}`
                  : e.tipo === 'responsavel' ? `responsável: ${e.de ?? 'ninguém'} → ${e.para ?? 'ninguém'}`
                  : `${e.tipo}: ${e.de ?? '—'} → ${e.para ?? '—'}`}
              </li>
            ))}
            {!eventos.length && <li>Sem registros.</li>}
          </ul>
        )}
      </div>

      {/* ── Conversa ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
        {!mensagens.length && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma mensagem ainda. Print, áudio e arquivo entram por aqui.
          </p>
        )}
        {mensagens.map(m => {
          const meu = m.autorId === perfil?.id;
          return (
            <div key={m.id} className={`flex gap-2 ${meu ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* A foto vem da mensagem, não de um JOIN: ela é o retrato de quem
                  falou naquele dia, e sobrevive à exclusão do perfil. */}
              <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                <AvatarImage src={m.autorFoto ?? undefined} />
                <AvatarFallback className="text-[10px]">{iniciais(m.autorNome)}</AvatarFallback>
              </Avatar>
              <div className={`max-w-[78%] rounded-lg px-3 py-2 ${
                meu ? 'bg-primary/10 border border-primary/20' : 'bg-muted'
              }`}>
                <p className="text-[11px] text-muted-foreground mb-0.5">
                  {m.autorNome ?? 'Alguém'} · {quando(m.criadoEm)}
                </p>
                {m.texto && <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>}
                {!!m.anexos.length && (
                  <div className="mt-1.5 space-y-1.5">
                    {m.anexos.map(a => <Anexo key={a.url} anexo={a} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {/* ── Caixa de envio ───────────────────────────────────────────────── */}
      <div className="border-t border-border p-4 space-y-2">
        {fechado ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            Ticket {STATUS_TICKET[ticket.status].label.toLowerCase()}. A conversa fica registrada.
          </p>
        ) : (
          <>
            {/* Imagem anexada aparece ANTES de ir: mandar o print errado num
                ticket é fácil, e desfazer depois não dá — mensagem não se apaga. */}
            {!!previas.length && (
              <div className="flex flex-wrap gap-2">
                {previas.map((p, i) => (
                  <div key={`${p.arquivo.name}-${i}`}
                    className="relative rounded border border-border bg-muted overflow-hidden">
                    {p.url ? (
                      <img src={p.url} alt={p.arquivo.name}
                        className="h-20 w-20 object-cover" />
                    ) : (
                      <div className="h-20 w-32 flex items-center justify-center px-2">
                        <span className="text-[10px] text-center break-all line-clamp-3">
                          {p.arquivo.name}
                        </span>
                      </div>
                    )}
                    <button
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5"
                      title={`Remover ${p.arquivo.name}`}
                      onClick={() => setPendentes(atual => atual.filter((_, j) => j !== i))}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={inputRef} type="file" multiple className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.xlsx,.xls,.csv,.txt"
                onChange={e => anexar(e.target.files)} />
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0"
                onClick={() => inputRef.current?.click()} disabled={enviando}
                title="Anexar print, áudio ou arquivo">
                <Paperclip className="w-4 h-4" />
              </Button>
              <Textarea value={texto} onChange={e => setTexto(e.target.value)}
                placeholder="Escreva uma mensagem…" rows={1}
                className="min-h-9 max-h-32 resize-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
                }} />
              <Button size="icon" className="h-9 w-9 flex-shrink-0"
                onClick={enviar} disabled={enviando || (!texto.trim() && !pendentes.length)}>
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Imagem aparece; o resto vira link. Print é o anexo mais comum de longe. */
function Anexo({ anexo }: { anexo: AnexoTicket }) {
  if (anexo.tipo.startsWith('image/')) {
    return (
      <a href={anexo.url} target="_blank" rel="noreferrer" className="block">
        <img src={anexo.url} alt={anexo.nome}
          className="max-h-56 rounded border border-border object-contain" />
      </a>
    );
  }
  if (anexo.tipo.startsWith('audio/')) {
    return <audio controls src={anexo.url} className="w-full max-w-xs" />;
  }
  if (anexo.tipo.startsWith('video/')) {
    return <video controls src={anexo.url} className="max-h-56 rounded border border-border" />;
  }
  return (
    <a href={anexo.url} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 text-xs text-primary underline underline-offset-2">
      <FileText className="w-3.5 h-3.5" /> {anexo.nome}
    </a>
  );
}

function iniciais(nome: string | null): string {
  return (nome ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
