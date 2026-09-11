/**
 * ParedeDeAparelhos — cada aparelho e as seis vagas dele, de relance.
 *
 * É a pergunta que o Núcleo faz de pé, olhando a bancada: «qual celular tem
 * vaga?», «em qual deles os chips estão morrendo?». Uma lista responderia linha
 * a linha; aqui cada aparelho é uma faixa de seis casas, e a resposta é a forma.
 *
 * ## O que cada casa diz
 *
 *   cor ........ a situação — aquecendo, ativo, banido —, nos tons de estado do
 *                sistema e sempre com legenda: nunca só a cor;
 *   ponto ...... o número já saiu para um setor;
 *   tracejada .. vaga livre.
 *
 * Cada casa leva o número e o estado no `title` e no `aria-label`, então quem
 * não distingue as cores lê a mesma coisa.
 */
import { Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  LIMITE_POR_CELULAR, SITUACOES, SITUACAO_LABELS, type Situacao,
} from '@/services/numeros/numerosRegras';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

/** Os mesmos tons das etiquetas de situação (`CORES_SITUACAO`), em cheio. */
const COR_DA_CASA: Record<Situacao, string> = {
  em_aquecimento:     'bg-warning',
  ativo:              'bg-success',
  banido:             'bg-destructive',
  aguardando_12h:     'bg-sky-400',
  aguardando_24h:     'bg-sky-600',
  movimentando_proxy: 'bg-violet-500',
  em_restricao:       'bg-orange-500',
};

export interface ParedeDeAparelhosProps {
  aparelhos: CelularComNumeros[];
  nomeDoSetor: (setorId: string) => string;
}

export function ParedeDeAparelhos({ aparelhos, nomeDoSetor }: ParedeDeAparelhosProps) {
  // «Celular 2» antes de «Celular 10»: a ordem que a bancada usa.
  const ordenados = [...aparelhos].sort((a, b) =>
    a.celular.identificacao.localeCompare(b.celular.identificacao, 'pt-BR', { numeric: true }));
  const vagas  = aparelhos.reduce((s, a) => s + (a.celular.ativo ? a.vagas : 0), 0);
  const cheios = aparelhos.filter(a => a.cheio).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Aparelhos, vaga a vaga</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {aparelhos.length} {aparelhos.length === 1 ? 'aparelho' : 'aparelhos'}
            {' · '}{vagas} {vagas === 1 ? 'vaga livre' : 'vagas livres'}
            {cheios > 0 ? ` · ${cheios} ${cheios === 1 ? 'cheio' : 'cheios'}` : ''}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legenda">
          {SITUACOES.map(s => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-[3px]', COR_DA_CASA[s])} aria-hidden />
              {SITUACAO_LABELS[s]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="relative h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/50" aria-hidden>
              <span className="absolute inset-0 m-auto h-1 w-1 rounded-full bg-background" />
            </span>
            No setor
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-muted-foreground/60" aria-hidden />
            Vaga livre
          </li>
        </ul>
      </CardHeader>

      <CardContent>
        {ordenados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Smartphone className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum aparelho cadastrado ainda.</p>
          </div>
        ) : (
          <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {ordenados.map(a => {
              const casas = Array.from({ length: LIMITE_POR_CELULAR }, (_, i) => a.numeros[i] ?? null);
              return (
                <li
                  key={a.celular.id}
                  className={cn('flex items-center gap-3', !a.celular.ativo && 'opacity-50')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.celular.identificacao}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {nomeDoSetor(a.celular.setor_id)}{a.celular.ativo ? '' : ' · inativo'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1" role="list" aria-label={`Vagas de ${a.celular.identificacao}`}>
                    {casas.map((n, i) => {
                      if (!n) {
                        return (
                          <span
                            key={`vaga-${i}`} role="listitem" aria-label="Vaga livre" title="Vaga livre"
                            className="h-5 w-5 rounded-[5px] border border-dashed border-muted-foreground/40"
                          />
                        );
                      }
                      const descricao = `${mascararNumero(n.numero)} · ${SITUACAO_LABELS[n.situacao]} · `
                        + (n.posse === 'setor' ? `no setor ${nomeDoSetor(n.setor_id)}` : 'no Núcleo');
                      return (
                        <span
                          key={n.id} role="listitem" aria-label={descricao} title={descricao}
                          className={cn('relative h-5 w-5 rounded-[5px]', COR_DA_CASA[n.situacao])}
                        >
                          {n.posse === 'setor' && (
                            <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-background" />
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {a.numeros.length}/{LIMITE_POR_CELULAR}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
