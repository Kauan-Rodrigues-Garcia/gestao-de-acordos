/**
 * ajusteValor.ts — o campo de dinheiro do ajuste manual.
 *
 * Arquivo próprio, e não uma função dentro do componente, por dois motivos:
 * é lógica pura com teste próprio (o padrão do projeto), e exportar função de
 * um arquivo de componente quebra o hot reload do Vite.
 */

/**
 * O valor digitado vira número.
 *
 * Aceita "1.234,56" e "1234.56": as duas formas chegam de gente diferente — a
 * primeira de quem copia do relatório, a segunda de quem digita rápido —, e
 * recusar uma delas produz "valor inválido" para quem digitou certo.
 *
 * O SINAL não vem daqui. Quem decide somar ou tirar é o botão da tela; um "-"
 * digitado no campo seria uma segunda fonte de verdade para a mesma decisão, e
 * o desacordo entre as duas ("-500" no campo, "somar" no botão) é exatamente o
 * tipo de erro que ninguém percebe até o número aparecer errado no painel.
 *
 * Zero devolve `null`: ajuste de zero não ajusta nada e só sujaria a trilha.
 */
export function valorDigitadoParaNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, '');
  if (!limpo) return null;
  // "1.234,56" → "1234.56"; "1234.56" fica como está.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
