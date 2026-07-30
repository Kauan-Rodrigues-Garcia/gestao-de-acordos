/**
 * pages/SolicitacoesWhatsapp — Solicitações de atendimento por WhatsApp
 * ─────────────────────────────────────────────────────────────────────────────
 * PaguePlay. Setores que só atendem por ligação pedem ao pessoal do digital que
 * mande uma mensagem ao cliente. O pedido tem dono, status, responsável,
 * carimbos de tempo, histórico e uma conversa presa a ele.
 *
 * Quem vê o quê é decidido pela RLS (migration 20260730b) — esta tela só evita
 * oferecer o que o banco recusaria:
 *   operador            → só os próprios pedidos
 *   líder+ / responsável → todos os da empresa, com edição
 *
 * Aberta a todos os cargos desde 30/07/2026. O operador enxerga só os pedidos
 * dele porque a policy `sol_wpp_select` decide isso — não porque a tela esconde.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquarePlus, Inbox, CheckCircle2, Filter, RefreshCw, ShieldAlert, Loader2,
  Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  useSolicitacoesWhatsapp, useChatSolicitacao, useResponsaveisAtendimento,
} from '@/hooks/useSolicitacoesWhatsapp';
import {
  criarSolicitacao, atualizarStatus, excluirSolicitacao,
  definirResponsavel, removerResponsavel, buscarEventos,
  MAX_PENDENTES, chatAindaAberto, podeFalarNaConversa, transferirAtendimento,
  type SolicitacaoWhatsapp, type StatusSolicitacao, type EventoSolicitacao,
  type PessoaResumo,
} from '@/services/solicitacoesWhatsapp.service';
import { podeAcessarAbaWpp, temVisaoGeralPorCargo, podeDefinirResponsavel } from './permissoes';
import { combinaBusca } from './formatacao';
import { ordenarEmAberto } from './ordenacao';
import { Input } from '@/components/ui/input';
import { FormNovaSolicitacao, type DadosNovaSolicitacao } from './FormNovaSolicitacao';
import { CardSolicitacao } from './CardSolicitacao';
import { PainelResponsaveis } from './PainelResponsaveis';
import { ChatSolicitacao } from './ChatSolicitacao';

const TODOS = '__todos__';

interface OpcaoSimples { id: string; nome: string }

interface GrupoOperador {
  id:     string;
  pessoa: PessoaResumo | null;
  itens:  SolicitacaoWhatsapp[];
}

/** De quanto em quanto tempo o "tempo de espera" dos cards é redesenhado. */
const PASSO_RELOGIO_MS = 30_000;

/**
 * Agrupa os pedidos por quem os abriu, preservando a ordem em que chegaram
 * (mais recentes primeiro, como a query devolve). Grupos ordenados pelo nome.
 */
function agruparPorSolicitante(lista: SolicitacaoWhatsapp[]): GrupoOperador[] {
  const mapa = new Map<string, GrupoOperador>();
  for (const s of lista) {
    const id = s.solicitante_id;
    let grupo = mapa.get(id);
    if (!grupo) {
      grupo = { id, pessoa: s.solicitante ?? null, itens: [] };
      mapa.set(id, grupo);
    }
    grupo.itens.push(s);
  }
  return [...mapa.values()].sort((a, b) =>
    (a.pessoa?.nome ?? '').localeCompare(b.pessoa?.nome ?? '', 'pt-BR'),
  );
}

