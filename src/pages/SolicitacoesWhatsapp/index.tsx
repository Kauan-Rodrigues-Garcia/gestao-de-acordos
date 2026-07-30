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
 * ⚠️  A aba está em teste: só admin/super_admin conseguem abrir. O gate é uma
 *     constante em `permissoes.ts` (PERFIS_ACESSO_ABA_WPP) — trocar por `null`
 *     libera para todos, e a RLS já está no formato final.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquarePlus, Inbox, CheckCircle2, Filter, RefreshCw, ShieldAlert, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  useSolicitacoesWhatsapp, useChatSolicitacao,
} from '@/hooks/useSolicitacoesWhatsapp';
import {
  criarSolicitacao, atualizarStatus, excluirSolicitacao,
  definirResponsavel, removerResponsavel, buscarEventos,
  MAX_PENDENTES,
  type SolicitacaoWhatsapp, type StatusSolicitacao, type EventoSolicitacao,
  type PessoaResumo,
} from '@/services/solicitacoesWhatsapp.service';
import { podeAcessarAbaWpp, temVisaoGeralPorCargo, podeDefinirResponsavel } from './permissoes';
import { FormNovaSolicitacao, type DadosNovaSolicitacao } from './FormNovaSolicitacao';
import { CardSolicitacao } from './CardSolicitacao';
import { PainelResponsaveis } from './PainelResponsaveis';
import { ChatSolicitacao } from './ChatSolicitacao';

const TODOS = '__todos__';

interface OpcaoSimples { id: string; nome: string }

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

  // Quem enxerga mais de um setor precisa escolher um — pedido explícito: nunca
  // misturar setores na mesma lista.
  const setorDoPerfil    = perfil?.setor_id ?? null;
  const veMaisDeUmSetor  = !setorDoPerfil && temVisaoGeralPorCargo(cargo);

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

  const {
    solicitacoes, responsaveis, loading, dbAtiva, erro, naoLidas,
    recarregar, recarregarResponsaveis, limparNaoLidas,
  } = useSolicitacoesWhatsapp(
    empresaId,
    usuarioId,
    { setorId: setorSel, equipeId: equipeSel === TODOS ? null : equipeSel },
    habilitado,
  );

  // Ser responsável dá visão geral mesmo sem cargo de liderança.
  const souResponsavel = useMemo(
    () => !!usuarioId && responsaveis.some(r => r.id === usuarioId),
    [responsaveis, usuarioId],
  );
  const temVisaoGeral = temVisaoGeralPorCargo(cargo) || souResponsavel;
  const podeEditarPedidos = temVisaoGeral;

  // ── Listas: em aberto × finalizados ────────────────────────────────────────
  const { emAberto, finalizados } = useMemo(() => {
    const abertos: SolicitacaoWhatsapp[] = [];
    const feitos:  SolicitacaoWhatsapp[] = [];
    for (const s of solicitacoes) (s.status === 'feito' ? feitos : abertos).push(s);
    return { emAberto: abertos, finalizados: feitos };
  }, [solicitacoes]);

  const meusPendentes = useMemo(
    () => solicitacoes.filter(s => s.solicitante_id === usuarioId && s.status === 'pendente').length,
    [solicitacoes, usuarioId],
  );

  const equipesDoSetor = useMemo(
    () => (setorSel ? equipes.filter(e => e.setor_id === setorSel) : equipes),
    [equipes, setorSel],
  );

  // ── Histórico sob demanda (ao expandir) ────────────────────────────────────
  const carregarEventos = useCallback(async (id: string) => {
    const lista = await buscarEventos(id);
    setEventos(prev => ({ ...prev, [id]: lista }));
  }, []);

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
      <p className="text-sm text-muted-foreground text-center py-16">
        Esta aba existe apenas na PaguePlay.
      </p>
    );
  }

  if (!temAcessoAba) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <ShieldAlert className="w-8 h-8 opacity-50" />
        <p className="text-sm">Esta aba está em teste e ainda não foi liberada para o seu perfil.</p>
      </div>
    );
  }

  if (!dbAtiva) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <ShieldAlert className="w-8 h-8 opacity-50" />
        <p className="text-sm max-w-sm">
          A migration <code className="font-mono text-xs">20260730b_solicitacoes_whatsapp.sql</code> ainda
          não foi aplicada no banco. Rode o SQL no Supabase para a aba funcionar.
        </p>
      </div>
    );
  }

  const precisaEscolherSetor = veMaisDeUmSetor && !setorSel;

  function renderLista(lista: SolicitacaoWhatsapp[], vazio: string) {
    if (lista.length === 0) {
      return <p className="text-xs text-muted-foreground py-6 text-center">{vazio}</p>;
    }
    return (
      <div className="space-y-2">
        {lista.map(s => (
          <CardSolicitacao
            key={s.id}
            solicitacao={s}
            expandido={expandidoId === s.id}
            eventos={eventos[s.id] ?? []}
            naoLidas={naoLidas[s.id] ?? 0}
            podeEditar={podeEditarPedidos}
            ehDono={s.solicitante_id === usuarioId}
            salvando={salvandoId === s.id}
            onAlternar={() => alternarCard(s.id)}
            onMudarStatus={status => void aoMudarStatus(s, status)}
            onExcluir={() => void aoExcluir(s.id)}
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
                onEnviar={chat.enviar}
                onDigitando={chat.avisarDigitando}
                onFechar={() => setChatAbertoId(null)}
              />
            )}
          </CardSolicitacao>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 max-w-5xl"
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            Solicitações de WhatsApp
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

      {/* Filtros (só para quem tem visão geral) */}
      {temVisaoGeral && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtros
          </span>

          {veMaisDeUmSetor && (
            <Select
              value={setorSel ?? ''}
              onValueChange={v => { setSetorSel(v); setEquipeSel(TODOS); }}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="Escolha um setor…" />
              </SelectTrigger>
              <SelectContent>
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
            {renderLista(emAberto, temVisaoGeral
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
            {renderLista(finalizados, 'Nada finalizado ainda.')}
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
              Digite o código do cliente para puxar os dados do acordo. Confira o
              WhatsApp antes de abrir o pedido.
            </DialogDescription>
          </DialogHeader>
          <FormNovaSolicitacao
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
