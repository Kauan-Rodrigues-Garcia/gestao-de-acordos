/**
 * OndeOResultadoAcontece — a tabela da Visão Geral, por setor e por equipe.
 *
 * ## Por que deixou de ser por carteira (14/09/2026)
 *
 * A tabela somava o 59 por CARTEIRA, direto das linhas cruas
 * (`fn_mestre_diretoria_visao_geral`). Os cards de «Setores e equipes» somam por
 * SETOR em `fn_mestre_diretoria_linhas`, que aplica equipe movida de setor, a
 * segunda perna do `Integral` e o descarte do colchão. Mesmo dinheiro, regras
 * diferentes: as duas abas nunca iam bater, e foi exatamente o que a Diretoria
 * reclamou.
 *
 * Agora a tabela lê `buscarGradeDeSetores` — a MESMA chamada dos cards — e o
 * setor mostra o mesmo número nas duas abas por construção.
 *
 * ## As equipes são as do Gestão
 *
 * Pedido do mesmo dia: «mostrar os setores e as equipes que existem no gestão;
 * caso no 59 exista alguma equipe que não esteja vinculada a alguma equipe do
 * sistema, separar da lista». Dentro de cada setor, a equipe do 59 soma na equipe
 * do sistema a que está vinculada (`separarEquipesDo59`); a que não tem vínculo
 * vai para a lista de baixo, com o setor ao lado.
 *
 * As equipes de todos os setores vêm numa chamada só
 * (`fn_mestre_diretoria_equipes_dos_setores`, 17/09/2026), depois da grade. Até
 * então era uma `fn_mestre_diretoria_setor` por setor, e era a consulta mais
 * pesada do painel — ver `buscarEquipesDosSetores`.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Link2Off, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { variacao, intensidadeDaBarra } from '@/services/mestre/diretoria.service';
import {
  buscarGradeDeSetores, buscarDetalheDoSetor, buscarEquipesDosSetores, espiarGradeDeSetores,
  type GradeDeSetores, type EquipeDoSetor,
} from '@/services/mestre/diretoriaSetores.service';
import {
  separarEquipesDo59, type EquipeVinculada59,
} from '@/services/mestre/equipesDiretoria';
import { SeloVariacao } from './components';

/**
 * Quantos detalhes de setor vão ao banco ao mesmo tempo — só no caminho antigo,
 * enquanto `fn_mestre_diretoria_equipes_dos_setores` não estiver aplicada.
 */
const LOTE = 4;

type EquipesDoSetor = { vinculadas: EquipeVinculada59[]; semVinculo: EquipeDoSetor[] } | 'erro';

