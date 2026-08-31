/**
 * TagFerias — quem está de férias, e até quando.
 *
 * A etiqueta antiga dizia só «Férias», e essa é metade da informação: o líder
 * que vê a lista quer saber quando pode contar com a pessoa de novo, e sem a
 * data ele pergunta — por WhatsApp, para outra pessoa, que também não sabe.
 *
 * Desde 01/09/2026 a data existe sempre (`definirSituacao` recusa férias sem
 * retorno), então a etiqueta pode prometê-la. Quando ela falta — perfil marcado
 * antes dessa data —, o componente degrada para o rótulo simples em vez de
 * mostrar «até null».
 *
 * Não filtra nada: informa. Quem some de ranking e quartil é decidido em
 * `idsOcultosRankingQuartil`.
 */
import { cn } from '@/lib/utils';

/** '2026-09-14' → '14/09'. O ano só entra quando não é o corrente. */
function ateQuando(iso: string): string {
  const [a, m, d] = iso.split('-');
  const anoAtual = String(new Date().getFullYear());
  return a === anoAtual ? `${d}/${m}` : `${d}/${m}/${a.slice(2)}`;
}

export function TagFerias({
  situacao, feriasAte, className,
}: {
  situacao: string | null | undefined;
  feriasAte?: string | null;
  className?: string;
}) {
  if (situacao !== 'ferias') return null;
  return (
    <span
      title={feriasAte
        ? `De férias até ${ateQuando(feriasAte)} — volta sozinho no dia seguinte`
        : 'De férias (sem data de retorno registrada)'}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide',
        'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400',
        className,
      )}
    >
      Férias
      {feriasAte && (
        <span className="font-semibold normal-case tabular-nums opacity-80">
          até {ateQuando(feriasAte)}
        </span>
      )}
    </span>
  );
}

/**
 * O aviso de quem VOLTOU de férias, para a tela de Metas.
 *
 * Existe porque a meta é mensal e as férias não: cobrar meta cheia de quem
 * trabalhou meio mês é o erro que este aviso previne, e ele não tem como ser
 * percebido depois — no fim do mês o número está batido ou não está, e
 * ninguém lembra do motivo.
 *
 * Aparece enquanto `feriasAte` existe e a pessoa já voltou. Some quando a meta
 * é salva (`limparAvisoDeFerias` zera o campo): a informação já foi usada.
 */
export function AvisoVoltouDeFerias({
  situacao, feriasAte, className,
}: {
  situacao: string | null | undefined;
  feriasAte?: string | null;
  className?: string;
}) {
  // De férias AGORA é a `TagFerias`, não este aviso: são coisas diferentes e
  // mostrar as duas na mesma linha confunde quem está definindo a meta.
  if (!feriasAte || situacao === 'ferias') return null;
  return (
    <span
      title={`Esteve de férias até ${ateQuando(feriasAte)}. Considere isso ao definir a meta — o aviso some quando você salvar.`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10px] font-medium leading-none',
        'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400',
        className,
      )}
    >
      Esteve de férias até {ateQuando(feriasAte)}
    </span>
  );
}
