import { lerArquivo } from './parser';

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ dados: lerArquivo(event.data) }); }
  catch (e) { self.postMessage({ erro: e instanceof Error ? e.message : 'Não foi possível ler o arquivo.' }); }
};
