/**
 * PremiacoesComissoes — a segunda aba do Fechamento.
 *
 * O «Relatório de Premiações e Comissões» que circulava em Excel (Crachá · Nome
 * · Setor · Comissão · Premiação · Obs.), agora com a premiação de quem já bateu
 * calculada sozinha. Birigui preenche Premiação e Marília Comissão, pelo vínculo
 * setor → cidade do RH Gestão. Ver `calculoPremiacoes.ts`.
 *
 * A única coisa que se escreve aqui é o CRACHÁ, com a mesma permissão de quem
 * preenche D.U. e situação (`fechamento_editar`). Ele grava na tabela do RH, e
 * chega pronto lá quando o RH Gestão entrar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, BadgeCheck, CircleDollarSign, FileSpreadsheet, IdCard, Info, List, Loader2,
  RefreshCw, Search, TriangleAlert, Trophy, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile } from '@/components/KpiTile';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { usePremiacoesComissoes } from '@/hooks/usePremiacoesComissoes';
import { formatBRL } from '@/lib/money';
import { ehMesAtual, rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  lerCracha, ROTULO_TIPO, type LinhaPremiacao, type TipoRemuneracao,
} from '@/services/premiacoes/calculoPremiacoes';
import { baixarPremiacoes } from '@/services/premiacoes/baixarPremiacoes';

type Filtro = 'todos' | 'bateram' | 'sem_cracha';

const COR_TIPO: Record<TipoRemuneracao, string> = {
  premiacao: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
  comissao: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
};

function Aviso({ tom, children }: { tom: 'alerta' | 'info'; children: React.ReactNode }) {
  const Icone = tom === 'alerta' ? TriangleAlert : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]',
      tom === 'alerta'
        ? 'border-amber-500/40 bg-amber-500/5 text-foreground'
        : 'border-border bg-muted/30 text-muted-foreground',
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Célula de valor: vazio não é zero. */
function Valor({ valor, faixa }: { valor: number | null; faixa: number | null }) {
  if (valor === null) return <span className="text-muted-foreground/60">—</span>;
  if (valor <= 0) return <span className="text-muted-foreground">{formatBRL(0)}</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {faixa !== null && (
        <span className="rounded-full bg-success/12 px-1.5 py-0.5 text-[9px] font-bold text-success">
          {faixa}ª
        </span>
      )}
      <span className="font-semibold text-success">{formatBRL(valor)}</span>
    </span>
  );
}

interface PropsCracha {
  linha: LinhaPremiacao;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (cracha: string | null) => void;
  onInvalido: (mensagem: string) => void;
}

/** Grava ao sair do campo ou no Enter; Esc devolve o salvo — como o D.U. do Fechamento. */
function CampoCracha({ linha: l, podeEditar, salvando, onSalvar, onInvalido }: PropsCracha) {
  const salvo = l.cracha ?? '';
  const [rascunho, setRascunho] = useState(salvo);
  const [editando, setEditando] = useState(false);
  const cancelou = useRef(false);

  useEffect(() => { if (!editando) setRascunho(salvo); }, [salvo, editando]);

  if (!podeEditar) {
    return l.cracha
      ? <span className="font-mono tabular-nums">{l.cracha}</span>
      : <span className="text-muted-foreground/60">—</span>;
  }

  function confirmar() {
    setEditando(false);
    if (cancelou.current) { cancelou.current = false; setRascunho(salvo); return; }
    const valor = lerCracha(rascunho);
    if (valor === undefined) {
      onInvalido('Crachá: use só números e letras, até 20 caracteres.');
      setRascunho(salvo);
      return;
    }
    if ((valor ?? '') === salvo) return;
    onSalvar(valor);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        aria-label={`Crachá de ${l.nome}`}
        value={rascunho}
        placeholder="—"
        disabled={salvando}
        onFocus={() => setEditando(true)}
        onChange={e => setRascunho(e.target.value.slice(0, 20))}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { cancelou.current = true; (e.target as HTMLInputElement).blur(); }
        }}
        className={cn(
          'h-7 w-[92px] rounded-md border bg-background px-2 text-center font-mono text-[11px] tabular-nums',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          l.cracha ? 'border-border' : 'border-dashed border-amber-500/50',
        )}
      />
      {salvando && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Salvando" />}
    </div>
  );
}

const CABECALHO: { rotulo: string; alinhamento: string; dica?: string }[] = [
  { rotulo: 'CRACHÁ', alinhamento: 'text-center', dica: 'Crachá do RH — o mesmo que o RH Gestão vai ler' },
  { rotulo: 'NOME', alinhamento: 'text-left' },
  { rotulo: 'SETOR', alinhamento: 'text-left', dica: 'Setor de origem no mês e a cidade dele no RH' },
  { rotulo: 'COMISSÃO (R$)', alinhamento: 'text-right', dica: 'Só setores de Marília' },
  { rotulo: 'PREMIAÇÃO (R$)', alinhamento: 'text-right', dica: 'Só setores de Birigui' },
  { rotulo: 'OBS.', alinhamento: 'text-left' },
];

