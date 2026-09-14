/**
 * Mestre59EquipesSugeridas — que equipe é cada subgrupo do 59.
 *
 * ## O que esta tela resolve
 *
 * Metade do dinheiro do 59 não chega às equipes porque o `subgrupo_equipe` do
 * ERP não está amarrado a nenhuma equipe do sistema: em setembro/2026 eram 77
 * subgrupos e apenas 18 vinculados.
 *
 * Vincular um por um é trabalho de garimpo. Esta tela faz o garimpo e entrega a
 * proposta pronta, **pelas pessoas** — quem recebeu naquele subgrupo já tem
 * equipe cadastrada. É por isso que ela acerta `EQUIPE DOUGLAS → HIBRIDO`, que
 * nenhum casamento de nome acertaria.
 *
 * ## Nada é vinculado sozinho
 *
 * As sugestões seguras vêm marcadas; o resto vem na lista, desmarcado, com o
 * motivo à vista. Quem confirma é quem manda — vínculo errado feito em silêncio
 * é pior que subgrupo sem vínculo, porque o sem vínculo aparece pedindo atenção
 * e o errado some no meio dos certos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Check, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarEquipesSugeridas,
  podeVincular,
  sugestaoConfiavel,
  type EquipeSugerida,
} from '@/services/mestre/equipesSugeridas.service';
import { vincularEquipe } from '@/services/mestre/mestre.service';

interface Props {
  empresaId: string;
  mes: string;
  versao?: number;
  /** Chamado depois de vincular, para a aba de trás recarregar os números. */
  aoVincular?: () => void;
}

const chaveDe = (s: EquipeSugerida) => `${s.codGrupo}::${s.subgrupo}`;

