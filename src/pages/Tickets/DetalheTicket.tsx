/**
 * DetalheTicket — o ticket aberto: cabeçalho, linha do tempo e caixa de envio.
 *
 * ## Uma linha do tempo, não duas listas
 *
 * Mensagem e evento são a MESMA lista, em ordem cronológica: "Ana assumiu o
 * ticket" aparece entre as duas mensagens, onde aconteceu. Um chamado é uma
 * história, e a história tem uma ordem só.
 *
 * O PEDIDO também entra nela, como primeiro cartão (`CartaoPedido`): descrição
 * e campos são o que a pessoa disse ao abrir — a primeira fala da conversa. Na
 * versão anterior eles moravam no cabeçalho, e uma descrição de dez linhas
 * empurrava a conversa para o pé da tela.
 *
 * ## As propriedades ficam numa barra, e cada uma é o próprio controle
 *
 * Estado, prioridade e responsável aparecem numa linha logo abaixo do assunto,
 * e clicar em cada um é o jeito de mudá-lo — ver e mudar são o mesmo gesto,
 * como nos recortes da fila. Antes eram dois seletores e três botões numa
 * fileira de ações separada do que eles mudavam. As duas ações mais comuns de
 * quem atende ganham botão próprio: «Assumir» (quando ninguém está com o
 * ticket) e «Concluir». O resto (cancelar, excluir, copiar o link) mora no ⋯.
 *
 * ## O que muda por quem está olhando
 *
 * A conversa NÃO é privada entre duas pessoas: quem enxerga o ticket fala
 * nele. O que muda são as AÇÕES: só quem atende assume, muda estado e
 * prioridade. Quem abriu cancela, e só enquanto o ticket não fechou. A RLS
 * repete essas regras — esconder botão não é proteção.
 *
 * ## Print se cola
 *
 * O anexo mais comum de longe é o print da tela. Além do clipe, a caixa aceita
 * colar (Ctrl+V) e arrastar o arquivo para cima dela — o caminho que a mão já
 * faz em qualquer chat.
 *
 * ## Carregamento
 *
 * A conversa é relida inteira a cada mensagem nova. `reconciliarLista` devolve
 * as mensagens antigas com a MESMA referência, então só a que chegou monta — e
 * as imagens anexadas não recarregam junto.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, Loader2, X, FileText, UserCheck, UserMinus, Ban, ArrowLeft,
  Trash2, MoreHorizontal, Check, Link2, ChevronDown, ArrowRightLeft, CircleDot,
  Flag, UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { tetoDeUpload } from '@/lib/tetoDeUpload';
import { useRelogioLento } from '@/hooks/useRelogioLento';
import { assinarTabela } from '@/lib/realtime';
import { criarAgrupador } from '@/lib/agrupador';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import {
  listarMensagens, listarEventos, enviarMensagem, mudarStatus, assumirTicket,
  mudarPrioridade, subirAnexo, excluirTicket, urlDoAnexoTicket, urlDoAnexoTicketEmCache,
  type Ticket, type MensagemTicket, type EventoTicket, type AnexoTicket,
} from '@/services/tickets.service';
import {
  STATUS_TICKET, STATUS_FECHADOS, ORDEM_STATUS, PRIORIDADES, ORDEM_PRIORIDADE, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';
import { iconeDaCategoria } from './icones';
import {
  temperatura, tempoSemMovimento, textoDeIdade, textoDoLimite, iniciais, fracaoDoPavio,
} from './fila';

interface Props {
  ticket: Ticket;
  podeAtender: boolean;
  /** `tickets_excluir`. A tela só antecipa: quem recusa é `fn_ticket_excluir`. */
  podeExcluir: boolean;
  /** Fotos já carregadas pela tela — o detalhe não faz consulta própria. */
  fotos: Map<string, string | null>;
  onFechar: () => void;
  onMudou: () => void;
  /** O ticket deixou de existir: a tela fecha o detalhe e relê a fila. */
  onExcluido: () => void;
}

/**
 * 10 MB — o mesmo teto do bucket (migration 20260819120000). O super admin não
 * tem este teto no navegador — ver `lib/tetoDeUpload.ts`.
 */
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** Um item da linha do tempo: mensagem de gente ou movimento do sistema. */
type ItemLinha =
  | { tipo: 'mensagem'; em: number; mensagem: MensagemTicket }
  | { tipo: 'evento';   em: number; evento: EventoTicket };

