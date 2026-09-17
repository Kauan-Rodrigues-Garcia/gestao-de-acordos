/**
 * Mestre59Operadores — o recebimento de cada pessoa, e para onde ele foi.
 *
 * ## A pergunta que esta aba responde
 *
 * «Este operador recebeu quanto, e por que o número dele no setor é menor?»
 *
 * A resposta quase sempre é a mesma: parte do que ele cobrou caiu na carteira
 * de outro setor, ou numa carteira que ainda não foi vinculada. Isso não é erro
 * — é o desenho da operação — mas ficava invisível, e o que não se vê vira
 * suspeita de bug.
 *
 * ## As duas colunas que importam
 *
 * **No setor dele** é o que conta para o setor da pessoa. É este o número que
 * bate com o 58 do setor.
 *
 * **Fora** é o resto, e o detalhe diz exatamente para onde foi: qual setor, qual
 * carteira, qual equipe. Nenhum centavo some da tela.
 *
 * ## Sem vínculo não é erro
 *
 * Carteira que ainda não foi amarrada a um setor da planilha aparece com o nome
 * que o ERP manda e um selo «sem vínculo». O valor conta igual — vincular é o
 * que o torna oficial, não o que o faz existir.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Search, ChevronDown, AlertCircle, Link2Off } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarOperadoresDoMes,
  espiarOperadoresDoMes,
  buscarOperadorDetalhe,
  type OperadorDoMes,
  type OperadorDetalhe,
} from '@/services/mestre/operadores.service';

interface Props {
  empresaId: string;
  mes: string;
  versao?: number;
}

/** Uma linha de valor com rótulo, usada nos três blocos do detalhe. */
function Parte({
  rotulo, valor, linhas, selo, destaque,
}: {
  rotulo: string;
  valor: number;
  linhas: number;
  selo?: { texto: string; tom: 'aviso' | 'ok' } | null;
  destaque?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-1.5',
      destaque ? 'bg-primary/10 border border-primary/20' : 'bg-card/60',
    )}>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{rotulo}</span>
      {selo && (
        <span className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
          selo.tom === 'aviso'
            ? 'bg-warning/15 text-warning'
            : 'bg-success/15 text-success',
        )}>
          {selo.texto}
        </span>
      )}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {linhas} linha{linhas !== 1 ? 's' : ''}
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums font-medium text-foreground">
        {formatBRL(valor)}
      </span>
    </div>
  );
}

