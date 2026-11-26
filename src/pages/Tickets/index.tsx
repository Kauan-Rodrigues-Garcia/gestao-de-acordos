/**
 * Tickets — a fila de pedidos da liderança para quem desenvolve.
 *
 * ## O que esta tela é
 *
 * Uma fila de trabalho, no sentido literal: existe para responder "o que
 * precisa de mim agora?" e "o que está apodrecendo?". Toda a estrutura vem
 * dessas duas perguntas.
 *
 *   • **Os contadores do topo são o filtro.** Ver "Sem dono: 3" e não poder
 *     clicar obrigaria a pessoa a reproduzir o recorte à mão nos seletores — e
 *     "sem dono" não é valor de campo nenhum, é combinação. Aqui ver e ir são o
 *     mesmo gesto.
 *   • **Dois modos.** A lista responde a quem executa; o quadro responde a quem
 *     coordena — ele mostra onde a fila entope. Mesmos dados, leituras
 *     diferentes, e por isso o quadro não tem filtro próprio.
 *   • **Envelhecimento em vez de prazo.** Não há SLA contratado aqui, e inventar
 *     um encheria a tela de vermelho que todo mundo aprende a ignorar. O que há
 *     é um limiar por prioridade (`fila.ts`): passou dele sem movimento, o
 *     cartão ganha um ponto. Urgente parado há duas horas é notícia; "baixa"
 *     parado há dois dias não é.
 *
 * ## O que o banco decide, e a tela só reflete
 *
 * A RLS devolve o que a pessoa pode ver — a lista nunca pergunta "de que setor é
 * este?". Assumir, mudar estado e liberar a aba são recusados pelo banco para
 * quem não pode; esconder botão aqui é conforto, não segurança.
 *
 * ## Carregamento
 *
 * A fila usa `useDadosVivos` com instantâneo: sair da aba e voltar pinta a
 * última resposta conhecida em tempo zero e relê em silêncio por trás. O
 * esqueleto só aparece na primeiríssima vez, quando não há nada guardado. Os
 * eventos de tempo real são agrupados — dez mudanças numa rajada viram uma
 * releitura, não dez.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, ShieldCheck, Inbox, Loader2, AlarmClock, Search, X, Ticket as IconeTicket,
} from 'lucide-react';
import { toast } from 'sonner';
import { ItemVivo } from '@/components/LinhaViva';
import { iguaisProfundo } from '@/lib/dadosVivos';
import { chaveDeCache, lerInstantaneo, gravarInstantaneo } from '@/lib/cacheInstantaneo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useDadosVivos } from '@/hooks/useDadosVivos';
import { useRelogioLento } from '@/hooks/useRelogioLento';
import { useTicketsAcesso } from '@/hooks/useTicketsAcesso';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { perfilVeDuasEmpresas } from '@/services/acessoMultiempresa.service';
import { fetchEmpresas } from '@/services/empresas.service';
import {
  listarTickets, buscarFotosDosPerfis, mudarStatus, type Ticket,
} from '@/services/tickets.service';
import {
  STATUS_TICKET, PRIORIDADES, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';
import {
  filtrarFila, ordenarFila, agruparFila, contarSegmentos, textoDeIdade,
  abasDoPapel, segmentoInicial, definicaoDoSegmento,
  abasDoQuadro, contarQuadro, segmentoNoQuadro, segmentoNaLista, ajudaDoQuadro,
  CRITERIOS_VAZIOS,
  type Segmento, type SegmentoQuadro, type Ordem, type Agrupamento, type CriteriosFila,
} from './fila';
import { CartaoTicket } from './CartaoTicket';
import { ResumoFila, type AbaResumo } from './ResumoFila';
import { QuadroTickets } from './QuadroTickets';
import { BarraFiltros, type Visao } from './BarraFiltros';
import NovoTicketDialog from './NovoTicketDialog';
import DetalheTicket from './DetalheTicket';
import PainelAtendentes from './PainelAtendentes';

/** Onde ficam as preferências de exibição. Não é dado — é gosto de quem usa. */
const CHAVE_PREFERENCIAS = 'tickets:preferencias:v1';

