/**
 * DetalheTicket — o ticket aberto: cabeçalho, linha do tempo e caixa de envio.
 *
 * ## Uma linha do tempo, não duas listas
 *
 * A versão anterior tinha a conversa no meio e a trilha de auditoria escondida
 * atrás de um botão "Histórico". Quem lia a conversa não sabia que, entre a
 * segunda e a terceira mensagem, o ticket tinha trocado de responsável — a
 * informação estava na tela, no lugar errado.
 *
 * Agora mensagem e evento são a MESMA lista, em ordem cronológica: "Ana assumiu
 * o ticket" aparece entre as duas mensagens, onde aconteceu. É como toda
 * ferramenta séria de atendimento apresenta um chamado, e pelo mesmo motivo —
 * um chamado é uma história, e a história tem uma ordem só.
 *
 * ## O que muda por quem está olhando
 *
 * A conversa NÃO é privada entre duas pessoas, ao contrário da Ouvidoria: quem
 * enxerga o ticket fala nele. O assunto é da liderança do setor, não de um
 * indivíduo, e travar a conversa em dois obrigaria a repetir por fora tudo o
 * que já foi dito aqui.
 *
 * O que muda são as AÇÕES: só quem atende assume, muda estado e prioridade.
 * Quem abriu cancela, e só enquanto o ticket não fechou. A RLS repete essas
 * duas regras — esconder botão não é proteção.
 *
 * ## Carregamento
 *
 * A conversa é relida inteira a cada mensagem nova — é o mais simples e continua
 * sendo. `reconciliarLista` devolve as mensagens antigas com a MESMA referência,
 * então só a que chegou monta. Sem isso, uma resposta num ticket de trinta
 * mensagens remontava as trinta e as imagens anexadas recarregavam junto.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, Loader2, X, FileText, UserCheck, UserMinus, Ban, ArrowLeft,
  Clock, Tag,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRelogioLento } from '@/hooks/useRelogioLento';
import { assinarTabela } from '@/lib/realtime';
import { criarAgrupador } from '@/lib/agrupador';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import {
  listarMensagens, listarEventos, enviarMensagem, mudarStatus, assumirTicket,
  mudarPrioridade, subirAnexo,
  type Ticket, type MensagemTicket, type EventoTicket, type AnexoTicket,
} from '@/services/tickets.service';
import {
  STATUS_TICKET, STATUS_FECHADOS, ORDEM_STATUS, PRIORIDADES, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';
import { temperatura, tempoSemMovimento, textoDeIdade, iniciais } from './fila';

interface Props {
  ticket: Ticket;
  podeAtender: boolean;
  /** Fotos já carregadas pela tela — o detalhe não faz consulta própria. */
  fotos: Map<string, string | null>;
  onFechar: () => void;
  onMudou: () => void;
}

/** 10 MB — o mesmo teto do bucket (migration 20260819120000). */
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** Um item da linha do tempo: mensagem de gente ou movimento do sistema. */
type ItemLinha =
  | { tipo: 'mensagem'; em: number; mensagem: MensagemTicket }
  | { tipo: 'evento';   em: number; evento: EventoTicket };

