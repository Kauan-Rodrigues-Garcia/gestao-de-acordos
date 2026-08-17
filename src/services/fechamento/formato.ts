/**
 * formato.ts — como número e texto viram string dentro do relatório.
 *
 * Mora fora do gerador de HTML porque TODA seção e TODO gráfico precisa disto,
 * e porque `esc` é a única porta de entrada de dado do banco na página: quatro
 * cópias dela, uma por arquivo, é como uma delas deixa de escapar aspas.
 */

/**
 * Escapa para texto e para atributo HTML.
 *
 * ⚠️ Todo dado vindo do banco passa por aqui. Nome de cliente, de operador e de
 * setor são digitados por gente; um `<` solto quebraria a página, e um
 * `<script>` num nome de setor viraria execução no navegador de quem abrisse o
 * relatório — que é a diretoria.
 */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function brl(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  });
}

export function num(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR');
}

export function pct(v: number): string {
  return `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/**
 * "12k", "1,2M" — o eixo de um gráfico não cabe o valor cheio.
 *
 * Só para eixo e para o miolo do donut. Em cartão e em tabela o valor vai
 * inteiro: número abreviado é ótimo para ler a forma da curva e péssimo para
 * conferir com o relatório do ERP.
 */
export function compacto(v: number): string {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  }
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** Variação com sinal explícito: "+ R$ 12.000,00" / "− R$ 3.400,00". */
export function comSinal(v: number, formatar: (n: number) => string = brl): string {
  const n = Number(v) || 0;
  return `${n >= 0 ? '+' : '−'} ${formatar(Math.abs(n))}`;
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** "05/08 (Ter)" a partir de uma data ISO. */
export function rotuloDiaCurto(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  const d = new Date(ano, mes - 1, dia);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} (${DIAS_CURTOS[d.getDay()]})`;
}

/** O dia da semana de um dia do mês — para marcar fim de semana no gráfico. */
export function ehFimDeSemana(mes: string, dia: number): boolean {
  const [ano, m] = mes.split('-').map(Number);
  if (!ano || !m) return false;
  const dow = new Date(ano, m - 1, dia).getDay();
  return dow === 0 || dow === 6;
}
