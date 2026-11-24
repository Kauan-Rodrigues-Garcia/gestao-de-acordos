/**
 * DetalheTicket — o ticket aberto.
 *
 * ## Abas internas, cada uma com uma pergunta
 *
 * A versão anterior era uma tela só: cabeçalho, pedido, conversa, eventos e a
 * caixa de envio, tudo empilhado. Funcionava com três mensagens; com trinta, o
 * print que alguém mandou no primeiro dia sumia no meio. Agora são abas, no
 * desenho dos help desks de referência (Zendesk, Freshdesk, Jira Service
 * Management):
 *
 *   • **Conversa** — o pedido (com as fotos que vieram na abertura) e a troca
 *     de mensagens. É onde se trabalha; é a aba que abre.
 *   • **Arquivos** — todo print, foto e arquivo do ticket num lugar só, com
 *     visualizador em tela cheia. Responde «cadê aquele print?».
 *   • **Histórico** — só os movimentos: quem assumiu, transferiu, chamou quem,
 *     mudou o estado. Responde «quando foi que isso mudou de dono?».
 *   • **Detalhes** — a ficha (`PainelDetalhes`). Em tela larga ela fica fixa à
 *     direita e a aba some; em tela menor, é aba.
 *
 * ## Uma linha do tempo na conversa
 *
 * Mensagem e evento continuam na MESMA lista na Conversa, em ordem: "Ana
 * transferiu para João" aparece entre as duas mensagens, onde aconteceu. O
 * Histórico é o mesmo evento sem as falas — para auditar, não para conversar.
 *
 * ## O que muda por quem está olhando
 *
 * Quem enxerga o ticket fala nele — inclusive os participantes. O que muda são
 * as AÇÕES: só quem atende assume, transfere, muda estado e prioridade. Quem
 * abriu cancela (enquanto não fechou) e chama pessoas. A RLS e as funções do
 * banco repetem essas regras — esconder botão não é proteção.
 *
 * ## Print se cola
 *
 * Além do clipe, a caixa aceita colar (Ctrl+V) e arrastar o arquivo para cima
 * dela — o caminho que a mão já faz em qualquer chat.
 *
 * ## Carregamento
 *
 * A conversa é relida inteira a cada mensagem nova. `reconciliarLista` devolve
 * as mensagens antigas com a MESMA referência, então só a que chegou monta — e
 * as imagens anexadas não recarregam junto.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, Loader2, UserCheck, UserMinus, Ban, ArrowLeft,
  Trash2, MoreHorizontal, Check, Link2, ChevronDown, ArrowRightLeft, CircleDot,
  Flag, UserRound, UserPlus, MessageSquare, Images, History, PanelRight, Users,
  LogOut, PlusCircle,
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
import { ROUTE_PATHS } from '@/lib/index';
import { useAuth } from '@/hooks/useAuth';
import { useRelogioLento } from '@/hooks/useRelogioLento';
import { assinarAviso, avisoToca } from '@/lib/sinais';
import { criarAgrupador } from '@/lib/agrupador';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import {
  listarMensagens, listarEventos, enviarMensagem, mudarStatus, assumirTicket,
  mudarPrioridade, subirAnexo, excluirTicket, transferirTicket,
  adicionarParticipantes, removerParticipante, listarQuemAtende, listarPessoasParaChamar,
  type Ticket, type MensagemTicket, type EventoTicket, type AnexoTicket, type PessoaTicket,
} from '@/services/tickets.service';
import {
  STATUS_TICKET, STATUS_FECHADOS, ORDEM_STATUS, PRIORIDADES, ORDEM_PRIORIDADE, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';
import { iconeDaCategoria } from './icones';
import {
  temperatura, tempoSemMovimento, textoDeIdade, textoDoLimite, iniciais, fracaoDoPavio, participa,
} from './fila';
import {
  AnexoNaConversa, MiniaturaAnexo, LinhaDeArquivo, PreviasPendentes, VisualizadorDeImagens,
} from './anexos';
import { arquivosColados, arquivosQueCabem, ehImagem, TIPOS_ACEITOS } from './arquivos';
import { TransferirDialog, ChamarPessoasDialog } from './pessoas';
import { PainelDetalhes } from './PainelDetalhes';

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

type Aba = 'conversa' | 'arquivos' | 'historico' | 'detalhes';

/** A partir daqui a ficha cabe fixa ao lado da conversa (o `2xl` do Tailwind). */
const TELA_LARGA = '(min-width: 1536px)';