function Barra({ valor, maior }: { valor: number; maior: number }) {
  const largura = maior ? Math.max(2, (valor / maior) * 100) : 0;
  return (
    <span className="hidden h-2 w-[22%] shrink-0 overflow-hidden rounded-full bg-muted/60 sm:block">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${largura}%`, opacity: intensidadeDaBarra(valor, maior) }}
      />
    </span>
  );
}

export function OndeOResultadoAcontece({
  empresaId, mes, diaCorte, versao = 0,
}: {
  empresaId: string;
  mes: string;
  /** O corte da Visão Geral: a tabela mede o mesmo trecho do mês que o resto da aba. */
  diaCorte: number;
  versao?: number;
}) {
  const [grade, setGrade] = useState<GradeDeSetores | null>(
    () => (empresaId ? espiarGradeDeSetores(empresaId, mes, diaCorte) ?? null : null),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [equipes, setEquipes] = useState<Record<string, EquipesDoSetor>>({});
  /** Setores abertos. Nascem todos fechados: as equipes só aparecem no clique (14/09/2026). */
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    setErro(null);
    setEquipes({});
    void (async () => {
      try {
        const g = await buscarGradeDeSetores(empresaId, mes, diaCorte);
        if (!vivo) return;
        setGrade(g);
        const ids = [...g.setores].sort((a, b) => b.valor - a.valor).map(s => s.setorId);

        // Caminho de uma chamada só (migration 20260917160000). `null` = a
        // função ainda não existe no banco, e aí vale o laço de baixo.
        let todas: Record<string, EquipeDoSetor[]> | null;
        try {
          todas = await buscarEquipesDosSetores(empresaId, mes, diaCorte);
        } catch {
          if (vivo) setEquipes(Object.fromEntries(ids.map(id => [id, 'erro' as const])));
          return;
        }
        if (!vivo) return;
        if (todas) {
          setEquipes(Object.fromEntries(ids.map(id => [id, separarEquipesDo59(todas[id] ?? [])])));
          return;
        }

        for (let i = 0; i < ids.length; i += LOTE) {
          const lote = ids.slice(i, i + LOTE);
          const resultados = await Promise.all(lote.map(async id => {
            try {
              const d = await buscarDetalheDoSetor(empresaId, mes, { setorId: id }, diaCorte);
              return [id, separarEquipesDo59(d.equipes)] as const;
            } catch {
              return [id, 'erro' as const] as const;
            }
          }));
          if (!vivo) return;
          setEquipes(atual => ({ ...atual, ...Object.fromEntries(resultados) }));
        }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar os setores.');
      }
    })();
    return () => { vivo = false; };
  }, [empresaId, mes, diaCorte, versao]);

  const setores = useMemo(
    () => [...(grade?.setores ?? [])].sort((a, b) => b.valor - a.valor),
    [grade],
  );

  /** Todas as equipes do 59 sem vínculo, de todos os setores, com o setor ao lado. */
  const semVinculo = useMemo(() => {
    const lista: (EquipeDoSetor & { setorNome: string })[] = [];
    for (const s of setores) {
      const e = equipes[s.setorId];
      if (!e || e === 'erro') continue;
      for (const x of e.semVinculo) lista.push({ ...x, setorNome: s.setorNome });
    }
    return lista.sort((a, b) => b.valor - a.valor);
  }, [setores, equipes]);

  if (erro) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
        <span>Não foi possível montar os setores: {erro}</span>
      </div>
    );
  }

  if (!grade) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 rounded-lg" />)}
      </div>
    );
  }

  const maior = setores[0]?.valor ?? 0;
  const totalSemVinculo = semVinculo.reduce((t, e) => t + e.valor, 0);
  const carregandoEquipes = setores.some(s => !(s.setorId in equipes));
  const diferencaIntegral = grade.totalSetores - grade.totalEmpresa;

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        {setores.map(s => {
          const aberto = abertos.has(s.setorId);
          const e = equipes[s.setorId];
          return (
            <div key={s.setorId}>
              <button
                type="button"
                onClick={() => setAbertos(atual => {
                  const novo = new Set(atual);
                  if (novo.has(s.setorId)) novo.delete(s.setorId); else novo.add(s.setorId);
                  return novo;
                })}
                aria-expanded={aberto}
                className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                  <span className="truncate text-xs font-semibold text-foreground" title={s.setorNome}>{s.setorNome}</span>
                </span>
                <Barra valor={s.valor} maior={maior} />
                <span className="w-[104px] shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                  {formatBRL(s.valor)}
                </span>
                <span className="w-[62px] shrink-0 text-right">
                  <SeloVariacao pct={s.temAnterior ? variacao(s.valor, s.valorAnterior) : null} />
                </span>
              </button>

              {aberto && (
                <div className="mb-1 ml-5 border-l border-border/60 pl-2">
                  {e === undefined ? (
                    <Skeleton className="my-1 h-5 w-2/3 rounded" />
                  ) : e === 'erro' ? (
                    <p className="py-1 text-[11px] text-muted-foreground">Equipes indisponíveis neste setor.</p>
                  ) : e.vinculadas.length === 0 ? (
                    <p className="py-1 text-[11px] text-muted-foreground">Nenhuma equipe do Gestão com recebimento no período.</p>
                  ) : (
                    e.vinculadas.map(v => (
                      <div key={v.equipeId} className="flex items-center gap-3 rounded-md px-1.5 py-1 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-foreground" title={v.rotulos59.join(', ')}>
                          {v.nome}
                          {v.liderNome && <span className="text-muted-foreground"> · {v.liderNome}</span>}
                        </span>
                        <Barra valor={v.valor} maior={maior} />
                        <span className="w-[104px] shrink-0 text-right font-mono tabular-nums text-foreground">
                          {formatBRL(v.valor)}
                        </span>
                        <span className="w-[62px] shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {grade.carteirasSemSetor.map(c => (
          <div key={c.cod} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
            <span className="flex min-w-0 flex-1 items-center gap-2 pl-5">
              <span className="truncate text-xs text-foreground" title={c.nome}>{c.nome}</span>
              <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase text-muted-foreground">
                sem setor
              </span>
            </span>
            <Barra valor={c.valor} maior={maior} />
            <span className="w-[104px] shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
              {formatBRL(c.valor)}
            </span>
            <span className="w-[62px] shrink-0 text-right">
              <SeloVariacao pct={c.valorAnterior > 0 ? variacao(c.valor, c.valorAnterior) : null} />
            </span>
          </div>
        ))}
      </div>

      {/* A equipe do 59 que não chegou a equipe nenhuma do sistema. */}
      {(semVinculo.length > 0 || carregandoEquipes) && (
        <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
            Equipes do 59 sem vínculo com equipe do sistema
            {semVinculo.length > 0 && (
              <span className="font-mono font-normal tabular-nums text-muted-foreground">· {formatBRL(totalSemVinculo)}</span>
            )}
          </p>
          <p className="mb-1 text-[10px] text-muted-foreground">
            Contam no setor, e ficam fora das equipes acima. O vínculo é feito na aba Relatório 59.
          </p>
          {semVinculo.map(x => (
            <div key={`${x.setorNome}|${x.codGrupo}|${x.nome}`} className="flex items-center gap-3 py-0.5 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {x.nome}
                <span className="text-muted-foreground"> · {x.setorNome}{!x.eEquipe && ' · rótulo do ERP'}</span>
              </span>
              <span className="w-[104px] shrink-0 text-right font-mono tabular-nums text-foreground">
                {formatBRL(x.valor)}
              </span>
            </div>
          ))}
          {carregandoEquipes && <Skeleton className="mt-1 h-4 w-1/2 rounded" />}
        </div>
      )}

      {/* Sem esta frase alguém soma a coluna, compara com o total do alto da
          aba e conclui que o painel está errado. */}
      {diferencaIntegral > 0.005 && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          A soma dos setores passa do total da empresa em {formatBRL(diferencaIntegral)}: o
          {' '}<em>Integral</em> cobrado por um setor para outro conta nos dois — os mesmos números da aba Setores e equipes.
        </p>
      )}
    </div>
  );
}