export default function DetalheTicket({
  ticket, podeAtender, fotos, onFechar, onMudou,
}: Props) {
  const { perfil } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemTicket[]>([]);
  const [eventos, setEventos] = useState<EventoTicket[]>([]);
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agora = useRelogioLento(60_000);
  const souAutor = perfil?.id === ticket.abertoPor;
  const fechado = STATUS_FECHADOS.includes(ticket.status);
  const souResponsavel = !!perfil?.id && ticket.responsavelId === perfil.id;

  const aplicarConversa = useCallback((m: MensagemTicket[], e: EventoTicket[]) => {
    setMensagens(atual => reconciliarLista(atual, m, { chave: x => x.id, iguais: iguaisProfundo }));
    setEventos(atual => reconciliarLista(atual, e, { chave: x => x.id, iguais: iguaisProfundo }));
  }, []);

  const reler = useCallback(async () => {
    const [m, e] = await Promise.all([listarMensagens(ticket.id), listarEventos(ticket.id)]);
    aplicarConversa(m, e);
  }, [ticket.id, aplicarConversa]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [m, e] = await Promise.all([listarMensagens(ticket.id), listarEventos(ticket.id)]);
      if (!vivo) return;
      aplicarConversa(m, e);
    })();
    return () => { vivo = false; };
  }, [ticket.id, ticket.atualizadoEm, aplicarConversa]);

  /*
   * A conversa chega sozinha.
   *
   * O filtro por `ticket_id` vale para INSERT, que é o único evento que este
   * chat produz — mensagem não é editada nem apagada. A RLS continua de pé no
   * canal: quem não pode ler o ticket não recebe a linha.
   *
   * O agrupador existe porque uma ação escreve DOIS registros: a mudança de
   * estado insere em `tickets_eventos` e o gatilho pode inserir em
   * `tickets_mensagens`. Sem ele, assumir um ticket produzia duas releituras da
   * conversa inteira em menos de 100 ms.
   */
  useEffect(() => {
    const grupo = criarAgrupador(() => { void reler(); }, { esperaMs: 150, tetoMs: 800 });
    const cancelar = assinarTabela(
      {
        topico: `rt-ticket-${ticket.id}`,
        escutas: [
          { tabela: 'tickets_mensagens', evento: 'INSERT', filtro: `ticket_id=eq.${ticket.id}` },
          { tabela: 'tickets_eventos',   evento: 'INSERT', filtro: `ticket_id=eq.${ticket.id}` },
        ],
      },
      {
        onEvento:      () => grupo.avisar(),
        onReconectado: () => { grupo.cancelar(); void reler(); },
      },
    );
    return () => { grupo.cancelar(); cancelar(); };
  }, [ticket.id, reler]);

  /**
   * Mensagem e evento na mesma ordem em que aconteceram.
   *
   * O desempate por tipo põe o EVENTO antes da mensagem quando os dois têm o
   * mesmo carimbo — e eles têm, quando o gatilho grava os dois na mesma
   * transação. "Ana assumiu" precede "Ana: já estou vendo", que é a ordem em
   * que a coisa se deu.
   */
  const linha = useMemo<ItemLinha[]>(() => {
    const itens: ItemLinha[] = [
      ...mensagens.map(m => ({ tipo: 'mensagem' as const, em: Date.parse(m.criadoEm), mensagem: m })),
      ...eventos.map(e => ({ tipo: 'evento' as const, em: Date.parse(e.criadoEm), evento: e })),
    ];
    return itens.sort((a, b) =>
      a.em - b.em || (a.tipo === 'evento' ? -1 : 1) - (b.tipo === 'evento' ? -1 : 1));
  }, [mensagens, eventos]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [linha.length]);

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
      await reler();
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setEnviando(false); }
  }

  /** Executa uma ação de ticket e traduz a recusa do banco, se vier. */
  async function aplicar(acao: () => Promise<{ erro: string | null }>, ok: string) {
    setOcupado(true);
    try {
      const r = await acao();
      if (r.erro) { toast.error(r.erro); return; }
      toast.success(ok);
      await reler();
      onMudou();
    } finally { setOcupado(false); }
  }

  const temp = temperatura(ticket, agora);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="border-b border-border px-4 py-3 md:px-5 md:py-4 space-y-3 shrink-0">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 -ml-1"
            onClick={onFechar} title="Voltar à fila (Esc)">
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
              <span className="font-mono">#{ticket.numero}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Tag className="w-3 h-3" /> {rotuloCategoria(ticket.categoria)}
              </span>
              <span>·</span>
              <span>aberto por {ticket.abertoPorNome ?? 'alguém'}</span>
            </div>
            <h2 className="text-base font-semibold leading-snug mt-0.5 break-words">
              {ticket.assunto}
            </h2>
          </div>

          <span className={cn(
            'shrink-0 text-xs px-2 py-1 rounded-full border leading-none',
            STATUS_TICKET[ticket.status].cor,
          )}>
            {STATUS_TICKET[ticket.status].label}
          </span>
        </div>

        {/* Linha de estado: quem está com isso, e há quanto tempo não anda. */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {ticket.responsavelId ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Avatar className="w-4 h-4">
                <AvatarImage src={fotos.get(ticket.responsavelId) ?? undefined} />
                <AvatarFallback className="text-[8px]">{iniciais(ticket.responsavelNome)}</AvatarFallback>
              </Avatar>
              com {ticket.responsavelNome}
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-500 font-medium">Sem responsável</span>
          )}

          <span className="text-muted-foreground/50">·</span>

          <span className={cn(
            'inline-flex items-center gap-1',
            temp === 'parado' ? 'text-destructive'
              : temp === 'atencao' ? 'text-amber-600 dark:text-amber-500'
              : 'text-muted-foreground',
          )}>
            <Clock className="w-3 h-3" />
            sem movimento {textoDeIdade(tempoSemMovimento(ticket, agora))}
          </span>

          {ticket.prioridade !== 'normal' && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className={PRIORIDADES[ticket.prioridade].cor}>
                prioridade {PRIORIDADES[ticket.prioridade].label.toLowerCase()}
              </span>
            </>
          )}
        </div>

        {ticket.descricao && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {ticket.descricao}
          </p>
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
        {(podeAtender || (souAutor && !fechado)) && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {podeAtender && (
              <>
                <Select
                  value={ticket.status}
                  disabled={ocupado}
                  onValueChange={v => aplicar(
                    () => mudarStatus(ticket.id, v as StatusTicket),
                    `Ticket movido para ${STATUS_TICKET[v as StatusTicket].label}.`,
                  )}
                >
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Cancelar é ato de quem PEDIU, não de quem atende: quem
                        atende recusa, que é uma resposta, não uma desistência. */}
                    {ORDEM_STATUS.filter(s => s !== 'cancelado').map(s => (
                      <SelectItem key={s} value={s}>{STATUS_TICKET[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={ticket.prioridade}
                  disabled={ocupado}
                  onValueChange={v => aplicar(
                    () => mudarPrioridade(ticket.id, v as PrioridadeTicket),
                    'Prioridade alterada.',
                  )}
                >
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORIDADES) as PrioridadeTicket[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORIDADES[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {souResponsavel ? (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={ocupado}
                    onClick={() => aplicar(
                      () => assumirTicket({
                        ticketId: ticket.id, responsavelId: null, responsavelNome: null,
                        statusAtual: ticket.status,
                      }),
                      'Ticket devolvido à fila.',
                    )}>
                    <UserMinus className="w-3.5 h-3.5" /> Largar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={ocupado}
                    onClick={() => aplicar(
                      () => assumirTicket({
                        ticketId: ticket.id,
                        responsavelId: perfil?.id ?? null,
                        responsavelNome: perfil?.nome ?? null,
                        statusAtual: ticket.status,
                      }),
                      'Ticket assumido.',
                    )}>
                    <UserCheck className="w-3.5 h-3.5" />
                    {ticket.responsavelId ? 'Assumir para mim' : 'Assumir'}
                  </Button>
                )}
              </>
            )}

            {souAutor && !fechado && (
              <Button variant="ghost" size="sm"
                className="h-8 gap-1.5 text-xs text-destructive ml-auto" disabled={ocupado}
                onClick={() => aplicar(
                  () => mudarStatus(ticket.id, 'cancelado'), 'Ticket cancelado.',
                )}>
                <Ban className="w-3.5 h-3.5" /> Cancelar pedido
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Linha do tempo ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5 space-y-3 min-h-0">
        {!linha.length && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nada aconteceu ainda. Print, áudio e arquivo entram por aqui.
          </p>
        )}

        {linha.map((item, i) => {
          const anterior = i > 0 ? linha[i - 1] : null;
          const separador = precisaSeparador(anterior?.em ?? null, item.em);

          return (
            <div key={item.tipo === 'mensagem' ? item.mensagem.id : item.evento.id}>
              {separador && (
                <div className="flex items-center gap-2 py-2">
                  <span className="flex-1 h-px bg-border" />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {rotuloDoDia(item.em)}
                  </span>
                  <span className="flex-1 h-px bg-border" />
                </div>
              )}

              {item.tipo === 'evento'
                ? <LinhaDeEvento evento={item.evento} />
                : <Balao mensagem={item.mensagem} meu={item.mensagem.autorId === perfil?.id} />}
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {/* ── Caixa de envio ───────────────────────────────────────────────── */}
      <div className="border-t border-border p-3 md:p-4 space-y-2 shrink-0">
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
                      <img src={p.url} alt={p.arquivo.name} className="h-20 w-20 object-cover" />
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

// ── Peças da linha do tempo ──────────────────────────────────────────────────

/**
 * O movimento do sistema, no meio da conversa.
 *
 * Centralizado, pequeno e sem balão: ele é contexto, não fala. Quem varre a
 * conversa com o olho tem de conseguir pular estas linhas sem esforço, e
 * encontrá-las quando a pergunta for "quando foi que isso mudou de dono?".
 */
function LinhaDeEvento({ evento }: { evento: EventoTicket }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="flex-1 h-px bg-border/60" />
      <p className="text-[11px] text-muted-foreground text-center px-1">
        {frase(evento)} · {hora(evento.criadoEm)}
      </p>
      <span className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function frase(e: EventoTicket): string {
  const quem = e.autorNome ?? 'O sistema';
  switch (e.tipo) {
    case 'aberto':
      return `${quem} abriu o ticket`;
    case 'status':
      return `${quem} mudou o estado: ${rotuloStatus(e.de)} → ${rotuloStatus(e.para)}`;
    case 'responsavel':
      if (!e.para) return `${quem} devolveu o ticket à fila`;
      if (!e.de)   return `${quem} assumiu o ticket`;
      return `${quem} passou o ticket de ${e.de} para ${e.para}`;
    case 'prioridade':
      return `${quem} mudou a prioridade: ${e.de ?? '—'} → ${e.para ?? '—'}`;
    default:
      return `${quem} — ${e.tipo}: ${e.de ?? '—'} → ${e.para ?? '—'}`;
  }
}

/** O evento guarda o valor CRU do banco; a tela mostra o rótulo de gente. */
function rotuloStatus(valor: string | null): string {
  if (!valor) return '—';
  return STATUS_TICKET[valor as StatusTicket]?.label ?? valor;
}

function Balao({ mensagem: m, meu }: { mensagem: MensagemTicket; meu: boolean }) {
  return (
    <div className={cn('flex gap-2', meu ? 'flex-row-reverse' : 'flex-row')}>
      {/* A foto vem da mensagem, não de um JOIN: ela é o retrato de quem falou
          naquele dia, e sobrevive à exclusão do perfil. */}
      <Avatar className="w-7 h-7 shrink-0 mt-0.5">
        <AvatarImage src={m.autorFoto ?? undefined} />
        <AvatarFallback className="text-[10px]">{iniciais(m.autorNome)}</AvatarFallback>
      </Avatar>
      <div className={cn(
        'max-w-[78%] rounded-xl px-3 py-2',
        meu ? 'bg-primary/10 border border-primary/20' : 'bg-muted',
      )}>
        <p className="text-[11px] text-muted-foreground mb-0.5">
          {m.autorNome ?? 'Alguém'} · {hora(m.criadoEm)}
        </p>
        {m.texto && <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.texto}</p>}
        {!!m.anexos.length && (
          <div className="mt-1.5 space-y-1.5">
            {m.anexos.map(a => <Anexo key={a.url} anexo={a} />)}
          </div>
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
        <img src={anexo.url} alt={anexo.nome} loading="lazy"
          className="max-h-56 rounded border border-border object-contain" />
      </a>
    );
  }
  if (anexo.tipo.startsWith('audio/')) {
    return <audio controls preload="none" src={anexo.url} className="w-full max-w-xs" />;
  }
  if (anexo.tipo.startsWith('video/')) {
    return <video controls preload="none" src={anexo.url} className="max-h-56 rounded border border-border" />;
  }
  return (
    <a href={anexo.url} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 text-xs text-primary underline underline-offset-2">
      <FileText className="w-3.5 h-3.5" /> {anexo.nome}
    </a>
  );
}

// ── Datas ────────────────────────────────────────────────────────────────────

/**
 * Um separador por dia.
 *
 * Sem ele, uma conversa que atravessa a semana vira uma parede de horários em
 * que "09:12" pode ser hoje ou terça-feira. Com ele, o horário sozinho basta em
 * cada balão — que é por isso que os balões não repetem a data.
 */
function precisaSeparador(anterior: number | null, atual: number): boolean {
  if (anterior === null) return true;
  return new Date(anterior).toDateString() !== new Date(atual).toDateString();
}

function rotuloDoDia(em: number): string {
  const d = new Date(em);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
