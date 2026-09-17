/**
 * Mestre59Divergencias — onde o 59 e o 58 discordam, e por quê.
 *
 * ## A aba nasceu de um aviso
 *
 * «Enquanto metade do dinheiro não tiver equipe, a aba vai listar ausência de
 * cadastro como se fosse divergência.» O aviso estava certo, e a primeira
 * medição provou: 1.090 NRs, R$ 375.193,73 de «divergência» em setembro/2026 —
 * uma lista que ninguém abre duas vezes.
 *
 * Quase nada daquilo era divergência. Era 58 que não tinha sido importado, e
 * dia que ainda estava aberto. Classificando, sobram **6 linhas** no mês. É
 * essa a tela: as 6 primeiro, o resto como contexto de quem quiser ver.
 *
 * ## Por que os cartões não são só enfeite
 *
 * Cada cartão é um filtro e carrega a frase que explica a classe. Quem chega
 * aqui vindo de «faltou R$ 122 mil no Jornada Play» precisa ler, na mesma tela,
 * que o Jornada Play **ainda não foi integrado ao sistema de gestão** — não há
 * 58 dele para importar, e o 59 é a única fonte daquele dinheiro. Sem essa
 * frase, a conclusão vira «o sistema está errado».
 *
 * ## Esta tela só lê
 *
 * Nada aqui grava. Corrigir divergência à mão é a Fase 4 e será ação explícita
 * de quem tem poder para isso.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Scale, Calendar, Download, Building2, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import Mestre59Pendencias from './Mestre59Pendencias';
import {
  buscarConferencia,
  pedeAtencao,
  esperaIntegracao,
  pedeImportacao,
  ROTULO_CLASSE,
  totalPorClasse,
  ultimoDiaPorSetor,
  type ClasseDivergencia,
  type Divergencia,
  type ResumoDivergencia,
} from '@/services/mestre/divergencias.service';

interface Props {
  empresaId: string;
  mes: string;
  versao?: number;
}

const diaCurto = (iso: string | null): string => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

const CORES: Record<ClasseDivergencia, string> = {
  divergencia:   'border-destructive/25 bg-destructive/10 text-destructive',
  estrutural:    'border-border/50 bg-muted/40 text-muted-foreground',
  dia_aberto:    'border-border/50 bg-muted/40 text-muted-foreground',
  aguardando_58: 'border-warning/25 bg-warning/10 text-warning',
  /* Cinza, não âmbar. Setor não integrado não é pendência de ninguém: não
     existe 58 dele para importar, e âmbar pediria uma ação que não há. */
  sem_58:        'border-border/50 bg-muted/40 text-muted-foreground',
};

const ICONE: Record<ClasseDivergencia, typeof AlertTriangle> = {
  divergencia:   AlertTriangle,
  estrutural:    Scale,
  dia_aberto:    Calendar,
  aguardando_58: Download,
  sem_58:        Building2,
};

const SITUACAO: Record<Divergencia['situacao'], string> = {
  so_no_59:     'só no 59',
  so_no_58:     'só no 58',
  valor_difere: 'valor difere',
};

