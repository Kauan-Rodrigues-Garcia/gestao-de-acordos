/**
 * SetoresDoRelatorio — a aba «Setores a vincular» do Painel Diretoria do
 * Comercial.
 *
 * ## O pedido de 21/09/2026
 *
 * «Eu tô numa conta de super admin e não tô vendo os dados gerais, tô vendo só
 * os dados do setor que tá cadastrado. Mostra ali pra mim os setores que são
 * vinculados na planilha e os que não estão.»
 *
 * O Painel Diretoria mede o dinheiro de `vendas`, e em `vendas` o setor vem do
 * DE-PARA de franquia (`vendas_franquias`). Franquia que ninguém vinculou
 * produz venda com `setor_id` nulo: o dinheiro entra no total da empresa e não
 * aparece em setor nenhum. É por isso que a diretoria via «um setor só» —
 * havia um setor só vinculado, e o resto do relatório estava invisível.
 *
 * Esta aba é o mapa que faltava: toda franquia que o relatório trouxe, quanto
 * ela faturou, e para qual setor ela aponta — ou o aviso de que não aponta para
 * nenhum, com o seletor ali mesmo para resolver.
 *
 * É o equivalente comercial de «Códigos» no Painel Diretoria da BookPlay, onde
 * o código do ERP amarra cada setor à carteira dele no 59. Mesma pergunta, outra
 * chave: lá é `NomeGrupoFiltro`, aqui é o código da franquia.
 *
 * ## O dinheiro sai do relatório, e não de `vendas`
 *
 * De propósito. `vendas` já passou pelo de-para — perguntar a ela quanto uma
 * franquia não vinculada trouxe devolveria «sem setor», que é a pergunta, não a
 * resposta. O relatório cru sabe o código de cada linha.
 *
 * ## A régua é a do relatório
 *
 * `conta_na_meta` e `valor_na_meta` são colunas de `vendas_relatorio`, gravadas
 * na importação: a mesma régua «confirmada E assinada» do resto do Comercial.
 * As duas leituras aparecem — o que a franquia trouxe no total e o que dela
 * conta na meta —, porque vincular um setor mexe nas duas.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2, Link2, Loader2, RefreshCw, TriangleAlert, Search, X, CheckCircle2, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import { normalizarTexto } from '@/lib/vendasLista';
import {
  vincularFranquia, type EstadoFranquia, type Franquia,
} from '@/services/vendas/importacaoVendas.service';
import { useCargaVigente } from './useCargaVigente';

/** O que o relatório escolhido diz de um código de franquia. */
interface DadosDaFranquia {
  codigo: string;
  nome: string;
  linhas: number;
  total: number;
  naMeta: number;
  qtdNaMeta: number;
  ufs: Set<string>;
}

/** Uma linha da tabela: o cadastro e o relatório, cada um podendo faltar. */
interface LinhaFranquia {
  /** `null` quando o código apareceu no relatório e não está no cadastro. */
  franquia: Franquia | null;
  /** `null` quando a franquia está cadastrada e não veio nesta carga. */
  dados: DadosDaFranquia | null;
}

/** O `Select` recusa `value=""`; «sem setor» e «ignorar» precisam de valor. */
const SEM_SETOR = '__sem_setor__';
const IGNORAR = '__ignorar__';

