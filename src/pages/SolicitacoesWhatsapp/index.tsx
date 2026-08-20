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
 * ## A divisão em quatro blocos (16/08/2026)
 *
 * Antes eram duas listas: "em aberto" e "finalizados". Em produção isso era 67
 * pedidos numa fila corrida — de 15 solicitantes, atendidos por 3 pessoas — e
 * 32 dos 59 em andamento já tinham passado do prazo de 5 dias. Metade da lista
 * ficava vermelha, e uma marca que pinta metade da tela deixa de apontar.
 *
 * Agora: minha mesa, a fila, a mesa dos outros, e o histórico. As regras da
 * divisão moram em `agrupamento.ts`, fora daqui, porque são o coração da tela e
 * merecem teste próprio.
 *
 * Não há ramo por papel: quem só vê os próprios pedidos nunca é responsável,
 * então o bloco "comigo" nasce vazio e some sozinho, e "com outra pessoa",
 * agrupado por responsável, vira "João está com 3 pedidos seus".
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquarePlus, Inbox, CheckCircle2, Filter, RefreshCw, ShieldAlert, Loader2,
  Search, X, PlayCircle, Users, Sparkles,
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
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
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
  MAX_PENDENTES, DIAS_HISTORICO_PADRAO, chatAindaAberto, podeFalarNaConversa,
  transferirAtendimento, marcarNaoConcluidos,
  type SolicitacaoWhatsapp, type StatusSolicitacao, type EventoSolicitacao,
  type PessoaResumo,
} from '@/services/solicitacoesWhatsapp.service';
import { combinaBusca, naoConcluido } from './formatacao';
import {
  separarEmBaldes, agruparPor, valeAgrupar, SEM_PESSOA,
  type Eixo, type GrupoPessoa,
} from './agrupamento';
import { Input } from '@/components/ui/input';
import { FormNovaSolicitacao, type DadosNovaSolicitacao } from './FormNovaSolicitacao';
import { CardSolicitacao } from './CardSolicitacao';
import { PainelResponsaveis } from './PainelResponsaveis';
import { ChatSolicitacao } from './ChatSolicitacao';
import { BlocoSolicitacoes } from './BlocoSolicitacoes';
import { FaixaContadores } from './FaixaContadores';

const TODOS = '__todos__';

interface OpcaoSimples { id: string; nome: string }

/** De quanto em quanto tempo o "tempo de espera" dos cards é redesenhado. */
const PASSO_RELOGIO_MS = 30_000;

