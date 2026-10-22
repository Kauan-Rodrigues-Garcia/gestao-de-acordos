/**
 * As variáveis da mensagem ({{nome}}, {{quitacao}}, …) — os botões que as
 * inserem no texto. Usados no editor de mensagens da Campanha Fácil e na
 * edição de uma campanha já lançada (HistoricoCampanhas).
 *
 * Separadas por categoria (16/10/2026: «tudo está junto»). Desde 21/10/2026
 * cada forma de pagamento tem o seu bloco (Pix Automático só com Pix
 * Automático, Quitação só com quitação…) e, dentro dele, o sem desconto e o
 * com desconto ficam em grupos separados, de cor diferente. Cada grupo tem uma
 * base e um desconto só, escritos na dica: não dá para confundir o que parte
 * do total, da parcela ou do valor com juros.
 *
 * O botão da variável que já está na mensagem fica preenchido, e passar o
 * mouse nele realça na caixa onde ela foi usada (20/10/2026) — só visual.
 */
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';

/** Um bloco por forma de pagamento (21/10/2026), mais os dados do cliente e os percentuais. */
export type SecaoDeVariaveis = 'cliente' | 'pix_automatico' | 'quitacao' | 'atraso' | 'anual' | 'juros' | 'percentuais';

export interface GrupoDeVariaveis {
  titulo: string;
  /** Nos grupos de valor, a conta: de onde parte e qual desconto entra. */
  dica: string;
  secao: SecaoDeVariaveis;
  /** Nos grupos de valor: se algum % de «Descontos e cálculos» entra na conta. */
  desconto?: boolean;
  /** A cor do grupo: a bolinha do título e a borda dos botões. */
  tom: 'neutro' | 'azul' | 'verde' | 'rosa' | 'ambar';
  itens: [string, string][];
}

// eslint-disable-next-line react-refresh/only-export-components -- os blocos; o teste confere a ordem.
export const SECOES: { id: SecaoDeVariaveis; titulo: string; dica: string; largo?: boolean }[] = [
  { id: 'cliente', titulo: 'Dados do cliente', dica: 'Sem valor — servem em qualquer relatório', largo: true },
  { id: 'pix_automatico', titulo: 'Pix Automático', dica: 'Parte do Valor Aberto' },
  { id: 'quitacao', titulo: 'Quitação', dica: 'Parte do Valor Aberto' },
  { id: 'atraso', titulo: 'Atrasadas e junção', dica: 'Parte do valor das atrasadas' },
  { id: 'anual', titulo: 'Plano anual', dica: 'Parte de 1 parcela × 12' },
  { id: 'juros', titulo: 'Saldo com juros', dica: 'Parte do Valor Atualizado' },
  { id: 'percentuais', titulo: 'Percentuais', dica: 'O número do %, para citar no texto' },
];

/** A cor diz se tem desconto: rosa sem, verde com. */
const SEM_DESCONTO = { desconto: false, tom: 'rosa' } as const;
const COM_DESCONTO = { desconto: true, tom: 'verde' } as const;

