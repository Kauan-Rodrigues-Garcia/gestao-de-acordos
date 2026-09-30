/**
 * Formatos da tela mínima (`/m`) e do aviso de pagamento.
 *
 * ## Cliente
 *
 * O aviso aparece na tela de bloqueio, que qualquer um ao lado vê. Por isso o
 * nome sai como «primeiro nome + inicial do último» — o suficiente para o
 * operador reconhecer o pagamento, sem expor o cliente.
 *
 * ## Forma
 *
 * Mesmo vocabulário de `lib/formasPagamento` (família, cor). Uma diferença:
 * sem `forma_detalhe` (a PaguePlay nunca manda) o rótulo é o consolidado do
 * enum, e NÃO passa por `familiaDaForma` — lá «Pix/Boleto» casa com a regra do
 * consolidado do ERP BookPlay e viraria «Boleto/Pix Cofen», que é outra coisa.
 */
import {
  ROTULO_AJUSTE, ROTULO_BOLETO_PIX, ROTULO_CARTAO, corDaForma, familiaDaForma,
} from '@/lib/formasPagamento';

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function capitalizar(palavra: string): string {
  const minusc = palavra.toLocaleLowerCase('pt-BR');
  return minusc.charAt(0).toLocaleUpperCase('pt-BR') + minusc.slice(1);
}

export function abreviarCliente(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'Cliente';
  const primeiro = capitalizar(partes[0]);
  const resto = partes.slice(1).filter(p => !PARTICULAS.has(p.toLocaleLowerCase('pt-BR')));
  if (resto.length === 0) return primeiro;
  const ultimo = resto[resto.length - 1];
  return `${primeiro} ${ultimo.charAt(0).toLocaleUpperCase('pt-BR')}.`;
}

export interface FormaDoPagamento {
  /** Família (`pix`, `boleto`, `cartao`…), `boleto_pix` no consolidado, `ajuste`. */
  chave: string;
  /** O que a tela escreve por extenso. */
  rotulo: string;
  /** Sigla do chip da lista. */
  curto: string;
  cor: string;
}

const CURTO: Record<string, string> = {
  pix: 'PIX',
  pix_automatico: 'PIX',
  boleto: 'BOL',
  cartao: 'CART',
  cartao_recorrente: 'REC',
  boleto_pix_cofen: 'PIX/BOL',
  boleto_pix: 'PIX/BOL',
};

function sigla(rotulo: string): string {
  return rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
}

export function formaDoPagamento(
  forma: 'boleto_pix' | 'cartao',
  detalhe?: string | null,
): FormaDoPagamento {
  const d = (detalhe ?? '').trim();

  if (d === ROTULO_AJUSTE) {
    return { chave: 'ajuste', rotulo: ROTULO_AJUSTE, curto: 'AJ', cor: corDaForma(d) };
  }

  if (!d) {
    const rotulo = forma === 'cartao' ? ROTULO_CARTAO : ROTULO_BOLETO_PIX;
    const chave = forma === 'cartao' ? 'cartao' : 'boleto_pix';
    return { chave, rotulo, curto: CURTO[chave], cor: corDaForma(rotulo) };
  }

  const familia = familiaDaForma(d);
  if (!familia) return { chave: d, rotulo: d, curto: sigla(d), cor: corDaForma(d) };
  return {
    chave: familia.chave,
    rotulo: familia.rotulo,
    curto: CURTO[familia.chave] ?? sigla(familia.rotulo),
    cor: corDaForma(familia.rotulo),
  };
}
