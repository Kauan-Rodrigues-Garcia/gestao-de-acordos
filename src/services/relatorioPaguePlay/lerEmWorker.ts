import type { RelatorioLido } from './modelo';

/** Históricos anuais podem ter dezenas de milhares de linhas. Não travar a UI. */
export async function lerEmWorker(file: File): Promise<RelatorioLido> {
  const buffer = await file.arrayBuffer();
  const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ dados?: RelatorioLido; erro?: string }>) => {
      worker.terminate();
      if (event.data.erro) reject(new Error(event.data.erro));
      else if (event.data.dados) resolve(event.data.dados);
      else reject(new Error('Resposta inválida ao ler o arquivo.'));
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('Não foi possível ler o arquivo. Tente novamente.')); };
    worker.postMessage(buffer, [buffer]);
  });
}
