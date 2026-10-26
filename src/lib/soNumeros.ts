import type { ChangeEvent, ClipboardEvent } from 'react';
import { toast } from 'sonner';

/**
 * src/lib/soNumeros.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * NR e Código só com números (26/10/2026).
 *
 * A conferência de 26/10 achou 123 acordos e registros do Pix com NR ou Código
 * que não era número: nome do cliente, telefone, CPF, valor, link, conversa do
 * WhatsApp colada, e o NR certo com sujeira em volta (`12748027_`,
 * `: 12823879`). Daqui em diante o campo só aceita dígito.
 *
 * Colar «NR: 12823879» funciona — sobra o número. Colar um texto com MAIS de
 * um número («12991505 Valor: R$ 140,00») é recusado: juntar os dígitos daria
 * um NR que não existe.
 */

/** Só os dígitos do texto. */
export function soNumeros(valor: string): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/** O valor (sem espaços nas pontas) é só número? Vazio não é. */
export function ehSoNumeros(valor: string | null | undefined): boolean {
  return /^\d+$/.test(String(valor ?? '').trim());
}

/** Quantos números separados o texto tem («(79)99860-9316» tem 3). */
export function gruposDeNumeros(texto: string): number {
  return (String(texto ?? '').match(/\d+/g) ?? []).length;
}

/**
 * Os props de um `<Input>` de NR ou Código: teclado numérico, tira o que não é
 * dígito e recusa colar texto com mais de um número.
 *
 * @param rotulo «NR» ou «Código», para o aviso.
 */
export function propsSoNumeros(definir: (valor: string) => void, rotulo: string) {
  return {
    inputMode: 'numeric' as const,
    autoComplete: 'off',
    onChange: (e: ChangeEvent<HTMLInputElement>) => definir(soNumeros(e.target.value)),
    onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
      if (gruposDeNumeros(e.clipboardData.getData('text')) <= 1) return;
      e.preventDefault();
      toast.error(`O ${rotulo} só aceita números, e o texto colado tem mais de um número. Cole só o ${rotulo}.`);
    },
  };
}