export default function DetalheTicket({
  ticket, podeAtender, podeExcluir, fotos, onFechar, onMudou, onExcluido,
}: Props) {
  const { perfil } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemTicket[]>([]);
  const [eventos, setEventos] = useState<EventoTicket[]>([]);
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
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
   * transação. "Ana assumiu" precede "Ana: já estou vendo".
   *
   * O evento «aberto» sai da lista: quem abriu e quando já está no cartão do
   * pedido, logo acima, e repetir seria a mesma frase duas vezes seguidas.
   */
  const linha = useMemo<ItemLinha[]>(() => {
    const itens: ItemLinha[] = [
      ...mensagens.map(m => ({ tipo: 'mensagem' as const, em: Date.parse(m.criadoEm), mensagem: m })),
      ...eventos
        .filter(e => e.tipo !== 'aberto')
        .map(e => ({ tipo: 'evento' as const, em: Date.parse(e.criadoEm), evento: e })),
    ];
    return itens.sort((a, b) =>
      a.em - b.em || (a.tipo === 'evento' ? -1 : 1) - (b.tipo === 'evento' ? -1 : 1));
  }, [mensagens, eventos]);

  // Abrir o ticket cai direto no fim da conversa; só mensagem que CHEGA
  // desliza. Rolar suave toda vez que se troca de ticket era uma viagem de
  // cima a baixo a cada clique na fila.
  const jaRolou = useRef<string | null>(null);
  useEffect(() => {
    if (!linha.length) return;
    const primeira = jaRolou.current !== ticket.id;
    jaRolou.current = ticket.id;
    // No celular o cabeçalho rola junto: abrir no fim esconderia o assunto e
    // as ações. Lá a primeira vista é o topo; mensagem nova ainda desce.
    if (primeira && window.matchMedia?.('(max-width: 767px)').matches) return;
    fimRef.current?.scrollIntoView({ behavior: primeira ? 'auto' : 'smooth', block: 'end' });
  }, [linha.length, ticket.id]);

  // Trocar de ticket limpa o rascunho: o texto escrito para o #212 não pode
  // ser enviado sem querer no #214.
  useEffect(() => { setTexto(''); setPendentes([]); }, [ticket.id]);

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

  function anexar(lista: FileList | File[] | null) {
    if (!lista) return;
    const bons: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > tetoDeUpload(TAMANHO_MAXIMO, perfil?.perfil)) {
        toast.error(`"${f.name}" passa de 10 MB e não pode ser enviado.`);
        continue;
      }
      bons.push(f);
    }
    if (bons.length) setPendentes(p => [...p, ...bons]);
    if (inputRef.current) inputRef.current.value = '';
  }

  /**
   * Ctrl+V com um print na área de transferência vira anexo. O print colado
   * chega sem nome («image.png»); ganha um com a hora, para a lista de anexos
   * não ficar com cinco «image.png» iguais.
   */
  function colar(e: React.ClipboardEvent) {
    const arquivos = Array.from(e.clipboardData.files);
    if (!arquivos.length) return;
    e.preventDefault();
    const hora = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
    anexar(arquivos.map((f, i) => (
      f.type.startsWith('image/') && /^image\.\w+$/.test(f.name)
        ? new File([f], `print-${hora}${i ? `-${i + 1}` : ''}.${f.type.split('/')[1] || 'png'}`, { type: f.type })
        : f
    )));
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

  const assumir = () => aplicar(
    () => assumirTicket({
      ticketId: ticket.id,
      responsavelId: perfil?.id ?? null,
      responsavelNome: perfil?.nome ?? null,
      statusAtual: ticket.status,
    }),
    'Ticket assumido.',
  );

  const largar = () => aplicar(
    () => assumirTicket({
      ticketId: ticket.id, responsavelId: null, responsavelNome: null, statusAtual: ticket.status,
    }),
    'Ticket devolvido à fila.',
  );

  const moverPara = (s: StatusTicket) => aplicar(
    () => mudarStatus(ticket.id, s),
    `Ticket movido para ${STATUS_TICKET[s].label}.`,
  );

  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  async function excluir() {
    setOcupado(true);
    try {
      const r = await excluirTicket(ticket.id);
      if (r.erro) { toast.error(r.erro); return; }
      toast.success(`Ticket #${ticket.numero} excluído.`);
      if (r.anexosPendentes) {
        toast.warning('Parte dos anexos não saiu do armazenamento — o ticket já foi excluído.');
      }
      setConfirmarExclusao(false);
      onExcluido();
    } finally { setOcupado(false); }
  }

  async function copiarLink() {
    const url = `${window.location.origin}${window.location.pathname}?ticket=${ticket.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link do ticket #${ticket.numero} copiado.`);
    } catch {
      toast.error('Não deu para copiar o link neste navegador.');
    }
  }

  const temp = temperatura(ticket, agora);
  const pavio = fracaoDoPavio(ticket, agora);
  const IconeCategoria = iconeDaCategoria(ticket.categoria);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* No celular cabeçalho e conversa rolam juntos — fixo, o cabeçalho
          comia a tela e sobrava uma fresta para a conversa. Da tela média para
          cima o cabeçalho fica parado e só a conversa rola. */}
      <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:flex md:flex-col">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="border-b border-border px-4 pt-3 pb-3 md:px-5 space-y-2.5 md:shrink-0">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 -ml-1.5"
            onClick={onFechar} title="Voltar à fila (Esc)" aria-label="Voltar à fila">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">#{ticket.numero}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <IconeCategoria className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{rotuloCategoria(ticket.categoria)}</span>
          </span>

          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-7 h-7 ml-auto shrink-0" aria-label="Mais ações">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => { void copiarLink(); }}>
                  <Link2 className="w-4 h-4" /> Copiar link do ticket
                </DropdownMenuItem>
                {souAutor && !fechado && (
                  <DropdownMenuItem disabled={ocupado}
                    onSelect={() => aplicar(() => mudarStatus(ticket.id, 'cancelado'), 'Ticket cancelado.')}>
                    <Ban className="w-4 h-4" /> Cancelar pedido
                  </DropdownMenuItem>
                )}
                {/* Excluir pede confirmação: é o único gesto aqui que não tem
                    volta. Ver `excluirTicket`. */}
                {podeExcluir && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={ocupado} className="text-destructive focus:text-destructive"
                      onSelect={() => setConfirmarExclusao(true)}>
                      <Trash2 className="w-4 h-4" /> Excluir de vez
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        <h2 className="text-lg font-semibold leading-snug tracking-tight break-words">
          {ticket.assunto}
        </h2>

        {/* ── Propriedades: cada uma é o próprio controle ─────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {podeAtender ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={ocupado}>
                <ChipPropriedade titulo="Estado">
                  <span className={cn('w-2 h-2 rounded-full', STATUS_TICKET[ticket.status].ponto)} />
                  {STATUS_TICKET[ticket.status].label}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </ChipPropriedade>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Mover para</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={ticket.status} onValueChange={v => { if (v !== ticket.status) void moverPara(v as StatusTicket); }}>
                  {/* Cancelar é ato de quem PEDIU, não de quem atende: quem
                      atende recusa, que é uma resposta, não uma desistência. */}
                  {ORDEM_STATUS.filter(s => s !== 'cancelado').map(s => (
                    <DropdownMenuRadioItem key={s} value={s}>
                      <span className={cn('w-2 h-2 rounded-full mr-1', STATUS_TICKET[s].ponto)} />
                      {STATUS_TICKET[s].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <ChipPropriedade titulo="Estado" estatico>
              <span className={cn('w-2 h-2 rounded-full', STATUS_TICKET[ticket.status].ponto)} />
              {STATUS_TICKET[ticket.status].label}
            </ChipPropriedade>
          )}

          {podeAtender ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={ocupado}>
                <ChipPropriedade titulo="Prioridade">
                  <Flag className={cn('w-3 h-3', PRIORIDADES[ticket.prioridade].cor)} />
                  <span className={PRIORIDADES[ticket.prioridade].cor}>{PRIORIDADES[ticket.prioridade].label}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </ChipPropriedade>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Prioridade</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={ticket.prioridade}
                  onValueChange={v => {
                    if (v !== ticket.prioridade) {
                      void aplicar(() => mudarPrioridade(ticket.id, v as PrioridadeTicket), 'Prioridade alterada.');
                    }
                  }}>
                  {[...ORDEM_PRIORIDADE].reverse().map(p => (
                    <DropdownMenuRadioItem key={p} value={p}>
                      <span className={PRIORIDADES[p].cor}>{PRIORIDADES[p].label}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <ChipPropriedade titulo="Prioridade" estatico>
              <Flag className={cn('w-3 h-3', PRIORIDADES[ticket.prioridade].cor)} />
              <span className={PRIORIDADES[ticket.prioridade].cor}>{PRIORIDADES[ticket.prioridade].label}</span>
            </ChipPropriedade>
          )}

          {/* Responsável: com dono e quem atende olhando, o chip abre as trocas;
              sem dono, a ação principal vira botão — é o gesto mais comum. */}
          {ticket.responsavelId ? (
            podeAtender ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={ocupado}>
                  <ChipPropriedade titulo="Responsável">
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={fotos.get(ticket.responsavelId) ?? undefined} />
                      <AvatarFallback className="text-[7px]">{iniciais(ticket.responsavelNome)}</AvatarFallback>
                    </Avatar>
                    {souResponsavel ? 'Você' : ticket.responsavelNome}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </ChipPropriedade>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {!souResponsavel && (
                    <DropdownMenuItem onSelect={() => { void assumir(); }}>
                      <ArrowRightLeft className="w-4 h-4" /> Assumir para mim
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => { void largar(); }}>
                    <UserMinus className="w-4 h-4" /> Devolver à fila
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <ChipPropriedade titulo="Responsável" estatico>
                <Avatar className="w-4 h-4">
                  <AvatarImage src={fotos.get(ticket.responsavelId) ?? undefined} />
                  <AvatarFallback className="text-[7px]">{iniciais(ticket.responsavelNome)}</AvatarFallback>
                </Avatar>
                com {ticket.responsavelNome}
              </ChipPropriedade>
            )
          ) : (
            <ChipPropriedade titulo="Responsável" estatico className="border-amber-500/40 text-amber-700 dark:text-amber-400">
              <UserRound className="w-3 h-3" /> Sem responsável
            </ChipPropriedade>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {podeAtender && !ticket.responsavelId && !fechado && (
              <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={() => { void assumir(); }}>
                <UserCheck className="w-3.5 h-3.5" /> Assumir
              </Button>
            )}
            {podeAtender && !fechado && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={ocupado}
                onClick={() => { void moverPara('concluido'); }}>
                <Check className="w-3.5 h-3.5" /> Concluir
              </Button>
            )}
          </div>
        </div>

        {/* O pavio do ticket aberto, com as palavras que a linha da fila não tem
            espaço para dizer. */}
        {!fechado && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="relative h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className={cn(
                  'absolute inset-0 origin-left rounded-full',
                  temp === 'parado' ? 'bg-destructive' : temp === 'atencao' ? 'bg-amber-500' : 'bg-foreground/30',
                )}
                style={{ transform: `scaleX(${pavio.toFixed(3)})` }}
              />
            </span>
            <span className={cn(
              temp === 'parado' ? 'text-destructive font-medium'
                : temp === 'atencao' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
            )}>
              {temp === 'parado' ? 'Parado: ' : ''}sem movimento {textoDeIdade(tempoSemMovimento(ticket, agora))}
              <span className="text-muted-foreground"> · {PRIORIDADES[ticket.prioridade].label.toLowerCase()} tolera {textoDoLimite(ticket.prioridade)}</span>
            </span>
          </div>
        )}

        <AlertDialog open={confirmarExclusao} onOpenChange={aberto => { if (!ocupado) setConfirmarExclusao(aberto); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{`Excluir o ticket #${ticket.numero}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                «{ticket.assunto}» será apagado de vez, com a conversa, o histórico e os
                anexos. Não há como desfazer — fica só o registro nos logs de quem excluiu.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={ocupado}>Manter</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={ocupado}
                onClick={e => { e.preventDefault(); void excluir(); }}
              >
                {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Excluir de vez'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* ── Linha do tempo ───────────────────────────────────────────────── */}
      <div className="px-4 py-4 md:px-5 space-y-3 bg-muted/20 md:flex-1 md:min-h-0 md:overflow-y-auto">
        <CartaoPedido ticket={ticket} foto={fotos.get(ticket.abertoPor) ?? null} />

        {linha.map((item, i) => {
          const anterior = i > 0 ? linha[i - 1] : null;
          const separador = precisaSeparador(anterior?.em ?? Date.parse(ticket.criadoEm), item.em);

          return (
            <div key={item.tipo === 'mensagem' ? item.mensagem.id : item.evento.id}>
              {separador && (
                <div className="flex items-center gap-2 py-2">
                  <span className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
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

        {!linha.length && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Ainda sem resposta. Print, áudio e arquivo entram pela caixa abaixo.
          </p>
        )}
        <div ref={fimRef} />
      </div>
      </div>

      {/* ── Caixa de envio ───────────────────────────────────────────────── */}
      <div className="border-t border-border p-3 md:px-5 md:py-4 shrink-0">
        {fechado ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            Ticket {STATUS_TICKET[ticket.status].label.toLowerCase()}. A conversa fica registrada.
          </p>
        ) : (
          <div
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastandoArquivo(true); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastandoArquivo(false); }}
            onDrop={e => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              setArrastandoArquivo(false);
              anexar(e.dataTransfer.files);
            }}
            className={cn(
              'rounded-xl border bg-background transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15',
              arrastandoArquivo ? 'border-primary border-dashed bg-primary/[0.04]' : 'border-border',
            )}
          >
            {/* Imagem anexada aparece ANTES de ir: mandar o print errado num
                ticket é fácil, e desfazer depois não dá — mensagem não se apaga. */}
            {!!previas.length && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {previas.map((p, i) => (
                  <div key={`${p.arquivo.name}-${i}`}
                    className="relative rounded-md border border-border bg-muted overflow-hidden">
                    {p.url ? (
                      <img src={p.url} alt={p.arquivo.name} className="h-16 w-16 object-cover" />
                    ) : (
                      <div className="h-16 w-28 flex items-center gap-1.5 px-2">
                        <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="text-[10px] break-all line-clamp-3">{p.arquivo.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 shadow-sm"
                      title={`Remover ${p.arquivo.name}`}
                      onClick={() => setPendentes(atual => atual.filter((_, j) => j !== i))}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onPaste={colar}
              placeholder={arrastandoArquivo ? 'Solte para anexar' : 'Escreva uma mensagem…'}
              rows={2}
              aria-label="Mensagem"
              className="min-h-[3.25rem] max-h-40 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
              }}
            />

            <div className="flex items-center gap-2 px-2 pb-2">
              <input ref={inputRef} type="file" multiple className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.xlsx,.xls,.csv,.txt"
                onChange={e => anexar(e.target.files)} />
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => inputRef.current?.click()} disabled={enviando}
                title="Anexar print, áudio ou arquivo" aria-label="Anexar arquivo">
                <Paperclip className="w-4 h-4" />
              </Button>
              <span className="hidden sm:inline text-[11px] text-muted-foreground">
                Cole um print com Ctrl+V · Enter envia · Shift+Enter quebra a linha
              </span>
              <Button size="sm" className="ml-auto h-8 gap-1.5"
                onClick={enviar} disabled={enviando || (!texto.trim() && !pendentes.length)}>
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Enviar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Peças do cabeçalho ───────────────────────────────────────────────────────

/**
 * Um chip de propriedade. Clicável quando é gatilho de menu (o Radix passa os
 * handlers pelo `asChild`), parado quando quem olha só pode ver.
 */
const ChipPropriedade = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { titulo: string; estatico?: boolean }
>(function ChipPropriedade({ titulo, estatico = false, className, children, ...resto }, ref) {
  const classes = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium',
    !estatico && 'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
    className,
  );
  if (estatico) {
    return <span className={classes} title={titulo}>{children}</span>;
  }
  // O `ref` é do Radix: o menu se posiciona pelo gatilho.
  return <button ref={ref} type="button" className={classes} title={`${titulo}: clique para mudar`} {...resto}>{children}</button>;
});

/**
 * O pedido, como a primeira fala da conversa: quem abriu, quando, o que disse
 * e os campos da categoria. Os campos vão como ficha (rótulo em cima, valor
 * embaixo) porque é dado para conferir, não frase para ler.
 */
function CartaoPedido({ ticket, foto }: { ticket: Ticket; foto: string | null }) {
  const campos = Object.entries(ticket.campos);
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <Avatar className="w-7 h-7">
          <AvatarImage src={foto ?? undefined} />
          <AvatarFallback className="text-[10px]">{iniciais(ticket.abertoPorNome)}</AvatarFallback>
        </Avatar>
        <p className="text-xs min-w-0">
          <span className="font-semibold text-foreground">{ticket.abertoPorNome ?? 'Alguém'}</span>
          <span className="text-muted-foreground"> abriu o ticket · {quando(ticket.criadoEm)}</span>
        </p>
      </div>

      {ticket.descricao ? (
        <p className="mt-3 text-sm whitespace-pre-wrap break-words leading-relaxed">{ticket.descricao}</p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Sem detalhes além do assunto.</p>
      )}

      {!!campos.length && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
          {campos.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="text-xs font-medium truncate" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ── Peças da linha do tempo ──────────────────────────────────────────────────

/**
 * O movimento do sistema, no meio da conversa.
 *
 * Pequeno, com ícone e sem balão: ele é contexto, não fala. Quem varre a
 * conversa tem de conseguir pular estas linhas sem esforço, e encontrá-las
 * quando a pergunta for "quando foi que isso mudou de dono?".
 */
function LinhaDeEvento({ evento }: { evento: EventoTicket }) {
  const Icone = evento.tipo === 'responsavel' ? UserRound
    : evento.tipo === 'prioridade' ? Flag
    : CircleDot;
  return (
    <div className="flex items-center gap-2 py-0.5 pl-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icone className="w-3 h-3 text-muted-foreground" />
      </span>
      <p className="text-[11px] text-muted-foreground">
        {frase(evento)} <span className="text-muted-foreground/70">· {hora(evento.criadoEm)}</span>
      </p>
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
      return `${quem} mudou a prioridade: ${rotuloPrioridade(e.de)} → ${rotuloPrioridade(e.para)}`;
    default:
      return `${quem} — ${e.tipo}: ${e.de ?? '—'} → ${e.para ?? '—'}`;
  }
}

/** O evento guarda o valor CRU do banco; a tela mostra o rótulo de gente. */
function rotuloStatus(valor: string | null): string {
  if (!valor) return '—';
  return STATUS_TICKET[valor as StatusTicket]?.label ?? valor;
}

function rotuloPrioridade(valor: string | null): string {
  if (!valor) return '—';
  return PRIORIDADES[valor as PrioridadeTicket]?.label ?? valor;
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
      <div className={cn('max-w-[78%] min-w-0', meu && 'items-end flex flex-col')}>
        <p className={cn('text-[11px] text-muted-foreground mb-1', meu && 'text-right')}>
          <span className="font-medium text-foreground/80">{meu ? 'Você' : m.autorNome ?? 'Alguém'}</span> · {hora(m.criadoEm)}
        </p>
        <div className={cn(
          'rounded-2xl px-3.5 py-2',
          meu ? 'rounded-tr-md bg-primary text-primary-foreground' : 'rounded-tl-md border border-border bg-card',
        )}>
          {m.texto && <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.texto}</p>}
          {!!m.anexos.length && (
            <div className={cn('space-y-1.5', m.texto && 'mt-1.5')}>
              {m.anexos.map(a => <Anexo key={a.url} anexo={a} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Imagem aparece; o resto vira link. Print é o anexo mais comum de longe. */
function Anexo({ anexo }: { anexo: AnexoTicket }) {
  // O balde é privado: o endereço gravado vira link assinado (ver
  // `urlDoAnexoTicket`). Enquanto assina, o anexo mostra só o nome.
  const [assinada, setAssinada] = useState<string | null>(() => urlDoAnexoTicketEmCache(anexo.url));
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (assinada) return;
    let vivo = true;
    void urlDoAnexoTicket(anexo.url).then(u => { if (!vivo) return; if (u) setAssinada(u); else setFalhou(true); });
    return () => { vivo = false; };
  }, [anexo.url, assinada]);
  if (!assinada) {
    return (
      <span className="flex items-center gap-1.5 text-xs opacity-80">
        <FileText className="w-3.5 h-3.5" /> {anexo.nome}{falhou ? ' — sem acesso ao anexo' : ''}
      </span>
    );
  }
  const url = assinada;
  if (anexo.tipo.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={anexo.nome} loading="lazy"
          className="max-h-56 rounded-lg border border-border/60 object-contain bg-background" />
      </a>
    );
  }
  if (anexo.tipo.startsWith('audio/')) {
    return <audio controls preload="none" src={url} className="w-full max-w-xs" />;
  }
  if (anexo.tipo.startsWith('video/')) {
    return <video controls preload="none" src={url} className="max-h-56 rounded-lg border border-border/60" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 text-xs underline underline-offset-2">
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
 * cada balão. O primeiro item compara com a abertura do ticket (o cartão do
 * pedido já diz o dia): só ganha separador se a conversa começou noutro dia.
 */
function precisaSeparador(anterior: number, atual: number): boolean {
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

/** «hoje às 09:12», «ontem às 16:40», «07 out. às 10:05». */
function quando(iso: string): string {
  const em = Date.parse(iso);
  const dia = rotuloDoDia(em);
  return `${dia === 'Hoje' || dia === 'Ontem' ? dia.toLowerCase() : new Date(em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${hora(iso)}`;
}
