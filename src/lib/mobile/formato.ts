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

/**
 * O nome do cliente sem o código na frente.
 *
 * Relato de 30/09/2026: «algumas [linhas] têm o nome correto e outras aparecem
 * com um código na frente do nome». O parser da tela já separa «123 - NOME»
 * (`extrairNome`), mas nem toda origem passa por ele — o robô, a sincronização e
 * importações antigas gravaram o texto como veio. Aqui a limpeza é na leitura,
 * então vale para o que já está no banco:
 *
 *   • tira o próprio `codigo` (NR) da linha quando o nome começa por ele;
 *   • tira «12345 - », «12345-», «12345: », «12345 | » e «12345 » (4+ dígitos).
 */
export function limparNomeCliente(nome: string | null | undefined, codigo?: string | null): string {
  let s = String(nome ?? '').trim();
  const c = String(codigo ?? '').trim();
  if (c && s.startsWith(c)) s = s.slice(c.length);
  s = s.replace(/^\s*[-–—:|.]\s*/, '');
  s = s.replace(/^\d[\d./]*\s*[-–—:|]\s*/, '');
  s = s.replace(/^\d{4,}\s+/, '');
  return s.trim();
}

/** Nome completo para a lista do app: «MARIA DA SILVA» → «Maria da Silva». */
export function nomeDoCliente(nome: string | null | undefined, codigo?: string | null): string {
  const partes = limparNomeCliente(nome, codigo).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'Cliente';
  return partes
    .map((p, i) => (i > 0 && PARTICULAS.has(p.toLocaleLowerCase('pt-BR'))
      ? p.toLocaleLowerCase('pt-BR') : capitalizar(p)))
    .join(' ');
}

export function abreviarCliente(nome: string | null | undefined, codigo?: string | null): string {
  const partes = limparNomeCliente(nome, codigo).split(/\s+/).filter(Boolean);
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

/**
 * Valor curto para listas do celular: «R$ 41,9 mil», «R$ 1,2 mi», «R$ 850».
 *
 * Nas listas a coluna de valor tem ~80 px; o valor completo fica nos
 * destaques (cartão, leitura grande, folha de detalhe). Sinal opcional para
 * sobra/falta: «+R$ 9,2 mil», «−R$ 1,6 mil» (menos tipográfico, não hífen).
 */
export function valorCurto(v: number, opcoes: { sinal?: boolean } = {}): string {
  const n = Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  const umaCasa = (x: number) =>
    x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  let corpo: string;
  if (abs >= 1_000_000) corpo = `R$ ${umaCasa(abs / 1_000_000)} mi`;
  else if (abs >= 1_000) corpo = `R$ ${umaCasa(abs / 1_000)} mil`;
  else corpo = `R$ ${Math.round(abs).toLocaleString('pt-BR')}`;
  if (opcoes.sinal) return `${n < 0 ? '−' : '+'}${corpo}`;
  return n < 0 ? `−${corpo}` : corpo;
}

