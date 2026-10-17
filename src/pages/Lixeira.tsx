/**
 * Lixeira.tsx
 * Exibe acordos excluídos (manual ou transferência de NR) armazenados em lixeira_acordos.
 * Acessível por líder e administrador via /admin/lixeira
 *
 * ## O desenho
 *
 * O mesmo vocabulário da Lixeira de Vendas e do extrato do Analítico: cabeçalho
 * com ícone neutro e filtro em `AbasSegmentadas`. A tela antiga tinha faixa em
 * degradê, três cartões coloridos que só contavam e as ações escondidas no
 * hover — o que no celular, sem hover, sumia com o botão de restaurar.
 *
 * A lista continua sendo a tabela do modelo antigo — uma coluna por informação,
 * com cabeçalho e larguras fixas —, porque foi o que se leu melhor: uma lista
 * em flex, sem colunas, deixava cada linha alinhar de um jeito e um vão no
 * meio. A tabela ganhou só as faixas de dia (Hoje, Ontem, data), da exclusão
 * mais recente para a mais antiga, com a quantidade e o total do dia. O prazo
 * só ganha cor quando aperta (vermelho com menos de 24 h, âmbar com menos de 48 h).
 */
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Trash2, RefreshCw, Search, ArrowRightLeft, X, Undo2, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  fetchLixeira, esvaziarLixeira, purgarExpirados, restaurarItemLixeira, LixeiraAcordo,
  ehTransferenciaLixeira, podeRestaurarItemLixeira, ROTULO_MOTIVO_LIXEIRA,
} from '@/services/lixeira.service';
import { useFechamentoMes } from '@/hooks/useFechamentoMes';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FiltroMotivo = 'todos' | 'exclusao' | 'transferencia';

const ABAS_MOTIVO: readonly AbaSegmentada<FiltroMotivo>[] = [
  { key: 'todos',         label: 'Todos',          Icon: Layers },
  { key: 'exclusao',      label: 'Exclusões',      Icon: Trash2 },
  { key: 'transferencia', label: 'Transferências', Icon: ArrowRightLeft },
];

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function tempoRestante(expiraEm?: string): string {
  if (!expiraEm) return '—';
  const diff = new Date(expiraEm).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const dias = Math.floor(diff / 86_400_000);
  if (dias > 1) return `${dias} dias`;
  const horas = Math.floor(diff / 3_600_000);
  if (horas > 0) return `${horas}h`;
  return 'Menos de 1h';
}

/** A cor do prazo: só pinta quando aperta. */
function tomDoPrazo(expiraEm?: string): string {
  if (!expiraEm) return 'text-muted-foreground';
  const diff = new Date(expiraEm).getTime() - Date.now();
  if (diff < 86_400_000) return 'text-destructive';
  if (diff < 2 * 86_400_000) return 'text-warning';
  return 'text-muted-foreground';
}

function textoDoPrazo(expiraEm?: string): string {
  const t = tempoRestante(expiraEm);
  if (t === '—') return 'sem prazo';
  if (t === 'Expirado') return 'expirado';
  return `some em ${t.toLowerCase()}`;
}

/** YYYY-MM-DD no fuso da máquina — o dia em que a pessoa viu o acordo sair. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rotuloDoDia(dia: string, hoje: string): { principal: string; detalhe: string } {
  const d = new Date(dia + 'T12:00:00');
  const ontem = new Date(hoje + 'T12:00:00');
  ontem.setDate(ontem.getDate() - 1);
  const dataCurta = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const semana = DIAS_SEMANA[d.getDay()];
  if (dia === hoje) return { principal: 'Hoje', detalhe: `${semana} · ${dataCurta}` };
  if (dia === diaLocal(ontem.toISOString())) return { principal: 'Ontem', detalhe: `${semana} · ${dataCurta}` };
  return { principal: dataCurta, detalhe: semana };
}

function hora(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function iniciais(nome: string): string {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

/** Primeiro e último nome: só o primeiro confunde (há várias Isabelas). */
function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0] ?? nome;
}

