/**
 * PainelMonitor.tsx — acompanhar o chat de outra pessoa, ao vivo.
 *
 * ## Ele toma a janela inteira, e isso é a correção de 01/09
 *
 * A primeira versão morava DENTRO da coluna da lista de conversas. Aquela
 * coluna tem 260 px no chat expandido e é a tela toda no compacto — e a
 * monitoria precisa de duas: as conversas da pessoa e a conversa aberta. O
 * resultado era o defeito relatado: a conversa monitorada abria por cima da
 * lista, no mesmo lugar, e no chat menor simplesmente não abria.
 *
 * Agora o botão «Monitor» na régua de abas é só um GATILHO: ele avisa a
 * `BolhaChat`, que troca o corpo da janela por este painel. Aqui dentro o
 * layout é o mesmo do chat — duas colunas quando há espaço, uma de cada vez
 * quando não há.
 *
 * ## Três níveis, e a navegação é para dentro
 *
 * 1. escolher QUEM acompanhar;
 * 2. a lista de conversas DELE, como ele a vê;
 * 3. uma conversa aberta, em tempo real.
 *
 * No expandido, 2 e 3 ficam lado a lado. No compacto, uma de cada vez, com
 * «voltar» — a mesma régua que a janela usa para lista e conversa.
 *
 * ## É leitura, e a tela diz isso o tempo todo
 *
 * A faixa âmbar no topo não some enquanto houver alguém sendo acompanhado. Ela
 * não é decoração nem aviso legal por desencargo: quem está lendo a conversa de
 * outra pessoa precisa ver, o tempo todo, que aquela caixa de mensagens não é a
 * dele — o risco de confundir com o próprio chat é real, e o efeito de
 * responder achando que é seu seria pior que o de não responder.
 *
 * O cabeçalho da conversa nomeia OS DOIS lados: «Kleber com Beatriz».
 *
 * ## Não escreve, e não é a tela que garante isso
 *
 * `Conversa` recebe `somenteLeitura`, que tira o campo, o curtir e o responder.
 * Se algo aqui tentasse escrever assim mesmo, o banco recusaria:
 * `fn_chat_posso_escrever` e `fn_chat_curtir` exigem participação, e o monitor
 * não participa. A tela evita o erro; a regra vive no banco.
 *
 * Efeito colateral disso, e é o certo: acompanhar não marca nada como lido. O
 * contador do operador não mexe, e o outro lado da conversa não vê dois tiques
 * que não aconteceram.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, Loader2, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { assinarTabela } from '@/lib/realtime';
import {
  listarMonitoraveis, listarConversasDe,
  type PessoaMonitoravel, type ConversaMonitorada,
} from '@/services/chat/monitor.service';
import {
  listarMensagens, type MensagemChat, type ConversaChat,
} from '@/services/chat/chat.service';
import { Conversa } from './Conversa';
import { AvatarChat, horaCurta, TagEmpresa, TagAdm } from './comum';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';

interface Props {
  expandido: boolean;
  /** Fecha a monitoria e devolve a janela ao chat normal. */
  onSair: () => void;
}

/** Espera antes de refazer a lista. Junta a rajada de eventos numa consulta só. */
const ESPERA_REFAZER = 300;

/**
 * «sua equipe», «seu setor», «a empresa inteira» — o alcance, em uma frase.
 *
 * A lista já vem recortada pelo banco, então a tela não PRECISA disto para
 * funcionar. Precisa para EXPLICAR: sem a frase, quem acompanha só o próprio
 * setor procura um nome de outro setor, não acha, e conclui que a busca está
 * quebrada. Mesma decisão de `NovaConversaDialog`.
 */
function fraseDoAlcance(niveis: string[]): string {
  if (niveis.includes('todos_setores')) return 'Você pode acompanhar qualquer pessoa da empresa.';
  if (niveis.includes('setor'))  return 'Você pode acompanhar as pessoas do seu setor.';
  if (niveis.includes('equipe')) return 'Você pode acompanhar as pessoas da sua equipe.';
  return 'Seu cargo ainda não tem alcance de monitoria definido.';
}

