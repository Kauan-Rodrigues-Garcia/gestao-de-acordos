/**
 * emDiaOperador.ts — quem está EM DIA com a média diária, no Analítico.
 *
 * ## A pergunta
 *
 * A liderança queria bater o olho na lista «Por operador» e ver quem está
 * conseguindo manter a média diária — e mandar um parabéns a essa pessoa sem
 * calcular nada de cabeça. A estrela da tela e o texto copiado afirmam a mesma
 * frase: «você atingiu a média diária necessária». Este arquivo decide quando
 * ela é verdade.
 *
 * ## A régua, e a única lente que a usa
 *
 * Média diária necessária = meta do mês ÷ dias úteis do mês. É a `metaDiaria`
 * de `calcularProjecao`, a mesma «Meta diária» da linha aberta dos Quartis. O
 * que se compara com ela é o recebido NAQUELE DIA.
 *
 * A estrela nasceu (08/09/2026) valendo também no recorte Mês, onde comparava a
 * média do mês — recebido ÷ dias trabalhados — com a mesma régua. Essa lente
 * foi RETIRADA em 17/09/2026, a pedido da liderança: «em dia» é uma afirmação
 * sobre um dia, e no mês ela dizia a mesma coisa que a projeção dos Quartis já
 * diz, com outro número ao lado e sem explicar a diferença.
 *
 * O Período nunca entrou: é uma janela escolhida à mão, e «média diária» dentro
 * dela pediria outra contagem de dias que ninguém pediu.
 *
 * ## Centavos, não frações
 *
 * A comparação é em centavos, que é o que a tela e o texto escrevem. 999,999
 * aparece como R$ 1.000,00; negar a estrela ao lado de dois valores iguais seria
 * a tela discordando de si mesma. A outra face: a estrela pode divergir do
 * «100%» dos Quartis por arredondamento — lá a % é inteira, e 99,6% aparece
 * como 100% sem a média ter chegado à régua.
 *
 * ## Só a frente direta `[PP]`
 *
 * O valor da lista é o recebimento do analítico (ou do diário), sem a frente
 * INDIRETA de acordos extra. A régua, então, é a meta direta: medir o
 * recebimento direto contra direta + indireta negaria a estrela a quem está em
 * dia justamente na frente que a lista mostra.
 *
 * Sem React, sem fetch.
 */
import { diasUteisDoMes } from '@/lib/diasUteis';

export interface EntradaEmDia {
  /** Recebido no DIA escolhido no recorte. */
  valor: number;
  /** Meta individual do mês. `null`/0 = sem meta, e sem régua. */
  meta: number | null;
  /** Dias úteis do mês — reduzidos quando a equipe é de treinamento. */
  totalUteis: number;
}

export interface AvaliacaoEmDia {
  emDia: boolean;
  /** Recebido no dia. */
  valor: number;
  /** Meta ÷ dias úteis do mês — a média diária necessária. */
  metaDiaria: number;
}

const centavos = (v: number) => Math.round(v * 100);

/**
 * A avaliação de um operador no dia.
 *
 * Devolve `null` — e não `emDia: false` — quando não há régua: sem meta ou sem
 * dia útil. É a diferença entre «não alcançou» e «não há o que alcançar», e só
 * a primeira é uma afirmação sobre a pessoa.
 */
export function avaliarEmDia(entrada: EntradaEmDia): AvaliacaoEmDia | null {
  const { valor, totalUteis } = entrada;
  const meta = Number(entrada.meta) || 0;
  if (meta <= 0 || totalUteis <= 0) return null;

  const metaDiaria = meta / totalUteis;

  return {
    valor,
    metaDiaria,
    // Um dia é a média de si mesmo: não há o que dividir por dias trabalhados.
    emDia: centavos(valor) >= centavos(metaDiaria),
  };
}

/** O calendário do mês, como a aba Metas o configura. */
export interface CalendarioDoMes {
  ano: number;
  /** 1 a 12. */
  mes: number;
  feriados: string[];
}

/**
 * Dias úteis de UM operador, reduzidos quando a equipe dele é de treinamento.
 *
 * A mesma regra de `QuartisOperadores` e `DesempenhoEquipes`: sem ela, a
 * estrela cobraria de quem está em treinamento a régua do mês cheio, e o mesmo
 * operador estaria em dia numa aba e fora do ritmo na outra.
 */
export function diasDoOperador(
  cal: CalendarioDoMes,
  inicioTreino?: string | null,
): { totalUteis: number } {
  return {
    totalUteis: diasUteisDoMes(cal.ano, cal.mes, cal.feriados, inicioTreino || undefined),
  };
}

/**
 * Quem está em dia numa lista de operadores.
 *
 * O mapa traz SÓ quem está em dia: é a pergunta da tela («quem ganha a
 * estrela?»), e quem não ganha não precisa de entrada. Um clone desenhado em
 * duas equipes tem o mesmo valor nas duas, e vira uma entrada só.
 */
export function operadoresEmDia(params: {
  linhas: readonly { operador_id: string; valor: number }[];
  /** operador_id → meta DIRETA bruta do mês. Ausente = sem meta. */
  metaPorOperador: Record<string, number>;
  /** equipe_id → início do treinamento. Só equipes em treinamento. */
  treinoPorEquipe: Record<string, string | null>;
  /** A equipe de ORIGEM do operador — é ela que diz se há treinamento. */
  equipeDoOperador: (operadorId: string) => string | null | undefined;
  calendario: CalendarioDoMes;
}): Map<string, AvaliacaoEmDia> {
  const {
    linhas, metaPorOperador, treinoPorEquipe, equipeDoOperador, calendario,
  } = params;

  const emDia = new Map<string, AvaliacaoEmDia>();
  // Os dias úteis dependem só do início do treinamento; a lista inteira
  // costuma ter dois ou três valores distintos, não um por operador.
  const diasPorInicio = new Map<string, { totalUteis: number }>();

  for (const l of linhas) {
    if (emDia.has(l.operador_id)) continue;
    const meta = metaPorOperador[l.operador_id];
    if (!(meta > 0)) continue;

    const equipe = equipeDoOperador(l.operador_id);
    const inicio = (equipe && treinoPorEquipe[equipe]) || '';
    let dias = diasPorInicio.get(inicio);
    if (!dias) {
      dias = diasDoOperador(calendario, inicio || null);
      diasPorInicio.set(inicio, dias);
    }

    const avaliacao = avaliarEmDia({ valor: l.valor, meta, ...dias });
    if (avaliacao?.emDia) emDia.set(l.operador_id, avaliacao);
  }

  return emDia;
}