function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(TELA_LARGA).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(TELA_LARGA);
    const aoMudar = () => setLarga(mq.matches);
    mq.addEventListener?.('change', aoMudar);
    return () => mq.removeEventListener?.('change', aoMudar);
  }, []);
  return larga;
}

/** Um item da linha do tempo: mensagem de gente ou movimento do sistema. */
type ItemLinha =
  | { tipo: 'mensagem'; em: number; mensagem: MensagemTicket }
  | { tipo: 'evento';   em: number; evento: EventoTicket };

/** Um arquivo do ticket, com de onde veio — para a aba Arquivos e o visualizador. */
interface ArquivoDoTicket {
  anexo: AnexoTicket;
  autor: string;
  em: string;
  doPedido: boolean;
}

export default function DetalheTicket({
  ticket, podeAtender, podeExcluir, fotos, onFechar, onMudou, onExcluido,
}: Props) {
  const { perfil } = useAuth();
  const meuId = perfil?.id ?? null;
  const [mensagens, setMensagens] = useState<MensagemTicket[]>([]);
  const [eventos, setEventos] = useState<EventoTicket[]>([]);
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [aba, setAba] = useState<Aba>('conversa');
  const [imagemAberta, setImagemAberta] = useState<number | null>(null);
  const [transferirAberto, setTransferirAberto] = useState(false);
  const [chamarAberto, setChamarAberto] = useState(false);
  const [quemAtende, setQuemAtende] = useState<PessoaTicket[] | null>(null);
  const [candidatos, setCandidatos] = useState<PessoaTicket[] | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agora = useRelogioLento(60_000);
  const telaLarga = useTelaLarga();
  const souAutor = meuId === ticket.abertoPor;
  const fechado = STATUS_FECHADOS.includes(ticket.status);
  const souResponsavel = !!meuId && ticket.responsavelId === meuId;
  const souParticipante = participa(ticket, meuId);
  const podeChamar = !fechado && (podeAtender || souAutor || souParticipante);
  const podeTirar = podeAtender || souAutor;
  const participantes = useMemo(() => ticket.participantes ?? [], [ticket.participantes]);

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
   * Pelo aviso `tickets` da empresa (20261013170000): o banco diz QUAIS tickets
   * tiveram mensagem ou evento, sem conteúdo, e aqui só interessa este. A
   * releitura passa pela RLS — quem não pode ler o ticket não lê a conversa.
   *
   * O agrupador existe porque uma ação escreve DOIS registros: a mudança de
   * estado insere em `tickets_eventos` e o gatilho pode inserir em
   * `tickets_mensagens`. Sem ele, assumir um ticket produzia duas releituras da
   * conversa inteira em menos de 100 ms.
   */
  useEffect(() => {
    const grupo = criarAgrupador(() => { void reler(); }, { esperaMs: 150, tetoMs: 800 });
    const cancelar = assinarAviso('tickets', ticket.empresaId, {
      onAviso: (aviso) => {
        if (aviso.tabela === 'tickets') return;
        if (avisoToca(aviso, ticket.id)) grupo.avisar();
      },
      onReconectado: () => { grupo.cancelar(); void reler(); },
    });
    return () => { grupo.cancelar(); cancelar(); };
  }, [ticket.id, ticket.empresaId, reler]);

  // Trocar de ticket volta para a Conversa e limpa o rascunho: o texto escrito
  // para o #212 não pode ser enviado sem querer no #214.
  useEffect(() => {
    setTexto(''); setPendentes([]); setAba('conversa'); setImagemAberta(null);
  }, [ticket.id]);

  // Alargou a janela com «Detalhes» aberta: a ficha passou para o lado, e a
  // aba deixaria de existir — volta para a Conversa.
  useEffect(() => {
    if (telaLarga && aba === 'detalhes') setAba('conversa');
  }, [telaLarga, aba]);

  /** As mensagens com os anexos do formulário de abertura moram no cartão do pedido. */
  const anexosDoPedido = useMemo(
    () => mensagens.filter(m => m.doPedido).flatMap(m => m.anexos),
    [mensagens],
  );

  /**
   * Mensagem e evento na mesma ordem em que aconteceram.
   *
   * O desempate por tipo põe o EVENTO antes da mensagem quando os dois têm o
   * mesmo carimbo — e eles têm, quando o gatilho grava os dois na mesma
   * transação. "Ana assumiu" precede "Ana: já estou vendo".
   *
   * O evento «aberto» sai da lista: quem abriu e quando já está no cartão do
   * pedido, logo acima.
   */
  const linha = useMemo<ItemLinha[]>(() => {
    const itens: ItemLinha[] = [
      ...mensagens
        .filter(m => !m.doPedido)
        .map(m => ({ tipo: 'mensagem' as const, em: Date.parse(m.criadoEm), mensagem: m })),
      ...eventos
        .filter(e => e.tipo !== 'aberto')
        .map(e => ({ tipo: 'evento' as const, em: Date.parse(e.criadoEm), evento: e })),
    ];
    return itens.sort((a, b) =>
      a.em - b.em || (a.tipo === 'evento' ? -1 : 1) - (b.tipo === 'evento' ? -1 : 1));
  }, [mensagens, eventos]);

  /** Todo arquivo do ticket, do pedido primeiro — a ordem em que chegaram. */
  const arquivos = useMemo<ArquivoDoTicket[]>(
    () => mensagens.flatMap(m => m.anexos.map(a => ({
      anexo: a,
      autor: m.autorId === meuId ? 'Você' : m.autorNome ?? 'Alguém',
      em: m.criadoEm,
      doPedido: m.doPedido,
    }))),
    [mensagens, meuId],
  );

  const imagens = useMemo(
    () => arquivos.filter(a => ehImagem(a.anexo)).map(a => ({
      anexo: a.anexo,
      legenda: `${a.doPedido ? 'No pedido' : 'Na conversa'} · ${a.autor} · ${quando(a.em)}`,
    })),
    [arquivos],
  );

  const ampliar = useCallback((anexo: AnexoTicket) => {
    const i = imagens.findIndex(x => x.anexo.url === anexo.url);
    setImagemAberta(i >= 0 ? i : null);
  }, [imagens]);

  // Abrir o ticket cai direto no fim da conversa; só mensagem que CHEGA
  // desliza. Rolar suave toda vez que se troca de ticket era uma viagem de
  // cima a baixo a cada clique na fila.
  const jaRolou = useRef<string | null>(null);
  useEffect(() => {
    if (aba !== 'conversa' || !linha.length) return;
    const primeira = jaRolou.current !== ticket.id;
    jaRolou.current = ticket.id;
    // No celular o cabeçalho rola junto: abrir no fim esconderia o assunto e
    // as ações. Lá a primeira vista é o topo; mensagem nova ainda desce.
    if (primeira && window.matchMedia?.('(max-width: 767px)').matches) return;
    fimRef.current?.scrollIntoView({ behavior: primeira ? 'auto' : 'smooth', block: 'end' });
  }, [linha.length, ticket.id, aba]);

  // ── Envio ─────────────────────────────────────────────────────────────────

  function anexar(lista: FileList | File[] | null) {
    const bons = arquivosQueCabem(lista, perfil?.perfil);
    if (bons.length) setPendentes(p => [...p, ...bons]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function colar(e: React.ClipboardEvent) {
    const colados = arquivosColados(e);
    if (!colados.length) return;
    e.preventDefault();
    anexar(colados);
  }

  async function enviar() {
    if (!meuId) return;
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
        autorId: meuId,
        autorNome: perfil?.nome ?? 'Sem nome',
        autorFoto: (perfil as { foto_url?: string | null } | null)?.foto_url ?? null,
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

  // ── Ações ─────────────────────────────────────────────────────────────────

  /** Executa uma ação de ticket e traduz a recusa do banco, se vier. */
  async function aplicar(acao: () => Promise<{ erro: string | null }>, ok: string): Promise<boolean> {
    setOcupado(true);
    try {
      const r = await acao();
      if (r.erro) { toast.error(r.erro); return false; }
      toast.success(ok);
      await reler();
      onMudou();
      return true;
    } finally { setOcupado(false); }
  }

  const assumir = () => aplicar(
    () => assumirTicket({
      ticketId: ticket.id,
      responsavelId: meuId,
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

  // As listas de pessoas só são buscadas quando alguém abre o seletor — a
  // maioria das aberturas de ticket nunca transfere nem chama ninguém.
  function abrirTransferir() {
    setTransferirAberto(true);
    if (!quemAtende) void listarQuemAtende(ticket.empresaId).then(setQuemAtende);
  }

  function abrirChamar() {
    setChamarAberto(true);
    if (!candidatos) void listarPessoasParaChamar(ticket.empresaId).then(setCandidatos);
  }

  async function transferir(p: { para: PessoaTicket; recado: string; continuarAcompanhando: boolean }) {
    if (!meuId) return false;
    const ok = await aplicar(
      () => transferirTicket({
        ticketId: ticket.id,
        para: { id: p.para.id, nome: p.para.nome },
        statusAtual: ticket.status,
        recado: p.recado,
        autor: {
          id: meuId,
          nome: perfil?.nome ?? 'Sem nome',
          foto: (perfil as { foto_url?: string | null } | null)?.foto_url ?? null,
        },
      }),
      `Ticket transferido para ${p.para.nome}.`,
    );
    if (ok && p.continuarAcompanhando) {
      const r = await adicionarParticipantes(ticket.id, [meuId]);
      if (r.erro) toast.warning(`Transferido, mas não deu para você continuar acompanhando: ${r.erro}`);
      else onMudou();
    }
    return ok;
  }

  async function chamar(escolhidos: PessoaTicket[]) {
    setOcupado(true);
    try {
      const r = await adicionarParticipantes(ticket.id, escolhidos.map(p => p.id));
      if (r.erro) { toast.error(r.erro); return false; }
      toast.success(r.adicionados === 1
        ? `${escolhidos.find(Boolean)?.nome ?? 'A pessoa'} foi chamada para o ticket.`
        : `${r.adicionados} pessoas chamadas para o ticket.`);
      await reler();
      onMudou();
      return true;
    } finally { setOcupado(false); }
  }

  const [confirmarTirar, setConfirmarTirar] = useState<{ id: string; nome: string } | null>(null);

  async function tirar(id: string) {
    const saindo = id === meuId;
    const ok = await aplicar(
      () => removerParticipante(ticket.id, id),
      saindo ? 'Você saiu do ticket.' : 'Pessoa tirada do ticket.',
    );
    setConfirmarTirar(null);
    // Quem saiu e não enxergava o ticket por outro caminho deixa de vê-lo.
    if (ok && saindo && !podeAtender && !souAutor) onFechar();
  }

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
    // O app usa HashRouter: a rota e a busca moram depois do `#`. Sem ele
    // (como era até 30/10/2026) o link abria a tela inicial, e não o ticket.
    const url = `${window.location.origin}${window.location.pathname}#${ROUTE_PATHS.TICKETS}?ticket=${ticket.id}`;
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

  const jaNoTicket = useMemo(() => {
    const m = new Map<string, string>();
    m.set(ticket.abertoPor, 'Abriu o ticket');
    if (ticket.responsavelId) m.set(ticket.responsavelId, 'É o responsável');
    for (const p of participantes) m.set(p.id, 'Já participa');
    return m;
  }, [ticket.abertoPor, ticket.responsavelId, participantes]);

  const historico = useMemo(() => [...eventos].sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm)), [eventos]);

  const painel = (
    <PainelDetalhes
      ticket={ticket} fotos={fotos} meuId={meuId} podeAtender={podeAtender} fechado={fechado}
      ocupado={ocupado} podeChamar={podeChamar} podeTirar={podeTirar} agora={agora}
      onAssumir={() => { void assumir(); }}
      onDevolver={() => { void largar(); }}
      onTransferir={abrirTransferir}
      onChamar={abrirChamar}
      onTirar={(id, nome) => setConfirmarTirar({ id, nome })}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* No celular cabeçalho e conteúdo rolam juntos — fixo, o cabeçalho
            comia a tela e sobrava uma fresta para a conversa. Da tela média
            para cima o cabeçalho fica parado e só o conteúdo da aba rola. */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:flex md:flex-col">
          {/* ── Cabeçalho ──────────────────────────────────────────────── */}
          <div className="border-b border-border px-4 pt-3 md:px-5 space-y-2.5 md:shrink-0">
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
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => { void copiarLink(); }}>
                    <Link2 className="w-4 h-4" /> Copiar link do ticket
                  </DropdownMenuItem>
                  {podeChamar && (
                    <DropdownMenuItem disabled={ocupado} onSelect={abrirChamar}>
                      <UserPlus className="w-4 h-4" /> Chamar pessoas
                    </DropdownMenuItem>
                  )}
                  {souParticipante && !fechado && (
                    <DropdownMenuItem disabled={ocupado}
                      onSelect={() => { if (meuId) setConfirmarTirar({ id: meuId, nome: perfil?.nome ?? 'Você' }); }}>
                      <LogOut className="w-4 h-4" /> Sair do ticket
                    </DropdownMenuItem>
                  )}
                  {souAutor && !fechado && (
                    <DropdownMenuItem disabled={ocupado}
                      onSelect={() => { void aplicar(() => mudarStatus(ticket.id, 'cancelado'), 'Ticket cancelado.'); }}>
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

            {/* ── Propriedades: cada uma é o próprio controle ─────────────── */}
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

              {/* Responsável: quem atende abre as trocas (assumir, transferir,
                  devolver); quem não atende só vê. */}
              {podeAtender && !fechado ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={ocupado}>
                    <ChipPropriedade titulo="Responsável"
                      className={cn(!ticket.responsavelId && 'border-amber-500/40 text-amber-700 dark:text-amber-400')}>
                      {ticket.responsavelId ? (
                        <>
                          <Avatar className="w-4 h-4">
                            <AvatarImage src={fotos.get(ticket.responsavelId) ?? undefined} />
                            <AvatarFallback className="text-[7px]">{iniciais(ticket.responsavelNome)}</AvatarFallback>
                          </Avatar>
                          {souResponsavel ? 'Você' : ticket.responsavelNome}
                        </>
                      ) : (
                        <><UserRound className="w-3 h-3" /> Sem responsável</>
                      )}
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </ChipPropriedade>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {!souResponsavel && (
                      <DropdownMenuItem onSelect={() => { void assumir(); }}>
                        <UserCheck className="w-4 h-4" /> Assumir para mim
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={abrirTransferir}>
                      <ArrowRightLeft className="w-4 h-4" /> Transferir para…
                    </DropdownMenuItem>
                    {ticket.responsavelId && (
                      <DropdownMenuItem onSelect={() => { void largar(); }}>
                        <UserMinus className="w-4 h-4" /> Devolver à fila
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : ticket.responsavelId ? (
                <ChipPropriedade titulo="Responsável" estatico>
                  <Avatar className="w-4 h-4">
                    <AvatarImage src={fotos.get(ticket.responsavelId) ?? undefined} />
                    <AvatarFallback className="text-[7px]">{iniciais(ticket.responsavelNome)}</AvatarFallback>
                  </Avatar>
                  {souResponsavel ? 'Com você' : `com ${ticket.responsavelNome}`}
                </ChipPropriedade>
              ) : (
                <ChipPropriedade titulo="Responsável" estatico className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                  <UserRound className="w-3 h-3" /> Sem responsável
                </ChipPropriedade>
              )}

              {/* Participantes: os rostos empilhados, e o clique leva à ficha. */}
              {(participantes.length > 0 || podeChamar) && (
                <ChipPropriedade titulo="Participantes"
                  onClick={() => (participantes.length && !telaLarga ? setAba('detalhes') : podeChamar ? abrirChamar() : undefined)}>
                  {participantes.length ? (
                    <>
                      <span className="flex -space-x-1.5">
                        {participantes.slice(0, 3).map(p => (
                          <Avatar key={p.id} className="w-4 h-4 ring-2 ring-background">
                            <AvatarImage src={fotos.get(p.id) ?? undefined} />
                            <AvatarFallback className="text-[7px]">{iniciais(p.nome)}</AvatarFallback>
                          </Avatar>
                        ))}
                      </span>
                      {participantes.length === 1 ? '+1 pessoa' : `+${participantes.length} pessoas`}
                    </>
                  ) : (
                    <><Users className="w-3 h-3" /> Chamar pessoas</>
                  )}
                </ChipPropriedade>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                {podeAtender && !ticket.responsavelId && !fechado && (
                  <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={() => { void assumir(); }}>
                    <UserCheck className="w-3.5 h-3.5" /> Assumir
                  </Button>
                )}
                {podeAtender && !fechado && (
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={ocupado} onClick={abrirTransferir}>
                    <ArrowRightLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Transferir</span>
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

            {/* O pavio do ticket aberto, com as palavras que a linha da fila
                não tem espaço para dizer. */}
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

            {/* ── Abas internas ─────────────────────────────────────────── */}
            <div role="tablist" aria-label="Partes do ticket" className="flex gap-1 -mb-px overflow-x-auto">
              <BotaoAba ativa={aba === 'conversa'} onClick={() => setAba('conversa')} icone={MessageSquare}
                rotulo="Conversa" total={linha.filter(i => i.tipo === 'mensagem').length} />
              <BotaoAba ativa={aba === 'arquivos'} onClick={() => setAba('arquivos')} icone={Images}
                rotulo="Arquivos" total={arquivos.length} />
              <BotaoAba ativa={aba === 'historico'} onClick={() => setAba('historico')} icone={History}
                rotulo="Histórico" total={eventos.length} />
              {!telaLarga && (
                <BotaoAba ativa={aba === 'detalhes'} onClick={() => setAba('detalhes')} icone={PanelRight}
                  rotulo="Detalhes" total={participantes.length || undefined} />
              )}
            </div>
          </div>

          {/* ── Conteúdo da aba ───────────────────────────────────────────── */}
          <div className="bg-muted/20 md:flex-1 md:min-h-0 md:overflow-y-auto">
            {aba === 'conversa' && (
              <div className="px-4 py-4 md:px-5 space-y-3">
                <CartaoPedido ticket={ticket} foto={fotos.get(ticket.abertoPor) ?? null}
                  anexos={anexosDoPedido} onAmpliar={ampliar} />

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
                        : <Balao mensagem={item.mensagem} meu={item.mensagem.autorId === meuId} onAmpliar={ampliar} />}
                    </div>
                  );
                })}

                {!linha.length && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Ainda sem resposta. Print, foto, áudio e arquivo entram pela caixa abaixo.
                  </p>
                )}
                <div ref={fimRef} />
              </div>
            )}

            {aba === 'arquivos' && (
              <AbaArquivos arquivos={arquivos} onAmpliar={ampliar}
                onIrParaConversa={!fechado ? () => { setAba('conversa'); setTimeout(() => inputRef.current?.click(), 50); } : undefined} />
            )}

            {aba === 'historico' && <AbaHistorico eventos={historico} />}

            {aba === 'detalhes' && !telaLarga && painel}
          </div>
        </div>

        {/* ── Caixa de envio (só na Conversa) ─────────────────────────────── */}
        {aba === 'conversa' && (
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
                {/* Imagem anexada aparece ANTES de ir: mandar o print errado
                    num ticket é fácil, e desfazer depois não dá. */}
                {!!pendentes.length && (
                  <div className="px-3 pt-3">
                    <PreviasPendentes arquivos={pendentes} tamanho="sm"
                      onRemover={i => setPendentes(atual => atual.filter((_, j) => j !== i))} />
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
                    accept={TIPOS_ACEITOS}
                    onChange={e => anexar(e.target.files)} />
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground"
                    onClick={() => inputRef.current?.click()} disabled={enviando}
                    title="Anexar print, foto, áudio ou arquivo" aria-label="Anexar arquivo">
                    <Paperclip className="w-4 h-4" /> <span className="hidden sm:inline text-xs">Anexar</span>
                  </Button>
                  <span className="hidden lg:inline text-[11px] text-muted-foreground">
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
        )}
      </div>

      {/* ── Ficha fixa à direita em tela larga ────────────────────────────── */}
      {telaLarga && (
        <aside className="w-72 shrink-0 border-l border-border overflow-y-auto">
          {painel}
        </aside>
      )}

      {/* ── Diálogos ──────────────────────────────────────────────────────── */}
      <VisualizadorDeImagens imagens={imagens} indice={imagemAberta}
        onIndice={setImagemAberta} onFechar={() => setImagemAberta(null)} />

      <TransferirDialog
        aberto={transferirAberto}
        onFechar={() => setTransferirAberto(false)}
        pessoas={quemAtende ?? []}
        carregando={quemAtende === null}
        responsavelAtualId={ticket.responsavelId}
        meuId={meuId}
        numero={ticket.numero}
        onConfirmar={transferir}
      />

      <ChamarPessoasDialog
        aberto={chamarAberto}
        onFechar={() => setChamarAberto(false)}
        pessoas={candidatos ?? []}
        carregando={candidatos === null}
        jaNoTicket={jaNoTicket}
        numero={ticket.numero}
        onConfirmar={chamar}
      />

      <AlertDialog open={!!confirmarTirar} onOpenChange={o => { if (!o && !ocupado) setConfirmarTirar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmarTirar?.id === meuId ? 'Sair deste ticket?' : `Tirar ${confirmarTirar?.nome} do ticket?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmarTirar?.id === meuId
                ? 'Você para de receber os avisos. Se não for do seu setor, o ticket some da sua lista.'
                : 'A pessoa para de receber os avisos. Se não for do setor do ticket, deixa de vê-lo.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado}
              onClick={e => { e.preventDefault(); if (confirmarTirar) void tirar(confirmarTirar.id); }}>
              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmarTirar?.id === meuId ? 'Sair' : 'Tirar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarExclusao} onOpenChange={o => { if (!ocupado) setConfirmarExclusao(o); }}>
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
  );
}

// ── Peças do cabeçalho ───────────────────────────────────────────────────────

/**
 * Um chip de propriedade. Clicável quando é gatilho de menu (o Radix passa os
 * handlers pelo `asChild`) ou tem `onClick`; parado quando quem olha só pode ver.
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
  return <button ref={ref} type="button" className={classes} title={titulo} {...resto}>{children}</button>;
});

function BotaoAba({ ativa, onClick, icone: Icone, rotulo, total, className }: {
  ativa: boolean;
  onClick: () => void;
  icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  total?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={cn(
        'relative shrink-0 inline-flex items-center gap-1.5 px-2.5 pt-1 pb-2.5 text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md',
        ativa ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <Icone className="w-3.5 h-3.5" />
      {rotulo}
      {!!total && (
        <span className={cn(
          'rounded-full px-1.5 font-mono text-[10px] leading-4 tabular-nums',
          ativa ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}>{total}</span>
      )}
      <span aria-hidden="true" className={cn(
        'absolute left-1.5 right-1.5 bottom-0 h-0.5 rounded-full', ativa ? 'bg-primary' : 'bg-transparent',
      )} />
    </button>
  );
}

/**
 * O pedido, como a primeira fala da conversa: quem abriu, quando, o que disse,
 * as fotos que vieram junto e os campos da categoria.
 */
function CartaoPedido({ ticket, foto, anexos, onAmpliar }: {
  ticket: Ticket;
  foto: string | null;
  anexos: AnexoTicket[];
  onAmpliar: (a: AnexoTicket) => void;
}) {
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

      {!!anexos.length && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {anexos.length === 1 ? 'Anexo do pedido' : `${anexos.length} anexos do pedido`}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {anexos.map(a => <MiniaturaAnexo key={a.url} anexo={a} onAmpliar={onAmpliar} />)}
          </div>
        </div>
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

// ── Abas ─────────────────────────────────────────────────────────────────────

function AbaArquivos({ arquivos, onAmpliar, onIrParaConversa }: {
  arquivos: ArquivoDoTicket[];
  onAmpliar: (a: AnexoTicket) => void;
  onIrParaConversa?: () => void;
}) {
  const imagens = arquivos.filter(a => ehImagem(a.anexo));
  const outros = arquivos.filter(a => !ehImagem(a.anexo));

  if (!arquivos.length) {
    return (
      <div className="flex flex-col items-center text-center px-6 py-14 text-muted-foreground">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Images className="w-5 h-5 opacity-60" />
        </span>
        <p className="text-sm font-medium text-foreground">Nenhum arquivo ainda</p>
        <p className="mt-1 text-xs">Prints, fotos e arquivos enviados no pedido ou na conversa aparecem aqui.</p>
        {onIrParaConversa && (
          <Button variant="outline" size="sm" className="mt-3 h-8 gap-1.5" onClick={onIrParaConversa}>
            <PlusCircle className="w-3.5 h-3.5" /> Anexar um arquivo
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-5 space-y-5">
      {!!imagens.length && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Fotos e prints ({imagens.length})
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {imagens.map(a => (
              <figure key={a.anexo.url} className="space-y-1">
                <MiniaturaAnexo anexo={a.anexo} onAmpliar={onAmpliar} />
                <figcaption className="text-[10px] text-muted-foreground truncate" title={`${a.autor} · ${quando(a.em)}`}>
                  {a.doPedido ? 'No pedido' : a.autor} · {diaCurto(a.em)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {!!outros.length && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Outros arquivos ({outros.length})
          </h3>
          <div className="space-y-1.5">
            {outros.map(a => (
              <LinhaDeArquivo key={a.anexo.url} anexo={a.anexo}
                legenda={`${a.doPedido ? 'no pedido' : a.autor} · ${quando(a.em)}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AbaHistorico({ eventos }: { eventos: EventoTicket[] }) {
  if (!eventos.length) {
    return <p className="px-6 py-14 text-center text-xs text-muted-foreground">Nenhum movimento registrado.</p>;
  }
  return (
    <ol className="px-4 py-4 md:px-5">
      {eventos.map((e, i) => {
        const Icone = iconeDoEvento(e.tipo);
        return (
          <li key={e.id} className="relative flex gap-3 pb-4">
            {i < eventos.length - 1 && (
              <span aria-hidden="true" className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
            )}
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card">
              <Icone className="w-3 h-3 text-muted-foreground" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-xs text-foreground">{frase(e)}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(e.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Peças da linha do tempo ──────────────────────────────────────────────────

/**
 * O movimento do sistema, no meio da conversa.
 *
 * Pequeno, com ícone e sem balão: ele é contexto, não fala. Quem varre a
 * conversa tem de conseguir pular estas linhas sem esforço.
 */
function LinhaDeEvento({ evento }: { evento: EventoTicket }) {
  const Icone = iconeDoEvento(evento.tipo);
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

function iconeDoEvento(tipo: string): React.ComponentType<{ className?: string }> {
  if (tipo === 'responsavel') return ArrowRightLeft;
  if (tipo === 'prioridade') return Flag;
  if (tipo === 'participante_entrou') return UserPlus;
  if (tipo.startsWith('participante_saiu')) return UserMinus;
  if (tipo === 'aberto') return PlusCircle;
  return CircleDot;
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
      if (!e.de)   return e.para === quem ? `${quem} assumiu o ticket` : `${quem} passou o ticket para ${e.para}`;
      return `${quem} transferiu o ticket de ${e.de} para ${e.para}`;
    case 'prioridade':
      return `${quem} mudou a prioridade: ${rotuloPrioridade(e.de)} → ${rotuloPrioridade(e.para)}`;
    case 'participante_entrou':
      return `${quem} chamou ${e.para ?? 'alguém'} para o ticket`;
    case 'participante_saiu':
      return `${quem} tirou ${e.de ?? 'alguém'} do ticket`;
    case 'participante_saiu_sozinho':
      return `${e.de ?? quem} saiu do ticket`;
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

function Balao({ mensagem: m, meu, onAmpliar }: {
  mensagem: MensagemTicket;
  meu: boolean;
  onAmpliar: (a: AnexoTicket) => void;
}) {
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
              {m.anexos.map(a => <AnexoNaConversa key={a.url} anexo={a} onAmpliar={onAmpliar} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Datas ────────────────────────────────────────────────────────────────────

/**
 * Um separador por dia.
 *
 * Sem ele, uma conversa que atravessa a semana vira uma parede de horários em
 * que "09:12" pode ser hoje ou terça-feira. O primeiro item compara com a
 * abertura do ticket (o cartão do pedido já diz o dia).
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

function diaCurto(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** «hoje às 09:12», «ontem às 16:40», «07 out. às 10:05». */
function quando(iso: string): string {
  const em = Date.parse(iso);
  const dia = rotuloDoDia(em);
  return `${dia === 'Hoje' || dia === 'Ontem' ? dia.toLowerCase() : new Date(em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${hora(iso)}`;
}