export function PainelMonitor({ expandido, onSair }: Props) {
  const { temPermissao } = useCargoPermissoes();
  const alcance = fraseDoAlcance(niveisLiberados('chat_monitor', temPermissao));

  const [busca, setBusca] = useState('');
  const [pessoas, setPessoas] = useState<PessoaMonitoravel[]>([]);
  const [carregandoPessoas, setCarregandoPessoas] = useState(true);

  const [alvo, setAlvo] = useState<PessoaMonitoravel | null>(null);
  const [conversas, setConversas] = useState<ConversaMonitorada[]>([]);
  const [carregandoConversas, setCarregandoConversas] = useState(false);

  const [aberta, setAberta] = useState<ConversaMonitorada | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  // ── Quem posso acompanhar ─────────────────────────────────────────────────
  //
  // A busca é resolvida no banco (a lista pode ser a empresa inteira), com uma
  // espera curta para não disparar uma consulta por tecla.
  useEffect(() => {
    if (alvo) return;   // já escolhi: a lista de gente não precisa recarregar
    let cancelado = false;
    setCarregandoPessoas(true);
    const id = setTimeout(() => {
      void listarMonitoraveis(busca).then(r => {
        if (cancelado) return;
        setPessoas(r);
        setCarregandoPessoas(false);
      });
    }, 280);
    return () => { cancelado = true; clearTimeout(id); };
  }, [busca, alvo]);

  // ── A lista de conversas do alvo ──────────────────────────────────────────
  const recarregarConversas = useCallback(async (perfilId: string) => {
    const r = await listarConversasDe(perfilId);
    setConversas(r);
    setCarregandoConversas(false);
  }, []);

  useEffect(() => {
    if (!alvo) { setConversas([]); setAberta(null); return; }
    setCarregandoConversas(true);
    void recarregarConversas(alvo.perfil_id);
  }, [alvo, recarregarConversas]);

  // ── Tempo real ────────────────────────────────────────────────────────────
  //
  // Canal PRÓPRIO, separado do `rt-chat-<empresa>` que `useChat` usa. Os dois
  // escutam a mesma tabela, e é de propósito: juntá-los faria a lista do
  // monitor refazer a cada mensagem do chat pessoal de quem está monitorando,
  // e vice-versa. Tópicos distintos, ciclos de vida distintos.
  const alvoRef = useRef<string | null>(null);
  alvoRef.current = alvo?.perfil_id ?? null;
  const abertaRef = useRef<string | null>(null);
  abertaRef.current = aberta?.id ?? null;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!alvo) return;

    return assinarTabela(
      { topico: `rt-chat-monitor-${alvo.perfil_id}`, escutas: [{ tabela: 'chat_mensagens' }] },
      {
        onEvento: (payload) => {
          const msg = (payload.new ?? payload.old ?? {}) as unknown as MensagemChat;

          // A conversa aberta recebe a mensagem direto: ali o evento É o dado,
          // e reler a página inteira faria a rolagem pular a cada linha.
          if (msg.conversa_id === abertaRef.current) {
            const normalizada = { ...msg, anexos: Array.isArray(msg.anexos) ? msg.anexos : [] };
            if (payload.eventType === 'INSERT') {
              setMensagens(atual => atual.some(m => m.id === msg.id) ? atual : [...atual, normalizada]);
            } else if (payload.eventType === 'UPDATE') {
              setMensagens(atual => atual.map(m => (m.id === msg.id ? { ...m, ...msg } : m)));
            }
          }

          // A lista é um agregado (última mensagem, ordem): refazer é uma
          // consulta pequena, e aplicar o evento sobre ela repetiria no cliente
          // as regras que a RPC já resolve.
          const id = alvoRef.current;
          if (!id) return;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { void recarregarConversas(id); }, ESPERA_REFAZER);
        },
        onReconectado: () => {
          const id = alvoRef.current;
          if (id) void recarregarConversas(id);
          const conversaId = abertaRef.current;
          if (conversaId) {
            void listarMensagens(conversaId).then(r => {
              setMensagens(r.mensagens);
              setTemMais(r.temMais);
            });
          }
        },
      },
    );
  }, [alvo, recarregarConversas]);

  // ── Abrir uma conversa ────────────────────────────────────────────────────
  function abrir(c: ConversaMonitorada) {
    setAberta(c);
    setMensagens([]);
    void listarMensagens(c.id).then(r => {
      setMensagens(r.mensagens);
      setTemMais(r.temMais);
    });
  }

  const verAnteriores = useCallback(async () => {
    const maisAntiga = mensagens[0]?.criado_em;
    if (!aberta || !maisAntiga || carregandoMais) return;
    setCarregandoMais(true);
    const r = await listarMensagens(aberta.id, maisAntiga);
    setCarregandoMais(false);
    setTemMais(r.temMais);
    if (r.mensagens.length) setMensagens(atual => [...r.mensagens, ...atual]);
  }, [aberta, mensagens, carregandoMais]);

  // ── ESC volta um nível, e do primeiro sai da monitoria ─────────────────────
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (aberta)     { setAberta(null); return; }
      if (alvo)       { setAlvo(null);   return; }
      onSair();
    }
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [aberta, alvo, onSair]);

  /**
   * A `ConversaChat` montada a partir da linha do monitor.
   *
   * `Conversa` desenha a conversa de quem está logado, e este objeto é a do
   * ALVO — daí os campos de leitura/entrega virem nulos: eles descrevem a
   * relação entre os dois participantes, e mostrá-los aqui insinuaria que quem
   * monitora entregou ou leu alguma coisa. Nada disso aconteceu.
   */
  function comoConversa(c: ConversaMonitorada): ConversaChat {
    return {
      id: c.id,
      outro_id: c.outro_id,
      outro_nome: c.outro_nome,
      outro_usuario: null,
      outro_foto: c.outro_foto,
      outro_perfil: c.outro_perfil,
      outro_empresa: null,
      ultima_mensagem_em: c.ultima_mensagem_em,
      ultima_atividade_em: c.ultima_mensagem_em,
      em_historico: false,
      ultimo_texto: c.ultimo_texto,
      ultimo_autor_id: c.ultimo_autor_id,
      nao_lidas: 0,
      leitura_do_outro: null,
      entrega_minha: null,
      entrega_do_outro: null,
      tipo: c.tipo,
      participantes: c.participantes,
      sou_admin: false,
      somente_lideranca: false,
    };
  }

  // ── Peças ─────────────────────────────────────────────────────────────────

  const faixa = (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
      <Eye className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-400" />
      <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-amber-800 dark:text-amber-300">
        {alvo
          ? <>Monitoramento em tempo real de <strong>{alvo.nome}</strong> — somente leitura</>
          : <>Monitoramento em tempo real — somente leitura</>}
      </p>
      <button
        type="button" onClick={onSair}
        title="Sair da monitoria"
        aria-label="Sair da monitoria e voltar ao chat"
        className="shrink-0 rounded p-0.5 text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  /** Nível 1: escolher quem acompanhar. */
  const escolhaDePessoa = (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 px-2 py-2">
        <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {alcance} Em tempo real e <strong>somente leitura</strong>: nada do que
          você fizer aqui aparece para a pessoa, e nada é marcado como lido.
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)} autoFocus
            placeholder="Procurar por nome ou login"
            className="w-full rounded-lg bg-muted/60 py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {carregandoPessoas && (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </p>
        )}
        {!carregandoPessoas && pessoas.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {busca.trim() ? 'Ninguém com esse nome no seu alcance.' : 'Ninguém para acompanhar.'}
            </p>
            {!busca.trim() && (
              <p className="mx-auto mt-1.5 max-w-[260px] text-[11px] leading-relaxed text-muted-foreground/70">
                {alcance} Quem amplia isso é o administrador, no painel de
                permissões.
              </p>
            )}
          </div>
        )}
        {pessoas.map(p => (
          <button
            key={p.perfil_id}
            onClick={() => setAlvo(p)}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
              'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            )}
          >
            <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={34} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm leading-tight">
                <span className="truncate">{p.nome}</span>
                <TagAdm perfil={p.cargo} />
                <TagEmpresa slug={p.empresa_slug} />
              </p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {[p.setor_nome, p.usuario ? `@${p.usuario}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );

  /** Nível 2: as conversas do alvo. */
  const listaDoAlvo = alvo && (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2">
        <button
          onClick={() => setAlvo(null)}
          className="-ml-1 rounded p-1 transition-colors hover:bg-muted"
          aria-label="Escolher outra pessoa"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <AvatarChat nome={alvo.nome} foto={alvo.foto_url} tamanho={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{alvo.nome}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {alvo.setor_nome ?? alvo.cargo}
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {carregandoConversas && (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </p>
        )}
        {!carregandoConversas && conversas.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            Esta pessoa ainda não tem conversas.
          </p>
        )}
        {conversas.map(c => (
          <button
            key={c.id}
            onClick={() => abrir(c)}
            className={cn(
              'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
              aberta?.id === c.id ? 'bg-muted' : 'hover:bg-muted/50',
            )}
          >
            <AvatarChat nome={c.outro_nome} foto={c.outro_foto} tamanho={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {c.tipo === 'grupo' && (
                  <Users aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <p className="min-w-0 truncate text-sm font-medium">{c.outro_nome}</p>
                <TagAdm perfil={c.outro_perfil} />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {c.ultimo_autor_id === alvo.perfil_id && (
                  <span className="opacity-60">{alvo.nome.split(' ')[0]}: </span>
                )}
                {c.ultimo_texto ?? 'Anexo'}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {horaCurta(c.ultima_mensagem_em)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  /** Nível 3: a conversa, com os DOIS nomes no topo. */
  const conversaAberta = alvo && aberta && (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/30 px-2.5 py-1.5">
        {/* No expandido a lista fica ao lado e o «voltar» seria supérfluo; no
            compacto ele é a única saída da conversa. */}
        {!expandido && (
          <button
            onClick={() => setAberta(null)}
            className="-ml-1 rounded p-1 transition-colors hover:bg-muted"
            aria-label="Voltar para as conversas desta pessoa"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <p className="min-w-0 flex-1 truncate text-[11px] leading-tight">
          <strong>{alvo.nome}</strong>
          <span className="mx-1 text-muted-foreground">com</span>
          <strong>{aberta.outro_nome}</strong>
          {aberta.tipo === 'grupo' && (
            <span className="ml-1 text-muted-foreground">
              (grupo, {aberta.participantes} pessoas)
            </span>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <Conversa
          conversa={comoConversa(aberta)}
          mensagens={mensagens}
          online={false}
          digitando={false}
          gravando={false}
          expandido
          onEnviar={async () => 'Monitoramento é somente leitura.'}
          onDigitando={() => { /* observar não digita */ }}
          onGravando={() => { /* observar não grava */ }}
          temMais={temMais}
          carregandoMais={carregandoMais}
          onVerAnteriores={verAnteriores}
          somenteLeitura
        />
      </div>
    </div>
  );

  // ── Montagem ──────────────────────────────────────────────────────────────
  //
  // Expandido: duas colunas, como o resto da janela. Compacto: uma tela de
  // cada vez, com «voltar» — mostrar as duas em 360 px deixaria 180 px para
  // cada uma, e nenhuma seria utilizável.
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      {faixa}
      <div className="flex min-h-0 flex-1">
        {!alvo ? (
          <div className="min-w-0 flex-1">{escolhaDePessoa}</div>
        ) : expandido ? (
          <>
            <div className="w-[260px] shrink-0 border-r border-border min-h-0">
              {listaDoAlvo}
            </div>
            <div className="min-w-0 flex-1 min-h-0">
              {aberta ? conversaAberta : (
                <div className="flex h-full items-center justify-center px-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Escolha uma conversa de {alvo.nome.split(' ')[0]} para acompanhar
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 min-h-0">
            {aberta ? conversaAberta : listaDoAlvo}
          </div>
        )}
      </div>
    </div>
  );
}
