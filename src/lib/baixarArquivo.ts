/**
 * baixarArquivo.ts — entrega ao navegador um arquivo montado na própria aba.
 *
 * Saiu de `services/fechamento/baixarFechamento.ts` quando o Fechamento da
 * gerência passou a baixar Excel e HTML (14/09/2026): duas cópias do mesmo link
 * temporário são como uma delas esquece o `revokeObjectURL`.
 */
export function baixarArquivo(conteudo: BlobPart, nome: string, tipo: string): void {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sem o revoke, cada download deixa o arquivo inteiro preso na memória da aba
  // até o refresh. O atraso dá tempo de o navegador iniciar a gravação.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const TIPO_HTML = 'text/html;charset=utf-8';
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
