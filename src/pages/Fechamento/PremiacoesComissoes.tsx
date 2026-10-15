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
 *
 * Correções de 18/09/2026: o valor de quem bateu ficou em destaque, e o recorte
 * de uma cidade só mostra a coluna e o card do tipo dela (`tiposNoRecorte`) —
 * Birigui sem a coluna Comissão.
 *
 * Correções de 19/09/2026: a aba baixa HTML além do Excel, os dois com a cara
 * do Gestão (`relatorioGestao`).
 *
 * ## Apresentável para a diretoria (15/10/2026)
 *
 * A aba era uma lista única de nomes em letra pequena, com selo sobre selo, e
 * nada consolidado: para saber quanto cada setor ia receber era preciso somar
 * de olho. Agora ela lê de cima para baixo como um relatório:
 *
 *   1. indicadores — total a pagar, quantos bateram, média por quem bateu, crachás;
 *   2. o recorte resumido — por setor (ou por equipe, num setor só) e por meta atingida;
 *   3. o detalhamento por pessoa, agrupado por setor com subtotal, e o resultado
 *      de cada um num selo só (`resultadoDaLinha`) — a Obs. fica com o resto.
 *
 * O HTML baixado segue a mesma ordem (`htmlPremiacoes`).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, BadgeCheck, Building2, CircleDollarSign, FileCode2, FileSpreadsheet, IdCard, Info, List, Loader2,
  RefreshCw, Search, Target, TriangleAlert, Trophy, Users, Wallet,
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
  agruparPremiacoes, chaveDoAgrupamento, distribuirPorFaixa, formatarPercentual, lerCracha,
  resultadoDaLinha, ROTULO_TIPO, tiposNoRecorte, valorDoTipo,
  type GrupoPremiacao, type LinhaPremiacao, type TipoRemuneracao, type TomResultado,
} from '@/services/premiacoes/calculoPremiacoes';
import { baixarPremiacoes, type FormatoPremiacoes } from '@/services/premiacoes/baixarPremiacoes';

type Filtro = 'todos' | 'bateram' | 'sem_cracha';

const COR_TIPO: Record<TipoRemuneracao, string> = {
  premiacao: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
  comissao: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
};

const COR_RESULTADO: Record<TomResultado, string> = {
  sucesso: 'bg-success/12 text-success ring-1 ring-success/25',
  neutro: 'bg-muted text-muted-foreground ring-1 ring-border',
  tenue: 'text-muted-foreground/80 border border-dashed border-border',
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

/** O cartão de uma seção do relatório: título, legenda e o conteúdo. */
function Secao({ titulo, legenda, Icon, acoes, children, className }: {
  titulo: string;
  legenda?: string;
  Icon: typeof Award;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            {legenda && <p className="text-[11px] text-muted-foreground">{legenda}</p>}
          </div>
        </div>
        {acoes}
      </header>
      {children}
    </section>
  );
}

function SeloCidade({ celula, tipo }: { celula: string | null; tipo: TipoRemuneracao | null }) {
  if (!celula || !tipo) return null;
  return (
    <span
      className={cn('rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase ring-1 whitespace-nowrap', COR_TIPO[tipo])}
      title={`${celula}: ${ROTULO_TIPO[tipo].toLowerCase()}`}
    >
      {celula}
    </span>
  );
}

/** Trilho com a fração preenchida. Uma cor só: o tamanho é o dado. */
function Barra({ fracao, tom, rotulo }: { fracao: number; tom: 'sucesso' | 'primario' | 'neutro'; rotulo: string }) {
  const largura = fracao > 0 ? Math.max(fracao * 100, 2) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={rotulo} title={rotulo}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500',
          tom === 'sucesso' ? 'bg-success' : tom === 'primario' ? 'bg-primary' : 'bg-muted-foreground/40')}
        style={{ width: `${largura}%` }}
      />
    </div>
  );
}