interface Props {
  empresaId: string;
  empresaNome: string;
  mes: string;
  setorId: string | null;
  setorNome: string | null;
  nomesDosSetores: ReadonlyMap<string, string>;
  podeEditar: boolean;
}

export function PremiacoesComissoes({
  empresaId, empresaNome, mes, setorId, setorNome, nomesDosSetores, podeEditar,
}: Props) {
  const dados = usePremiacoesComissoes({
    empresaId, mes, setorId, nomesDosSetores, ativo: true,
  });
  const { linhas, resumo, carregando, atualizando, erro, disponivel, comissaoAtiva } = dados;

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [baixando, setBaixando] = useState(false);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return linhas.filter(l => {
      if (filtro === 'bateram' && l.estado !== 'bateu') return false;
      if (filtro === 'sem_cracha' && l.cracha) return false;
      if (!termo) return true;
      return l.nome.toLocaleLowerCase('pt-BR').includes(termo) || (l.cracha ?? '').includes(termo);
    });
  }, [linhas, busca, filtro]);

  /** As cidades de cada tipo, para o rótulo dos cards («Birigui»). */
  const cidades = useMemo(() => {
    const por: Record<TipoRemuneracao, Set<string>> = { premiacao: new Set(), comissao: new Set() };
    for (const l of linhas) if (l.tipo && l.celula) por[l.tipo].add(l.celula);
    return {
      premiacao: [...por.premiacao].join(', ') || 'Birigui',
      comissao: [...por.comissao].join(', ') || 'Marília',
    };
  }, [linhas]);

  const setoresSemCidade = useMemo(
    () => [...new Set(linhas.filter(l => !l.tipo).map(l => l.setorNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  );

  const bateram = resumo.premiacao.bateram + resumo.comissao.bateram;
  const abasFiltro: readonly AbaSegmentada<Filtro>[] = [
    { key: 'todos', label: `Todos (${linhas.length})`, Icon: List },
    { key: 'bateram', label: `Bateram (${bateram})`, Icon: Trophy },
    { key: 'sem_cracha', label: 'Sem crachá', Icon: IdCard, badge: linhas.length - resumo.comCracha },
  ];

  const { salvarCracha } = dados;
  const aoSalvar = useCallback((operadorId: string, cracha: string | null) => {
    void salvarCracha(operadorId, cracha).then(r => {
      if (!r.ok) toast.error('Não foi possível salvar o crachá', { description: r.erro ?? undefined });
    });
  }, [salvarCracha]);
  const aoInvalido = useCallback((m: string) => { toast.error(m); }, []);

  const baixar = useCallback(async () => {
    setBaixando(true);
    const r = await baixarPremiacoes({
      empresaNome, setorNome, mes, parcial: ehMesAtual(mes), geradoEm: new Date(), linhas,
    }, empresaId);
    setBaixando(false);
    if (!r.ok) toast.error('Não foi possível gerar o arquivo', { description: r.erro });
  }, [empresaId, empresaNome, setorNome, mes, linhas]);

  const totalPremiacao = visiveis.reduce((t, l) => t + (l.premiacao ?? 0), 0);
  const totalComissao = visiveis.reduce((t, l) => t + (l.comissao ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Avisos */}
      {!disponivel && (
        <Aviso tom="alerta">
          <strong>Crachá e cidade dos setores ainda não podem ser lidos</strong> — a estrutura de
          Premiações e Comissões não foi instalada neste banco. Sem a cidade, nenhuma coluna de valor é preenchida.
        </Aviso>
      )}
      {!comissaoAtiva && (
        <Aviso tom="alerta">A comissão por meta não está instalada neste banco — não há valor para calcular.</Aviso>
      )}
      {erro && disponivel && <Aviso tom="alerta">Parte dos dados não pôde ser lida: {erro}</Aviso>}
      {ehMesAtual(mes) && (
        <Aviso tom="info">
          {rotuloDoMes(mes)} ainda está aberto: o valor é de quem já bateu até agora e acompanha o
          Analítico sozinho.
        </Aviso>
      )}
      {disponivel && !carregando && setoresSemCidade.length > 0 && (
        <Aviso tom="info">
          Sem cidade no RH — sem valor aqui: <strong>{setoresSemCidade.join(', ')}</strong>. A cidade de
          cada setor define a coluna: Birigui recebe premiação e Marília comissão.
        </Aviso>
      )}

      {/* Cards */}
      {carregando ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            rotulo={`Premiação · ${cidades.premiacao}`}
            valor={formatBRL(resumo.premiacao.total)}
            valorNumerico={resumo.premiacao.total}
            formatar={formatBRL}
            sub={`${resumo.premiacao.bateram} de ${resumo.premiacao.pessoas} bateram a meta`}
            Icon={Award}
            tom="primario"
          />
          <KpiTile
            rotulo={`Comissão · ${cidades.comissao}`}
            valor={formatBRL(resumo.comissao.total)}
            valorNumerico={resumo.comissao.total}
            formatar={formatBRL}
            sub={`${resumo.comissao.bateram} de ${resumo.comissao.pessoas} bateram a meta`}
            Icon={CircleDollarSign}
            tom="primario"
          />
          <KpiTile
            rotulo="Total a pagar"
            valor={formatBRL(resumo.premiacao.total + resumo.comissao.total)}
            valorNumerico={resumo.premiacao.total + resumo.comissao.total}
            formatar={formatBRL}
            sub="Premiação + comissão, sem bônus"
            Icon={Wallet}
            tom="sucesso"
          />
          <KpiTile
            rotulo="Crachás"
            valor={`${resumo.comCracha} de ${resumo.total}`}
            sub="Pessoas com crachá cadastrado"
            Icon={BadgeCheck}
            tom={resumo.total > 0 && resumo.comCracha === resumo.total ? 'sucesso' : 'alerta'}
          />
        </div>
      )}

      {/* Barra: filtro, busca, ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AbasSegmentadas abas={abasFiltro} ativa={filtro} onTrocar={(k: Filtro) => setFiltro(k)} rotulo="Filtrar pessoas" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar nome ou crachá"
              aria-label="Buscar nome ou crachá"
              className="h-8 w-56 rounded-lg border border-border bg-background pl-8 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => void baixar()}
            disabled={carregando || linhas.length === 0 || baixando}
          >
            {baixando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Baixar Excel
          </Button>
          <Button
            variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => void dados.recarregar()}
            disabled={carregando || atualizando}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', atualizando && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-muted rounded-lg" />)}
        </div>
      ) : linhas.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          Ninguém {setorNome ? `em ${setorNome}` : 'nesta empresa'} em {rotuloDoMes(mes)}.
        </div>
      ) : (
        <div className={cn('space-y-2 transition-opacity', atualizando && 'opacity-80')}>
          {!podeEditar && (
            <p className="text-[11px] text-muted-foreground">
              Somente leitura — cadastrar crachá depende da permissão «Fechamento: preencher D.U. e situação».
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[980px] text-[11px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {CABECALHO.map(c => (
                    <th key={c.rotulo} scope="col" title={c.dica}
                        className={cn('px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap', c.alinhamento)}>
                      {c.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr
                    key={l.operadorId}
                    className="border-t border-border/50"
                    style={l.estado === 'bateu' ? { boxShadow: 'inset 3px 0 0 0 var(--success)' } : undefined}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <CampoCracha
                        linha={l}
                        podeEditar={podeEditar && disponivel}
                        salvando={dados.salvandoId === l.operadorId}
                        onSalvar={c => aoSalvar(l.operadorId, c)}
                        onInvalido={aoInvalido}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <p className="font-medium truncate max-w-[240px]" title={l.nome}>{l.nome}</p>
                      {l.equipeNome && (
                        <p className="text-[10px] text-muted-foreground truncate max-w-[240px]" title={l.equipeNome}>
                          {l.equipeNome}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[150px]" title={l.setorNome}>{l.setorNome}</span>
                        {l.tipo && l.celula && (
                          <span
                            className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1 whitespace-nowrap', COR_TIPO[l.tipo])}
                            title={`${l.celula}: ${ROTULO_TIPO[l.tipo].toLowerCase()}`}
                          >
                            {l.celula}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                      <Valor valor={l.comissao} faixa={l.tipo === 'comissao' ? l.faixa : null} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-mono">
                      <Valor valor={l.premiacao} faixa={l.tipo === 'premiacao' ? l.faixa : null} />
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[320px]">
                      <span className="line-clamp-2" title={l.obs}>{l.obs || '—'}</span>
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={CABECALHO.length} className="px-2 py-6 text-center text-muted-foreground">
                      Ninguém neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
              {visiveis.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-primary/30 bg-primary/[0.04] font-semibold">
                    <td className="px-2 py-2" colSpan={3}>
                      Total · {visiveis.length} {visiveis.length === 1 ? 'pessoa' : 'pessoas'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-mono text-primary">{formatBRL(totalComissao)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-mono text-primary">{formatBRL(totalPremiacao)}</td>
                    <td className="px-2 py-2 text-[10px] font-normal text-muted-foreground">
                      O Excel sai com todas as {linhas.length} pessoas, sem o filtro.
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
