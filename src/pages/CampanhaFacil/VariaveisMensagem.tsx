/**
 * As variáveis da mensagem ({{nome}}, {{quitacao}}, …) — os botões que as
 * inserem no texto. Usados no editor de mensagens da Campanha Fácil e na
 * edição de uma campanha já lançada (HistoricoCampanhas).
 */
import type { RefObject } from 'react';

export const VARIABLE_LABELS: [string, string][] = [
  ['primeiro_nome', 'Primeiro nome'], ['nome', 'Nome completo'], ['cpf', 'CPF'],
  ['empresa', 'Empresa'], ['contrato', 'Contrato'], ['parcela_desconto', 'Parcela'],
  ['quitacao', 'Quitação'], ['valor_com_juros', 'Valor atualizado'], ['juncao', 'Junção'],
  ['anual', 'Plano anual'], ['cartao_quitacao', '12x quitação'], ['cartao_anual', '12x anual'],
  ['pct_atraso', '% parcela'], ['pct_quitacao', '% quitação'], ['pct_juncao', '% junção'],
  ['pct_anual', '% anual'],
  // Pix Automático em 21x (09/10/2026): valor com juros ÷ 21, e com o desconto
  // configurado em «Descontos e cálculos».
  ['pix_automatico_21x', 'Pix Automático 21x'], ['pix_automatico_desconto_21x', 'Pix Automático c/ desconto 21x'],
  ['pct_pix_automatico', '% Pix Automático'],
  ['protocolo', 'Protocolo'], ['atendimento', '0800 da empresa'], ['link', 'Link'],
];

export function insertVariable(ref: RefObject<HTMLTextAreaElement>, value: string, setValue: (v: string) => void, variable: string) {
  const el = ref.current;
  const token = `{{${variable}}}`;
  if (!el) { setValue(value + token); return; }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + token + el.value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + token.length;
    el.setSelectionRange(caret, caret);
  });
}

export function VariableChips({ onInsert, ocultar }: { onInsert: (variable: string) => void; ocultar?: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VARIABLE_LABELS.filter(([variable]) => !ocultar?.includes(variable)).map(([variable, label]) => (
        <button
          key={variable}
          type="button"
          title={`Inserir {{${variable}}}`}
          onClick={() => onInsert(variable)}
          className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