export default function Mestre59Divergencias({ empresaId, mes, versao }: Props) {
  const [resumo, setResumo]   = useState<ResumoDivergencia[]>([]);
  const [linhas, setLinhas]   = useState<Divergencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]       = useState<string | null>(null);
  const [busca, setBusca]     = useState('');
  const [setorFiltro, setSetorFiltro] = useState<string>('all');
  /* Abre na divergência de verdade. O resto da tela é contexto, e contexto que
     abre sozinho é o mesmo ruído que esta aba existe para não ter. */
  const [classeFiltro, setClasseFiltro] = useState<ClasseDivergencia | 'all'>('divergencia');

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      // Resumo e lista de um cruzamento só — ver `buscarConferencia`.
      const { resumo: r, linhas: l } = await buscarConferencia(empresaId, mes, 500);
      setResumo(r); setLinhas(l);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao comparar o 59 com o 58.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  const cartoes = useMemo(() => totalPorClasse(resumo), [resumo]);
  const ultimoDia = useMemo(() => ultimoDiaPorSetor(resumo), [resumo]);

  const setores = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of resumo) if (r.setorId) m.set(r.setorId, r.setorNome ?? r.setorId);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [resumo]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l =>
      (classeFiltro === 'all' || l.classe === classeFiltro) &&
      (setorFiltro === 'all' || l.setorId === setorFiltro) &&
      (!q
        || l.operadorNome.toLowerCase().includes(q)
        || l.cobradora.toLowerCase().includes(q)
        || l.nr.includes(q)),
    );
  }, [linhas, busca, setorFiltro, classeFiltro]);

  const somaVisivel = useMemo(
    () => visiveis.reduce((t, l) => t + Math.abs(l.delta), 0),
    [visiveis],
  );

  if (carregando) return <Skeleton className="h-64 rounded-2xl" />;
  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {erro}
      </div>
    );
  }

  const totalDivergencia = cartoes.find(c => c.classe === 'divergencia');

  return (
    <div className="space-y-3">

      {/* ── O veredito, numa frase ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-card/95 p-4 shadow-sm">
        <div className="flex items-start gap-2.5">
          <div className={cn(
            'rounded-lg border p-1.5',
            totalDivergencia ? CORES.divergencia : 'border-success/25 bg-success/10 text-success',
          )}>
            {totalDivergencia
              ? <AlertTriangle className="h-4 w-4" />
              : <Check className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">
              {totalDivergencia
                ? `${totalDivergencia.nrs} divergência${totalDivergencia.nrs !== 1 ? 's' : ''} sem explicação · ${formatBRL(totalDivergencia.valor)}`
                : 'Nenhuma divergência sem explicação neste mês.'}
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Os dois relatórios são comparados por <strong>setor + cobradora + NR</strong>, cada
              um passado pelo mesmo recorte: a carteira manda, colchão e Retenção ficam fora do
              setor. Tudo que tem explicação é separado nas outras classes — o número acima é o
              que sobra.
            </p>
          </div>
        </div>
      </div>

      {/* ── A mesma pergunta pelo outro lado: o que o 58 tem e o 59 não ── */}
      <Mestre59Pendencias
        empresaId={empresaId}
        mes={mes}
        versao={versao}
        setorId={setorFiltro === 'all' ? null : setorFiltro}
      />

      {/* ── Os cartões: cada um é um filtro, com o porquê junto ─────────── */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cartoes.map(({ classe, nrs, valor }) => {
          const Icon = ICONE[classe];
          const ativo = classeFiltro === classe;
          return (
            <button key={classe} type="button"
              onClick={() => setClasseFiltro(ativo ? 'all' : classe)}
              title={ROTULO_CLASSE[classe].porque}
              className={cn(
                'rounded-2xl border p-3 text-left transition-all',
                ativo ? 'border-primary ring-1 ring-primary/30' : 'border-border/40 hover:border-border',
                'bg-card/95',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn('rounded border px-1 py-0.5', CORES[classe])}>
                  <Icon className="h-3 w-3" />
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {ROTULO_CLASSE[classe].curto}
                </span>
                {pedeAtencao(classe) && (
                  <span className="ml-auto rounded bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive">
                    olhar
                  </span>
                )}
                {pedeImportacao(classe) && (
                  <span className="ml-auto rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
                    importar
                  </span>
                )}
                {/* Setor não integrado não pede nada de quem está olhando: não
                    existe 58 dele para importar. Marcar «importar» aqui mandaria
                    procurar um arquivo que não existe. Ver `esperaIntegracao`. */}
                {esperaIntegracao(classe) && (
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    integração
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-mono text-sm font-bold tabular-nums text-foreground">
                {formatBRL(valor)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {nrs} documento{nrs !== 1 ? 's' : ''}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-3">
                {ROTULO_CLASSE[classe].porque}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── Até onde o 58 de cada setor chegou ──────────────────────────── */}
      {setores.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/95 p-3 shadow-sm">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Até que dia o 58 de cada setor chegou
          </p>
          <div className="flex flex-wrap gap-1.5">
            {setores.map(([id, nome]) => {
              const dia = ultimoDia.get(id) ?? null;
              return (
                <span key={id}
                  title={dia
                    ? undefined
                    : 'Este setor ainda não foi integrado ao sistema de gestão: não existe 58 '
                      + 'dele para importar. O 59 é a única fonte deste dinheiro.'}
                  className="rounded-lg border border-border/50 bg-muted/30 px-2 py-1 text-[11px] text-foreground"
                >
                  {nome}{' '}
                  <strong className={cn(
                    'font-mono tabular-nums',
                    !dia && 'font-sans text-muted-foreground',
                  )}>
                    {dia ? diaCurto(dia) : 'não integrado'}
                  </strong>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            O <strong>último dia</strong> de cada setor é sempre parcial: o relatório foi
            exportado no meio daquele dia, e o 59 tem o dia inteiro. Por isso ele entra como
            «dia aberto», não como divergência.
          </p>
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 rounded-xl pl-8 text-xs"
            placeholder="Pessoa, login ou NR do documento…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <Select value={setorFiltro} onValueChange={setSetorFiltro}>
          <SelectTrigger className="h-9 w-48 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {setores.map(([id, nome]) => (
              <SelectItem key={id} value={id}>{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={classeFiltro}
          onValueChange={v => setClasseFiltro(v as ClasseDivergencia | 'all')}
        >
          <SelectTrigger className="h-9 w-44 rounded-xl text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as classes</SelectItem>
            {cartoes.map(({ classe }) => (
              <SelectItem key={classe} value={classe}>{ROTULO_CLASSE[classe].curto}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── A lista ─────────────────────────────────────────────────────── */}
      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/95 p-6 text-center">
          <Check className="mx-auto mb-2 h-5 w-5 text-success" />
          <p className="text-sm font-medium text-foreground">Nada nesse recorte.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {classeFiltro === 'divergencia'
              ? 'Nenhuma diferença sem explicação nos filtros escolhidos.'
              : 'Tente outra classe ou limpe os filtros.'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card/95 shadow-sm">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-semibold">Pessoa</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Setor</th>
                  <th className="px-3 py-2.5 text-left font-semibold">NR</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Dia</th>
                  <th className="px-3 py-2.5 text-right font-semibold">No 59</th>
                  <th className="px-3 py-2.5 text-right font-semibold">No 58</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Diferença</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Classe</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={`${l.setorId}::${l.cobradora}::${l.nr}`}
                    className="border-b border-border/25">
                    <td className="px-3 py-2">
                      <span className="block text-xs font-medium text-foreground">
                        {l.operadorNome}
                      </span>
                      {l.operadorNome !== l.cobradora && (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {l.cobradora}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">{l.setorNome ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{l.nr}</td>
                    <td className="px-3 py-2 text-center font-mono text-[11px] tabular-nums text-foreground">
                      {diaCurto(l.dia)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
                      {formatBRL(l.valor59)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
                      {formatBRL(l.valor58)}
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums',
                      l.delta > 0 ? 'text-foreground' : 'text-destructive',
                    )}>
                      {l.delta > 0 ? '+' : ''}{formatBRL(l.delta)}
                      <span className="block text-[9px] font-normal text-muted-foreground">
                        {SITUACAO[l.situacao]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        title={ROTULO_CLASSE[l.classe].porque}
                        className={cn(
                          'inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium',
                          CORES[l.classe],
                        )}
                      >
                        {ROTULO_CLASSE[l.classe].curto}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {visiveis.length} documento{visiveis.length !== 1 ? 's' : ''} nos filtros ·{' '}
            <strong className="font-mono tabular-nums">{formatBRL(somaVisivel)}</strong> em
            diferença absoluta. A diferença é <strong>59 menos 58</strong>: positiva quer dizer
            que o 59 tem mais.
          </p>
        </>
      )}
    </div>
  );
}