function Detalhe({ d }: { d: OperadorDetalhe }) {
  return (
    <div className="space-y-4 bg-muted/20 px-5 py-4">

      {/* A conta, em linha: total = no setor dele + fora. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono tabular-nums font-semibold text-foreground">
          {formatBRL(d.total)}
        </span>
        <span className="text-muted-foreground">=</span>
        <span className="font-mono tabular-nums text-success">{formatBRL(d.noSetorDele)}</span>
        <span className="text-[10px] text-muted-foreground">
          (no setor {d.setorNome ? `· ${d.setorNome}` : 'dele'})
        </span>
        {d.foraDoSetorDele !== 0 && (
          <>
            <span className="text-muted-foreground">+</span>
            <span className="font-mono tabular-nums text-chart-4">
              {formatBRL(d.foraDoSetorDele)}
            </span>
            <span className="text-[10px] text-muted-foreground">(fora)</span>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Para qual setor foi
          </h4>
          <div className="space-y-1">
            {d.porSetor.map(s => (
              <Parte
                key={s.setorId ?? s.rotulo}
                rotulo={s.rotulo}
                valor={s.valor}
                linhas={s.linhas}
                destaque={s.eOSetorDele}
                selo={!s.oficial ? { texto: 'sem vínculo', tom: 'aviso' }
                    : s.eOSetorDele ? { texto: 'setor dele', tom: 'ok' } : null}
              />
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Por carteira do ERP
          </h4>
          <div className="space-y-1">
            {d.porCarteira.map(c => (
              <Parte
                key={c.cod}
                rotulo={`${c.cod} · ${c.nome}`}
                valor={c.valor}
                linhas={c.linhas}
                selo={c.oficial
                  ? (c.setorNome ? { texto: c.setorNome, tom: 'ok' } : null)
                  : { texto: 'sem vínculo', tom: 'aviso' }}
              />
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Por equipe
          </h4>
          <div className="space-y-1">
            {d.porEquipe.map(e => (
              <Parte
                key={`${e.codGrupo}::${e.subgrupo}`}
                rotulo={e.vinculada && e.equipeNome ? e.equipeNome : e.subgrupo}
                valor={e.valor}
                linhas={e.linhas}
                selo={e.vinculada ? null : { texto: 'não vinculada', tom: 'aviso' }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Mestre59Operadores({ empresaId, mes, versao }: Props) {
  // Abre com a lista guardada, se houver — ver `cache59.ts`.
  const [linhas, setLinhas]       = useState<OperadorDoMes[]>(
    () => (empresaId ? espiarOperadoresDoMes(empresaId, mes) ?? [] : []),
  );
  const [carregando, setCarregando] = useState(() => !(empresaId && espiarOperadoresDoMes(empresaId, mes)));
  const [erro, setErro]           = useState<string | null>(null);
  const [busca, setBusca]         = useState('');
  const [setorFiltro, setSetorFiltro] = useState<string>('all');
  /* Um detalhe aberto por vez: dois painéis longos abertos juntos empurram
     para fora da tela a lista que dá o contexto. */
  const [aberto, setAberto]       = useState<string | null>(null);
  const [detalhe, setDetalhe]     = useState<OperadorDetalhe | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const guardada = espiarOperadoresDoMes(empresaId, mes);
    if (guardada) setLinhas(guardada);
    setCarregando(!guardada); setErro(null);
    try {
      setLinhas(await buscarOperadoresDoMes(empresaId, mes));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar os operadores.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);
  /* Trocar de mês fecha o detalhe: ele é do mês anterior, e deixá-lo aberto
     mostraria números de um período que o cabeçalho não indica mais. */
  useEffect(() => { setAberto(null); setDetalhe(null); }, [mes, empresaId]);

  const abrir = useCallback(async (cobradora: string) => {
    if (aberto === cobradora) { setAberto(null); setDetalhe(null); return; }
    setAberto(cobradora); setDetalhe(null); setErroDetalhe(null);
    try {
      setDetalhe(await buscarOperadorDetalhe(empresaId, mes, cobradora));
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : 'Falha ao abrir o detalhe.');
    }
  }, [aberto, empresaId, mes]);

  const setores = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (l.setorId && l.setorNome) m.set(l.setorId, l.setorNome);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [linhas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l => {
      /* «Sem registro» é sobre PERFIL, não sobre setor: existe gente com perfil
         e sem setor, e são casos diferentes. O filtro segue o selo da tabela. */
      const passaSetor =
        setorFiltro === 'all' ? true
        : setorFiltro === 'sem' ? !l.temPerfil
        : l.setorId === setorFiltro;
      if (!passaSetor) return false;
      if (!q) return true;
      return l.cobradora.toLowerCase().includes(q)
          || (l.nome?.toLowerCase().includes(q) ?? false);
    });
  }, [linhas, busca, setorFiltro]);

  const soma = useMemo(() => ({
    total:  visiveis.reduce((s, l) => s + l.total, 0),
    dentro: visiveis.reduce((s, l) => s + l.noSetorDele, 0),
    fora:   visiveis.reduce((s, l) => s + l.foraDoSetorDele, 0),
    semPerfil: visiveis.filter(l => !l.temPerfil).length,
  }), [visiveis]);

  if (carregando) return <Skeleton className="h-64 rounded-2xl" />;
  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Recebimento por pessoa, em {mes}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Somado pela cobradora do 59 — atravessa carteira e equipe. Só leitura.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar pessoa…"
              className="h-9 w-48 rounded-xl pl-8 text-xs"
            />
          </div>
          <Select value={setorFiltro} onValueChange={setSetorFiltro}>
            <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              <SelectItem value="sem">Sem registro na planilha</SelectItem>
              {setores.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile rotulo="Pessoas" valor={String(visiveis.length)}
          sub={soma.semPerfil > 0 ? `${soma.semPerfil} sem registro` : 'todas com registro'} />
        <Tile rotulo="Total" valor={formatBRL(soma.total)} sub="tudo o que cobraram" />
        <Tile rotulo="No setor delas" valor={formatBRL(soma.dentro)} sub="o que conta no setor" />
        <Tile rotulo="Fora do setor" valor={formatBRL(soma.fora)}
          sub="outra carteira — abre no detalhe" tom={soma.fora > 0 ? 'alerta' : undefined} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card/95 shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-2.5 text-left font-semibold">Pessoa</th>
              <th className="px-3 py-2.5 text-left font-semibold">Setor</th>
              <th className="px-3 py-2.5 text-right font-semibold">Total</th>
              <th className="px-3 py-2.5 text-right font-semibold">No setor dela</th>
              <th className="px-3 py-2.5 text-right font-semibold">Fora</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(l => {
              const abertoAqui = aberto === l.cobradora;
              return (
                <Fragment key={l.cobradora}>
                  <tr
                    className={cn(
                      'cursor-pointer border-b border-border/25 transition-colors hover:bg-muted/30',
                      abertoAqui && 'bg-muted/30',
                    )}
                    onClick={() => void abrir(l.cobradora)}
                  >
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <ChevronDown className={cn(
                          'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                          abertoAqui && 'rotate-180',
                        )} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {l.nome ?? l.cobradora}
                          </span>
                          {l.nome && (
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {l.cobradora}
                            </span>
                          )}
                        </span>
                        {!l.temPerfil && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                            title="Aparece no 59 e não tem perfil cadastrado. O valor conta para o setor do mesmo jeito."
                          >
                            <Link2Off className="h-2.5 w-2.5" /> sem registro
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-foreground">
                      {l.setorNome ?? <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBRL(l.total)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums font-semibold text-foreground">
                      {formatBRL(l.noSetorDele)}
                    </td>
                    <td className={cn(
                      'px-3 py-2.5 text-right font-mono text-xs tabular-nums',
                      l.foraDoSetorDele > 0 ? 'text-chart-4' : 'text-muted-foreground/40',
                    )}>
                      {l.foraDoSetorDele > 0 ? formatBRL(l.foraDoSetorDele) : '—'}
                    </td>
                  </tr>
                  {abertoAqui && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        {erroDetalhe ? (
                          <div className="flex items-center gap-2 bg-destructive/10 px-5 py-3 text-xs text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" /> {erroDetalhe}
                          </div>
                        ) : detalhe ? (
                          <Detalhe d={detalhe} />
                        ) : (
                          <div className="px-5 py-4">
                            <Skeleton className="h-24 rounded-xl" />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  Nenhuma pessoa com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({
  rotulo, valor, sub, tom,
}: { rotulo: string; valor: string; sub?: string; tom?: 'alerta' }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/95 px-4 py-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className={cn(
        'mt-0.5 font-mono text-base tabular-nums font-bold',
        tom === 'alerta' ? 'text-chart-4' : 'text-foreground',
      )}>
        {valor}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
