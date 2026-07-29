/**
 * AcordoForm.vencimento-pagueplay.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do item #5: na tela cheia de "Novo acordo" da PaguePlay,
 * o input de Vencimento era um <input type="date"> digitável. O usuário
 * pediu para substituir pelo mesmo componente de calendário visual
 * (`DatePickerField`) já usado no `AcordoNovoInline`.
 *
 * Inspeção estática, não render: montar o AcordoForm exige
 * supabase/auth/motion/useEmpresa + zodResolver com 2 schemas por tenant +
 * carregamento assíncrono no modo edição. Para o que se quer garantir aqui —
 * "não existe input de data digitável em nenhum dos dois formulários" — ler o
 * fonte é mais estável e diz exatamente isso.
 *
 * ⚠️  ATUALIZADO: o arquivo único `src/pages/AcordoForm.tsx` foi dividido em
 *     `AcordoForm/index.tsx` (container) + `FormPP.tsx` + `FormBP.tsx`, um
 *     formulário por tenant. O teste apontava para o caminho antigo e o arquivo
 *     inteiro deixou de coletar (`ENOENT`), então nenhuma das garantias abaixo
 *     estava valendo. Agora cada tenant é verificado no SEU arquivo — antes as
 *     duas renderizações eram contadas no mesmo fonte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORMULARIOS = [
  { tenant: 'PaguePlay', arquivo: 'FormPP.tsx' },
  { tenant: 'Bookplay',  arquivo: 'FormBP.tsx' },
] as const;

function lerFormulario(arquivo: string): string {
  return readFileSync(resolve(__dirname, '../AcordoForm', arquivo), 'utf-8');
}

describe('AcordoForm (tela cheia) — Vencimento via DatePickerField (#5)', () => {
  describe.each(FORMULARIOS)('$tenant ($arquivo)', ({ arquivo }) => {
    const src = lerFormulario(arquivo);

    it('não possui nenhum <input type="date">', () => {
      // Cobre aspas simples e duplas, e espaços variados
      const regex = /<input\b[^>]*\btype\s*=\s*["']date["']/i;
      expect(regex.test(src)).toBe(false);
    });

    it('importa DatePickerField do path compartilhado', () => {
      expect(src).toMatch(
        /import\s*\{\s*DatePickerField\s*\}\s*from\s*['"]@\/components\/DatePickerField['"]/,
      );
    });

    it('renderiza exatamente um DatePickerField', () => {
      const ocorrencias = src.match(/<DatePickerField\b/g) ?? [];
      expect(ocorrencias).toHaveLength(1);
    });

    it('o DatePickerField está ligado ao campo "vencimento" do react-hook-form', () => {
      const blocos = src.match(/<DatePickerField\b[\s\S]*?\/>/g) ?? [];
      expect(blocos).toHaveLength(1);
      const bloco = blocos[0];
      expect(bloco).toMatch(/watch\(\s*['"]vencimento['"]\s*\)/);
      expect(bloco).toMatch(/setValue\(\s*['"]vencimento['"]/);
      expect(bloco).toMatch(/label=["']Vencimento["']/);
      expect(bloco).toMatch(/required/);
      expect(bloco).toMatch(/minDate=["']2026-01-01["']/);
    });

    it('ícone Calendar de lucide-react não é mais importado', () => {
      const importLucide = src.match(/import\s*\{[\s\S]*?\}\s*from\s*['"]lucide-react['"]/);
      // A regex \bCalendar\b pega a palavra exata, não CalendarIcon
      if (importLucide) {
        expect(importLucide[0]).not.toMatch(/\bCalendar\b(?!Icon)/);
      }
    });

    it('não há mais register("vencimento") — controle é via watch/setValue', () => {
      expect(src).not.toMatch(/register\(\s*['"]vencimento['"]\s*\)/);
    });
  });
});