interface Preferencias {
  visao: Visao;
  ordem: Ordem;
  agrupar: Agrupamento;
}

const PREFERENCIAS_PADRAO: Preferencias = {
  visao: 'fila',
  // A fila nasce pela urgência: é o que a aba existe para responder.
  ordem: 'urgencia',
  agrupar: 'nenhum',
};

function lerPreferencias(): Preferencias {
  try {
    const cru = localStorage.getItem(CHAVE_PREFERENCIAS);
    if (!cru) return PREFERENCIAS_PADRAO;
    return { ...PREFERENCIAS_PADRAO, ...(JSON.parse(cru) as Partial<Preferencias>) };
  } catch {
    return PREFERENCIAS_PADRAO;
  }
}

export default function Tickets() {
  const { empresa } = useEmpresa();
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  const acesso = useTicketsAcesso();
  const [params, setParams] = useSearchParams();

  const empresaId = empresa?.id ?? null;
  const meuId = perfil?.id ?? null;

  // Quem responde pelas duas empresas vê as duas listas de uma vez. Trocar a
  // empresa ativa para conferir a fila da outra é um caminho ruim: muda o
  // contexto do sistema inteiro para responder uma pergunta de uma aba só.
  const veDuasEmpresas = perfilVeDuasEmpresas(
    perfil as Parameters<typeof perfilVeDuasEmpresas>[0],
    temPermissao,
  );

  /** `null` = sem filtro de empresa na consulta; a RLS resolve o resto. */
  const escopo = veDuasEmpresas ? null : empresaId;

  // ── Dados ─────────────────────────────────────────────────────────────────

  const carregar = useCallback(() => listarTickets(escopo), [escopo]);

  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    if (!veDuasEmpresas) return;
    let vivo = true;
    (async () => {
      const lista = await fetchEmpresas();
      if (vivo) setEmpresas((lista ?? []).map(e => ({ id: e.id, nome: e.nome })));
    })();
    return () => { vivo = false; };
  }, [veDuasEmpresas]);

  // O aviso `tickets` do banco vem por empresa (20261013170000): quem enxerga
  // as duas filas ouve as duas.
  const assinaturas = useMemo(() => {
    const ids = escopo ? [escopo] : empresas.map(e => e.id);
    return ids.map(id => ({ topico: `tickets:${id}`, escutas: [{ sinal: 'mudou' }] }));
  }, [escopo, empresas]);

  const {
    dados: tickets, carregando, atualizando, atualizadoEm, entraram, recarregar,
  } = useDadosVivos<Ticket>({
    carregar,
    chave: t => t.id,
    // Profunda: o ticket carrega `campos`, que é `jsonb` — a comparação rasa
    // acharia toda linha diferente e a reconciliação não teria servido para nada.
    iguais: iguaisProfundo,
    ativo: !!empresaId && acesso.podeVerAba,
    chaveCache: chaveDeCache('tickets', escopo ?? 'todas', meuId),
    assinar: assinaturas,
    // Mensagem e evento são da conversa (DetalheTicket); a lista muda quando o
    // próprio ticket muda.
    aceitarSinal: p => p.tabela === 'tickets',
    agrupamento: { esperaMs: 250, tetoMs: 1_200 },
  });

  const fotos = useFotosDePerfis(!!empresaId && acesso.podeVerAba);

  const nomeDaEmpresa = useMemo(
    () => new Map(empresas.map(e => [e.id, e.nome])),
    [empresas],
  );

  // ── Recorte ───────────────────────────────────────────────────────────────

  const [criterios, setCriterios] = useState<CriteriosFila>(CRITERIOS_VAZIOS);
  const [preferencias, setPreferencias] = useState<Preferencias>(lerPreferencias);
  const [selecionado, setSelecionado] = useState<string | null>(params.get('ticket'));
  const [novoAberto, setNovoAberto] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(preferencias)); }
    catch { /* modo privado; a tela funciona sem lembrar do gosto */ }
  }, [preferencias]);

  const mudar = useCallback(<K extends keyof CriteriosFila>(campo: K, valor: CriteriosFila[K]): void => {
    setCriterios(c => ({ ...c, [campo]: valor }));
  }, []);

  /*
   * A aba com que a tela abre depende do papel: quem atende cai na fila em
   * aberto, quem pede cai nos próprios pedidos. O papel chega depois do
   * primeiro render (`useTicketsAcesso` consulta o banco), então a escolha é
   * feita uma vez, quando ele chega — e nunca mais por cima da escolha da
   * pessoa.
   */
  const abaInicialDefinida = useRef(false);
  useEffect(() => {
    if (acesso.carregando || abaInicialDefinida.current) return;
    abaInicialDefinida.current = true;
    const inicial = segmentoInicial(acesso.podeAtender);
    setCriterios(c => ({ ...c, segmento: inicial, segmentoQuadro: segmentoNoQuadro(inicial) }));
  }, [acesso.carregando, acesso.podeAtender]);

  // Limpar tira os filtros e a busca, mas fica no recorte: quem está em
  // «Comigo» e limpa os filtros quer ver tudo o que é seu, não a fila inteira.
  const limpar = useCallback(() => {
    setCriterios(c => ({ ...CRITERIOS_VAZIOS, segmento: c.segmento, segmentoQuadro: c.segmentoQuadro }));
  }, []);

  /*
   * O relógio da tela.
   *
   * "há 3 h" precisa envelhecer sozinho, e a temperatura do cartão depende de
   * um `agora`. Um `Date.now()` no corpo do render mudaria a cada quadro e
   * quebraria o `memo` de todos os cartões; um `setInterval` de um segundo
   * repintaria a fila sessenta vezes por minuto. O relógio lento bate uma vez
   * por minuto, que é a menor unidade que a tela chega a mostrar.
   */
  const agora = useRelogioLento(60_000);

  const contagem = useMemo(
    () => contarSegmentos(tickets, meuId, agora),
    [tickets, meuId, agora],
  );

  const contagemQuadro = useMemo(
    () => contarQuadro(tickets, meuId, agora),
    [tickets, meuId, agora],
  );

  /*
   * O modo manda no recorte. No quadro as abas são só de pessoa e as colunas
   * dizem o estado (`fila.ts`, «Quadro»). Com um ticket aberto, o quadro dá
   * lugar à lista estreita — que continua com o recorte do quadro, para a
   * pessoa não ver sumir o cartão em que acabou de clicar.
   */
  const modo: 'lista' | 'quadro' = preferencias.visao === 'quadro' ? 'quadro' : 'lista';

  const visiveis = useMemo(() => {
    const filtrados = filtrarFila(tickets, criterios, meuId, agora, modo);
    return ordenarFila(filtrados, preferencias.ordem, agora);
  }, [tickets, criterios, meuId, agora, preferencias.ordem, modo]);

  const grupos = useMemo(
    () => agruparFila(visiveis, preferencias.agrupar),
    [visiveis, preferencias.agrupar],
  );

  /*
   * Só anima o cartão que CHEGOU de verdade.
   *
   * Sem este conjunto, trocar de filtro remontaria vinte cartões e os vinte
   * entrariam de uma vez — efeito de abertura, não aviso de novidade, que é o
   * oposto do que a animação existe para dizer. `entraram` vem da própria
   * reconciliação: são as chaves que não existiam na leitura anterior.
   */
  const novos = useMemo(() => new Set(entraram), [entraram]);

  /**
   * As pessoas que aparecem no seletor de responsável.
   *
   * Saem da própria lista, e não de uma consulta a `perfis`: quem nunca pegou
   * um ticket não precisa aparecer num filtro de "quem está com", e uma
   * consulta a mais para montar um seletor é uma consulta a mais em toda
   * abertura da aba.
   */
  const responsaveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of tickets) {
      if (t.responsavelId) mapa.set(t.responsavelId, t.responsavelNome ?? 'Sem nome');
    }
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [tickets]);

  const aberto = useMemo(
    () => tickets.find(t => t.id === selecionado) ?? null,
    [tickets, selecionado],
  );

  // A notificação leva `?ticket=<id>`: quem clica cai no ticket aberto, e não
  // numa lista onde ainda teria que procurar do que se tratava.
  useEffect(() => {
    const alvo = params.get('ticket');
    if (alvo) setSelecionado(alvo);
  }, [params]);

  const abrir = useCallback((id: string) => {
    setSelecionado(atual => (atual === id ? null : id));
    setParams(p => {
      const proximo = new URLSearchParams(p);
      if (proximo.get('ticket') === id) proximo.delete('ticket');
      else proximo.set('ticket', id);
      return proximo;
    }, { replace: true });
  }, [setParams]);

  const fechar = useCallback(() => {
    setSelecionado(null);
    setParams(p => {
      const proximo = new URLSearchParams(p);
      proximo.delete('ticket');
      return proximo;
    }, { replace: true });
  }, [setParams]);

  /*
   * Dois atalhos, e só dois.
   *
   * `/` cai na busca e `Esc` fecha o ticket aberto. São os que existem em toda
   * ferramenta parecida e que a mão já sabe; uma tabela de dez atalhos que
   * ninguém decorou seria peso morto no arquivo e na tela.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (
        alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable
      );
      if (e.key === '/' && !digitando) {
        e.preventDefault();
        buscaRef.current?.focus();
      }
      if (e.key === 'Escape' && !digitando) fechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fechar]);

  /** Soltar um cartão noutra coluna do quadro. */
  const mover = useCallback(async (id: string, status: StatusTicket) => {
    const r = await mudarStatus(id, status);
    if (r.erro) { toast.error(r.erro); return; }
    toast.success(`Ticket movido para ${STATUS_TICKET[status].label}.`);
    await recarregar();
  }, [recarregar]);

  // ── Portas fechadas ───────────────────────────────────────────────────────

  if (acesso.carregando) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A rota é alcançável por URL mesmo com o item fora do menu — e o cargo
  // sozinho não responde a pergunta, porque a liberação é uma chave de banco.
  // O gate de verdade é a RLS; isto só evita uma tela vazia sem explicação.
  if (!acesso.podeVerAba) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-6 space-y-2">
        <Inbox className="w-8 h-8 mx-auto opacity-40" />
        <p className="text-sm font-medium">Os tickets ainda não estão liberados.</p>
        <p className="text-xs text-muted-foreground">
          A aba está em conferência com os administradores. Assim que for liberada, ela aparece
          no seu menu.
        </p>
      </div>
    );
  }

  const listaVazia = !carregando && !visiveis.length;
  const buscando = criterios.busca.trim() !== '';
  const temFiltro =
    buscando || !!criterios.status || !!criterios.categoria
    || !!criterios.prioridade || !!criterios.responsavel || !!criterios.empresaId;
  const abas: AbaResumo[] = modo === 'quadro'
    ? abasDoQuadro(acesso.podeAtender).map(s => ({
      chave: s,
      label: ROTULO_QUADRO[s],
      ajuda: ajudaDoQuadro(s),
      total: contagemQuadro[s],
      alerta: s === 'sem_dono' ? 'bg-amber-500' : undefined,
    }))
    : abasDoPapel(acesso.podeAtender, contagem, criterios.segmento).map(s => {
      const d = definicaoDoSegmento(s);
      return {
        chave: s,
        label: d.label,
        ajuda: d.ajuda,
        total: contagem[s] ?? 0,
        alerta: ALERTA_LISTA[s],
        respiro: s === 'encerrados',
      };
    });
  const abaAtiva = modo === 'quadro' ? criterios.segmentoQuadro : criterios.segmento;

  const escolherAba = (chave: string) => {
    if (modo === 'quadro') mudar('segmentoQuadro', chave as SegmentoQuadro);
    else mudar('segmento', chave as Segmento);
    if (buscando) mudar('busca', '');
  };

  // Trocar de modo leva o recorte junto: «Comigo» na lista é «Comigo» no
  // quadro, e «Todos» no quadro volta como «Em aberto» na lista.
  const definirVisao = (v: Visao) => {
    if (v === preferencias.visao) return;
    setPreferencias(p => ({ ...p, visao: v }));
    setCriterios(c => (v === 'quadro'
      ? { ...c, segmentoQuadro: segmentoNoQuadro(c.segmento) }
      : { ...c, segmento: segmentoNaLista(c.segmentoQuadro) }));
    // O quadro divide a largura em quatro colunas; com um ticket aberto ao
    // lado não sobraria espaço para nenhuma delas.
    if (v === 'quadro') fechar();
  };

  /** Da lista ou do quadro para um recorte da LISTA (o rodapé dos encerrados, o aviso de parados). */
  const irParaLista = (s: Segmento) => {
    setPreferencias(p => ({ ...p, visao: 'fila' }));
    setCriterios(c => ({ ...c, segmento: s, busca: '' }));
  };

  return (
    // `p-4 md:p-6`: o `<main>` do Layout não tem respiro próprio — cada tela põe
    // o dela. A altura desconta esse padding além do cabeçalho, senão a lista
    // rola por baixo da borda inferior.
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] min-h-0 p-4 md:p-6 gap-3">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <IconeTicket className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight leading-tight">Tickets</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {acesso.podeAtender
                ? 'Assuma, transfira ou chame mais gente para resolver cada pedido.'
                : 'Peça ajuda com print ou foto e acompanhe a resposta por aqui.'}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {atualizadoEm && (
            <span className="hidden sm:inline text-[11px] text-muted-foreground/80 mr-1">
              {atualizando ? 'buscando…' : `atualizado ${textoDeIdade(Math.max(0, agora - atualizadoEm))}`}
            </span>
          )}
          {acesso.podeAtender && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5"
              onClick={() => setPainelAberto(true)}
              title="Quem vê a aba e quem resolve tickets">
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">
                {acesso.liberadoParaLideranca ? 'Aba liberada' : 'Aba fechada'}
              </span>
            </Button>
          )}
          {acesso.podeAbrir && (
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setNovoAberto(true)}>
              <Plus className="w-4 h-4" /> Novo ticket
            </Button>
          )}
        </div>
      </div>

      {/* ── Recortes (contador e filtro ao mesmo tempo) ──────────────────── */}
      <div className="space-y-2">
        <ResumoFila
          abas={abas}
          ativa={abaAtiva}
          onEscolher={escolherAba}
          carregando={carregando}
          rotulo={modo === 'quadro' ? 'De quem é o ticket' : 'Recortes da fila'}
        />

        {/* Uma frase que diz o que a aba mostra: quem chega pela primeira vez
            não precisa adivinhar a diferença entre «Comigo» e «Em aberto». */}
        {buscando ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="w-3.5 h-3.5" />
            Buscando em <strong className="font-medium text-foreground/80">todos os tickets</strong>, abertos e encerrados.
            <button type="button" onClick={() => mudar('busca', '')}
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
              <X className="w-3 h-3" /> Limpar busca
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {modo === 'quadro' ? ajudaDoQuadro(criterios.segmentoQuadro) : definicaoDoSegmento(criterios.segmento).ajuda}
          </p>
        )}

        {/* «Parados» deixou de ser aba: é aviso, e só aparece quando existe.
            Do quadro, «Ver» leva à lista, que é onde o recorte mora. */}
        {!buscando && contagem.parados > 0
          && (modo === 'quadro' || (criterios.segmento !== 'parados' && criterios.segmento !== 'encerrados')) && (
          <button type="button" onClick={() => irParaLista('parados')}
            className="flex w-full items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-left text-xs transition-colors hover:bg-destructive/[0.1]">
            <AlarmClock className="w-4 h-4 shrink-0 text-destructive" />
            <span className="flex-1">
              <strong className="font-semibold text-destructive">
                {contagem.parados === 1 ? '1 ticket parado' : `${contagem.parados} tickets parados`}
              </strong>
              <span className="text-muted-foreground"> há mais tempo do que a prioridade aguenta.</span>
            </span>
            <span className="font-medium text-destructive">Ver</span>
          </button>
        )}
      </div>

      {/* ── Busca, filtros e modo ────────────────────────────────────────── */}
      <BarraFiltros
        criterios={criterios}
        mudar={mudar}
        limpar={limpar}
        buscaRef={buscaRef}
        responsaveis={responsaveis}
        empresas={veDuasEmpresas ? empresas : []}
        ordem={preferencias.ordem}
        onOrdem={o => setPreferencias(p => ({ ...p, ordem: o }))}
        agrupar={preferencias.agrupar}
        onAgrupar={a => setPreferencias(p => ({ ...p, agrupar: a }))}
        visao={preferencias.visao}
        onVisao={definirVisao}
      />

      {/* ── Corpo ────────────────────────────────────────────────────────── */}
      {preferencias.visao === 'quadro' && !aberto ? (
        <QuadroTickets
          tickets={visiveis}
          fotos={fotos}
          selecionado={selecionado}
          onAbrir={abrir}
          onMover={acesso.podeAtender ? (id, s) => { void mover(id, s); } : null}
          onVerEncerrados={() => irParaLista('encerrados')}
          agora={agora}
          nomeDaEmpresa={veDuasEmpresas ? nomeDaEmpresa : undefined}
        />
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          {/* Lista: uma superfície só, com as linhas dentro. A largura dela é
              que decide a forma da linha (`tickets.css`). */}
          <div className={cn(
            'tk-lista flex flex-col min-h-0 rounded-xl border border-border bg-card overflow-hidden',
            aberto ? 'hidden md:flex md:w-[22rem] lg:w-[26rem] shrink-0' : 'flex-1',
          )}>
            <div className="flex-1 overflow-y-auto">
              {carregando && <EsqueletoFila />}

              {listaVazia && (
                <div className="flex flex-col items-center text-center px-6 py-16 text-muted-foreground">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <Inbox className="w-5 h-5 opacity-60" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {temFiltro ? 'Nenhum ticket com esse recorte' : TEXTO_VAZIO[criterios.segmento]}
                  </p>
                  {temFiltro ? (
                    <Button variant="link" size="sm" className="mt-1 text-xs" onClick={limpar}>
                      Limpar filtros
                    </Button>
                  ) : acesso.podeAbrir && (criterios.segmento === 'fila' || criterios.segmento === 'pedidos') && (
                    <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => setNovoAberto(true)}>
                      Abrir um ticket
                    </Button>
                  )}
                </div>
              )}

              {grupos.map(grupo => (
                <div key={grupo.chave || 'unico'}>
                  {preferencias.agrupar !== 'nenhum' && (
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted px-4 py-1.5 md:pl-5">
                      <span className="text-[11px] font-semibold text-foreground/80">
                        {rotuloDoGrupo(preferencias.agrupar, grupo.chave)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {grupo.tickets.length}
                      </span>
                    </div>
                  )}

                  {/* `initial={false}` cobre a primeira pintura; `novos` cobre
                      o resto. Juntos, só se mexe a linha que acabou de chegar. */}
                  <AnimatePresence initial={false}>
                    {grupo.tickets.map(t => (
                      <ItemVivo key={t.id} nova={novos.has(t.id)}>
                        <CartaoTicket
                          ticket={t}
                          fotoAutor={fotos.get(t.abertoPor) ?? null}
                          fotoResponsavel={t.responsavelId ? fotos.get(t.responsavelId) ?? null : null}
                          selecionado={t.id === selecionado}
                          onAbrir={abrir}
                          agora={agora}
                          nomeEmpresa={veDuasEmpresas ? nomeDaEmpresa.get(t.empresaId) ?? null : null}
                        />
                      </ItemVivo>
                    ))}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {!carregando && visiveis.length > 0 && (
              <div className="border-t border-border px-4 py-1.5 md:pl-5 text-[11px] text-muted-foreground">
                {visiveis.length === 1 ? '1 ticket' : `${visiveis.length} tickets`}
                {temFiltro && ' neste recorte'}
              </div>
            )}
          </div>

          {/* Ticket aberto */}
          {aberto && (
            <div className="flex-1 min-w-0 min-h-0 rounded-xl border border-border bg-card overflow-hidden">
              <DetalheTicket
                ticket={aberto}
                podeAtender={acesso.podeAtender}
                podeExcluir={temPermissao('tickets_excluir')}
                fotos={fotos}
                onFechar={fechar}
                onMudou={() => { void recarregar(); }}
                onExcluido={() => { fechar(); void recarregar(); }}
              />
            </div>
          )}
        </div>
      )}

      <NovoTicketDialog aberto={novoAberto} onFechar={() => setNovoAberto(false)}
        onCriado={id => {
          // Quem acabou de abrir quase sempre tem um print para mandar: o
          // ticket novo já abre ao lado, com a caixa de mensagem pronta.
          void recarregar().then(() => { if (id) abrir(id); });
        }} />
      <PainelAtendentes aberto={painelAberto} onFechar={() => setPainelAberto(false)}
        liberado={acesso.liberadoParaLideranca}
        onMudou={() => { acesso.recarregar(); void recarregar(); }} />
    </div>
  );
}

/** A frase da lista vazia SEM filtro: o recorte vazio também é notícia. */
const TEXTO_VAZIO: Record<Segmento, string> = {
  fila:         'Nada em aberto. Tudo respondido.',
  meus:         'Nada com você agora.',
  sem_dono:     'Todo ticket aberto tem alguém cuidando.',
  parados:      'Nada parado além do limite.',
  encerrados:   'Nenhum ticket encerrado ainda.',
  todos:        'Nenhum ticket por aqui.',
  pedidos:      'Você não tem pedido em aberto.',
  participando: 'Ninguém chamou você para um ticket em aberto.',
};

/** Os rótulos das abas do quadro. */
const ROTULO_QUADRO: Record<SegmentoQuadro, string> = {
  todos:    'Todos',
  meus:     'Comigo',
  sem_dono: 'Sem responsável',
  pedidos:  'Meus pedidos',
};

/** Abas da lista que ganham ponto de cor quando têm alguém dentro. */
const ALERTA_LISTA: Partial<Record<Segmento, string>> = {
  sem_dono: 'bg-amber-500',
  parados:  'bg-destructive',
};

// ── Peças pequenas ───────────────────────────────────────────────────────────

/**
 * O esqueleto da PRIMEIRA carga, e só dela.
 *
 * Ele existe para o caso em que não há nada guardado — a primeiríssima vez que
 * alguém abre a aba nesta sessão. Toda reabertura seguinte pinta o instantâneo
 * e nunca chega aqui.
 */
function EsqueletoFila() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-3 md:pl-5 animate-pulse space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-10 rounded bg-muted" />
            <div className="h-2.5 w-20 rounded bg-muted" />
            <div className="ml-auto h-2.5 w-10 rounded bg-muted" />
          </div>
          <div className="h-3.5 rounded bg-muted" style={{ width: `${55 + ((i * 37) % 35)}%` }} />
          <div className="h-2.5 w-1/3 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

function rotuloDoGrupo(por: Agrupamento, chave: string): string {
  if (por === 'status') return STATUS_TICKET[chave as StatusTicket]?.label ?? chave;
  if (por === 'prioridade') return PRIORIDADES[chave as PrioridadeTicket]?.label ?? chave;
  if (por === 'categoria') return rotuloCategoria(chave);
  return chave;
}

/**
 * As fotos de quem aparece nos cartões.
 *
 * Sem tempo real de propósito: uma foto de perfil muda uma vez por ano, e
 * assinar `perfis` para isso custaria um canal a mais em toda abertura da aba
 * para atualizar um avatar que ninguém está esperando mudar. O instantâneo faz
 * a segunda abertura não pagar nem a consulta.
 *
 * O `Map` guardado é o mesmo objeto entre releituras quando o conteúdo é igual —
 * um `Map` novo faria todos os avatares da fila re-renderizarem à toa.
 */
function useFotosDePerfis(ativo: boolean): Map<string, string | null> {
  const CHAVE = chaveDeCache('tickets-fotos');
  const [fotos, setFotos] = useState<Map<string, string | null>>(
    () => lerInstantaneo<[string, string | null][]>(CHAVE)
      ? new Map(lerInstantaneo<[string, string | null][]>(CHAVE)!.valor)
      : new Map(),
  );

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    (async () => {
      const mapa = await buscarFotosDosPerfis();
      if (!vivo) return;
      setFotos(atual => (mesmoMapa(atual, mapa) ? atual : mapa));
      gravarInstantaneo(CHAVE, [...mapa]);
    })();
    return () => { vivo = false; };
  }, [ativo, CHAVE]);

  return fotos;
}

function mesmoMapa(a: Map<string, string | null>, b: Map<string, string | null>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (!b.has(k) || b.get(k) !== v) return false;
  }
  return true;
}