/**
 * O selo do motivo. Até 28/09/2026 só `transferencia_nr` era reconhecido, e a
 * transferência aprovada por pedido (`autorizacao_solicitada`) e a troca
 * Extra → Direto (`troca_extra`) apareciam como «Exclusão Manual».
 *
 * Exclusão é o caso comum e fica neutra; transferência é a exceção — o acordo
 * não volta — e leva o âmbar.
 */
function SeloMotivo({ motivo, className }: { motivo: string; className?: string }) {
  const base = cn('inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium leading-tight whitespace-nowrap', className);
  if (ehTransferenciaLixeira(motivo)) {
    return (
      <span
        className={cn(base, 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300')}
        title={ROTULO_MOTIVO_LIXEIRA[motivo] ?? 'Transferência'}
      >
        <ArrowRightLeft className="h-2.5 w-2.5" aria-hidden />
        {motivo === 'troca_extra' ? 'Extra → Direto' : 'Transferência'}
      </span>
    );
  }
  return <span className={cn(base, 'border-border bg-muted/50 text-muted-foreground')}>Exclusão</span>;
}

function Pessoa({ nome, foto, destaque }: { nome: string; foto?: string | null; destaque?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={nome}>
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarImage src={foto ?? undefined} alt={nome} />
        <AvatarFallback className="bg-muted text-[8px] font-semibold text-muted-foreground">
          {iniciais(nome)}
        </AvatarFallback>
      </Avatar>
      <span className={cn('truncate', destaque ? 'text-foreground' : 'text-muted-foreground')}>
        {nomeCurto(nome)}
      </span>
    </span>
  );
}

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

export default function Lixeira() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, loading: permissoesCarregando } = useCargoPermissoes();

  const [itens, setItens]               = useState<LixeiraAcordo[]>([]);
  const [loading, setLoading]           = useState(true);
  const [busca, setBusca]               = useState('');
  const [filtro, setFiltro]             = useState<FiltroMotivo>('todos');
  const [detalhe, setDetalhe]           = useState<LixeiraAcordo | null>(null);
  const [confirmEsvaziar, setConfirmEsvaziar] = useState(false);
  const [esvaziando, setEsvaziando]     = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);
  const [fotoMap, setFotoMap]           = useState<Record<string, string | null>>({});

  const podeAcessar = temPermissao('ver_lixeira');

  /*
   * Acoes proprias da aba.
   *
   * `podeEsvaziar` era `podeAcessar`: quem enxergava a lixeira podia apaga-la
   * inteira. Agora e chave propria — mas ela NASCE ligada para todo cargo que
   * tem `ver_lixeira` hoje, entao ninguem perde a acao nesta entrega. Derivar
   * de `excluir_em_lote`, como cheguei a considerar, teria tirado o esvaziar
   * da ouvidoria da BookPlay e da gerencia da PaguePlay.
   */
  const podeEsvaziar  = temPermissao('lixeira_limpar');
  const podeRestaurar = temPermissao('lixeira_restaurar');

  /*
   * Escopo DESTA aba, e de nenhuma outra.
   *
   * Antes vinha de `ver_acordos_gerais`, a mesma chave que decidia Acordos e
   * Dashboard — mexer no alcance de uma mexia nas tres. Agora a Lixeira
   * responde so pelas chaves `lixeira_escopo_*`.
   *
   * `equipe`, `setor` e `todos_setores` ainda produzem a mesma consulta: sem
   * recorte por operador, deixando o teto do RLS decidir — que e exatamente o
   * que a tela faz hoje. Eles passam a se distinguir quando a aba ganhar
   * filtro proprio e quando o teto subir. Ver o projeto em docs/.
   */
  const escopo = escopoEfetivo('lixeira', temPermissao);
  const soOsProprios = escopo === 'individual' || escopo === null;

  /*
   * Quem restaura o quê — a mesma regra de `fn_lixeira_restaurar` no banco:
   * transferência nunca; quem vê só os próprios restaura só o que ELE
   * excluiu; a liderança devolve o acordo à pessoa (o banco confere o alcance).
   */
  const podeRestaurarItem = (item: LixeiraAcordo) =>
    podeRestaurarItemLixeira(item, { meuId: perfil?.id, temChave: podeRestaurar, soOsProprios });

  // O mesmo cadeado de mês fechado da exclusão: devolver um acordo mexe no mês dele.
  const fechamento = useFechamentoMes(null);

  const carregar = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      // Purga lazy: antes de listar, remove permanentemente os itens cujo
      // expira_em já passou (prazo padrão de 3 dias). Evita que o usuário
      // veja itens com status "expirado" que já deveriam ter sido excluídos.
      // Idealmente deveria existir um job pg_cron no Supabase; aqui fica
      // como garantia de funcionalidade client-side.
      await purgarExpirados(empresa.id);
      // Escopo individual recorta por pessoa; qualquer nivel acima entrega o que
      // o RLS permitir, como sempre foi.
      const data = await fetchLixeira(
        empresa.id,
        soOsProprios && perfil?.id ? { operadorId: perfil.id } : undefined,
      );
      setItens(data);

      // Buscar foto_url dos perfis para os operadores presentes na lista
      const ids = [
        ...new Set([
          ...data.map((i: LixeiraAcordo) => i.operador_id).filter(Boolean),
          ...data.map((i: LixeiraAcordo) => i.transferido_para_id).filter(Boolean),
        ]),
      ] as string[];
      if (ids.length > 0) {
        const { data: perfis } = await supabase
          .from('perfis')
          .select('id, foto_url')
          .in('id', ids);
        const map: Record<string, string | null> = {};
        (perfis ?? []).forEach((p: { id: string; foto_url?: string | null }) => {
          map[p.id] = p.foto_url ?? null;
        });
        setFotoMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, soOsProprios, perfil?.id]);

  async function handleEsvaziar() {
    if (!empresa?.id) return;
    setEsvaziando(true);
    const { ok, error } = await esvaziarLixeira(empresa.id);
    setEsvaziando(false);
    setConfirmEsvaziar(false);
    if (ok) {
      setItens([]);
      toast.success('Lixeira esvaziada.');
    } else {
      toast.error('Erro ao esvaziar lixeira: ' + error);
    }
  }

  async function handleRestaurar(item: LixeiraAcordo) {
    if (restaurandoId) return;
    if (!podeRestaurarItem(item)) return;
    if (fechamento.impedirData(item.vencimento, 'restaurar o acordo')) return;
    setRestaurandoId(item.id);
    const { ok, error, operadorNome } = await restaurarItemLixeira(item);
    setRestaurandoId(null);
    if (ok) {
      setItens(prev => prev.filter(i => i.id !== item.id));
      setDetalhe(d => (d?.id === item.id ? null : d));
      const dono = operadorNome ?? item.operador_nome;
      toast.success(dono && dono !== perfil?.nome
        ? `Acordo restaurado — voltou para ${dono}, que foi avisado.`
        : 'Acordo restaurado — voltou para a sua lista.');
    } else {
      toast.error(error ?? 'Não foi possível restaurar o acordo.', { duration: 7000 });
    }
  }

  /*
   * Esperar as permissões antes da primeira busca.
   *
   * `escopo` sai de `temPermissao`, que responde `false` enquanto as chaves
   * carregam — `soOsProprios` nascia `true`. Com o efeito preso só a
   * `empresa?.id`, a lista buscava recortada pela pessoa e não buscava de
   * novo quando o escopo real chegava: a gerência abria a Lixeira e via só
   * os próprios itens até clicar em recarregar.
   */
  useEffect(() => {
    if (!permissoesCarregando) carregar();
  }, [carregar, permissoesCarregando]);

  const encontrados = useMemo(() => itens.filter(item => {
    // Defesa em profundidade: se por qualquer motivo a purga server-side
    // falhou, não mostra itens cujo expira_em já passou.
    if (item.expira_em && new Date(item.expira_em).getTime() < Date.now()) return false;
    if (!busca.trim()) return true;
    const b = busca.toLowerCase();
    return (
      item.nr_cliente?.toLowerCase().includes(b) ||
      item.nome_cliente?.toLowerCase().includes(b) ||
      item.operador_nome?.toLowerCase().includes(b) ||
      item.transferido_para_nome?.toLowerCase().includes(b) ||
      (item as { instituicao?: string | null }).instituicao?.toLowerCase().includes(b)
    );
  }), [itens, busca]);

  const itensFiltrados = useMemo(() => encontrados.filter(item => {
    if (filtro === 'todos') return true;
    return (filtro === 'transferencia') === ehTransferenciaLixeira(item.motivo);
  }), [encontrados, filtro]);

  const valorTotal = useMemo(
    () => itensFiltrados.reduce((s, i) => s + (Number(i.valor) || 0), 0),
    [itensFiltrados],
  );

  const hoje = diaLocal(new Date().toISOString());
  const dias = useMemo(() => {
    const grupos = new Map<string, LixeiraAcordo[]>();
    for (const item of itensFiltrados) {
      const dia = item.excluido_em ? diaLocal(item.excluido_em) : 'sem-data';
      const lista = grupos.get(dia);
      if (lista) lista.push(item); else grupos.set(dia, [item]);
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => (a === 'sem-data' ? 1 : b === 'sem-data' ? -1 : b.localeCompare(a)))
      .map(([dia, lista]) => {
        lista.sort((a, b) => (b.excluido_em ?? '').localeCompare(a.excluido_em ?? ''));
        const total = lista.reduce((s, i) => s + (Number(i.valor) || 0), 0);
        return { dia, lista, total };
      });
  }, [itensFiltrados]);

  if (!podeAcessar) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground text-sm">Acesso restrito.</p>
      </div>
    );
  }

  const filtrando = busca.trim() !== '' || filtro !== 'todos';
  const qtd = itensFiltrados.length;

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 md:p-6">
      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <Trash2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Lixeira de Acordos</h1>
            <p className="text-[12px] text-muted-foreground">
              {loading
                ? 'Carregando…'
                : qtd === 0 && !filtrando
                  ? 'Acordos excluídos ficam 3 dias aqui antes de sumir'
                  : `${qtd} ${qtd === 1 ? 'acordo' : 'acordos'} · ${formatCurrency(valorTotal)} · cada um fica 3 dias`}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="NR, cliente ou operador"
              aria-label="Buscar na lixeira"
              className="h-8 w-full pl-8 sm:w-[240px] pr-7 text-[12px]"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={carregar} disabled={loading} aria-label="Recarregar"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {podeEsvaziar && itens.length > 0 && (
            <Button
              variant="ghost" size="sm"
              onClick={() => setConfirmEsvaziar(true)}
              className="h-8 gap-1.5 text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Esvaziar
            </Button>
          )}
        </div>
      </div>

      <AbasSegmentadas rotulo="Motivo" abas={ABAS_MOTIVO} ativa={filtro} onTrocar={(k: FiltroMotivo) => setFiltro(k)} />

      {/* ── Lista ── */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : qtd === 0 ? (
        <div className="rounded-xl border border-border bg-card px-3 py-10 text-center text-[12px] text-muted-foreground">
          {filtrando ? (
            <>
              <p>Nada na lixeira com esse filtro.</p>
              <button
                type="button"
                onClick={() => { setBusca(''); setFiltro('todos'); }}
                className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/5"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            </>
          ) : (
            <p>A lixeira está vazia. É o estado bom.</p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/*
            Desktop: tabela de verdade, como era antes — uma coluna por
            informação, com cabeçalho, e larguras fixas (`table-fixed`) para
            que NR, motivo, pessoas, horário e valor caiam no mesmo lugar em
            todas as linhas e em todos os dias. O cliente fica com o que sobra.
          */}
          {/* `relative`: sem ele o «Ações» só-leitor-de-tela (absolute) escapa da rolagem e alarga a página. */}
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full min-w-[972px] table-fixed text-[12px] min-[1440px]:min-w-[1128px]">
              <colgroup>
                <col className="w-[96px]" />
                <col />
                <col className="w-[116px]" />
                <col className="w-[148px]" />
                {/*
                  Abaixo de 1440 px o destino fica só no detalhe: o cliente precisa do
                  espaço. A coluna encolhe para largura 0 em vez de sumir — uma <col>
                  com `hidden` vira coluna automática e divide a sobra com o Cliente,
                  e uma <td> com `hidden` sai da linha e empurra as seguintes uma casa.
                */}
                <col className="w-0 min-[1440px]:w-[156px]" />
                <col className="w-[72px]" />
                <col className="w-[84px]" />
                <col className="w-[112px]" />
                {podeRestaurar && <col className="w-[104px]" />}
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-wider whitespace-nowrap text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-semibold">NR</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Cliente</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Motivo</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Operador</th>
                  <th scope="col" className="overflow-hidden p-0 font-semibold min-[1440px]:px-3 min-[1440px]:py-2">
                    <span className="hidden min-[1440px]:inline">Transferido para</span>
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">Excluído</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Some em</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Valor</th>
                  {podeRestaurar && <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              {dias.map(({ dia, lista, total }) => {
                const rotulo = dia === 'sem-data' ? { principal: 'Sem data', detalhe: '' } : rotuloDoDia(dia, hoje);
                return (
                  <tbody key={dia} aria-label={`Excluídos em ${rotulo.principal}`}>
                    <tr className="border-b border-border/70 bg-muted/35">
                      <td colSpan={podeRestaurar ? 9 : 8} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{rotulo.principal}</span>
                          {rotulo.detalhe && <span className="text-[11px] text-muted-foreground">{rotulo.detalhe}</span>}
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {lista.length} {lista.length === 1 ? 'acordo' : 'acordos'}
                          </span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {formatCurrency(total)}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {lista.map(item => {
                      const restaurando = restaurandoId === item.id;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setDetalhe(item)}
                          className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30"
                        >
                          <td className="truncate px-3 py-2 font-mono tabular-nums text-muted-foreground">
                            {item.nr_cliente || item.instituicao || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {/* O botão é o caminho do teclado; o clique na linha inteira, o do mouse. */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setDetalhe(item); }}
                              title={item.nome_cliente || undefined}
                              className="block w-full truncate rounded-sm text-left text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {item.nome_cliente || <span className="text-muted-foreground">sem cliente</span>}
                            </button>
                          </td>
                          <td className="px-3 py-2"><SeloMotivo motivo={item.motivo} /></td>
                          <td className="px-3 py-2">
                            {item.operador_nome
                              ? <Pessoa nome={item.operador_nome} foto={item.operador_id ? fotoMap[item.operador_id] : null} />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="overflow-hidden p-0 min-[1440px]:px-3 min-[1440px]:py-2">
                            <div className="hidden min-[1440px]:block">
                              {item.transferido_para_nome
                                ? <Pessoa nome={item.transferido_para_nome} foto={item.transferido_para_id ? fotoMap[item.transferido_para_id] : null} destaque />
                                : <span className="text-muted-foreground/60">—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{hora(item.excluido_em) || '—'}</td>
                          <td className={cn('px-3 py-2 font-medium', tomDoPrazo(item.expira_em))}>
                            {tempoRestante(item.expira_em).toLowerCase()}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                            {item.valor ? formatCurrency(item.valor) : '—'}
                          </td>
                          {podeRestaurar && (
                            <td className="px-3 py-1.5 text-right">
                              {podeRestaurarItem(item) && (
                                <Button
                                  size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]"
                                  disabled={restaurando}
                                  onClick={e => { e.stopPropagation(); handleRestaurar(item); }}
                                  title={`Restaurar — volta para ${item.operador_nome ?? 'o operador'}`}
                                >
                                  <Undo2 className={cn('h-3.5 w-3.5', restaurando && 'animate-spin')} />
                                  Restaurar
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>

          {/* Celular: tabela não cabe; cada acordo vira duas linhas. */}
          <div className="md:hidden">
            {dias.map(({ dia, lista, total }) => {
              const rotulo = dia === 'sem-data' ? { principal: 'Sem data', detalhe: '' } : rotuloDoDia(dia, hoje);
              return (
                <section key={dia} aria-label={`Excluídos em ${rotulo.principal}`}>
                  <header className="flex items-center gap-2 border-b border-border/70 bg-muted/35 px-3 py-1.5">
                    <span className="text-xs font-semibold text-foreground">{rotulo.principal}</span>
                    {rotulo.detalhe && <span className="text-[11px] text-muted-foreground">{rotulo.detalhe}</span>}
                    <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-foreground">
                      {formatCurrency(total)}
                    </span>
                  </header>
                  <ul className="divide-y divide-border/70">
                    {lista.map(item => {
                      const restaurando = restaurandoId === item.id;
                      return (
                        <li key={item.id} className="flex items-center gap-2 pr-3">
                          <button
                            type="button"
                            onClick={() => setDetalhe(item)}
                            className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-foreground">
                                {item.nome_cliente || <span className="text-muted-foreground">sem cliente</span>}
                              </span>
                              <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                                {item.nr_cliente || item.instituicao || '—'} · {hora(item.excluido_em)}
                                <SeloMotivo motivo={item.motivo} className="font-sans" />
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-mono text-[13px] font-semibold tabular-nums text-foreground">
                                {item.valor ? formatCurrency(item.valor) : '—'}
                              </span>
                              <span className={cn('block text-[11px]', tomDoPrazo(item.expira_em))}>
                                {textoDoPrazo(item.expira_em)}
                              </span>
                            </span>
                          </button>
                          {podeRestaurarItem(item) ? (
                            <Button
                              size="icon" variant="outline" className="h-8 w-8 shrink-0"
                              disabled={restaurando}
                              onClick={() => handleRestaurar(item)}
                              aria-label={`Restaurar — volta para ${item.operador_nome ?? 'o operador'}`}
                            >
                              <Undo2 className={cn('h-3.5 w-3.5', restaurando && 'animate-spin')} />
                            </Button>
                          ) : podeRestaurar ? (
                            // Guarda o lugar do botão: sem ele o valor desta linha sai da coluna.
                            <span className="w-8 shrink-0" aria-hidden />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Detalhe ── */}
      <Dialog open={!!detalhe} onOpenChange={open => { if (!open) setDetalhe(null); }}>
        <DialogContent className="max-w-[460px] gap-0 p-0" aria-describedby="lixeira-dlg-desc">
          {detalhe && (
            <>
              <div className="space-y-1.5 px-5 pb-4 pt-5 pr-10">
                <SeloMotivo motivo={detalhe.motivo} />
                <DialogTitle className="text-base font-semibold leading-tight">
                  {detalhe.nome_cliente || 'Acordo sem cliente'}
                </DialogTitle>
                <DialogDescription id="lixeira-dlg-desc" className="text-[12px]">
                  <span className="font-mono tabular-nums">{detalhe.nr_cliente || detalhe.instituicao || '—'}</span>
                  {' · '}
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {detalhe.valor ? formatCurrency(detalhe.valor) : '—'}
                  </span>
                </DialogDescription>
              </div>

              <div className="space-y-4 border-t border-border px-5 py-4">
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
                  <Campo rotulo="Vencimento">{detalhe.vencimento ? formatDate(detalhe.vencimento) : '—'}</Campo>
                  <Campo rotulo="Status anterior">{detalhe.status || '—'}</Campo>
                  <Campo rotulo="Tipo">{detalhe.tipo || '—'}</Campo>
                </dl>

                <div className="space-y-1 text-[12px] text-muted-foreground">
                  {ehTransferenciaLixeira(detalhe.motivo) ? (
                    <>
                      <p className="text-foreground">
                        {ROTULO_MOTIVO_LIXEIRA[detalhe.motivo] ?? 'Transferência'}:{' '}
                        <strong className="font-medium">{detalhe.operador_nome || '—'}</strong>
                        {' → '}
                        <strong className="font-medium">{detalhe.transferido_para_nome || '—'}</strong>
                      </p>
                      {detalhe.autorizado_por_nome && <p>Autorizado por {detalhe.autorizado_por_nome}.</p>}
                      <p>Transferência não se restaura pela lixeira: o acordo já é de outra pessoa.</p>
                    </>
                  ) : (
                    <p>
                      Excluído por <strong className="font-medium text-foreground">{detalhe.excluido_por_nome || '—'}</strong>
                      {detalhe.operador_nome && detalhe.excluido_por_nome !== detalhe.operador_nome
                        ? <> · o acordo é de <strong className="font-medium text-foreground">{detalhe.operador_nome}</strong></>
                        : null}
                    </p>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/40 px-3 py-2.5">
                  <Campo rotulo="Excluído em">
                    {detalhe.excluido_em ? new Date(detalhe.excluido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </Campo>
                  <Campo rotulo="Some em">
                    <span className={cn('font-medium', tomDoPrazo(detalhe.expira_em))}>
                      {detalhe.expira_em ? new Date(detalhe.expira_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </span>
                    {detalhe.expira_em && (
                      <span className="ml-1 text-[11px] text-muted-foreground">({tempoRestante(detalhe.expira_em).toLowerCase()})</span>
                    )}
                  </Campo>
                </dl>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button
                  variant="ghost" size="sm" className="h-8 text-[12px]"
                  onClick={() => setDetalhe(null)}
                  disabled={restaurandoId === detalhe.id}
                >
                  Fechar
                </Button>
                {podeRestaurarItem(detalhe) && (
                  <Button
                    size="sm" className="h-8 gap-1.5 text-[12px]"
                    onClick={() => handleRestaurar(detalhe)}
                    disabled={restaurandoId === detalhe.id}
                  >
                    <Undo2 className={cn('h-3.5 w-3.5', restaurandoId === detalhe.id && 'animate-spin')} />
                    {restaurandoId === detalhe.id ? 'Restaurando…' : 'Restaurar acordo'}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Esvaziar ── */}
      <Dialog open={confirmEsvaziar} onOpenChange={setConfirmEsvaziar}>
        <DialogContent className="max-w-[400px] gap-0 p-0" aria-describedby="dlg-esvaziar-desc">
          <div className="space-y-2 px-5 pb-4 pt-5 pr-10">
            <DialogTitle className="text-base font-semibold">Esvaziar a lixeira?</DialogTitle>
            <DialogDescription id="dlg-esvaziar-desc" className="text-[12px] leading-relaxed">
              {itens.length === 1 ? 'O acordo' : `Os ${itens.length} acordos`} da lixeira{' '}
              {itens.length === 1 ? 'será excluído' : 'serão excluídos'} de vez.{' '}
              <strong className="font-medium text-foreground">Não dá para recuperar depois.</strong>
            </DialogDescription>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              variant="ghost" size="sm" className="h-8 text-[12px]"
              onClick={() => setConfirmEsvaziar(false)}
              disabled={esvaziando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 text-[12px]"
              onClick={handleEsvaziar}
              disabled={esvaziando}
            >
              {esvaziando
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              {esvaziando ? 'Esvaziando…' : `Esvaziar ${itens.length} ${itens.length === 1 ? 'acordo' : 'acordos'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