const ESTADO: Record<EstadoFranquia, { rotulo: string; classe: string }> = {
  novo:      { rotulo: 'A vincular', classe: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  vinculado: { rotulo: 'Vinculada',  classe: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  ignorado:  { rotulo: 'Ignorada',   classe: 'border-border bg-muted text-muted-foreground' },
};

interface Props {
  /** `false` congela a leitura — a aba ainda não foi aberta. */
  ativo: boolean;
}

export function SetoresDoRelatorio({ ativo }: Props) {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const empresaId = empresa?.id ?? null;
  const podeVincular = temPermissao('vendas_vincular_franquia');

  const carga = useCargaVigente(empresaId, ativo);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId || !ativo) return;
    void supabase.from('setores')
      .select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome')
      .then(({ data }) => setSetores(data ?? []));
  }, [empresaId, ativo]);

  /**
   * O que cada CÓDIGO de franquia trouxe no relatório escolhido.
   *
   * A chave é o código, e não o nome: o nome muda de grafia entre cargas
   * («18- PLAY 4» × «PLAY 4»), e agrupar por ele partiria a mesma franquia em
   * duas linhas com metade do dinheiro cada.
   */
  const porCodigo = useMemo(() => {
    const mapa = new Map<string, DadosDaFranquia>();
    for (const l of carga.linhas) {
      const codigo = (l.codigo_franquia ?? '').trim() || '—';
      const atual = mapa.get(codigo) ?? {
        codigo, nome: (l.franquia ?? '').trim() || 'sem nome',
        linhas: 0, total: 0, naMeta: 0, qtdNaMeta: 0, ufs: new Set<string>(),
      };
      atual.linhas += 1;
      atual.total += l.valor_total;
      // `conta_na_meta` é gravada na importação e não vem em `COLUNAS_RELATORIO`;
      // a régua é reconstruída aqui pela mesma definição: confirmada E assinada.
      const naMeta = l.situacao === 'confirmada' && l.contrato_assinado === true;
      if (naMeta) { atual.naMeta += l.valor_total; atual.qtdNaMeta += 1; }
      if (l.uf?.trim()) atual.ufs.add(l.uf.trim());
      mapa.set(codigo, atual);
    }
    return mapa;
  }, [carga.linhas]);

  /** A franquia cadastrada, mais o que o relatório diz dela. */
  const linhas = useMemo((): LinhaFranquia[] => {
    const cadastradas: LinhaFranquia[] = carga.franquias.map(f => ({
      franquia: f,
      dados: porCodigo.get(f.codigo.trim()) ?? null,
    }));
    /*
     * Código que apareceu no relatório e não está em `vendas_franquias`.
     *
     * Não deveria acontecer — a promoção do lote cadastra toda franquia nova —,
     * mas se acontecer é exatamente o caso que esta aba existe para denunciar:
     * dinheiro no relatório sem lugar no sistema. Aparece como linha sem ações.
     */
    const conhecidos = new Set(carga.franquias.map(f => f.codigo.trim()));
    const orfas: LinhaFranquia[] = [...porCodigo.values()]
      .filter(d => !conhecidos.has(d.codigo))
      .map((d): LinhaFranquia => ({ franquia: null, dados: d }));
    return [...cadastradas, ...orfas];
  }, [carga.franquias, porCodigo]);

  const visiveis = useMemo(() => {
    const termo = normalizarTexto(busca);
    return linhas
      .filter(l => !soPendentes || (l.franquia?.estado ?? 'novo') === 'novo')
      .filter(l => {
        if (!termo) return true;
        const nome = l.franquia?.nome ?? l.dados?.nome ?? '';
        const codigo = l.franquia?.codigo ?? l.dados?.codigo ?? '';
        return normalizarTexto(nome).includes(termo) || normalizarTexto(codigo).includes(termo);
      })
      .sort((a, b) => (b.dados?.total ?? 0) - (a.dados?.total ?? 0));
  }, [linhas, busca, soPendentes]);

  const resumo = useMemo(() => {
    let semSetor = 0; let comSetor = 0; let pendentes = 0;
    for (const l of linhas) {
      const valor = l.dados?.naMeta ?? 0;
      const vinculada = l.franquia?.estado === 'vinculado' && l.franquia.setor_id;
      if (vinculada) comSetor += valor;
      else {
        semSetor += valor;
        if ((l.franquia?.estado ?? 'novo') === 'novo') pendentes += 1;
      }
    }
    return { semSetor, comSetor, pendentes };
  }, [linhas]);

  async function mudar(id: string, valor: string, observacao: string | null) {
    setSalvando(id);
    const estado: EstadoFranquia = valor === IGNORAR ? 'ignorado' : valor === SEM_SETOR ? 'novo' : 'vinculado';
    const setorId = estado === 'vinculado' ? valor : null;
    const r = await vincularFranquia({ id, estado, setorId, observacao });
    setSalvando(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível vincular a franquia.'); return; }
    toast.success(estado === 'vinculado'
      ? 'Franquia vinculada. A próxima importação já credita no setor.'
      : estado === 'ignorado'
        ? 'Franquia ignorada — ela some dos pendentes e o dinheiro dela fica sem setor.'
        : 'Vínculo desfeito.');
    carga.recarregar();
  }

  if (!empresaId) return null;

  return (
    <div className="space-y-4">
      {/* ── O que está sendo lido ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Setores a vincular</h2>
            <p className="text-[11px] text-muted-foreground">
              Cada franquia do relatório e o setor que ela credita — quem não aponta para nenhum
              soma no geral e em setor nenhum
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {carga.vigentes.length > 1 && (
            <Select value={carga.lote?.id ?? undefined} onValueChange={carga.escolher}>
              <SelectTrigger className="h-8 w-[300px] text-xs" aria-label="Carga"><SelectValue /></SelectTrigger>
              <SelectContent>
                {carga.vigentes.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {rotuloDoMes(l.mes.slice(0, 7))} · {l.origem === 'geral' ? 'Geral (oficial)' : 'Prévia do setor'}
                    {' · '}{l.linhas_aceitas} linhas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Recarregar"
            disabled={carga.carregando} onClick={carga.recarregar}>
            <RefreshCw className={cn('h-4 w-4', carga.carregando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {carga.lote?.origem === 'setor' && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Não há carga do <strong className="text-foreground">geral</strong> vigente, então o que aparece
          é a prévia do setor. Ela recorta pela data da venda e traz o que ainda está em aberto — os
          valores não são os oficiais.
        </div>
      )}
      {carga.erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{carga.erro}
        </div>
      )}

      {/* ── O placar do vínculo ────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero
          rotulo="Na meta, já em um setor" valor={formatBRL(resumo.comSetor)}
          sub="aparece no card do setor" tom="bom"
        />
        <Numero
          rotulo="Na meta, sem setor" valor={formatBRL(resumo.semSetor)}
          sub="soma no geral e em setor nenhum" tom={resumo.semSetor > 0 ? 'alerta' : undefined}
        />
        <Numero
          rotulo="Franquias a vincular" valor={String(resumo.pendentes)}
          sub={resumo.pendentes === 0 ? 'nada pendente' : 'ninguém decidiu o setor delas'}
          tom={resumo.pendentes > 0 ? 'alerta' : undefined}
        />
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar franquia ou código" className="h-8 pl-8 text-xs"
            aria-label="Buscar franquia" />
        </div>
        <Button variant={soPendentes ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-xs"
          onClick={() => setSoPendentes(v => !v)}>
          <TriangleAlert className="h-3.5 w-3.5" /> Só as pendentes
        </Button>
        {(busca || soPendentes) && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={() => { setBusca(''); setSoPendentes(false); }}>
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      {/* ── A tabela ───────────────────────────────────────────────────── */}
      {carga.carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo o relatório…
        </div>
      ) : carga.vigentes.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nenhuma carga vigente ainda. Importe o relatório na aba Importar vendas.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px]">
                  <th className="w-[90px] px-3 py-3 text-left font-semibold text-muted-foreground">CÓDIGO</th>
                  <th className="min-w-[200px] px-3 py-3 text-left font-semibold text-muted-foreground">FRANQUIA</th>
                  <th className="w-[70px] px-3 py-3 text-left font-semibold text-muted-foreground">UF</th>
                  <th className="w-[80px] px-3 py-3 text-right font-semibold text-muted-foreground">LINHAS</th>
                  <th className="w-[120px] px-3 py-3 text-right font-semibold text-muted-foreground">TOTAL</th>
                  <th className="w-[130px] px-3 py-3 text-right font-semibold text-muted-foreground">NA META</th>
                  <th className="w-[110px] px-3 py-3 text-left font-semibold text-muted-foreground">SITUAÇÃO</th>
                  <th className="min-w-[210px] px-3 py-3 text-left font-semibold text-muted-foreground">SETOR</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {soPendentes ? 'Nenhuma franquia pendente — está tudo vinculado.' : 'Nada com esses filtros.'}
                    </td>
                  </tr>
                ) : visiveis.map((l, i) => {
                  const f = l.franquia;
                  const d = l.dados;
                  const estado = f?.estado ?? 'novo';
                  const marca = ESTADO[estado];
                  const valorAtual = f?.estado === 'ignorado'
                    ? IGNORAR
                    : (f?.setor_id ?? SEM_SETOR);
                  return (
                    <tr key={f?.id ?? `orfa-${d?.codigo}`}
                      className={cn(
                        'border-b border-border/50',
                        i % 2 === 0 && 'bg-muted/10',
                        estado === 'novo' && (d?.naMeta ?? 0) > 0 && 'bg-amber-500/5',
                      )}>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">
                        {f?.codigo ?? d?.codigo ?? '—'}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <p className="truncate font-medium text-foreground">{f?.nome ?? d?.nome ?? '—'}</p>
                        {f && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            visto de {formatDate(f.primeira_aparicao)} a {formatDate(f.ultima_aparicao)}
                          </p>
                        )}
                        {!f && (
                          <p className="mt-0.5 text-[10px] text-destructive">
                            no relatório e fora do cadastro — reimporte a carga
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                        {d && d.ufs.size > 0 ? [...d.ufs].sort().join(', ') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {d ? d.linhas.toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {d ? formatBRL(d.total) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                        {d ? formatBRL(d.naMeta) : '—'}
                        {d && d.qtdNaMeta > 0 && (
                          <span className="ml-1 font-normal text-[10px] text-muted-foreground">
                            {d.qtdNaMeta}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          marca.classe,
                        )}>
                          {estado === 'vinculado' ? <CheckCircle2 className="h-3 w-3" />
                            : estado === 'ignorado' ? <EyeOff className="h-3 w-3" />
                            : <TriangleAlert className="h-3 w-3" />}
                          {marca.rotulo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {!f ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : podeVincular ? (
                          <Select value={valorAtual} disabled={salvando === f.id}
                            onValueChange={v => void mudar(f.id, v, f.observacao)}>
                            <SelectTrigger className="h-8 w-full text-xs" aria-label={`Setor de ${f.nome}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SEM_SETOR}>Sem setor (pendente)</SelectItem>
                              {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                              <SelectItem value={IGNORAR}>Ignorar esta franquia</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {f.setores?.nome ?? 'sem setor'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Vincular uma franquia muda o setor das vendas dela{' '}
        <strong className="text-foreground">na próxima importação</strong> — o de-para é aplicado quando
        o lote é promovido, e não retroativamente sobre o que já está gravado. Para valer no mês
        corrente, reimporte a carga depois de vincular.
      </p>
    </div>
  );
}

function Numero({
  rotulo, valor, sub, tom,
}: { rotulo: string; valor: string; sub: string; tom?: 'alerta' | 'bom' }) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-3.5 shadow-sm',
      tom === 'alerta' ? 'border-amber-500/40' : tom === 'bom' ? 'border-emerald-500/40' : 'border-border/70',
    )}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn(
        'mt-1.5 font-mono text-xl font-bold tabular-nums',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
      )}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
