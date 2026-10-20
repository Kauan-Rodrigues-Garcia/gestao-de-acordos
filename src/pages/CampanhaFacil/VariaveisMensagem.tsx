/**
 * As variáveis da mensagem ({{nome}}, {{quitacao}}, …) — os botões que as
 * inserem no texto. Usados no editor de mensagens da Campanha Fácil e na
 * edição de uma campanha já lançada (HistoricoCampanhas).
 *
 * Separadas por categoria (16/10/2026: «tudo está junto»): o que não é valor
 * (nome, empresa…) num grupo, os valores à vista noutro, cada parcelamento no
 * seu, e os percentuais por último.
 *
 * O botão da variável que já está na mensagem fica preenchido, e passar o
 * mouse nele realça na caixa onde ela foi usada (20/10/2026) — só visual.
 */
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';

export interface GrupoDeVariaveis {
  titulo: string;
  dica: string;
  /** A cor do grupo: a bolinha do título e a borda dos botões. */
  tom: 'neutro' | 'azul' | 'verde' | 'rosa' | 'violeta' | 'ciano' | 'ambar';
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
    // O valor da {{juncao}} em 6x ou 12x (20/10/2026): sai só a parcela.
    titulo: 'Junção parcelada', dica: 'Valor de cada parcela', tom: 'rosa',
    itens: [['juncao_6x', 'Junção 6x'], ['juncao_12x', 'Junção 12x']],
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
    // cálculos» (09/10/2026; 12x e 20x em 16/10/2026). «Só a parcela»
    // (20/10/2026): uma parcela com o desconto da parcela.
    titulo: 'Pix Automático', dica: 'Valor de cada parcela', tom: 'ciano',
    itens: [
      ['pix_automatico_parcela', 'Só a parcela (c/ desc. da parcela)'],
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

/**
 * `usado`: o botão da variável que já está na mensagem, preenchido como
 * selecionado. `marca`: o realce dela na caixa de texto.
 */
const TONS: Record<GrupoDeVariaveis['tom'], { bolinha: string; chip: string; usado: string; marca: string }> = {
  neutro: {
    bolinha: 'bg-muted-foreground/60', chip: 'border-border bg-muted/40',
    usado: 'border-foreground/70 bg-foreground/80 text-background hover:bg-foreground hover:text-background',
    marca: 'bg-foreground/20 ring-foreground/50',
  },
  azul: {
    bolinha: 'bg-blue-500', chip: 'border-blue-500/30 bg-blue-500/5',
    usado: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white',
    marca: 'bg-blue-500/30 ring-blue-500/70',
  },
  verde: {
    bolinha: 'bg-emerald-500', chip: 'border-emerald-500/30 bg-emerald-500/5',
    usado: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white',
    marca: 'bg-emerald-500/30 ring-emerald-500/70',
  },
  rosa: {
    bolinha: 'bg-pink-500', chip: 'border-pink-500/30 bg-pink-500/5',
    usado: 'border-pink-600 bg-pink-600 text-white hover:bg-pink-700 hover:text-white',
    marca: 'bg-pink-500/30 ring-pink-500/70',
  },
  violeta: {
    bolinha: 'bg-violet-500', chip: 'border-violet-500/30 bg-violet-500/5',
    usado: 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 hover:text-white',
    marca: 'bg-violet-500/30 ring-violet-500/70',
  },
  ciano: {
    bolinha: 'bg-cyan-500', chip: 'border-cyan-500/30 bg-cyan-500/5',
    usado: 'border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-700 hover:text-white',
    marca: 'bg-cyan-500/30 ring-cyan-500/70',
  },
  ambar: {
    bolinha: 'bg-amber-500', chip: 'border-amber-500/30 bg-amber-500/5',
    usado: 'border-amber-500 bg-amber-500 text-amber-950 hover:bg-amber-400 hover:text-amber-950',
    marca: 'bg-amber-500/35 ring-amber-500/70',
  },
};

const TOM_DA_VARIAVEL: Record<string, GrupoDeVariaveis['tom']> = Object.fromEntries(
  VARIABLE_GROUPS.flatMap((g) => g.itens.map(([variable]) => [variable, g.tom])),
);

/** As variáveis que o texto usa, do jeito que `renderTemplate` as lê (`{{ x }}` vale). */
// eslint-disable-next-line react-refresh/only-export-components -- o teste confere a leitura igual à do renderTemplate.
export function variaveisUsadas(texto: string): Set<string> {
  const usadas = new Set<string>();
  for (const m of texto.matchAll(/{{\s*([a-z0-9_]+)\s*}}/gi)) usadas.add(m[1].toLowerCase());
  return usadas;
}

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

/**
 * O realce de uma variável na caixa de texto: uma cópia da caixa por cima
 * dela, com o texto transparente e só as ocorrências pintadas. Mesma fonte,
 * respiro e quebra de linha da textarea, e acompanha a rolagem dela. Não
 * pega clique nem mexe no texto.
 *
 * Vai junto da textarea, num pai `relative`.
 */
export function RealceDeVariavel({ alvo, texto, variavel }: {
  alvo: RefObject<HTMLTextAreaElement>;
  texto: string;
  variavel: string | null;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const pedacos = useMemo(() => {
    if (!variavel || !/^[a-z0-9_]+$/i.test(variavel)) return null;
    const partes = texto.split(new RegExp(`({{\\s*${variavel}\\s*}})`, 'gi'));
    return partes.length > 1 ? partes : null;
  }, [texto, variavel]);

  useLayoutEffect(() => {
    const el = alvo.current;
    const div = caixa.current;
    if (!el || !div) return;
    const cs = getComputedStyle(el);
    const bordaX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    // A barra de rolagem da textarea come a largura do texto; a cópia não tem barra.
    const barra = Math.max(0, el.offsetWidth - el.clientWidth - bordaX);
    Object.assign(div.style, {
      top: `${el.offsetTop}px`, left: `${el.offsetLeft}px`,
      width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, wordSpacing: cs.wordSpacing, tabSize: cs.tabSize,
      paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
      paddingRight: `${parseFloat(cs.paddingRight) + barra}px`,
      borderStyle: 'solid', borderColor: 'transparent',
      borderTopWidth: cs.borderTopWidth, borderRightWidth: cs.borderRightWidth,
      borderBottomWidth: cs.borderBottomWidth, borderLeftWidth: cs.borderLeftWidth,
    });
    const rolar = () => { div.scrollTop = el.scrollTop; div.scrollLeft = el.scrollLeft; };
    rolar();
    el.addEventListener('scroll', rolar);
    return () => el.removeEventListener('scroll', rolar);
  }, [alvo, pedacos]);

  if (!pedacos || !variavel) return null;
  const marca = TONS[TOM_DA_VARIAVEL[variavel] ?? 'neutro'].marca;
  return (
    <div
      ref={caixa}
      aria-hidden
      className="pointer-events-none absolute overflow-hidden whitespace-pre-wrap break-words text-transparent"
    >
      {pedacos.map((p, i) => (i % 2 === 1
        ? <mark key={i} className={cn('rounded-[3px] text-transparent ring-1', marca)}>{p}</mark>
        : <span key={i}>{p}</span>))}
      {/* A textarea mostra a linha vazia depois de um «Enter» no fim; a div, não. */}
      {' '}
    </div>
  );
}

export function VariableChips({ onInsert, ocultar, texto, onRealcar }: {
  onInsert: (variable: string) => void;
  ocultar?: readonly string[];
  /** O texto da mensagem: o botão da variável já usada fica preenchido. */
  texto?: string;
  /** Mouse em cima de um botão (ou `null` ao sair): a caixa realça a variável. */
  onRealcar?: (variable: string | null) => void;
}) {
  const usadas = useMemo(() => variaveisUsadas(texto ?? ''), [texto]);
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
            {g.itens.map(([variable, label]) => {
              const usada = usadas.has(variable);
              return (
                <button
                  key={variable}
                  type="button"
                  title={usada
                    ? `{{${variable}}} já está na mensagem — o mouse aqui mostra onde. Clique para inserir de novo.`
                    : `Inserir {{${variable}}}`}
                  onClick={() => onInsert(variable)}
                  onMouseEnter={() => onRealcar?.(variable)}
                  onMouseLeave={() => onRealcar?.(null)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    TONS[g.tom].chip,
                    usada && TONS[g.tom].usado,
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
