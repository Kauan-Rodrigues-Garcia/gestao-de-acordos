/**
 * metasDoDesafio.ts — a tradução entre o que o líder digita e o que fica gravado.
 *
 * Duas direções, e as duas precisam ser exatas:
 *
 *   • **tela → banco** (`valoresParaMetas`): o campo ao lado de cada pessoa vira
 *     `{ <id do perfil>: valor }`. Só o que for número positivo entra — campo em
 *     branco é "esta pessoa não disputa", e não "meta zero", que a tela leria
 *     como desafio já concluído.
 *
 *   • **banco → tela** (`metasParaValores`): o mapa gravado volta para os
 *     campos. A chave pode ser o id do perfil (o normal) ou um login — campanha
 *     antiga, ou meta semeada por migration a partir de planilha. As duas são
 *     resolvidas aqui, senão a janela abriria em branco e o líder acharia que
 *     perdeu a configuração.
 *
 * Mora fora do componente por dois motivos: é lógica pura e testável
 * (`metasDoDesafio.test.ts`), e um arquivo que exporta componente E função
 * quebra o *fast refresh* do Vite.
 */
import { parseBRL } from '@/lib/money';
import { chaveDeLogin } from '@/services/desafios/calcularDesafio';
import type { PessoaDesafio } from '@/services/desafios/types';

/** O que o formulário guarda: pessoa → valor digitado, como texto. */
export type ValoresPorPessoa = Record<string, string>;

/**
 * Texto do campo → número.
 *
 * Vazio, lixo e zero viram `0`, que não entra na campanha. Aceita `R$`, ponto
 * de milhar e vírgula decimal, porque é o que sai de uma planilha colada.
 */
export function valorDigitado(texto: string | undefined): number {
  if (!texto || !texto.trim()) return 0;
  const n = parseBRL(texto.replace(/r\$/i, '').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Número → o texto que o campo mostra (`40857,14`). */
export function paraCampo(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
}

/** Os valores digitados viram o mapa que a campanha guarda (só os positivos). */
export function valoresParaMetas(valores: ValoresPorPessoa): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const [pessoaId, texto] of Object.entries(valores)) {
    const n = valorDigitado(texto);
    if (n > 0) saida[pessoaId] = n;
  }
  return saida;
}

/**
 * O mapa gravado vira os campos da tela.
 *
 * Chave que casa com um login vira o id daquela pessoa — assim editar e salvar
 * de novo MIGRA a campanha para chaves por id, que é a forma estável. Chave que
 * não casa com ninguém é preservada como está: some da lista (não há pessoa
 * para mostrar) mas não é perdida em silêncio.
 */
export function metasParaValores(
  metas: Record<string, number>, pessoas: PessoaDesafio[],
): ValoresPorPessoa {
  const porLogin = new Map(pessoas.map(p => [chaveDeLogin(p.usuario), p.id]));
  const saida: ValoresPorPessoa = {};
  for (const [chave, valor] of Object.entries(metas)) {
    const pessoaId = porLogin.get(chaveDeLogin(chave)) ?? chave;
    saida[pessoaId] = paraCampo(valor);
  }
  return saida;
}

/**
 * Colar em bloco: `login = valor` por linha.
 *
 * Casa por login normalizado — a mesma normalização que o cálculo usa. O que
 * não casar volta em `naoCasaram` para a tela AVISAR: na primeira versão o
 * login errado era engolido, a pessoa não entrava na campanha, e o líder só
 * descobria quando alguém reclamasse de não estar no ranking.
 *
 * Aceita `=`, `:` e tabulação como separador — colar direto de uma planilha
 * traz tabulação.
 */
export function aplicarBlocoDeMetas(
  texto: string, pessoas: PessoaDesafio[], atuais: ValoresPorPessoa,
): { valores: ValoresPorPessoa; naoCasaram: string[] } {
  const porLogin = new Map(pessoas.map(p => [chaveDeLogin(p.usuario), p.id]));
  const valores: ValoresPorPessoa = { ...atuais };
  const naoCasaram: string[] = [];

  for (const bruta of texto.split('\n')) {
    // `#` abre comentário: dá para anotar por que alguém saiu da lista sem
    // apagar a linha.
    const linha = bruta.split('#')[0].trim();
    if (!linha) continue;

    const partes = linha.split(/\s*[=:\t]\s*/);
    if (partes.length < 2) continue;

    const login = chaveDeLogin(partes[0]);
    const valor = valorDigitado(partes.slice(1).join('='));
    if (!login || valor <= 0) continue;

    const pessoaId = porLogin.get(login);
    if (!pessoaId) { naoCasaram.push(partes[0].trim()); continue; }
    valores[pessoaId] = paraCampo(valor);
  }

  return { valores, naoCasaram };
}