// eslint-disable-next-line react-refresh/only-export-components -- os grupos dos chips; o editor e o teste leem a mesma lista.
export const VARIABLE_GROUPS: GrupoDeVariaveis[] = [
  {
    titulo: 'Cliente e empresa', dica: 'Nome, contrato e contato', secao: 'cliente', tom: 'neutro',
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
    titulo: 'Do mailing', dica: 'Puxados das colunas do arquivo importado', secao: 'cliente', tom: 'azul',
    itens: [
      ['endereco', 'Endereço'], ['cidade', 'Cidade'], ['local_trabalho', 'Local de trabalho'],
      ['ocupacao', 'Ocupação'], ['tempo_atraso', 'Tempo de atraso'],
    ],
  },
  // Nos blocos de valor, o bloco e o grupo já dizem o que é: o botão leva só
  // o que muda (12x, 20x, 21x…), em colunas alinhadas de grupo a grupo.
  // ── Pix Automático: parte do Valor Aberto, a base da quitação, e não do
  // valor com juros (21/10/2026).
  {
    titulo: 'Parcelado', dica: 'Valor Aberto ÷ parcelas', secao: 'pix_automatico', ...SEM_DESCONTO,
    itens: [['pix_automatico_12x', '12x'], ['pix_automatico_20x', '20x'], ['pix_automatico_21x', '21x']],
  },
  {
    titulo: 'Parcelado', dica: '(Valor Aberto − % Pix Aut.) ÷ parcelas', secao: 'pix_automatico', ...COM_DESCONTO,
    itens: [['pix_automatico_desconto_12x', '12x'], ['pix_automatico_desconto_20x', '20x'], ['pix_automatico_desconto_21x', '21x']],
  },
  {
    // Só a parcela (20/10/2026): UMA parcela em atraso, com o % da parcela.
    titulo: 'Só a parcela', dica: '1 parcela em atraso − % parcela', secao: 'pix_automatico', ...COM_DESCONTO,
    itens: [['pix_automatico_parcela', '1 parcela']],
  },
  // ── Quitação
  {
    titulo: 'À vista no Pix', dica: 'Valor Aberto − % quitação', secao: 'quitacao', ...COM_DESCONTO,
    itens: [['quitacao', 'Pix à vista']],
  },
  {
    titulo: 'No cartão', dica: 'Quitação Pix ÷ parcelas', secao: 'quitacao', ...COM_DESCONTO,
    itens: [['cartao_quitacao', '12x'], ['cartao_quitacao_20x', '20x'], ['cartao_quitacao_21x', '21x']],
  },
  // ── Parcelas em atraso e junção. {{parcela_desconto}} é a soma de TODAS as
  // atrasadas, não uma parcela.
  {
    titulo: 'Atrasadas', dica: 'Todas as atrasadas − % parcela', secao: 'atraso', ...COM_DESCONTO,
    itens: [['parcela_desconto', 'Todas']],
  },
  {
    // A junção em 6x ou 12x (20/10/2026): sai só a parcela.
    titulo: 'Junção', dica: '(Atrasadas + próxima) − % junção', secao: 'atraso', ...COM_DESCONTO,
    itens: [['juncao', 'À vista'], ['juncao_6x', '6x'], ['juncao_12x', '12x']],
  },
  // ── Plano anual
  {
    titulo: 'À vista', dica: '(1 parcela × 12) − % anual', secao: 'anual', ...COM_DESCONTO,
    itens: [['anual', 'Anual à vista']],
  },
  {
    titulo: 'No cartão', dica: 'Anual à vista ÷ parcelas', secao: 'anual', ...COM_DESCONTO,
    itens: [['cartao_anual', '12x'], ['cartao_anual_20x', '20x'], ['cartao_anual_21x', '21x']],
  },
  // ── Saldo com juros: o «Valor Atualizado» do mailing. O % juros é 0 no
  // padrão; quem o configura tira dos juros, e só daqui.
  {
    titulo: 'Valor cheio', dica: 'Valor Atualizado − % juros (padrão 0%)', secao: 'juros', ...SEM_DESCONTO,
    itens: [['valor_com_juros', 'Saldo com juros']],
  },
  {
    titulo: 'Percentuais de desconto', dica: 'Os de «Descontos e cálculos»', secao: 'percentuais', tom: 'ambar',
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
  const secoes = SECOES
    .map((s) => ({ ...s, grupos: grupos.filter((g) => g.secao === s.id) }))
    .filter((s) => s.grupos.length > 0);
  const temValor = grupos.some((g) => g.desconto !== undefined);
  return (
    <div className="space-y-2">
      {temValor && (
        <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', TONS.rosa.bolinha)} aria-hidden /> Sem desconto
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', TONS.verde.bolinha)} aria-hidden /> Com desconto
          </span>
        </p>
      )}
      {/* Na janela larga, 3 blocos por linha: menos rolagem (21/10/2026). */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {secoes.map((s) => (
          <section
            key={s.id}
            aria-label={s.titulo}
            className={cn('min-w-0 rounded-lg border border-border bg-muted/20 p-2.5', s.largo && 'sm:col-span-2 lg:col-span-3')}
          >
            <div className="mb-2 border-b border-border/70 pb-1.5 text-[11px] leading-tight">
              <p className="truncate whitespace-nowrap font-bold uppercase tracking-wide text-foreground">{s.titulo}</p>
              <p className="truncate whitespace-nowrap text-muted-foreground" title={s.dica}>{s.dica}</p>
            </div>
            <div className={cn('grid gap-2.5', s.largo && 'sm:grid-cols-2')}>
              {s.grupos.map((g) => (
                <GrupoDeChips key={g.itens[0][0]} grupo={g} usadas={usadas} onInsert={onInsert} onRealcar={onRealcar} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Um grupo: o título com a conta (base e desconto) e os botões dele. */
function GrupoDeChips({ grupo: g, usadas, onInsert, onRealcar }: {
  grupo: GrupoDeVariaveis;
  usadas: Set<string>;
  onInsert: (variable: string) => void;
  onRealcar?: (variable: string | null) => void;
}) {
  // Grupo de valor: botões em 3 colunas iguais, para o 12x / 20x / 21x de um
  // grupo ficar embaixo do 12x / 20x / 21x do outro. Botão sozinho fica com a
  // largura do nome. Os de cliente e percentuais seguem soltos, em fila.
  const deValor = g.desconto !== undefined;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] leading-tight">
        <p className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONS[g.tom].bolinha)} aria-hidden />
          <span className="truncate font-semibold text-foreground">{g.titulo}</span>
          {deValor && (
            <span className={cn('ml-auto shrink-0 rounded px-1.5 text-[10px] font-medium', g.desconto
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-pink-500/10 text-pink-700 dark:text-pink-400')}
            >
              {g.desconto ? 'com desconto' : 'sem desconto'}
            </span>
          )}
        </p>
        <p className="truncate whitespace-nowrap pl-3 text-muted-foreground" title={g.dica}>{g.dica}</p>
      </div>
      <div className={deValor ? 'grid grid-cols-3 gap-1.5' : 'flex flex-wrap gap-1.5'}>
        {g.itens.map(([variable, label]) => {
          const usada = usadas.has(variable);
          return (
            <button
              key={variable}
              type="button"
              title={usada
                ? `{{${variable}}} já está na mensagem — o mouse aqui mostra onde. Clique para inserir de novo.\n${g.dica}`
                : `Inserir {{${variable}}}\n${g.dica}`}
              onClick={() => onInsert(variable)}
              onMouseEnter={() => onRealcar?.(variable)}
              onMouseLeave={() => onRealcar?.(null)}
              className={cn(
                'whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                deValor && 'truncate text-center',
                deValor && g.itens.length === 1 && 'col-span-3 min-w-[calc((100%_-_0.75rem)/3)] justify-self-start',
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
  );
}
