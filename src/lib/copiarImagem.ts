/**
 * copiarImagem.ts — fotografa um elemento da tela e põe a imagem na área de
 * transferência, para colar direto no WhatsApp.
 *
 * O mesmo caminho do «copiar imagem» do relatório PaguePlay (html2canvas +
 * `ClipboardItem`), fora do iframe. Onde o navegador não deixa gravar imagem na
 * área de transferência (Firefox antigo, página em http), baixa o PNG — o
 * clique nunca termina sem entregar nada.
 *
 * A promessa do PNG vai DENTRO do `ClipboardItem`, criado ainda no clique: o
 * Safari só aceita a gravação enquanto o gesto do usuário está vivo, e gerar a
 * imagem antes (carregar o html2canvas, desenhar) o faria recusar.
 */

export type ResultadoCopiaImagem = 'copiado' | 'baixado';

async function gerarPng(el: HTMLElement, fundo: string): Promise<Blob> {
  // Sob demanda: o html2canvas pesa ~200 KB e só este botão o usa.
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: fundo,
    logging: false,
    useCORS: true,
  });
  return new Promise<Blob>((ok, falha) => {
    canvas.toBlob(b => (b ? ok(b) : falha(new Error('O navegador não gerou a imagem.'))), 'image/png');
  });
}

function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * @param el          o que fotografar — pode estar fora da área visível.
 * @param nomeArquivo o nome do PNG, se precisar baixar.
 * @param fundo       cor por trás de cantos arredondados e transparências.
 */
export async function copiarImagemDoElemento(
  el: HTMLElement,
  nomeArquivo: string,
  fundo = '#FCFCFC',
): Promise<ResultadoCopiaImagem> {
  const png = gerarPng(el, fundo);
  // O download de reserva ainda precisa do PNG: sem este `catch` uma falha
  // na cópia deixaria a promessa rejeitada sem ninguém ouvindo.
  png.catch((): void => undefined);

  const podeCopiar = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
  if (podeCopiar) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return 'copiado';
    } catch {
      // Navegador que não aceita promessa no ClipboardItem: tenta com o PNG pronto.
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png })]);
        return 'copiado';
      } catch {
        /* cai no download */
      }
    }
  }
  baixar(await png, nomeArquivo);
  return 'baixado';
}