/** Cabeçalho de um grupo de pessoa dentro de um bloco. */
function CabecalhoGrupo({ grupo }: { grupo: GrupoPessoa }) {
  const nome = grupo.id === SEM_PESSOA
    ? 'Sem responsável'
    : grupo.pessoa?.nome ?? 'Sem nome';

  return (
    <div className="flex items-center gap-2 px-0.5">
      <Avatar className="w-6 h-6 shrink-0">
        {grupo.pessoa?.foto_url && (
          <AvatarImage src={grupo.pessoa.foto_url} alt={nome} className="object-cover" />
        )}
        <AvatarFallback className="bg-muted text-[9px] font-bold">
          {nome.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <p className="text-xs font-semibold truncate">{nome}</p>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
        {grupo.itens.length}
      </Badge>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function SolicitacoesWhatsapp() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant      = useTenant();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  // ── Gates ──────────────────────────────────────────────────────────────────
  const ehPaguePlay  = tenant.isPaguePlay;
  const temAcessoAba = temPermissao('ver_solicitacoes_whatsapp');
  const ehLiderOuAcima = temPermissao('ver_solicitacoes_whatsapp_geral');

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

  /**
   * Janela do histórico. `null` = tudo.
   *
   * Nasce em 30 dias porque a consulta trazia a empresa inteira sem limite, e
   * os concluídos só crescem — ver `buscarSolicitacoes`.
   */
  const [diasHistorico, setDiasHistorico] = useState<number | null>(DIAS_HISTORICO_PADRAO);

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
      ? { setorId: setorSel, equipeId: equipeSel === TODOS ? null : equipeSel, dias: diasHistorico }
      : { dias: diasHistorico },
    habilitado,
  );
  /**
   * Verificação preguiçosa do prazo de 5 dias.
   *
   * Não há job agendado neste projeto: se ninguém dispara, o aviso de "não
   * concluído" nunca sai. Roda UMA vez por abertura da aba, antes de tudo o
   * mais importar — a RPC é idempotente (só alcança quem ainda não foi
   * marcado), então abrir a aba dez vezes no dia não vira dez notificações.
   *
   * Só recarrega a lista quando algo mudou de fato; o `marcarNaoConcluidos`
   * engole os próprios erros justamente para não derrubar a listagem, que é o
   * que a pessoa veio ver.
   */
  const verificouPrazoRef = useRef(false);
  useEffect(() => {
    if (verificouPrazoRef.current || !habilitado || !empresaId) return;
    verificouPrazoRef.current = true;
    void (async () => {
      if (await marcarNaoConcluidos(empresaId) > 0) await recarregar();
    })();
  }, [habilitado, empresaId, recarregar]);

  // A matriz decide quem pode atender; a visibilidade continua respeitando o
  // recorte próprio/geral configurado separadamente.
  const podeEditarPedidos = temPermissao('atender_solicitacoes_whatsapp');
  /**
   * Excluir: o DONO do pedido, em qualquer status, e líder+.
   *
   * Até 31/07/2026 o dono perdia o botão assim que alguém assumia. Na prática o
   * pedido que precisa sumir é justamente o que já andou — cliente que ligou de
   * volta, código errado descoberto depois. Quem abriu é quem sabe que não vale
   * mais, e ficava dependendo de um líder para apagar.
   *
   * O responsável continua de fora: ele atende o chamado, não o descarta. E
   * quem estava com o atendimento é avisado — trigger `trg_wpp_notificar_exclusao`
   * (migration 20260731c). Espelha a policy `sol_wpp_delete`.
   */
  const podeExcluirSolicitacao = useCallback(
    (s: SolicitacaoWhatsapp) =>
      temPermissao('atender_solicitacoes_whatsapp') || s.solicitante_id === usuarioId,
    [temPermissao, usuarioId],
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

  // ── Os quatro baldes ───────────────────────────────────────────────────────
  // A busca corta ANTES da divisão, então os blocos e os contadores falam todos
  // do mesmo recorte.
  const baldes = useMemo(
    () => separarEmBaldes(solicitacoes.filter(s => combinaBusca(s, busca)), usuarioId),
    [solicitacoes, busca, usuarioId],
  );

  /** Quantos passaram dos 5 dias, em cada balde e no total. */
  const atrasados = useMemo(() => {
    const conta = (lista: SolicitacaoWhatsapp[]) =>
      lista.filter(s => naoConcluido(s, agora)).length;
    const comigo = conta(baldes.comigo);
    const fila   = conta(baldes.fila);
    const outros = conta(baldes.outros);
    return { comigo, fila, outros, total: comigo + fila + outros };
  }, [baldes, agora]);

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
  const nadaParaMostrar =
    baldes.comigo.length === 0 && baldes.fila.length === 0
    && baldes.outros.length === 0 && baldes.concluidos.length === 0;

  function renderCard(s: SolicitacaoWhatsapp, compacto = false) {
    return (
      <CardSolicitacao
        key={s.id}
        solicitacao={s}
        expandido={expandidoId === s.id}
        eventos={eventos[s.id] ?? []}
        naoLidas={naoLidas[s.id] ?? 0}
        totalMensagens={totaisMensagens[s.id] ?? 0}
        agora={agora}
        compacto={compacto}
        podeEditar={podeEditarPedidos}
        podeExcluir={podeExcluirSolicitacao(s)}
        podeTransferir={podeTransferirParaMim(s)}
        avisaResponsavel={!!s.responsavel_id && s.responsavel_id !== usuarioId}
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
            leituras={chat.leituras}
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

  /** Lista corrida. */
  function renderCorrida(lista: SolicitacaoWhatsapp[], compacto = false) {
    return (
      <div className={compacto ? 'space-y-1' : 'space-y-2'}>
        {lista.map(s => renderCard(s, compacto))}
      </div>
    );
  }

  /**
   * Lista agrupada por pessoa — **sempre**, sem depender de filtro de equipe.
   *
   * Era esse o defeito da versão anterior: o agrupamento só ligava quando uma
   * equipe era escolhida, e a aba abre sem filtro nenhum.
   *
   * Com um grupo só, cai para lista corrida: um cabeçalho repetindo o nome de
   * quem já está no topo da tela é custo visual sem informação.
   */
  function renderAgrupada(lista: SolicitacaoWhatsapp[], eixo: Eixo, compacto = false) {
    const grupos = agruparPor(lista, eixo);
    if (!valeAgrupar(grupos)) return renderCorrida(lista, compacto);

    return (
      <div className="space-y-4">
        {grupos.map(grupo => (
          <div key={grupo.id} className="space-y-2">
            <CabecalhoGrupo grupo={grupo} />
            <div className={cn('sm:pl-8', compacto ? 'space-y-1' : 'space-y-2')}>
              {grupo.itens.map(s => renderCard(s, compacto))}
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
            {/* O limite vale para QUEM CRIA — o trigger `fn_wpp_limite_pendentes`
                não olha cargo. Até 16/08/2026 o aviso só aparecia para quem não
                tinha visão geral, e o líder que abria pedido descobria o teto
                pela mensagem de erro. */}
            {temPermissao('criar_solicitacao_whatsapp')
              && ` Você pode ter até ${MAX_PENDENTES} pendentes.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9"
            onClick={() => void recarregar()} title="Atualizar">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          {/* Acompanhar e ABRIR pedido são coisas diferentes: o digital
              acompanha, o setor de ligação é quem pede. */}
          {temPermissao('criar_solicitacao_whatsapp') && (
            <Button onClick={() => setNovaAberta(true)} className="gap-1.5">
              <MessageSquarePlus className="w-4 h-4" /> Nova solicitação
            </Button>
          )}
        </div>
      </div>

      {/* Responsáveis */}
      <PainelResponsaveis
        empresaId={empresaId as string}
        responsaveis={responsaveis}
        podeEditar={temPermissao('gerenciar_responsaveis_whatsapp')}
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
        <>
          {/* Os números ficam aqui e não nos blocos: assim um bloco vazio pode
              sumir sem levar a informação junto. "Na fila: 0" é notícia boa. */}
          <FaixaContadores
            comigo={baldes.comigo.length}
            fila={baldes.fila.length}
            outros={baldes.outros.length}
            atrasados={atrasados.total}
            mostrarComigo={temVisaoGeral}
          />

          {nadaParaMostrar ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
              <Sparkles className="w-7 h-7 opacity-40" />
              <p className="text-sm max-w-xs">
                {busca
                  ? 'Nenhuma solicitação para essa busca.'
                  : temVisaoGeral
                    ? 'Nenhuma solicitação por aqui. A fila está limpa.'
                    : 'Você ainda não abriu nenhuma solicitação.'}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 1 — a minha mesa. Lista corrida: agrupar por mim mesmo não diz
                  nada. Some para quem não atende, porque nasce vazio. */}
              <BlocoSolicitacoes
                titulo="Comigo agora"
                descricao="atendimentos que você assumiu"
                icone={<PlayCircle className="w-4 h-4" />}
                total={baldes.comigo.length}
                atrasados={atrasados.comigo}
              >
                {() => renderCorrida(baldes.comigo)}
              </BlocoSolicitacoes>

              {/* 2 — a fila, agrupada por quem pediu. Sempre, com ou sem filtro
                  de equipe: era esse o defeito da versão anterior. */}
              <BlocoSolicitacoes
                titulo="Aguardando alguém"
                descricao="ninguém assumiu ainda"
                icone={<Inbox className="w-4 h-4" />}
                total={baldes.fila.length}
                atrasados={atrasados.fila}
              >
                {() => renderAgrupada(baldes.fila, 'solicitante')}
              </BlocoSolicitacoes>

              {/* 3 — a mesa dos outros, agrupada por quem atende. É aqui que os
                  atrasados ganham dono e nome, em vez de virarem uma parede
                  vermelha na lista única. Recolhido: não é o meu trabalho.
                  Para quem só vê os próprios pedidos, este bloco é o "João está
                  com 3 pedidos seus" — e por isso nasce ABERTO para essa
                  pessoa: é a única coisa em andamento que ela tem. */}
              <BlocoSolicitacoes
                titulo={temVisaoGeral ? 'Com outra pessoa' : 'Quem está atendendo'}
                descricao={temVisaoGeral
                  ? 'assumidos por outro atendente'
                  : 'quem está cuidando dos seus pedidos'}
                icone={<Users className="w-4 h-4" />}
                total={baldes.outros.length}
                atrasados={atrasados.outros}
                recolhivel
                abertoInicial={!temVisaoGeral}
              >
                {() => renderAgrupada(baldes.outros, 'responsavel')}
              </BlocoSolicitacoes>

              {/* 4 — histórico. Linha enxuta, recolhido, e com janela: ver
                  `buscarSolicitacoes` para por que a janela existe. */}
              <BlocoSolicitacoes
                titulo="Concluídos"
                descricao={diasHistorico
                  ? `últimos ${diasHistorico} dias`
                  : 'histórico completo'}
                icone={<CheckCircle2 className="w-4 h-4" />}
                total={baldes.concluidos.length}
                recolhivel
                abertoInicial={false}
                acao={diasHistorico !== null ? (
                  <div className="pt-1 text-center">
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setDiasHistorico(null)}
                    >
                      Ver histórico completo
                    </Button>
                  </div>
                ) : undefined}
              >
                {() => renderCorrida(baldes.concluidos, true)}
              </BlocoSolicitacoes>
            </div>
          )}
        </>
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
