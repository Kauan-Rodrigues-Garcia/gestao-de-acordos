/**
 * Mestre59Pendencias — o que o 58 trouxe e o 59 ainda não confirmou.
 *
 * ## Por que fica dentro da Conferência, e não numa aba própria
 *
 * É a mesma pergunta vista do outro lado. A conferência olha onde as duas
 * fontes discordam; a pendência olha uma coisa só — linha que o 58 tem e o 59
 * não — e acrescenta o que a conferência não sabe dizer: **há quantas rodadas
 * do 59 aquilo está assim**.
 *
 * Separar em duas abas faria a pessoa abrir duas telas para responder «está tudo
 * batendo?». Em setembro/2026 são 18 linhas; uma aba inteira para 18 linhas é
 * um convite a nunca abri-la.
 *
 * ## A escalada é o conteúdo
 *
 * `aguardando` é o estado normal de qualquer 58 recém-importado e não cobra
 * nada de ninguém. `critico` é o 59 tendo rodado duas vezes sem trazer a linha
 * — e aí ou o ERP tirou do 59 o que manteve no 58, ou a carteira daquela
 * cobrança não está vinculada àquele setor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarPendencias,
  buscarResumoPendencias,
  pedeAcao,
  ROTULO_SEVERIDADE,
  totalPorSeveridade,
  type Pendencia,
  type ResumoPendencia,
  type Severidade,
} from '@/services/analitico/pendencias.service';

interface Props {
  empresaId: string;
  mes: string;
  versao?: number;
  /** Quando a Conferência está filtrada por setor, a pendência acompanha. */
  setorId?: string | null;
}

const diaCurto = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

const CORES: Record<Severidade, string> = {
  critico:    'border-destructive/25 bg-destructive/10 text-destructive',
  pendente:   'border-warning/25 bg-warning/10 text-warning',
  aguardando: 'border-border/50 bg-muted/40 text-muted-foreground',
};

export default function Mestre59Pendencias({ empresaId, mes, versao, setorId }: Props) {
  const [linhas, setLinhas] = useState<Pendencia[]>([]);
  const [resumo, setResumo] = useState<ResumoPendencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [l, r] = await Promise.all([
        buscarPendencias(empresaId, mes, { setorId: setorId ?? null, limite: 500 }),
        buscarResumoPendencias(empresaId, mes),
      ]);
      setLinhas(l); setResumo(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar as pendências.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes, setorId]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  const cartoes = useMemo(() => totalPorSeveridade(resumo), [resumo]);
  const grave = useMemo(() => cartoes.find(c => pedeAcao(c.severidade)), [cartoes]);
  const total = useMemo(
    () => cartoes.reduce((t, c) => ({ linhas: t.linhas + c.linhas, valor: t.valor + c.valor }),
      { linhas: 0, valor: 0 }),
    [cartoes],
  );

  /* Quando existe crítico, a lista abre sozinha: é o único estado em que alguém
     precisa ver a linha, e não só o número. */
  useEffect(() => { if (grave) setAberto(true); }, [grave]);

  if (carregando) return <Skeleton className="h-24 rounded-2xl" />;
  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {erro}
      </div>
    );
  }

  if (total.linhas === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/95 p-3 text-center">
        <p className="text-xs text-muted-foreground">
          <Check className="mr-1 inline h-3.5 w-3.5 text-success" />
          Nenhuma linha do 58 esperando confirmação do 59 em {mes}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm">
      <button type="button" onClick={() => setAberto(a => !a)}
        className="flex w-full items-start gap-2.5 p-4 text-left">
        <div className={cn('rounded-lg border p-1.5', CORES[grave ? 'critico' : 'aguardando'])}>
          {grave ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">
            {total.linhas} linha{total.linhas !== 1 ? 's' : ''} do 58 esperando o 59 ·{' '}
            {formatBRL(total.valor)}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {grave
              ? `${grave.linhas} delas o 59 já teve duas chances de trazer e não trouxe — essas merecem ser abertas.`
              : 'O valor conta normalmente. Está só esperando a fonte oficial confirmar.'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {cartoes.map(({ severidade, linhas: n, valor }) => (
              <span key={severidade}
                title={ROTULO_SEVERIDADE[severidade].porque}
                className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', CORES[severidade])}
              >
                {ROTULO_SEVERIDADE[severidade].curto}: {n} · {formatBRL(valor)}
              </span>
            ))}
          </div>
        </div>
        <ChevronDown className={cn(
          'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
          aberto && 'rotate-180',
        )} />
      </button>

      {aberto && (
        <div className="border-t border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Pessoa</th>
                  <th className="px-3 py-2 text-left font-semibold">Setor</th>
                  <th className="px-3 py-2 text-left font-semibold">NR</th>
                  <th className="px-3 py-2 text-center font-semibold">Dia</th>
                  <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  <th className="px-3 py-2 text-center font-semibold">Rodadas do 59</th>
                  <th className="px-3 py-2 text-left font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(p => (
                  <tr key={p.id} className="border-b border-border/20">
                    <td className="px-3 py-2">
                      <span className="block text-xs font-medium text-foreground">
                        {p.operadorNome}
                      </span>
                      {p.operadorNome !== p.operadorUsuario && (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {p.operadorUsuario}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">{p.setorNome ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{p.nr}</td>
                    <td className="px-3 py-2 text-center font-mono text-[11px] tabular-nums text-foreground">
                      {diaCurto(p.dia)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-medium text-foreground">
                      {formatBRL(p.valor)}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs tabular-nums text-muted-foreground">
                      {p.promocoesDesde}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        title={ROTULO_SEVERIDADE[p.severidade].porque}
                        className={cn(
                          'inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium',
                          CORES[p.severidade],
                        )}
                      >
                        {ROTULO_SEVERIDADE[p.severidade].curto}
                      </span>
                      {p.no59EmOutroSetor && (
                        <span className="mt-0.5 block text-[9px] text-muted-foreground">
                          o 59 tem este NR em outro setor
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-[10px] leading-snug text-muted-foreground">
            <strong>Rodadas do 59</strong> é quantas vezes o relatório mestre foi importado
            depois de o 58 trazer esta linha. Zero quer dizer que o 59 nem rodou desde então —
            não é cobrança de ninguém. Duas ou mais é crítico: o 59 teve duas chances de trazer
            e não trouxe.
          </p>
        </div>
      )}
    </div>
  );
}
