/**
 * As variáveis da mensagem ({{nome}}, {{quitacao}}, …) — os botões que as
 * inserem no texto. Usados no editor de mensagens da Campanha Fácil e na
 * edição de uma campanha já lançada (HistoricoCampanhas).
 *
 * Separadas por categoria (16/10/2026: «tudo está junto»): o que não é valor
 * (nome, empresa…) num grupo, os valores à vista noutro, cada parcelamento no
 * seu, e os percentuais por último.
 */
import type { RefObject } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';

export interface GrupoDeVariaveis {
  titulo: string;
  dica: string;
  /** A cor do grupo: a bolinha do título e a borda dos botões. */
  tom: 'neutro' | 'azul' | 'verde' | 'violeta' | 'ciano' | 'ambar';
  itens: [string, string][];
}

// eslint-disable-next-line react-refresh/only-export-components -- os grupos dos chips; o editor e o teste leem a mesma lista.
export const VARIABLE_GROUPS: GrupoDeVariaveis[] = [
  {
    titulo: 'Cliente e empresa', dica: 'Sem valor — servem em qualquer relatório', tom: 'neutro',
    itens: [
      // O {{cpf}} sai mascarado, só os 5 últimos dígitos (19/10/2026).
      ['primeiro_nome', 'Primeiro nome'], ['nome', 'Nome completo'], ['cpf', 'CPF (5 últimos)'],
      ['contrato', 'Contrato'], ['protocolo', 'Protocolo'], ['empresa', 'Empresa'],
      ['atendimento', '0800 da empresa'], ['link', 'Link'],
    ],
  },
  {
    // Vêm das colunas do mailing (16/10/2026). Coluna ausente: o cliente sai
    // marcado para revisar.
    titulo: 'Do mailing', dica: 'Puxados das colunas do arquivo importado', tom: 'azul',
    itens: [
      ['endereco', 'Endereço'], ['cidade', 'Cidade'], ['local_trabalho', 'Local de trabalho'],
      ['ocupacao', 'Ocupação'], ['tempo_atraso', 'Tempo de atraso'],
    ],
  },
  {
    titulo: 'Valores à vista', dica: 'Pix e pagamento único', tom: 'verde',
    itens: [
      ['parcela_desconto', 'Parcela'], ['juncao', 'Junção'], ['quitacao', 'Quitação Pix'],
      ['valor_com_juros', 'Valor atualizado'], ['anual', 'Plano anual'],
    ],
  },
  {
    // 12x, 20x e 21x em todas as modalidades (16/10/2026).
    titulo: 'Cartão de crédito', dica: 'Valor de cada parcela', tom: 'violeta',
    itens: [
      ['cartao_quitacao', 'Quitação 12x'], ['cartao_quitacao_20x', 'Quitação 20x'], ['cartao_quitacao_21x', 'Quitação 21x'],
      ['cartao_anual', 'Anual 12x'], ['cartao_anual_20x', 'Anual 20x'], ['cartao_anual_21x', 'Anual 21x'],
    ],
  },
  {
    // Valor com juros ÷ parcelas, e com o desconto configurado em «Descontos e
    // cálculos» (09/10/2026; 12x e 20x em 16/10/2026).
    titulo: 'Pix Automático', dica: 'Valor de cada parcela', tom: 'ciano',
    itens: [
      ['pix_automatico_12x', 'Pix Automático 12x'], ['pix_automatico_20x', 'Pix Automático 20x'],
      ['pix_automatico_21x', 'Pix Automático 21x'],
      ['pix_automatico_desconto_12x', 'c/ desconto 12x'], ['pix_automatico_desconto_20x', 'c/ desconto 20x'],
      ['pix_automatico_desconto_21x', 'c/ desconto 21x'],
    ],
  },
  {
    titulo: 'Percentuais de desconto', dica: 'Os de «Descontos e cálculos»', tom: 'ambar',
    itens: [
      ['pct_atraso', '% parcela'], ['pct_juncao', '% junção'], ['pct_quitacao', '% quitação'],
      ['pct_juros', '% juros'], ['pct_anual', '% anual'], ['pct_pix_automatico', '% Pix Automático'],
    ],
  },
];

/** A lista plana dos chips; o teste do Pix Automático confere as variáveis por ela. */
export const VARIABLE_LABELS: [string, string][] = VARIABLE_GROUPS.flatMap((g) => g.itens);

const TONS: Record<GrupoDeVariaveis['tom'], { bolinha: string; chip: string }> = {
  neutro: { bolinha: 'bg-muted-foreground/60', chip: 'border-border bg-muted/40' },
  azul: { bolinha: 'bg-blue-500', chip: 'border-blue-500/30 bg-blue-500/5' },
  verde: { bolinha: 'bg-emerald-500', chip: 'border-emerald-500/30 bg-emerald-500/5' },
  violeta: { bolinha: 'bg-violet-500', chip: 'border-violet-500/30 bg-violet-500/5' },
  ciano: { bolinha: 'bg-cyan-500', chip: 'border-cyan-500/30 bg-cyan-500/5' },
  ambar: { bolinha: 'bg-amber-500', chip: 'border-amber-500/30 bg-amber-500/5' },
};

/**
 * Põe `{{variavel}}` onde estava o cursor e devolve o cursor logo depois dela.
 *
 * A tela fica onde estava (15/10/2026: «sempre desce pra baixo»). Trocar o
 * `value` de uma textarea leva o cursor ao FIM do texto, e o navegador rola a
 * caixa até lá; o `focus()` comum ainda rola a janela até a caixa. Por isso o
 * texto entra já aplicado (`flushSync`), o foco vem com `preventScroll` e a
 * rolagem da caixa volta à de antes do clique — sem um quadro pintado no fim.
 */
// eslint-disable-next-line react-refresh/only-export-components -- irmã dos chips: o editor e a edição da campanha usam as duas juntas.
export function insertVariable(ref: RefObject<HTMLTextAreaElement>, value: string, setValue: (v: string) => void, variable: string) {
  const el = ref.current;
  const token = `{{${variable}}}`;
  if (!el) { setValue(value + token); return; }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + token + el.value.slice(end);
  const rolagem = el.scrollTop;
  flushSync(() => setValue(next));
  el.focus({ preventScroll: true });
  const caret = start + token.length;
  el.setSelectionRange(caret, caret);
  el.scrollTop = rolagem;
}

export function VariableChips({ onInsert, ocultar }: { onInsert: (variable: string) => void; ocultar?: readonly string[] }) {
  const grupos = VARIABLE_GROUPS
    .map((g) => ({ ...g, itens: g.itens.filter(([variable]) => !ocultar?.includes(variable)) }))
    .filter((g) => g.itens.length > 0);
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {grupos.map((g) => (
        <div key={g.titulo} className="min-w-0">
          <p className="mb-1 flex items-baseline gap-1.5 text-[11px]">
            <span className={cn('h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full', TONS[g.tom].bolinha)} aria-hidden />
            <span className="font-semibold text-foreground">{g.titulo}</span>
            <span className="truncate text-muted-foreground">{g.dica}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.itens.map(([variable, label]) => (
              <button
                key={variable}
                type="button"
                title={`Inserir {{${variable}}}`}
                onClick={() => onInsert(variable)}
                className={cn(
                  'rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  TONS[g.tom].chip,
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
