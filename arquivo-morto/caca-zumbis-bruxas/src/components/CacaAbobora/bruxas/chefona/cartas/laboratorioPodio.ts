/**
 * laboratorioPodio.ts — os quadros do pódio (`podio.ts`), SÓ no localhost.
 *
 * Abre em http://localhost:8080/lab-podio.html (com o `npm run dev`). Sem
 * login e sem banco. As fotos entram pelos campos da página (as de
 * Downloads/Top 3) ou por `window.renderizarPodio`, que o script de exportar
 * chama. O build de produção não leva esta página.
 */
import { prepararFontes } from './carta';
import { TOP3, desenharPodio, desenharQuadro, nomeDoQuadro, recortarFoto, type ComoRecortar } from './podio';

/** Como tirar o fundo de cada foto: a do Pedro veio sem; a da Erika é preto puro; a do Eduardo, azul-marinho. */
const RECORTE: Readonly<Record<1 | 2 | 3, ComoRecortar>> = {
  1: { tipo: 'pronta' },
  2: { tipo: 'chave', cor: [0, 0, 0], tolerancia: 6 },
  3: { tipo: 'chave', cor: [35, 48, 71], tolerancia: 16 },
};

async function imagem(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Desenha os três quadros e o pódio junto; devolve os PNGs em data URL, pelo nome do arquivo. */
async function renderizarPodio(fotos: Readonly<Record<1 | 2 | 3, string>>): Promise<Record<string, string>> {
  await prepararFontes();
  const quadros = {} as Record<1 | 2 | 3, HTMLCanvasElement>;
  const saida: Record<string, string> = {};
  for (const h of TOP3) {
    const foto = recortarFoto(await imagem(fotos[h.posicao]), RECORTE[h.posicao]);
    quadros[h.posicao] = desenharQuadro(h, foto);
    saida[nomeDoQuadro(h)] = quadros[h.posicao].toDataURL('image/png');
  }
  saida['Top 3 - Pódio.png'] = desenharPodio(quadros, 0.5).toDataURL('image/png');
  mostrar(quadros);
  return saida;
}

function mostrar(quadros: Record<1 | 2 | 3, HTMLCanvasElement>): void {
  const raiz = document.getElementById('lab')!;
  raiz.replaceChildren();
  for (const p of [2, 1, 3] as const) {
    quadros[p].style.width = `${quadros[p].width / 5}px`;
    raiz.append(quadros[p]);
  }
}

declare global {
  interface Window { renderizarPodio: typeof renderizarPodio }
}
window.renderizarPodio = renderizarPodio;

// Os campos de arquivo: escolha as três fotos (na ordem 1º, 2º, 3º).
const campo = document.getElementById('fotos') as HTMLInputElement | null;
campo?.addEventListener('change', () => {
  const arquivos = [...(campo.files ?? [])];
  if (arquivos.length !== 3) return;
  const [a, b, c] = arquivos.map(f => URL.createObjectURL(f));
  void renderizarPodio({ 1: a, 2: b, 3: c });
});
document.body.style.cssText = 'margin:0;background:#11151c;font-family:system-ui;color:#ccd';
document.body.dataset.pronto = '1';