export default function SolicitacoesWhatsapp() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const tenant      = useTenant();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  const cargo     = perfil?.perfil ?? null;

  // ── Gates ──────────────────────────────────────────────────────────────────
  const ehPaguePlay  = tenant.isPaguePlay;
  const temAcessoAba = podeAcessarAbaWpp(cargo);
  /** Visão geral por CARGO. Depende só do perfil, então já vale antes do hook. */
  const ehLiderOuAcima = temVisaoGeralPorCargo(cargo);

  // Quem enxerga mais de um setor precisa escolher um — pedido explícito: nunca
  // misturar setores na mesma lista.
  const setorDoPerfil    = perfil?.setor_id ?? null;
  const veMaisDeUmSetor  = !setorDoPerfil && ehLiderOuAcima;

  const [setores, setSetores]   = useState<OpcaoSimples[]>([]);
  const [equipes, setEquipes]   = useState<(OpcaoSimples & { setor_id: string | null })[]>([]);
  const [setorSel, setSetorSel] = useState<string | null>(setorDoPerfil);
  const [equipeSel, setEquipeSel] = useState<string>(TODOS);

  const [novaAberta, setNovaAberta] = useState(false);
  const [criando, setCriando]       = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [salvandoResp, setSalvandoResp] = useState(false);

  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [chatAbertoId, setChatAbertoId] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Record<string, EventoSolicitacao[]>>({});
  const [busca, setBusca] = useState('');

  // Um relógio para a lista toda. Sem ele o "tempo de espera" dos cards só
  // mudaria quando algo mais provocasse um render.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), PASSO_RELOGIO_MS);
    return () => clearInterval(t);
  }, []);

  // ── Setores e equipes (filtros) ────────────────────────────────────────────
  useEffect(() => {
    if (!empresaId || !ehPaguePlay || !temAcessoAba) return;
    let cancelado = false;
    void (async () => {
      const [{ data: s }, { data: e }] = await Promise.all([
        supabase.from('setores').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId).order('nome'),
      ]);
      if (cancelado) return;
      setSetores((s ?? []) as OpcaoSimples[]);
      setEquipes((e ?? []) as (OpcaoSimples & { setor_id: string | null })[]);
    })();
    return () => { cancelado = true; };
  }, [empresaId, ehPaguePlay, temAcessoAba]);

  const habilitado = ehPaguePlay && temAcessoAba && !!empresaId;

  // Carregado ANTES da lista: ser responsável dá visão geral, e a visão geral
  // decide se os filtros de setor/equipe valem. Se viesse junto com a lista, a
  // página precisaria do resultado do hook para montar os argumentos dele.
  const { responsaveis, recarregarResponsaveis } =
    useResponsaveisAtendimento(empresaId, habilitado);

  const souResponsavel = useMemo(
    () => !!usuarioId && responsaveis.some(r => r.id === usuarioId),
    [responsaveis, usuarioId],
  );
  const temVisaoGeral = ehLiderOuAcima || souResponsavel;

  const {
    solicitacoes, loading, dbAtiva, erro, naoLidas, totaisMensagens,
    recarregar, limparNaoLidas,
  } = useSolicitacoesWhatsapp(
    empresaId,
    usuarioId,
    // Filtro só para quem enxerga os pedidos dos outros. Para o operador comum a
    // RLS já devolve só os dele, e filtrar por setor o faria PERDER os próprios
    // pedidos antigos se mudasse de setor (o setor é congelado na abertura).
    temVisaoGeral
      ? { setorId: setorSel, equipeId: equipeSel === TODOS ? null : equipeSel }
      : {},
    habilitado,
    // Silencia a notificação do SO da conversa que já está aberta na tela.
    chatAbertoId,
  );
  // Editar (assumir, mudar status) — responsável e líder+.
  const podeEditarPedidos = temVisaoGeral;
  // Excluir é MAIS restrito que editar: apaga para todos. O responsável atende
  // o chamado, não o descarta. Espelha a policy `sol_wpp_delete`, que dá DELETE
  // só a líder+ e ao dono enquanto ninguém pegou.
  const podeExcluirSolicitacao = useCallback(
    (s: SolicitacaoWhatsapp) =>
      ehLiderOuAcima || (s.solicitante_id === usuarioId && s.status === 'pendente'),
    [ehLiderOuAcima, usuarioId],
  );

  // Puxar para mim: o atendimento já tem dono, o dono não sou eu, e ainda não
  // acabou. Em 'feito' não faz sentido — não há mais o que atender.
  const podeTransferirParaMim = useCallback(
    (s: SolicitacaoWhatsapp) =>
      podeEditarPedidos
      && !!s.responsavel_id
      && s.responsavel_id !== usuarioId
      && s.status !== 'feito',
    [podeEditarPedidos, usuarioId],
  );

  // ── Listas: em aberto × finalizados ────────────────────────────────────────
  // A busca corta antes de separar, então os dois blocos e os contadores falam
  // do mesmo recorte.
  const { emAberto, finalizados } = useMemo(() => {
    const abertos: SolicitacaoWhatsapp[] = [];
    const feitos:  SolicitacaoWhatsapp[] = [];
    for (const s of solicitacoes) {
      if (!combinaBusca(s, busca)) continue;
      (s.status === 'feito' ? feitos : abertos).push(s);
    }
    // Finalizados seguem do mais novo para o mais antigo: é histórico, e o de
    // ontem interessa mais que o do mês passado.
    return { emAberto: ordenarEmAberto(abertos, usuarioId), finalizados: feitos };
  }, [solicitacoes, busca, usuarioId]);

  const meusPendentes = useMemo(
    () => solicitacoes.filter(s => s.solicitante_id === usuarioId && s.status === 'pendente').length,
    [solicitacoes, usuarioId],
  );

  // O responsável atende a fila da empresa inteira, então não pode nascer preso
  // ao próprio setor como um líder nasce. Roda uma vez, quando descobrimos que
  // ele é responsável — depois o filtro é dele para mexer.
  const ajustouSetorRef = useRef(false);
  useEffect(() => {
    if (ajustouSetorRef.current) return;
    if (souResponsavel && !ehLiderOuAcima) {
      ajustouSetorRef.current = true;
      setSetorSel(null);
    }
  }, [souResponsavel, ehLiderOuAcima]);

  /**
   * Escolher uma equipe separa a lista por operador. Sem equipe, a lista corre
   * direto — agrupar a empresa inteira por pessoa daria dezenas de blocos de
   * uma linha cada.
   */
  const agruparPorOperador = temVisaoGeral && equipeSel !== TODOS;

  const equipesDoSetor = useMemo(
    () => (setorSel ? equipes.filter(e => e.setor_id === setorSel) : equipes),
    [equipes, setorSel],
  );

  // ── Histórico sob demanda (ao expandir) ────────────────────────────────────
  const carregarEventos = useCallback(async (id: string) => {
    if (!empresaId) return;
    const lista = await buscarEventos(id, empresaId);
    setEventos(prev => ({ ...prev, [id]: lista }));
  }, [empresaId]);

  function alternarCard(id: string) {
    const abrindo = expandidoId !== id;
    setExpandidoId(abrindo ? id : null);
    if (!abrindo) setChatAbertoId(null);
    if (abrindo && !eventos[id]) void carregarEventos(id);
  }

  // ── Chat do card expandido ─────────────────────────────────────────────────
  const solicitacaoDoChat = useMemo(
    () => solicitacoes.find(s => s.id === chatAbertoId) ?? null,
    [solicitacoes, chatAbertoId],
  );

  const chat = useChatSolicitacao({
    empresaId,
    solicitacaoId: chatAbertoId,
    usuarioId,
    usuarioNome: perfil?.nome ?? null,
  });

  /** O outro lado da conversa: se sou o dono, é o responsável; senão, o dono. */
  const interlocutor: PessoaResumo | null = useMemo(() => {
    if (!solicitacaoDoChat) return null;
    const souDono = solicitacaoDoChat.solicitante_id === usuarioId;
    return (souDono ? solicitacaoDoChat.responsavel : solicitacaoDoChat.solicitante) ?? null;
  }, [solicitacaoDoChat, usuarioId]);

  function abrirChat(id: string) {
    const fechando = chatAbertoId === id;
    setChatAbertoId(fechando ? null : id);
    if (!fechando) limparNaoLidas(id);
  }

  // ── Ações ──────────────────────────────────────────────────────────────────
  async function aoCriar(dados: DadosNovaSolicitacao) {
    if (!empresaId || !usuarioId) return;
    setCriando(true);
    try {
      const { ok, erro: e } = await criarSolicitacao({
        empresaId,
        solicitanteId: usuarioId,
        // Congela o setor/equipe da abertura para o filtro do líder não mudar
        // quando o operador trocar de equipe depois.
        setorId:  setorDoPerfil,
        equipeId: perfil?.equipe_id ?? null,
        codigoCliente: dados.codigoCliente,
        nomeCliente:   dados.nomeCliente,
        estadoUf:      dados.estadoUf,
        whatsapp:      dados.whatsapp,
        categoria:     dados.categoria,
        mensagem:      dados.mensagem,
      });
      if (!ok) { toast.error(e ?? 'Não foi possível abrir a solicitação.'); return; }
      toast.success('Solicitação aberta!');
      setNovaAberta(false);
      await recarregar();
    } finally {
      setCriando(false);
    }
  }

  async function aoMudarStatus(s: SolicitacaoWhatsapp, status: StatusSolicitacao) {
    setSalvandoId(s.id);
    try {
      // Assumir sem responsável definido: o trigger grava quem mexeu.
      const assumindo = status === 'em_andamento' && !s.responsavel_id;
      const { ok, erro: e } = await atualizarStatus({
        id: s.id,
        status,
        responsavelId: assumindo ? usuarioId : undefined,
      });
      if (!ok) { toast.error(e ?? 'Não foi possível mudar o status.'); return; }
      await Promise.all([recarregar(), carregarEventos(s.id)]);
    } finally {
      setSalvandoId(null);
    }
  }

  async function aoTransferir(s: SolicitacaoWhatsapp) {
    if (!usuarioId) return;
    setSalvandoId(s.id);
    try {
      const { ok, erro: e } = await transferirAtendimento({
        id: s.id, novoResponsavelId: usuarioId,
      });
      if (!ok) { toast.error(e ?? 'Não foi possível transferir o atendimento.'); return; }
      toast.success('Atendimento transferido para você.');
      await Promise.all([recarregar(), carregarEventos(s.id)]);
    } finally {
      setSalvandoId(null);
    }
  }

  async function aoExcluir(id: string) {
    setSalvandoId(id);
    try {
      const { ok, erro: e } = await excluirSolicitacao(id);
      if (!ok) { toast.error(e ?? 'Não foi possível excluir.'); return; }
      toast.success('Solicitação excluída.');
      if (expandidoId === id) { setExpandidoId(null); setChatAbertoId(null); }
      await recarregar();
    } finally {
      setSalvandoId(null);
    }
  }

  async function aoAdicionarResponsavel(uid: string) {
    if (!empresaId || !usuarioId) return;
    setSalvandoResp(true);
    try {
      const { ok, erro: e } = await definirResponsavel({
        empresaId, usuarioId: uid, definidoPor: usuarioId,
      });
      if (!ok) { toast.error(e ?? 'Não foi possível definir o responsável.'); return; }
      toast.success('Responsável definido.');
      await recarregarResponsaveis();
    } finally {
      setSalvandoResp(false);
    }
  }

  async function aoRemoverResponsavel(uid: string) {
    if (!empresaId) return;
    setSalvandoResp(true);
    try {
      const { ok, erro: e } = await removerResponsavel({ empresaId, usuarioId: uid });
      if (!ok) { toast.error(e ?? 'Não foi possível remover.'); return; }
      await recarregarResponsaveis();
    } finally {
      setSalvandoResp(false);
    }
  }

  // ── Portas de entrada ──────────────────────────────────────────────────────
  if (!ehPaguePlay) {
    return (
      <p className="p-6 text-sm text-muted-foreground text-center py-16">
        Esta aba existe apenas na PaguePlay.
      </p>
    );
  }

  if (!temAcessoAba) {
    return (
      <div className="p-6 flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <ShieldAlert className="w-8 h-8 opacity-50" />
        <p className="text-sm">Esta aba está em teste e ainda não foi liberada para o seu perfil.</p>
      </div>
    );
  }

  if (!dbAtiva) {
    return (
      <div className="p-6 flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <ShieldAlert className="w-8 h-8 opacity-50" />
        <p className="text-sm max-w-sm">
          A migration <code className="font-mono text-xs">20260730b_solicitacoes_whatsapp.sql</code> ainda
          não foi aplicada no banco. Rode o SQL no Supabase para a aba funcionar.
        </p>
      </div>
    );
  }

  const precisaEscolherSetor = veMaisDeUmSetor && !setorSel;

  function renderCard(s: SolicitacaoWhatsapp) {
    return (
      <CardSolicitacao
        key={s.id}
        solicitacao={s}
        expandido={expandidoId === s.id}
        eventos={eventos[s.id] ?? []}
        naoLidas={naoLidas[s.id] ?? 0}
        totalMensagens={totaisMensagens[s.id] ?? 0}
        agora={agora}
        podeEditar={podeEditarPedidos}
        podeExcluir={podeExcluirSolicitacao(s)}
        podeTransferir={podeTransferirParaMim(s)}
        ehDono={s.solicitante_id === usuarioId}
        salvando={salvandoId === s.id}
        onAlternar={() => alternarCard(s.id)}
        onMudarStatus={status => void aoMudarStatus(s, status)}
        onExcluir={() => void aoExcluir(s.id)}
        onTransferir={() => void aoTransferir(s)}
        onAbrirChat={() => abrirChat(s.id)}
        chatAberto={chatAbertoId === s.id}
      >
        {chatAbertoId === s.id && (
          <ChatSolicitacao
            mensagens={chat.mensagens}
            loading={chat.loading}
            enviando={chat.enviando}
            digitando={chat.digitando}
            usuarioId={usuarioId}
            interlocutor={interlocutor}
            encerrado={!chatAindaAberto(s)}
            podeFalar={podeFalarNaConversa(s, usuarioId)}
            onEnviar={chat.enviar}
            onDigitando={chat.avisarDigitando}
            onFechar={() => setChatAbertoId(null)}
          />
        )}
      </CardSolicitacao>
    );
  }

  function renderLista(lista: SolicitacaoWhatsapp[], vazio: string) {
    if (lista.length === 0) {
      return <p className="text-xs text-muted-foreground py-6 text-center">{vazio}</p>;
    }

    // Sem equipe escolhida, lista corrida.
    if (!agruparPorOperador) {
      return <div className="space-y-2">{lista.map(renderCard)}</div>;
    }

    // Com equipe escolhida: um bloco por operador da equipe. É a visão que o
    // líder quer nesse recorte — quem pediu o quê, e quanto cada um tem aberto.
    return (
      <div className="space-y-4">
        {agruparPorSolicitante(lista).map(grupo => (
          <div key={grupo.id} className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <Avatar className="w-6 h-6 shrink-0">
                {grupo.pessoa?.foto_url && (
                  <AvatarImage src={grupo.pessoa.foto_url} alt={grupo.pessoa.nome} className="object-cover" />
                )}
                <AvatarFallback className="bg-muted text-[9px] font-bold">
                  {(grupo.pessoa?.nome ?? '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs font-semibold truncate">
                {grupo.pessoa?.nome ?? 'Sem operador'}
              </p>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {grupo.itens.length}
              </Badge>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2 sm:pl-8">
              {grupo.itens.map(renderCard)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    // `p-6` como as outras páginas: o <main> do Layout não tem padding, então
    // sem isto o conteúdo encosta na borda do menu lateral.
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-5xl space-y-4"
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            Solicitar Atendimento
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Peça ao time do digital para enviar uma mensagem ao cliente.
            {!temVisaoGeral && ` Você pode ter até ${MAX_PENDENTES} pendentes.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9"
            onClick={() => void recarregar()} title="Atualizar">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button onClick={() => setNovaAberta(true)} className="gap-1.5">
            <MessageSquarePlus className="w-4 h-4" /> Nova solicitação
          </Button>
        </div>
      </div>

      {/* Responsáveis */}
      <PainelResponsaveis
        empresaId={empresaId as string}
        responsaveis={responsaveis}
        podeEditar={podeDefinirResponsavel(cargo)}
        salvando={salvandoResp}
        onAdicionar={uid => void aoAdicionarResponsavel(uid)}
        onRemover={uid => void aoRemoverResponsavel(uid)}
      />

      {/* Busca — vale para todo mundo, inclusive o operador que só vê os dele */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por código, nome ou WhatsApp…"
          className="h-9 pl-9 pr-9 text-sm"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca('')}
            title="Limpar busca"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filtros — para quem enxerga os pedidos dos outros (líder+ ou responsável) */}
      {temVisaoGeral && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtros
          </span>

          {/* Seletor de setor: obrigatório para quem não tem setor próprio
              (admin/diretoria); opcional para o responsável, que atende a fila
              inteira e por isso ganha a opção "Todos os setores". */}
          {(veMaisDeUmSetor || souResponsavel) && (
            <Select
              value={setorSel ?? TODOS}
              onValueChange={v => {
                setSetorSel(v === TODOS ? null : v);
                setEquipeSel(TODOS);
              }}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="Escolha um setor…" />
              </SelectTrigger>
              <SelectContent>
                {!veMaisDeUmSetor && <SelectItem value={TODOS}>Todos os setores</SelectItem>}
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={equipeSel} onValueChange={setEquipeSel}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Todas as equipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as equipes</SelectItem>
              {equipesDoSetor.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </div>
      )}

      {/* Quem vê vários setores precisa escolher um antes de ver qualquer lista */}
      {precisaEscolherSetor ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
          <Filter className="w-7 h-7 opacity-40" />
          <p className="text-sm max-w-xs">
            Escolha um setor acima. As listas nunca misturam setores diferentes.
          </p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Em aberto */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Pendentes e em andamento</h2>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {emAberto.length}
              </Badge>
            </div>
            {renderLista(emAberto, busca
              ? 'Nenhum pedido em aberto para essa busca.'
              : temVisaoGeral
                ? 'Nenhuma solicitação em aberto.'
                : 'Você não tem solicitações em aberto.')}
          </section>

          {/* Finalizados */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">Finalizados</h2>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {finalizados.length}
              </Badge>
            </div>
            {renderLista(finalizados, busca
              ? 'Nenhum finalizado para essa busca.'
              : 'Nada finalizado ainda.')}
          </section>
        </div>
      )}

      {/* Nova solicitação */}
      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className={cn('max-w-2xl max-h-[90vh] overflow-y-auto')}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-primary" />
              Nova solicitação
            </DialogTitle>
            <DialogDescription>
              Digite o código do cliente para puxar os dados do cadastro. Confira
              o WhatsApp antes de abrir o pedido.
            </DialogDescription>
          </DialogHeader>
          <FormNovaSolicitacao
            empresaId={empresaId as string}
            pendentesAtuais={meusPendentes}
            enviando={criando}
            onSubmit={dados => void aoCriar(dados)}
            onCancelar={() => setNovaAberta(false)}
          />
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
