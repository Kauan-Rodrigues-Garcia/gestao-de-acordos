/**
 * assiduidade.ts — o «percentual de uso» que a gerência pediu.
 *
 * ## O pedido, transcrito
 *
 * «no dia ela logou. Até agora já passou tantos dias úteis, ela logou tantas
 * vezes, então é tantos percentual de uso.»
 *
 * Ou seja: **em quantos dos dias de trabalho do período essa pessoa apareceu**.
 * Não é tempo de tela, não é quantidade de cliques — é presença. É a pergunta
 * que separa quem usa o sistema de quem tem uma conta nele.
 *
 * ## Por que dias, e não logins
 *
 * O número de logins mede outra coisa, e mede mal: quem deixa a aba aberta a
 * semana inteira loga uma vez e usa cinco dias; quem tem a sessão expirando por
 * política de rede loga três vezes no mesmo dia. Contar DIAS DISTINTOS com
 * acesso responde a pergunta sem premiar nem punir o comportamento do
 * navegador. Os logins continuam disponíveis no perfil, ao lado, como
 * informação — não como o denominador.
 *
 * ## O denominador é dia útil, com a régua do resto do sistema
 *
 * `diasUteisIntervalo` (em `lib/diasUteis.ts`), com os mesmos feriados que a
 * meta usa. Contar sábado e domingo faria todo mundo parecer relapso; usar uma
 * segunda definição de «dia de trabalho» faria este painel discordar do painel
 * de metas sobre o mesmo mês.
 *
 * O período é recortado em «até hoje»: cobrar assiduidade de dias que ainda não
 * aconteceram é o defeito clássico de percentual com janela futura — na
 * segunda-feira de uma janela de 30 dias, todo mundo apareceria com 3%.
 */

import { listarDiasUteisIntervalo } from '@/lib/diasUteis';

export interface Assiduidade {
  /** Dias úteis do período que já passaram. `0` quando a janela é toda futura. */
  diasUteis: number;
  /** Dias distintos em que a pessoa acessou, dentro desses dias úteis. */
  diasComAcesso: number;
  /**
   * `diasComAcesso ÷ diasUteis`, de 0 a 100. `null` quando não há dias úteis
   * para dividir — e `null` é diferente de `0%`, que afirmaria ausência.
   */
  percentual: number | null;
  /** Dias de acesso que caíram em fim de semana ou feriado. */
  diasForaDoUtil: number;
}

export interface EntradaAssiduidade {
  /** `yyyy-MM-dd` de cada dia com acesso, como a RPC devolve. */
  diasComAcesso: readonly string[];
  /** Recorte do painel, `yyyy-MM-dd`. */
  desde: string;
  ate: string;
  /** Hoje, `yyyy-MM-dd`. O período nunca é cobrado além dele. */
  hoje: string;
  /** Feriados cadastrados nos meses da janela. */
  feriados?: readonly string[];
}

export function calcularAssiduidade(e: EntradaAssiduidade): Assiduidade {
  // A janela para de crescer em «hoje»: dia que não aconteceu não é dia que a
  // pessoa deixou de usar.
  const fim = e.ate < e.hoje ? e.ate : e.hoje;
  // A LISTA, e não a contagem: o Set precisa saber QUAIS dias são úteis para
  // decidir em qual balde cada acesso cai.
  const uteis = new Set(
    fim < e.desde ? [] : listarDiasUteisIntervalo(e.desde, fim, [...(e.feriados ?? [])]),
  );

  let comAcesso = 0;
  let foraDoUtil = 0;
  for (const dia of new Set(e.diasComAcesso.map(d => d.slice(0, 10)))) {
    if (dia < e.desde || dia > fim) continue;
    if (uteis.has(dia)) comAcesso++;
    // Acesso em sábado, domingo ou feriado é informação — mas não entra na
    // fração, senão alguém que só trabalha no fim de semana marca 0 de 20 dias
    // úteis e aparece como quem nunca entrou.
    else foraDoUtil++;
  }

  return {
    diasUteis: uteis.size,
    diasComAcesso: comAcesso,
    percentual: uteis.size > 0 ? Math.round((comAcesso / uteis.size) * 100) : null,
    diasForaDoUtil: foraDoUtil,
  };
}

/** A faixa em que o percentual cai, para a tela colorir sem inventar regra. */
export function faixaAssiduidade(pct: number | null): {
  rotulo: string; cls: string;
} {
  if (pct === null) return { rotulo: 'sem base', cls: 'text-muted-foreground' };
  if (pct >= 80) return { rotulo: 'assíduo',   cls: 'text-emerald-500' };
  if (pct >= 50) return { rotulo: 'regular',   cls: 'text-sky-500' };
  if (pct >= 20) return { rotulo: 'esporádico', cls: 'text-amber-500' };
  return { rotulo: 'raro', cls: 'text-red-400' };
}

/**
 * Os meses `yyyy-MM` que uma janela atravessa.
 *
 * Os feriados são cadastrados POR MÊS (`metas_config_mes`), e uma janela de 90
 * dias cruza três ou quatro. Sem isto, o feriado do mês do meio não entraria na
 * conta e aquele dia seria cobrado como dia de trabalho.
 */
export function mesesDaJanela(desde: string, ate: string): string[] {
  const meses: string[] = [];
  let ano = Number(desde.slice(0, 4));
  let mes = Number(desde.slice(5, 7));
  const alvo = ate.slice(0, 7);

  // Teto de 24: janela absurda vinda de estado corrompido não pode virar laço
  // infinito nem uma rajada de consultas.
  for (let i = 0; i < 24; i++) {
    const atual = `${ano}-${String(mes).padStart(2, '0')}`;
    meses.push(atual);
    if (atual >= alvo) break;
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}