/** Célula de valor: vazio não é zero, e quem bateu sai em verde. */
function Valor({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground/60">—</span>;
  if (valor <= 0) return <span className="text-muted-foreground">{formatBRL(0)}</span>;
  return <span className="text-[13px] font-semibold text-success">{formatBRL(valor)}</span>;
}

function SeloResultado({ linha }: { linha: LinhaPremiacao }) {
  const r = resultadoDaLinha(linha);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_RESULTADO[r.tom])}>
      {r.tom === 'sucesso' && <Trophy className="h-3 w-3" aria-hidden />}
      {r.rotulo}
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
          'h-7 w-[92px] rounded-md border bg-background px-2 text-center font-mono text-[12px] tabular-nums',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          l.cracha ? 'border-border' : 'border-dashed border-amber-500/50',
        )}
      />
      {salvando && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Salvando" />}
    </div>
  );
}

/** Setor (ou equipe): pessoas, quantos bateram, a taxa em barra e o valor. */
function TabelaGrupos({ grupos, rotulo, tipos }: {
  grupos: readonly GrupoPremiacao[];
  rotulo: string;
  tipos: readonly TipoRemuneracao[];
}) {
  const total = grupos.reduce((t, g) => t + g.total, 0);
  const pessoas = grupos.reduce((t, g) => t + g.pessoas, 0);
  const bateram = grupos.reduce((t, g) => t + g.bateram, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-medium">{rotulo}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Bateram</th>
            <th scope="col" className="px-2 py-2 text-left font-medium w-[30%]">Atingimento</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">A pagar</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => {
            const taxa = g.pessoas ? g.bateram / g.pessoas : 0;
            return (
              <tr key={g.chave} className="border-t border-border/60">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate font-medium text-foreground" title={g.nome}>{g.nome}</span>
                    {tipos.length > 1 && <SeloCidade celula={g.celula} tipo={g.tipo} />}
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  <span className="font-semibold text-foreground">{g.bateram}</span>
                  <span className="text-muted-foreground"> de {g.pessoas}</span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Barra fracao={taxa} tom="sucesso" rotulo={`${g.nome}: ${formatarPercentual(taxa)} bateram a meta`} />
                    <span className="w-11 shrink-0 text-right tabular-nums text-muted-foreground">{formatarPercentual(taxa)}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">
                  {formatBRL(g.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-primary/30 bg-primary/[0.04] font-semibold">
            <td className="px-4 py-2">Total</td>
            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
              {bateram}<span className="font-normal text-muted-foreground"> de {pessoas}</span>
            </td>
            <td className="px-2 py-2 text-muted-foreground font-normal">
              {pessoas ? `${formatarPercentual(bateram / pessoas)} no recorte` : '—'}
            </td>
            <td className="px-4 py-2 text-right font-mono tabular-nums text-primary whitespace-nowrap">{formatBRL(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Quantas pessoas pararam em cada meta, e quanto isso custa. */
function PainelFaixas({ linhas }: { linhas: readonly LinhaPremiacao[] }) {
  const d = useMemo(() => distribuirPorFaixa(linhas), [linhas]);
  const maior = Math.max(1, d.naoBateram, ...d.faixas.map(f => f.pessoas));
  const itens = [
    ...d.faixas.map(f => ({ chave: `f${f.faixa}`, rotulo: `${f.faixa}ª meta`, pessoas: f.pessoas, valor: f.total as number | null, tom: 'sucesso' as const })),
    { chave: 'nao', rotulo: 'Não bateram', pessoas: d.naoBateram, valor: null as number | null, tom: 'neutro' as const },
  ];
  return (
    <div className="space-y-3 px-4 py-3">
      {itens.map(i => (
        <div key={i.chave} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-xs">
          <span className={cn('font-medium', i.tom === 'sucesso' ? 'text-foreground' : 'text-muted-foreground')}>{i.rotulo}</span>
          <Barra fracao={i.pessoas / maior} tom={i.tom} rotulo={`${i.rotulo}: ${i.pessoas} ${i.pessoas === 1 ? 'pessoa' : 'pessoas'}`} />
          <span className="whitespace-nowrap text-right tabular-nums">
            <span className="font-semibold text-foreground">{i.pessoas}</span>
            <span className="text-muted-foreground"> {i.pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
            {i.valor !== null && <span className="ml-2 font-mono text-muted-foreground">{formatBRL(i.valor)}</span>}
          </span>
        </div>
      ))}
      {d.semValor > 0 && (
        <p className="pt-1 text-[11px] text-muted-foreground">
          {d.semValor} {d.semValor === 1 ? 'pessoa sem meta, configuração ou cidade fica' : 'pessoas sem meta, configuração ou cidade ficam'} fora da conta.
        </p>
      )}
    </div>
  );
}

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
  const [baixando, setBaixando] = useState<FormatoPremiacoes | null>(null);

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

  /** Birigui sozinha mostra só Premiação; Marília sozinha, só Comissão. */
  const tipos = useMemo(() => tiposNoRecorte(linhas), [linhas]);
  const umTipo = tipos.length === 1;

  const chaveGrupo = useMemo(() => chaveDoAgrupamento(linhas), [linhas]);
  const grupos = useMemo(() => (chaveGrupo ? agruparPremiacoes(linhas, chaveGrupo) : []), [linhas, chaveGrupo]);

  /** O detalhamento por pessoa, em blocos de setor quando o recorte tem vários. */
  const blocos = useMemo(() => {
    if (chaveGrupo !== 'setor') return [{ chave: 'todos', grupo: null as GrupoPremiacao | null, linhas: visiveis }];
    const ordem = new Map<string, LinhaPremiacao[]>();
    for (const l of visiveis) {
      const k = l.setorId ?? `nome:${l.setorNome}`;
      const lista = ordem.get(k) ?? [];
      lista.push(l);
      ordem.set(k, lista);
    }
    return [...ordem.entries()].map(([k, ls]) => ({ chave: k, grupo: agruparPremiacoes(ls, 'setor')[0], linhas: ls }));
  }, [visiveis, chaveGrupo]);

  const setoresSemCidade = useMemo(
    () => [...new Set(linhas.filter(l => !l.tipo).map(l => l.setorNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  );

  const pessoasComTipo = resumo.premiacao.pessoas + resumo.comissao.pessoas;
  const bateram = resumo.premiacao.bateram + resumo.comissao.bateram;
  const totalAPagar = resumo.premiacao.total + resumo.comissao.total;
  const semCracha = resumo.total - resumo.comCracha;

  const abasFiltro: readonly AbaSegmentada<Filtro>[] = [
    { key: 'todos', label: `Todos (${linhas.length})`, Icon: List },
    { key: 'bateram', label: `Bateram (${bateram})`, Icon: Trophy },
    { key: 'sem_cracha', label: 'Sem crachá', Icon: IdCard, badge: semCracha },
  ];

  const { salvarCracha } = dados;
  const aoSalvar = useCallback((operadorId: string, cracha: string | null) => {
    void salvarCracha(operadorId, cracha).then(r => {
      if (!r.ok) toast.error('Não foi possível salvar o crachá', { description: r.erro ?? undefined });
    });
  }, [salvarCracha]);
  const aoInvalido = useCallback((m: string) => { toast.error(m); }, []);

  const baixar = useCallback(async (formato: FormatoPremiacoes) => {
    setBaixando(formato);
    const r = await baixarPremiacoes({
      empresaNome, setorNome, mes, parcial: ehMesAtual(mes), geradoEm: new Date(), linhas,
    }, empresaId, formato);
    setBaixando(null);
    if (!r.ok) toast.error('Não foi possível gerar o arquivo', { description: r.erro });
  }, [empresaId, empresaNome, setorNome, mes, linhas]);

  const somaDoTipo = (ls: readonly LinhaPremiacao[], tipo: TipoRemuneracao) =>
    ls.reduce((t, l) => t + (valorDoTipo(l, tipo) ?? 0), 0);

  // Crachá · Nome · Resultado · valores · Observação
  const totalColunas = 3 + tipos.length + 1;

  return (
    <div className="space-y-5">
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

      {/* 1. Indicadores */}
      {carregando ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {umTipo ? (
            <KpiTile
              rotulo={`${ROTULO_TIPO[tipos[0]]} · ${cidades[tipos[0]]}`}
              valor={formatBRL(resumo[tipos[0]].total)}
              valorNumerico={resumo[tipos[0]].total}
              formatar={formatBRL}
              sub={`A pagar em ${rotuloDoMes(mes)}`}
              Icon={tipos[0] === 'premiacao' ? Award : CircleDollarSign}
              tom="primario"
            />
          ) : (
            <KpiTile
              rotulo="Total a pagar"
              valor={formatBRL(totalAPagar)}
              valorNumerico={totalAPagar}
              formatar={formatBRL}
              sub={`Premiação ${formatBRL(resumo.premiacao.total)} · Comissão ${formatBRL(resumo.comissao.total)}`}
              Icon={Wallet}
              tom="primario"
            />
          )}
          <KpiTile
            rotulo="Bateram a meta"
            valor={`${bateram} de ${pessoasComTipo}`}
            sub={pessoasComTipo ? `${formatarPercentual(bateram / pessoasComTipo)} de atingimento` : 'Ninguém com cidade no RH'}
            Icon={Trophy}
            tom="sucesso"
          />
          <KpiTile
            rotulo="Média por quem bateu"
            valor={bateram ? formatBRL(totalAPagar / bateram) : '—'}
            sub="Soma dos valores ÷ quem bateu"
            Icon={Target}
            tom="neutro"
          />
          <KpiTile
            rotulo="Crachás"
            valor={`${resumo.comCracha} de ${resumo.total}`}
            sub={semCracha > 0 ? `${semCracha} sem crachá — necessário para pagar` : 'Todos com crachá cadastrado'}
            Icon={BadgeCheck}
            tom={resumo.total > 0 && semCracha === 0 ? 'sucesso' : 'alerta'}
          />
        </div>
      )}

      {/* 2. O recorte resumido */}
      {!carregando && linhas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {chaveGrupo && (
            <Secao
              className="lg:col-span-3"
              titulo={chaveGrupo === 'setor' ? 'Resultado por setor' : 'Resultado por equipe'}
              legenda="Quem bateu a meta e quanto cada um recebe, do maior valor ao menor"
              Icon={chaveGrupo === 'setor' ? Building2 : Users}
            >
              <TabelaGrupos grupos={grupos} rotulo={chaveGrupo === 'setor' ? 'Setor' : 'Equipe'} tipos={tipos} />
            </Secao>
          )}
          <Secao
            className={chaveGrupo ? 'lg:col-span-2' : 'lg:col-span-5'}
            titulo="Por meta atingida"
            legenda="Até onde cada pessoa chegou no mês"
            Icon={Target}
          >
            <PainelFaixas linhas={linhas} />
          </Secao>
        </div>
      )}

      {/* 3. Detalhamento por pessoa */}
      <Secao
        titulo="Detalhamento por pessoa"
        legenda={chaveGrupo === 'setor' ? 'Agrupado por setor, com subtotal' : 'Em ordem alfabética'}
        Icon={List}
        acoes={(
          <div className="flex flex-wrap items-center gap-2">
            {(['xlsx', 'html'] as const).map(formato => (
              <Button
                key={formato}
                variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => void baixar(formato)}
                disabled={carregando || linhas.length === 0 || baixando !== null}
              >
                {baixando === formato
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : formato === 'xlsx'
                    ? <FileSpreadsheet className="h-3.5 w-3.5" />
                    : <FileCode2 className="h-3.5 w-3.5" />}
                {formato === 'xlsx' ? 'Baixar Excel' : 'Baixar HTML'}
              </Button>
            ))}
            <Button
              variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => void dados.recarregar()}
              disabled={carregando || atualizando}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', atualizando && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
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
          {!podeEditar && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              Somente leitura — cadastrar crachá depende da permissão «Fechamento: preencher D.U. e situação».
            </span>
          )}
        </div>

        {carregando ? (
          <div className="space-y-2 p-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-muted rounded-lg" />)}
          </div>
        ) : linhas.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Ninguém {setorNome ? `em ${setorNome}` : 'nesta empresa'} em {rotuloDoMes(mes)}.
          </div>
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', atualizando && 'opacity-80')}>
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="bg-muted/40 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2.5 text-center font-semibold w-[110px]" title="Crachá do RH — o mesmo que o RH Gestão vai ler">Crachá</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Nome</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Resultado</th>
                  {tipos.map(t => (
                    <th key={t} scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap"
                        title={t === 'premiacao' ? 'Setores das cidades de premiação (Birigui)' : 'Setores das cidades de comissão (Marília)'}>
                      {ROTULO_TIPO[t]} (R$)
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Observação</th>
                </tr>
              </thead>
              <tbody>
                {blocos.map(b => (
                  <Fragment key={b.chave}>
                    {b.grupo && (
                      <tr className="border-t border-border bg-muted/25">
                        <td colSpan={3} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-semibold text-foreground">{b.grupo.nome}</span>
                            <SeloCidade celula={b.grupo.celula} tipo={b.grupo.tipo} />
                            <span className="text-[11px] text-muted-foreground">
                              {b.grupo.bateram} de {b.grupo.pessoas} bateram
                            </span>
                          </div>
                        </td>
                        {tipos.map(t => (
                          <td key={t} className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">
                            {b.grupo!.tipo === t ? formatBRL(somaDoTipo(b.linhas, t)) : ''}
                          </td>
                        ))}
                        <td />
                      </tr>
                    )}
                    {b.linhas.map(l => {
                      const detalhe = resultadoDaLinha(l).detalhe;
                      return (
                        <tr key={l.operadorId} className="border-t border-border/50 hover:bg-muted/20">
                          <td className="px-3 py-2 text-center">
                            <CampoCracha
                              linha={l}
                              podeEditar={podeEditar && disponivel}
                              salvando={dados.salvandoId === l.operadorId}
                              onSalvar={c => aoSalvar(l.operadorId, c)}
                              onInvalido={aoInvalido}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-[13px] font-medium text-foreground truncate max-w-[280px]" title={l.nome}>{l.nome}</p>
                            {(l.equipeNome || chaveGrupo !== 'setor') && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                                {[chaveGrupo !== 'setor' ? l.setorNome : null, l.equipeNome].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2"><SeloResultado linha={l} /></td>
                          {tipos.map(t => (
                            <td key={t} className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                              <Valor valor={valorDoTipo(l, t)} />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-muted-foreground max-w-[300px]">
                            <span className="line-clamp-2" title={l.obs}>{detalhe || '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={totalColunas} className="px-3 py-8 text-center text-muted-foreground">
                      Ninguém neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
              {visiveis.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-primary/30 bg-primary/[0.04] font-semibold">
                    <td className="px-3 py-2.5" colSpan={3}>
                      Total · {visiveis.length} {visiveis.length === 1 ? 'pessoa' : 'pessoas'}
                    </td>
                    {tipos.map(t => (
                      <td key={t} className="px-3 py-2.5 text-right tabular-nums font-mono text-[13px] font-bold text-primary whitespace-nowrap">
                        {formatBRL(somaDoTipo(visiveis, t))}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-[11px] font-normal text-muted-foreground">
                      {visiveis.length === linhas.length
                        ? 'Valor = faixa atingida × % do mês, sem bônus'
                        : `O arquivo sai com todas as ${linhas.length} pessoas, sem o filtro.`}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Secao>
    </div>
  );
}