export default function Mestre59EquipesSugeridas({ empresaId, mes, versao, aoVincular }: Props) {
  const [linhas, setLinhas] = useState<EquipeSugerida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const dados = await buscarEquipesSugeridas(empresaId, mes);
      setLinhas(dados);
      // Só as seguras vêm marcadas. Ver `sugestaoConfiavel`.
      setMarcadas(new Set(dados.filter(s => podeVincular(s) && sugestaoConfiavel(s)).map(chaveDe)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar as sugestões.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  /* Sugestão que o banco vai recusar não entra na seleção: a guarda de
     `fn_mestre_vincular_equipe` barra equipe de outro setor, e deixar marcar
     seria oferecer um botão que só sabe falhar. Ver `podeVincular`. */
  const alternar = useCallback((chave: string, habilitada: boolean) => {
    if (!habilitada) return;
    setMarcadas(prev => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave);
      return proximo;
    });
  }, []);

  const selecionadas = useMemo(
    () => linhas.filter(s => marcadas.has(chaveDe(s))),
    [linhas, marcadas],
  );
  const valorSelecionado = useMemo(
    () => selecionadas.reduce((t, s) => t + s.valor, 0),
    [selecionadas],
  );

  const confirmar = useCallback(async () => {
    if (!selecionadas.length) return;
    setSalvando(true);
    let feitas = 0;
    const falhas: string[] = [];
    /* Uma a uma, de propósito: a RPC vincula um subgrupo por chamada, e um erro
       no meio não pode desfazer o que já passou — o que foi vinculado está
       certo, e refazer a lista é barato. */
    for (const s of selecionadas) {
      try {
        await vincularEquipe({
          empresaId, codGrupo: s.codGrupo, subgrupo: s.subgrupo,
          equipeId: s.equipeId, estado: 'vinculado',
        });
        feitas++;
      } catch (e) {
        falhas.push(`${s.subgrupo}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
    setSalvando(false);
    if (feitas > 0) {
      toast.success(`${feitas} equipe${feitas !== 1 ? 's' : ''} vinculada${feitas !== 1 ? 's' : ''}.`);
      aoVincular?.();
    }
    if (falhas.length) toast.error(falhas.slice(0, 3).join(' · '), { duration: 8000 });
    await carregar();
  }, [selecionadas, empresaId, carregar, aoVincular]);

  if (carregando) return <Skeleton className="h-48 rounded-2xl" />;
  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {erro}
      </div>
    );
  }
  if (!linhas.length) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/95 p-6 text-center">
        <Check className="mx-auto mb-2 h-5 w-5 text-success" />
        <p className="text-sm font-medium text-foreground">
          Nenhum subgrupo esperando vínculo em {mes}.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ou está tudo vinculado, ou o que falta não tem gente com equipe cadastrada —
          e aí o caminho é o vínculo manual.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5">
            <Link2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {linhas.length} subgrupo{linhas.length !== 1 ? 's' : ''} com equipe sugerida
            </h3>
            <p className="text-[11px] text-muted-foreground">
              A sugestão vem das pessoas que receberam, não do nome. Nada é vinculado sem você confirmar.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 rounded-xl"
            onClick={() => void carregar()} disabled={salvando}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recarregar
          </Button>
          <Button size="sm" className="h-9 rounded-xl"
            onClick={() => void confirmar()}
            disabled={salvando || selecionadas.length === 0}>
            {salvando
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Vinculando…</>
              : <>Vincular {selecionadas.length} · {formatBRL(valorSelecionado)}</>}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card/95 shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left font-semibold">Subgrupo no 59</th>
              <th className="px-3 py-2.5 text-left font-semibold">Setor da carteira</th>
              <th className="px-3 py-2.5 text-left font-semibold">Equipe sugerida</th>
              <th className="px-3 py-2.5 text-right font-semibold">Confiança</th>
              <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(s => {
              const chave = chaveDe(s);
              const segura = sugestaoConfiavel(s);
              const habilitada = podeVincular(s);
              return (
                <tr key={chave}
                  className={cn(
                    'border-b border-border/25 transition-colors',
                    habilitada ? 'cursor-pointer hover:bg-muted/30' : 'opacity-70',
                    marcadas.has(chave) && 'bg-primary/5',
                  )}
                  onClick={() => alternar(chave, habilitada)}
                >
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={marcadas.has(chave)}
                      disabled={!habilitada}
                      onCheckedChange={() => alternar(chave, habilitada)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-foreground">{s.subgrupo}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {s.codGrupo} · {s.carteira}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-foreground">
                    {s.setorNome ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-xs font-medium text-foreground">{s.equipeNome}</span>
                    {!s.mesmoSetor && (
                      <span
                        className="mt-0.5 inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                        title={
                          `A equipe é do setor ${s.equipeSetorNome ?? 'outro'} e a carteira é do ` +
                          `${s.setorNome ?? 'setor atual'}. Vincular mandaria o dinheiro desta ` +
                          'carteira para a equipe do outro setor, e o banco recusa. ' +
                          'Quase sempre é gente emprestada — se não for, o que precisa mudar é ' +
                          'o cadastro da carteira ou o setor da equipe.'
                        }
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        equipe de {s.equipeSetorNome ?? 'outro setor'} · não dá para vincular
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={cn(
                      'font-mono text-xs tabular-nums',
                      segura ? 'text-success' : 'text-muted-foreground',
                    )}>
                      {(s.concentracao * 100).toFixed(0)}%
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {s.pessoasNaEquipe} pessoa{s.pessoasNaEquipe !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums font-medium text-foreground">
                    {formatBRL(s.valor)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Vêm marcadas só as sugestões do <strong>mesmo setor</strong>, com{' '}
        <strong>duas pessoas ou mais</strong> e concentração acima de 90%. As outras
        estão na lista para você olhar: com uma pessoa só, «100%» significa apenas que
        existe uma pessoa.
      </p>
      {linhas.some(s => !podeVincular(s)) && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          As linhas apagadas <strong>não podem ser vinculadas por aqui</strong>: a equipe
          sugerida é de outro setor, e o banco recusa — vincular mandaria o dinheiro
          daquela carteira para a equipe de outro setor. Quase sempre é gente emprestada.
          Se não for, o que precisa mudar é o cadastro: ou o setor da carteira, ou o setor
          da equipe.
        </p>
      )}
    </div>
  );
}
