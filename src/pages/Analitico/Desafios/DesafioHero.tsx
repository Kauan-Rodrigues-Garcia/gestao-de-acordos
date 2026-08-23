/**
 * DesafioHero — o cartaz da campanha em cartaz.
 *
 * Responde, em uma olhada, às quatro primeiras perguntas do pedido: qual
 * desafio está acontecendo, qual é o prêmio, quanto tempo falta e quanto já foi
 * recebido.
 *
 * O tema entra como acabamento (gradiente diagonal, cor do destaque, ícone) sem
 * trocar a estrutura: continua sendo um `bg-card` com `border-border` e
 * `rounded-xl`, como todo card do Gestão.
 *
 * Nada aqui sabe que existe um "Café no IBIS": nome, prêmio, datas, critério e
 * ícone vêm da linha do desafio.
 */
import { CalendarDays, Trophy, Users } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import {
  rotuloCriterio, rotuloEscopoDisputa, rotuloPremiacao,
} from '@/services/desafios/tiposDesafio';
import { diasRestantes, situacaoDoPeriodo } from '@/services/desafios/calcularDesafio';
import type { Desafio } from '@/services/desafios/types';
import { dataBR, diaCurto, estiloDoTema, hojeISO } from './tema';
import { ProgressoDesafio } from './ProgressoDesafio';

interface Props {
  desafio: Desafio;
  totalRecebido: number;
  totalParticipantes: number;
  totalEquipes: number;
  /** Percentual da meta coletiva; ignorado quando a campanha não tem uma. */
  progressoColetivo: number;
  carregando?: boolean;
}

export function DesafioHero({
  desafio, totalRecebido, totalParticipantes, totalEquipes, progressoColetivo, carregando,
}: Props) {
  const tema  = estiloDoTema(desafio.visual.tema);
  const Icone = tema.Icone;
  const hoje  = hojeISO();
  const fase  = situacaoDoPeriodo(desafio, hoje);
  const faltam = diasRestantes(desafio.dataFim, hoje);

  const etiqueta =
    fase === 'antes'  ? 'Começa em breve'
    : fase === 'depois' ? 'Período encerrado'
    : faltam === 0 ? 'Último dia'
    : `Termina em ${faltam} dia${faltam === 1 ? '' : 's'}`;

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl border bg-card bg-gradient-to-br p-5 sm:p-6',
      tema.borda, tema.gradiente,
    )}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
              tema.selo,
            )}>
              <Icone className="h-3 w-3" /> Desafio ativo
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {diaCurto(desafio.dataInicio)} — {diaCurto(desafio.dataFim)}
            </span>
            <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {etiqueta}
            </span>
          </div>

          <h2 className={cn('truncate text-2xl font-bold sm:text-3xl', tema.destaque)}>
            {desafio.nome}
          </h2>

          {desafio.descricao && (
            <p className="max-w-xl text-sm text-muted-foreground">{desafio.descricao}</p>
          )}

          {/* A REGRA DO PRÊMIO, e não o critério de ordenação: numa campanha em
              que basta alcançar o valor, anunciar "mais perto da meta leva"
              seria dizer o contrário do que vale. O critério de ordenação
              continua visível, uma linha abaixo, como o que ele é. */}
          <p className="pt-1 text-sm font-medium text-foreground">
            {rotuloPremiacao(desafio.regra.premiacao)}
            {desafio.premio ? ` ${desafio.premio}.` : '.'}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {desafio.premio && (
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Trophy className={cn('h-3.5 w-3.5', tema.destaque)} /> {desafio.premio}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {totalParticipantes} participante{totalParticipantes === 1 ? '' : 's'}
            </span>
            {totalEquipes > 0 && (
              <span>{totalEquipes} equipe{totalEquipes === 1 ? '' : 's'}</span>
            )}
            <span>{rotuloEscopoDisputa(desafio.regra.escopoDisputa)}</span>
            <span>{rotuloCriterio(desafio.regra.criterioRanking)}</span>
            <span>Encerra {dataBR(desafio.dataFim)}</span>
          </div>
        </div>

        {/* O número grande. `ValorAnimado` é o mesmo componente que o Dashboard
            usa para que uma mudança discreta não passe despercebida. */}
        <div className="shrink-0 lg:text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recebido no desafio
          </p>
          <ValorAnimado
            valor={totalRecebido}
            formatar={formatBRL}
            carregando={carregando}
            className={cn('text-3xl font-bold sm:text-4xl', tema.destaque)}
            classeSubindo="text-emerald-500"
          />
          {desafio.regra.metaColetiva ? (
            <div className="mt-2 w-full lg:w-64">
              <ProgressoDesafio
                progresso={progressoColetivo}
                cor={tema.barra}
                aria-label="Progresso da meta coletiva"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Meta coletiva {formatBRL(desafio.regra.metaColetiva)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default DesafioHero;
