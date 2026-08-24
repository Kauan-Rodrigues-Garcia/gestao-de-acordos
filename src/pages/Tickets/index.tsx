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
  Plus, ShieldCheck, Inbox, Loader2, Search, Rows3, Columns3, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ItemVivo } from '@/components/LinhaViva';
import { iguaisProfundo } from '@/lib/dadosVivos';
import { chaveDeCache, lerInstantaneo, gravarInstantaneo } from '@/lib/cacheInstantaneo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  STATUS_TICKET, ORDEM_STATUS, PRIORIDADES, CATEGORIAS, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';
import {
  filtrarFila, ordenarFila, agruparFila, contarSegmentos, textoDeIdade,
  ORDENS, CRITERIOS_VAZIOS,
  type Segmento, type Ordem, type Agrupamento, type CriteriosFila,
} from './fila';
import { CartaoTicket } from './CartaoTicket';
import { ResumoFila } from './ResumoFila';
import { QuadroTickets } from './QuadroTickets';
import NovoTicketDialog from './NovoTicketDialog';
import DetalheTicket from './DetalheTicket';
import PainelAtendentes from './PainelAtendentes';

type Visao = 'fila' | 'quadro';

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
    assinar: {
      topico: `rt-tickets-${escopo ?? 'todas'}`,
      // Sem filtro no canal: a RLS já decide que linha chega, e um filtro por
      // empresa aqui esconderia justamente a outra fila de quem enxerga as duas.
      escutas: [{ tabela: 'tickets' }],
    },
    agrupamento: { esperaMs: 250, tetoMs: 1_200 },
  });

  const fotos = useFotosDePerfis(!!empresaId && acesso.podeVerAba);

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

  function mudar<K extends keyof CriteriosFila>(campo: K, valor: CriteriosFila[K]): void {
    setCriterios(c => ({ ...c, [campo]: valor }));
  }

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

  const visiveis = useMemo(() => {
    const filtrados = filtrarFila(tickets, criterios, meuId, agora);
    return ordenarFila(filtrados, preferencias.ordem, agora);
  }, [tickets, criterios, meuId, agora, preferencias.ordem]);

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
  const temFiltro =
    criterios.busca.trim() !== '' || !!criterios.status || !!criterios.categoria
    || !!criterios.prioridade || !!criterios.responsavel || !!criterios.empresaId;

  return (
    // `p-4 md:p-6`: o `<main>` do Layout não tem respiro próprio — cada tela põe
    // o dela. A altura desconta esse padding além do cabeçalho, senão a lista
    // rola por baixo da borda inferior.
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] min-h-0 p-4 md:p-6 gap-3">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Tickets</h1>
          <p className="text-xs text-muted-foreground">
            {acesso.podeAtender
              ? 'Você resolve tickets. Assuma o que for seu para receber as mensagens dele.'
              : 'Seus pedidos e os do seu setor.'}
            {atualizadoEm && (
              <span className="ml-1.5 text-muted-foreground/70">
                · atualizado {textoDeIdade(Math.max(0, agora - atualizadoEm))}
                {atualizando && ' · buscando…'}
              </span>
            )}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {acesso.podeAtender && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setPainelAberto(true)}>
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">
                {acesso.liberadoParaLideranca ? 'Aba liberada' : 'Aba fechada'}
              </span>
            </Button>
          )}
          {acesso.podeAbrir && (
            <Button size="sm" className="gap-1.5" onClick={() => setNovoAberto(true)}>
              <Plus className="w-4 h-4" /> Novo ticket
            </Button>
          )}
        </div>
      </div>

      {/* ── Contadores, que também são o filtro ──────────────────────────── */}
      <ResumoFila
        contagem={contagem}
        segmento={criterios.segmento}
        onEscolher={s => mudar('segmento', s as Segmento)}
        carregando={carregando}
      />

      {/* ── Filtros e modo de exibição ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
        <div className="relative flex-1 min-w-[10rem] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={buscaRef}
            value={criterios.busca}
            onChange={e => mudar('busca', e.target.value)}
            placeholder="Buscar por número, assunto ou pessoa…"
            className="h-8 pl-8 pr-7 text-xs"
          />
          {criterios.busca && (
            <button
              onClick={() => mudar('busca', '')}
              title="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <SeletorCurto
          valor={criterios.status ?? 'todos'}
          onMudar={v => mudar('status', v === 'todos' ? null : v as StatusTicket)}
          rotuloVazio="Todo estado"
          largura="w-36"
          opcoes={ORDEM_STATUS.map(s => ({ valor: s, label: STATUS_TICKET[s].label }))}
        />

        <SeletorCurto
          valor={criterios.categoria ?? 'todos'}
          onMudar={v => mudar('categoria', v === 'todos' ? null : v)}
          rotuloVazio="Toda categoria"
          largura="w-40"
          opcoes={CATEGORIAS.map(c => ({ valor: c.key, label: c.label }))}
        />

        <SeletorCurto
          valor={criterios.prioridade ?? 'todos'}
          onMudar={v => mudar('prioridade', v === 'todos' ? null : v as PrioridadeTicket)}
          rotuloVazio="Toda prioridade"
          largura="w-36"
          opcoes={(Object.keys(PRIORIDADES) as PrioridadeTicket[])
            .map(p => ({ valor: p, label: PRIORIDADES[p].label }))}
        />

        {responsaveis.length > 0 && (
          <SeletorCurto
            valor={criterios.responsavel ?? 'todos'}
            onMudar={v => mudar('responsavel', v === 'todos' ? null : v)}
            rotuloVazio="Qualquer responsável"
            largura="w-44"
            opcoes={[
              { valor: 'ninguem', label: 'Sem responsável' },
              ...responsaveis.map(r => ({ valor: r.id, label: r.nome })),
            ]}
          />
        )}

        {veDuasEmpresas && empresas.length > 1 && (
          <SeletorCurto
            valor={criterios.empresaId ?? 'todos'}
            onMudar={v => mudar('empresaId', v === 'todos' ? null : v)}
            rotuloVazio="As duas empresas"
            largura="w-40"
            opcoes={empresas.map(e => ({ valor: e.id, label: e.nome }))}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <SeletorCurto
            valor={preferencias.ordem}
            onMudar={v => setPreferencias(p => ({ ...p, ordem: v as Ordem }))}
            largura="w-44"
            opcoes={ORDENS.map(o => ({ valor: o.chave, label: o.label }))}
          />

          {preferencias.visao === 'fila' && (
            <SeletorCurto
              valor={preferencias.agrupar}
              onMudar={v => setPreferencias(p => ({ ...p, agrupar: v as Agrupamento }))}
              largura="w-40"
              opcoes={[
                { valor: 'nenhum',     label: 'Sem agrupar' },
                { valor: 'status',     label: 'Agrupar por estado' },
                { valor: 'prioridade', label: 'Agrupar por prioridade' },
                { valor: 'categoria',  label: 'Agrupar por categoria' },
              ]}
            />
          )}

          {/* O quadro divide a largura em quatro colunas; com um ticket aberto
              ao lado não sobraria espaço para nenhuma delas. */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <BotaoVisao
              ativo={preferencias.visao === 'fila'}
              onClick={() => setPreferencias(p => ({ ...p, visao: 'fila' }))}
              titulo="Ver como fila"
            >
              <Rows3 className="w-3.5 h-3.5" />
            </BotaoVisao>
            <BotaoVisao
              ativo={preferencias.visao === 'quadro'}
              onClick={() => { setPreferencias(p => ({ ...p, visao: 'quadro' })); fechar(); }}
              titulo="Ver como quadro"
            >
              <Columns3 className="w-3.5 h-3.5" />
            </BotaoVisao>
          </div>
        </div>
      </div>

      {/* ── Corpo ────────────────────────────────────────────────────────── */}
      {preferencias.visao === 'quadro' && !aberto ? (
        <QuadroTickets
          tickets={visiveis}
          fotos={fotos}
          selecionado={selecionado}
          onAbrir={abrir}
          onMover={acesso.podeAtender ? (id, s) => { void mover(id, s); } : null}
          agora={agora}
          nomeDaEmpresa={veDuasEmpresas ? nomeDaEmpresa : undefined}
        />
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          {/* Lista */}
          <div className={cn(
            'flex flex-col min-h-0',
            aberto ? 'hidden md:flex md:w-80 lg:w-96' : 'flex-1',
          )}>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1.5">
              {carregando && <EsqueletoFila />}

              {listaVazia && (
                <div className="text-center py-12 text-muted-foreground">
                  <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {temFiltro ? 'Nenhum ticket com esse recorte.' : 'Nenhum ticket por aqui.'}
                  </p>
                  {temFiltro && (
                    <Button variant="ghost" size="sm" className="mt-2 text-xs"
                      onClick={() => setCriterios({ ...CRITERIOS_VAZIOS, segmento: criterios.segmento })}>
                      Limpar filtros
                    </Button>
                  )}
                </div>
              )}

              {grupos.map(grupo => (
                <div key={grupo.chave || 'unico'} className="space-y-2">
                  {preferencias.agrupar !== 'nenhum' && (
                    <div className="flex items-center gap-2 pt-1.5 first:pt-0">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {rotuloDoGrupo(preferencias.agrupar, grupo.chave)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                        {grupo.tickets.length}
                      </span>
                      <span className="flex-1 h-px bg-border" />
                    </div>
                  )}

                  {/* `initial={false}` cobre a primeira pintura; `novos` cobre
                      o resto. Juntos, só se mexe o cartão que acabou de chegar. */}
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
          </div>

          {/* Ticket aberto */}
          {aberto && (
            <div className="flex-1 min-h-0 rounded-xl border border-border bg-card overflow-hidden">
              <DetalheTicket
                ticket={aberto}
                podeAtender={acesso.podeAtender}
                fotos={fotos}
                onFechar={fechar}
                onMudou={() => { void recarregar(); }}
              />
            </div>
          )}
        </div>
      )}

      <NovoTicketDialog aberto={novoAberto} onFechar={() => setNovoAberto(false)}
        onCriado={() => { void recarregar(); }} />
      <PainelAtendentes aberto={painelAberto} onFechar={() => setPainelAberto(false)}
        liberado={acesso.liberadoParaLideranca}
        onMudou={() => { acesso.recarregar(); void recarregar(); }} />
    </div>
  );
}

// ── Peças pequenas ───────────────────────────────────────────────────────────

/**
 * Um seletor de uma linha, com a opção "tudo" embutida.
 *
 * Existe porque a barra tem seis deles e o `<Select>` cru pede oito linhas de
 * JSX cada. `'todos'` é o valor sentinela: o Radix não aceita `value=""` num
 * `SelectItem` — ele o reserva para "sem seleção" e o item simplesmente não
 * aparece na lista.
 */
function SeletorCurto({
  valor, onMudar, opcoes, rotuloVazio, largura = 'w-36',
}: {
  valor: string;
  onMudar: (v: string) => void;
  opcoes: { valor: string; label: string }[];
  rotuloVazio?: string;
  largura?: string;
}) {
  return (
    <Select value={valor} onValueChange={onMudar}>
      <SelectTrigger className={cn('h-8 text-xs', largura)}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        {rotuloVazio && <SelectItem value="todos">{rotuloVazio}</SelectItem>}
        {opcoes.map(o => (
          <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BotaoVisao({
  ativo, onClick, titulo, children,
}: { ativo: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
      className={cn(
        'px-2.5 py-1.5 transition-colors',
        ativo ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

/**
 * O esqueleto da PRIMEIRA carga, e só dela.
 *
 * Ele existe para o caso em que não há nada guardado — a primeiríssima vez que
 * alguém abre a aba nesta sessão. Toda reabertura seguinte pinta o instantâneo
 * e nunca chega aqui.
 */
function EsqueletoFila() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border p-3 animate-pulse">
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-24 rounded bg-muted" />
              <div className="h-3.5 w-3/4 rounded bg-muted" />
              <div className="h-2.5 w-1/2 rounded bg-muted/60" />
            </div>
          </div>
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
