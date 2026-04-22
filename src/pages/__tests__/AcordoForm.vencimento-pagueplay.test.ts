/**
 * AcordoForm.vencimento-pagueplay.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do item #5: na tela cheia de "Novo acordo" da PaguePlay,
 * o input de Vencimento era um <input type="date"> digitável. O usuário
 * pediu para substituir pelo mesmo componente de calendário visual
 * (`DatePickerField`) já usado no `AcordoNovoInline` (e no branch
 * Bookplay do próprio `AcordoForm`).
 *
 * Este teste faz inspeção estática sobre `src/pages/AcordoForm.tsx`:
 *   1. Nenhum `<input type="date">` pode existir no arquivo todo.
 *   2. `DatePickerField` deve ser importado de `@/components/DatePickerField`.
 *   3. Devem existir DUAS renderizações de `DatePickerField` no JSX —
 *      uma no bloco `isPP ? (...)` (PaguePlay) e outra no `(...) : (...)`
 *      (Bookplay) — ambas ligadas ao campo `vencimento` via
 *      `watch('vencimento')` e `setValue('vencimento', ...)`.
 *   4. O ícone `Calendar` de lucide-react (usado apenas pelo input
 *      antigo) deve ter sido removido dos imports.
 *
 * Esta abordagem evita flakiness: renderizar o AcordoForm completo
 * requer supabase/auth/motion/useEmpresa/useEmpresaAtual + zodResolver
 * com 2 schemas por tenant + lazy loading de dados em modo edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(__dirname, '../AcordoForm.tsx');
const src = readFileSync(FILE, 'utf-8');

describe('AcordoForm (tela cheia) — Vencimento migrado para DatePickerField (#5)', () => {
  it('não possui mais nenhum <input type="date"> no arquivo', () => {
    // Cobre aspas simples e duplas, e espaços variados
    const regex = /<input\b[^>]*\btype\s*=\s*["']date["']/i;
    expect(regex.test(src)).toBe(false);
  });

  it('importa DatePickerField do path compartilhado', () => {
    expect(src).toMatch(
      /import\s*\{\s*DatePickerField\s*\}\s*from\s*['"]@\/components\/DatePickerField['"]/,
    );
  });

  it('renderiza DatePickerField em AMBOS os branches (PaguePlay e Bookplay)', () => {
    const occurrences = src.match(/<DatePickerField\b/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it('ambas renderizações de DatePickerField ligam ao campo "vencimento" do react-hook-form', () => {
    // Captura cada bloco <DatePickerField ... /> e verifica vínculo RHF
    const blocos = src.match(/<DatePickerField\b[\s\S]*?\/>/g) ?? [];
    expect(blocos.length).toBe(2);
    for (const bloco of blocos) {
      expect(bloco).toMatch(/watch\(\s*['"]vencimento['"]\s*\)/);
      expect(bloco).toMatch(/setValue\(\s*['"]vencimento['"]/);
      expect(bloco).toMatch(/label=["']Vencimento["']/);
      expect(bloco).toMatch(/required/);
      expect(bloco).toMatch(/minDate=["']2026-01-01["']/);
    }
  });

  it('ícone Calendar de lucide-react foi removido dos imports (não há usos remanescentes)', () => {
    // Não deve haver ", Calendar," ou ", Calendar\n" na linha de import de lucide-react
    const importLucide = src.match(/import\s*\{[\s\S]*?\}\s*from\s*['"]lucide-react['"]/);
    expect(importLucide).not.toBeNull();
    // A regex \bCalendar\b pega a palavra exata, não CalendarIcon
    expect(importLucide![0]).not.toMatch(/\bCalendar\b(?!Icon)/);
  });

  it('não há mais uso de register("vencimento") — controle agora é via watch/setValue', () => {
    // register('vencimento') era o padrão do input legado. O DatePickerField
    // usa value/onChange externos controlados por watch+setValue.
    expect(src).not.toMatch(/register\(\s*['"]vencimento['"]\s*\)/);
  });
});
