/**
 * Tickets — a fila de pedidos da liderança para quem desenvolve.
 *
 * Lista à esquerda, ticket aberto à direita. A lista é a única coisa que o
 * banco recorta por permissão: a RLS devolve o que a pessoa pode ver, e a tela
 * nunca precisa perguntar "de que setor é este?".
 *
 * O filtro padrão esconde o que já fechou. Uma fila que mostra concluído junto
 * com aberto deixa de ser fila em duas semanas.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ShieldCheck, Inbox, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTicketsAcesso } from '@/hooks/useTicketsAcesso';
import { assinarTabela } from '@/lib/realtime';
import { perfilVeDuasEmpresas } from '@/services/acessoMultiempresa.service';
import { fetchEmpresas } from '@/services/empresas.service';
import {
  listarTickets, buscarFotosDosPerfis, paraTicket, type Ticket,
} from '@/services/tickets.service';
import {
  STATUS_TICKET, STATUS_FECHADOS, PRIORIDADES, CATEGORIAS, rotuloCategoria,
  type StatusTicket,
} from './categorias';
import NovoTicketDialog from './NovoTicketDialog';
import DetalheTicket from './DetalheTicket';
import PainelAtendentes from './PainelAtendentes';

type FiltroStatus = 'abertos' | 'todos' | StatusTicket;

export default function Tickets() {
  const { empresa } = useEmpresa();
  const { perfil } = useAuth();
  const acesso = useTicketsAcesso();
  const [params, setParams] = useSearchParams();
  const empresaId = empresa?.id ?? null;

  // Quem responde pelas duas empresas vê as duas listas de uma vez. Trocar a
  // empresa ativa para conferir a fila da outra é um caminho ruim: muda o
  // contexto do sistema inteiro para responder uma pergunta de uma aba só.
  const veDuasEmpresas = perfilVeDuasEmpresas(perfil as Parameters<typeof perfilVeDuasEmpresas>[0]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [fotos, setFotos] = useState<Map<string, string | null>>(new Map());
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('todas');
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(params.get('ticket'));
  const [filtro, setFiltro] = useState<FiltroStatus>('abertos');
  const [categoria, setCategoria] = useState('todas');
  const [busca, setBusca] = useState('');
  const [novoAberto, setNovoAberto] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);
  const [versao, setVersao] = useState(0);

  // `null` = sem filtro de empresa na consulta; a RLS resolve o resto.
  const escopo = veDuasEmpresas ? null : empresaId;

  useEffect(() => {
    if (!veDuasEmpresas) return;
    let vivo = true;
    (async () => {
      const lista = await fetchEmpresas();
      if (vivo) setEmpresas((lista ?? []).map(e => ({ id: e.id, nome: e.nome })));
    })();
    return () => { vivo = false; };
  }, [veDuasEmpresas]);

  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    setCarregando(true);
    (async () => {
      const [lista, mapaFotos] = await Promise.all([
        listarTickets(escopo), buscarFotosDosPerfis(),
      ]);
      if (!vivo) return;
      setTickets(lista);
      setFotos(mapaFotos);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [empresaId, escopo, versao]);

  /*
   * Tempo real na lista.
   *
   * Sem isto o card só mudava quando quem estava olhando fazia alguma coisa —
   * um ticket assumido do outro lado continuava aparecendo como "sem
   * responsável" até alguém apertar algo. Não há filtro no canal: a RLS já
   * decide que linha chega, e um filtro por empresa aqui esconderia justamente
   * a outra fila de quem enxerga as duas.
   */
  useEffect(() => {
    if (!empresaId) return;
    return assinarTabela(
      { topico: `rt-tickets-${escopo ?? 'todas'}`, escutas: [{ tabela: 'tickets' }] },
      {
        onEvento: (payload) => {
          const bruto = (payload.eventType === 'DELETE' ? payload.old : payload.new) as
            Record<string, unknown> | null;
          const id = bruto?.id ? String(bruto.id) : '';
          if (!id) return;
          setTickets(atual => {
            if (payload.eventType === 'DELETE') return atual.filter(t => t.id !== id);
            const proximo = paraTicket(bruto);
            if (escopo && proximo.empresaId !== escopo) return atual;
            const indice = atual.findIndex(t => t.id === id);
            if (indice < 0) return [proximo, ...atual];
            const lista = [...atual];
            lista[indice] = proximo;
            return lista;
          });
        },
        onReconectado: () => setVersao(v => v + 1),
      },
    );
  }, [empresaId, escopo]);

  // A notificação leva `?ticket=<id>`: quem clica cai no ticket aberto, e não
  // numa lista onde ainda teria que procurar do que se tratava.
  useEffect(() => {
    const alvo = params.get('ticket');
    if (alvo) setSelecionado(alvo);
  }, [params]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return tickets.filter(k => {
      if (filtro === 'abertos' && STATUS_FECHADOS.includes(k.status)) return false;
      if (filtro !== 'abertos' && filtro !== 'todos' && k.status !== filtro) return false;
      if (categoria !== 'todas' && k.categoria !== categoria) return false;
      if (filtroEmpresa !== 'todas' && k.empresaId !== filtroEmpresa) return false;
      if (t && !(
        k.assunto.toLowerCase().includes(t)
        || String(k.numero).includes(t)
        || (k.abertoPorNome ?? '').toLowerCase().includes(t)
      )) return false;
      return true;
    });
  }, [tickets, filtro, categoria, busca, filtroEmpresa]);

  const nomeDaEmpresa = useMemo(
    () => new Map(empresas.map(e => [e.id, e.nome])),
    [empresas],
  );

  const aberto = useMemo(
    () => tickets.find(t => t.id === selecionado) ?? null,
    [tickets, selecionado],
  );

  /** Clicar no card abre; clicar no mesmo card de novo fecha e volta à lista larga. */
  function alternar(id: string) {
    const fechando = selecionado === id;
    setSelecionado(fechando ? null : id);
    const p = new URLSearchParams(params);
    if (fechando) p.delete('ticket'); else p.set('ticket', id);
    setParams(p, { replace: true });
  }

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

  return (
    // `p-4 md:p-6`: o `<main>` do Layout não tem respiro próprio — cada tela
    // põe o dela, como em Solicitar Atendimento. A altura desconta esse padding
    // além do cabeçalho, senão a lista rola por baixo da borda inferior.
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] min-h-0 p-4 md:p-6">
      {/* ── Barra superior ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold leading-tight">Tickets</h1>
          <p className="text-xs text-muted-foreground">
            {acesso.podeAtender
              ? 'Você resolve tickets. Assuma o que for seu para receber as mensagens dele.'
              : 'Seus pedidos e os do seu setor.'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {acesso.podeGerenciar && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setPainelAberto(true)}>
              <ShieldCheck className="w-4 h-4" />
              {acesso.liberadoParaLideranca ? 'Aba liberada' : 'Aba fechada'}
            </Button>
          )}
          {acesso.podeAbrir && (
            <Button size="sm" className="gap-1.5" onClick={() => setNovoAberto(true)}>
              <Plus className="w-4 h-4" /> Novo ticket
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 pt-4">
        {/* ── Lista ──────────────────────────────────────────────────────── */}
        <div className={`flex flex-col min-h-0 ${aberto ? 'hidden md:flex md:w-80' : 'flex-1'}`}>
          <div className="flex items-center gap-2 pb-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar…" className="h-8 pl-8 text-xs" />
            </div>
            <Select value={filtro} onValueChange={v => setFiltro(v as FiltroStatus)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="abertos">Em aberto</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
                {(Object.keys(STATUS_TICKET) as StatusTicket[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_TICKET[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="todas">Toda categoria</SelectItem>
                {CATEGORIAS.map(c => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {veDuasEmpresas && empresas.length > 1 && (
              <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">As duas empresas</SelectItem>
                  {empresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {carregando && (
              <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
            )}
            {!carregando && !visiveis.length && (
              <div className="text-center py-10 text-muted-foreground">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum ticket por aqui.</p>
              </div>
            )}
            {visiveis.map(t => (
              <button key={t.id} onClick={() => alternar(t.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  t.id === selecionado
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}>
                <div className="flex gap-2.5">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={fotos.get(t.abertoPor) ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {iniciais(t.abertoPorNome)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">#{t.numero}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_TICKET[t.status].cor}`}>
                        {STATUS_TICKET[t.status].label}
                      </span>
                      {t.prioridade !== 'normal' && (
                        <span className={`text-[10px] ${PRIORIDADES[t.prioridade].cor}`}>
                          {PRIORIDADES[t.prioridade].label}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {quando(t.criadoEm)}
                      </span>
                    </div>

                    <p className="text-sm font-medium leading-tight mt-1 truncate">{t.assunto}</p>

                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.abertoPorNome ?? 'alguém'} · {rotuloCategoria(t.categoria)}
                      {veDuasEmpresas && nomeDaEmpresa.get(t.empresaId)
                        ? ` · ${nomeDaEmpresa.get(t.empresaId)}` : ''}
                    </p>

                    {/* Quem está com o ticket é a pergunta que mais se repete
                        na fila — vale a linha própria, com a cara da pessoa. */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {t.responsavelId ? (
                        <>
                          <Avatar className="w-4 h-4">
                            <AvatarImage src={fotos.get(t.responsavelId) ?? undefined} />
                            <AvatarFallback className="text-[8px]">
                              {iniciais(t.responsavelNome)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[11px] text-muted-foreground truncate">
                            com {t.responsavelNome}
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-amber-600">Sem responsável</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Ticket aberto ──────────────────────────────────────────────── */}
        {aberto && (
          <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
            <div className="md:hidden p-2 border-b border-border">
              <Button variant="ghost" size="sm" onClick={() => setSelecionado(null)}>
                ← Voltar à lista
              </Button>
            </div>
            <DetalheTicket
              ticket={aberto}
              podeAtender={acesso.podeAtender}
              onMudou={() => setVersao(v => v + 1)}
            />
          </div>
        )}
      </div>

      <NovoTicketDialog aberto={novoAberto} onFechar={() => setNovoAberto(false)}
        onCriado={() => setVersao(v => v + 1)} />
      <PainelAtendentes aberto={painelAberto} onFechar={() => setPainelAberto(false)}
        liberado={acesso.liberadoParaLideranca}
        onMudou={() => { acesso.recarregar(); setVersao(v => v + 1); }} />
    </div>
  );
}

function iniciais(nome: string | null): string {
  return (nome ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/** Hoje mostra a hora; antes disso, o dia — o que a pessoa procura no card. */
function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
