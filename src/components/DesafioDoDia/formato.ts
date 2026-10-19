/**
 * Os textos curtos do desafio do dia — a pílula, o card e a gaveta. Fora dos
 * componentes para que o Fast Refresh continue funcionando neles.
 */
import { formatBRL } from '@/lib/money';
import {
  duracaoCurta, minutosParaComecar, minutosRestantes, rotuloHora,
  type DiarioDesafio, type Entrada, type SituacaoDoDia,
} from '@/services/desafios/desafioDoDia';

/** Inteiro de pagamentos, ou R$ sem centavos — a barra não tem espaço para eles. */
export function valorDaMedida(v: number, porQuantidade: boolean): string {
  if (porQuantidade) return `${Math.round(v)} pag.`;
  return formatBRL(v).replace(/,\d{2}$/, '');
}

/** O tempo da pílula: quanto falta para acabar, ou quando começa. */
export function rotuloDoTempo(
  situacao: SituacaoDoDia,
  diario: DiarioDesafio,
  minuto: number,
  diaISO: string,
  hojeISO: string,
): string | null {
  if (situacao === 'agendado') {
    if (diaISO > hojeISO) return `dia ${diaISO.slice(8, 10)}/${diaISO.slice(5, 7)}`;
    return diario.horaInicio !== null
      ? `começa às ${rotuloHora(diario.horaInicio)} (${duracaoCurta(minutosParaComecar(diario, minuto))})`
      : 'hoje';
  }
  if (situacao === 'valendo') {
    return diario.horaFim !== null ? duracaoCurta(minutosRestantes(diario, minuto)) : 'hoje';
  }
  if (situacao === 'apurando') return 'apurando';
  return null;
}

/** «+R$ 350 · Ana» — a maior entrada do lote, e quantas mais vieram. */
export function textoDaEntrada(entradas: Entrada[], porQuantidade: boolean): string {
  const [primeira, ...resto] = entradas;
  const nome = primeira.nome.split(' ')[0];
  const valor = porQuantidade
    ? `+${primeira.qtd} pag.`
    : `+${formatBRL(primeira.valor).replace(/,\d{2}$/, '')}`;
  return resto.length ? `${valor} · ${nome} e +${resto.length}` : `${valor} · ${nome}`;
}
