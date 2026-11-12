/**
 * CartasDoPantano.tsx — a janela do super_admin com as cartas épicas da Bruxa
 * do Pântano (`carta.ts` desenha, `banco.ts` lê).
 *
 * Abre pelo cartão da chefona em Configurações. Escolhe a rodada (a mais nova
 * vem marcada) e desenha uma carta para cada pessoa que tirou vida dela: o
 * top 10 primeiro, depois do 11º em diante (pedido do Kauan, 19/10/2026).
 * Cada carta baixa já com o lugar e o nome da pessoa no arquivo, copia para
 * colar no WhatsApp, ou vai num .zip (todas, só o top 10 ou do 11º em diante).
 *
 * O RECORTE: a foto do perfil nem sempre vem enquadrada para a janela em arco.
 * O lápis da carta abre o editor, onde se arrasta a foto e se aproxima com o
 * zoom; a carta é redesenhada ao vivo. O recorte fica guardado neste navegador
 * (por rodada e pessoa) para a próxima vez que a janela abrir.
 *
 * Na tela, a carta inclina com o mouse e o brilho de carta rara passa por cima
 * (só na tela: o PNG é a arte).
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { zipSync } from 'fflate';
import { Copy, Crop, Download, Loader2, PackageOpen, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import {
  ENQUADRAMENTO_PADRAO, JANELA, LARGURA_CARTA, TOPO_CARTA, ZOOM_MAXIMO, carregarFoto, desenharCarta, nomeDoArquivo,
  prepararFontes, tamanhoDaFoto, type DadosDaCarta, type Enquadramento,
} from './carta';
import { lerCartasDaRodada, lerRodadasDerrotadas, type RodadaDerrotada } from './banco';
import './cartas.css';

interface CartaPronta {
  usuario: string;
  dados: DadosDaCarta;
  foto: HTMLImageElement | null;
  enq: Enquadramento;
  arquivo: string;
  blob: Blob;
  url: string;
}

// ── O recorte guardado neste navegador ──────────────────────────────────────

const chaveDoRecorte = (rodada: number, usuario: string) => `cartas-pantano:recorte:${rodada}:${usuario}`;

function lerRecorte(rodada: number, usuario: string): Enquadramento {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveDoRecorte(rodada, usuario)) ?? 'null') as Partial<Enquadramento> | null;
    if (bruto && [bruto.zoom, bruto.px, bruto.py].every(v => typeof v === 'number' && Number.isFinite(v))) {
      return bruto as Enquadramento;
    }
  } catch { /* sem armazenamento: fica o padrão */ }
  return ENQUADRAMENTO_PADRAO;
}

function guardarRecorte(rodada: number, usuario: string, enq: Enquadramento): void {
  try {
    if (enq === ENQUADRAMENTO_PADRAO) localStorage.removeItem(chaveDoRecorte(rodada, usuario));
    else localStorage.setItem(chaveDoRecorte(rodada, usuario), JSON.stringify(enq));
  } catch { /* sem armazenamento: vale só nesta abertura */ }
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function paraBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => cv.toBlob(b => (b ? resolve(b) : reject(new Error('PNG vazio'))), 'image/png'));
}

function baixar(blob: Blob, arquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function baixarZip(cartas: readonly CartaPronta[], arquivo: string): Promise<void> {
  const arquivos: Record<string, Uint8Array> = {};
  for (const c of cartas) arquivos[c.arquivo] = new Uint8Array(await c.blob.arrayBuffer());
  // PNG já vem comprimido: o zip só junta (os nomes com acento vão em UTF-8).
  baixar(new Blob([zipSync(arquivos, { level: 0 })], { type: 'application/zip' }), arquivo);
}

/** A carta desenhada; foto que não deixa exportar sai com as iniciais. */
async function renderizar(dados: DadosDaCarta, foto: HTMLImageElement | null, enq: Enquadramento): Promise<{ blob: Blob; foto: HTMLImageElement | null }> {
  try {
    return { blob: await paraBlob(desenharCarta(dados, foto, enq)), foto };
  } catch {
    return { blob: await paraBlob(desenharCarta(dados, null)), foto: null };
  }
}

function quando(r: RodadaDerrotada): string {
  if (!r.derrotado_em) return `Rodada ${r.id}`;
  return new Date(r.derrotado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── A carta na tela ──────────────────────────────────────────────────────────

/** A carta na tela: inclina com o mouse e o brilho segue o ponteiro. */
function CartaNaTela({ carta, aoRecortar }: { carta: CartaPronta; aoRecortar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mexer = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--cdp-rx', `${(0.5 - y) * 14}deg`);
    el.style.setProperty('--cdp-ry', `${(x - 0.5) * 18}deg`);
    el.style.setProperty('--cdp-mx', `${x * 100}%`);
    el.style.setProperty('--cdp-my', `${y * 100}%`);
  };
  const soltar = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--cdp-rx', '0deg');
    el.style.setProperty('--cdp-ry', '0deg');
  };
  async function copiar() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': carta.blob })]);
      toast.success('Carta copiada', { description: 'É só colar na conversa.' });
    } catch {
      toast.error('Este navegador não deixou copiar a imagem', { description: 'Use o botão de baixar.' });
    }
  }
  const { posicao, nome } = carta.dados;
  return (
    <figure className="cdp-item">
      <div ref={ref} className="cdp-carta" data-posicao={posicao} onPointerMove={mexer} onPointerLeave={soltar}>
        <img src={carta.url} alt={`Carta do ${posicao}º lugar: ${nome}`} draggable={false} />
        <span className="cdp-brilho" aria-hidden />
      </div>
      <figcaption className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium" title={carta.arquivo}>{posicao}º · {nome}</span>
        <span className="flex shrink-0">
          <Button
            size="sm" variant="ghost" className="h-7 px-2" disabled={!carta.foto}
            title={carta.foto ? 'Recortar a foto' : 'Sem foto no perfil: a carta mostra as iniciais'}
            onClick={aoRecortar}
          >
            <Crop className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Copiar a imagem" onClick={copiar}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" title={`Baixar «${carta.arquivo}»`} onClick={() => baixar(carta.blob, carta.arquivo)}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </span>
      </figcaption>
    </figure>
  );
}

// ── O editor do recorte ──────────────────────────────────────────────────────

function Recorte({ carta, aoSalvar, aoFechar }: {
  carta: CartaPronta;
  aoSalvar: (enq: Enquadramento) => void;
  aoFechar: () => void;
}) {
  const [enq, setEnq] = useState<Enquadramento>(carta.enq);
  const tela = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<{ x: number; y: number; enq: Enquadramento } | null>(null);
  const foto = carta.foto!;

  // Redesenha a carta inteira a cada mudança, no máximo uma vez por quadro.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const cv = tela.current;
      const c = cv?.getContext('2d');
      if (!cv || !c) return;
      c.drawImage(desenharCarta(carta.dados, foto, enq), 0, 0, cv.width, cv.height);
    });
    return () => cancelAnimationFrame(id);
  }, [carta.dados, foto, enq]);

  const lim = (v: number) => Math.min(1, Math.max(0, v));

  function apertar(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { x: e.clientX, y: e.clientY, enq };
  }
  function arrastar(e: PointerEvent<HTMLCanvasElement>) {
    const a = arrasto.current;
    if (!a) return;
    // O quanto o mouse andou, em px da carta; a foto anda junto com ele.
    const escala = LARGURA_CARTA / e.currentTarget.getBoundingClientRect().width;
    const dx = (e.clientX - a.x) * escala, dy = (e.clientY - a.y) * escala;
    const { dw, dh } = tamanhoDaFoto(foto, a.enq.zoom);
    const sobraX = dw - JANELA.w, sobraY = dh - JANELA.h;
    setEnq({
      zoom: a.enq.zoom,
      px: sobraX > 0 ? lim(a.enq.px - dx / sobraX) : 0.5,
      py: sobraY > 0 ? lim(a.enq.py - dy / sobraY) : 0.5,
    });
  }
  function soltar() {
    arrasto.current = null;
  }
  function rodinha(e: WheelEvent<HTMLCanvasElement>) {
    const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, enq.zoom * Math.pow(1.1, -e.deltaY / 100)));
    setEnq({ ...enq, zoom });
  }

  return (
    <Dialog open onOpenChange={a => !a && aoFechar()}>
      <DialogContent className="max-h-[94vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recortar a foto: {carta.dados.posicao}º · {carta.dados.nome}</DialogTitle>
          <DialogDescription>
            Arraste a foto para enquadrar o rosto na janela e use o zoom (ou a rodinha do mouse) para aproximar.
          </DialogDescription>
        </DialogHeader>
        <canvas
          ref={tela}
          width={540}
          height={756}
          className="mx-auto block w-full max-w-[380px] cursor-grab touch-none select-none rounded-md active:cursor-grabbing"
          onPointerDown={apertar}
          onPointerMove={arrastar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onWheel={rodinha}
        />
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          Zoom
          <Slider
            className="flex-1"
            min={1} max={ZOOM_MAXIMO} step={0.01}
            value={[enq.zoom]}
            onValueChange={([zoom]) => setEnq({ ...enq, zoom })}
          />
          <span className="w-10 text-right tabular-nums">{Math.round(enq.zoom * 100)}%</span>
        </label>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEnq(ENQUADRAMENTO_PADRAO)}>
            <RotateCcw className="h-3.5 w-3.5" /> Voltar ao padrão
          </Button>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" onClick={aoFechar}>Cancelar</Button>
            <Button size="sm" onClick={() => aoSalvar(enq)}>Usar este recorte</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A janela ─────────────────────────────────────────────────────────────────

export function CartasDoPantano({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [rodadas, setRodadas] = useState<RodadaDerrotada[] | null>(null);
  const [rodadaId, setRodadaId] = useState<number | null>(null);
  const [cartas, setCartas] = useState<CartaPronta[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recortando, setRecortando] = useState<CartaPronta | null>(null);
  const urls = useRef<string[]>([]);

  // As rodadas, uma vez por abertura.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setErro(null);
    lerRodadasDerrotadas()
      .then(rs => {
        if (!vivo) return;
        setRodadas(rs);
        setRodadaId(id => id ?? rs[0]?.id ?? null);
      })
      .catch(e => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [aberto]);

  // As cartas da rodada escolhida, uma a uma (aparecem conforme ficam prontas).
  useEffect(() => {
    const r = rodadas?.find(x => x.id === rodadaId);
    if (!aberto || !r) return;
    let vivo = true;
    const feitas: CartaPronta[] = [];
    setCarregando(true);
    setErro(null);
    setCartas([]);
    setTotal(0);
    (async () => {
      const [lista] = await Promise.all([lerCartasDaRodada(r), prepararFontes()]);
      if (!vivo) return;
      setTotal(lista.length);
      const fotos = await Promise.all(lista.map(t => carregarFoto(t.foto)));
      for (let i = 0; i < lista.length && vivo; i++) {
        const { dados, usuario } = lista[i];
        const enq = lerRecorte(r.id, usuario);
        const pronta = await renderizar(dados, fotos[i], enq);
        const url = URL.createObjectURL(pronta.blob);
        urls.current.push(url);
        feitas.push({ usuario, dados, foto: pronta.foto, enq, arquivo: nomeDoArquivo(dados), blob: pronta.blob, url });
        if (vivo) setCartas([...feitas]);
      }
    })()
      .catch(e => vivo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [aberto, rodadas, rodadaId]);

  // Os endereços das imagens morrem com a janela.
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  const salvarRecorte = useCallback(async (carta: CartaPronta, enq: Enquadramento) => {
    setRecortando(null);
    if (rodadaId != null) guardarRecorte(rodadaId, carta.usuario, enq);
    const pronta = await renderizar(carta.dados, carta.foto, enq);
    const url = URL.createObjectURL(pronta.blob);
    urls.current.push(url);
    setCartas(cs => cs.map(c => (c.usuario === carta.usuario ? { ...c, enq, blob: pronta.blob, url } : c)));
  }, [rodadaId]);

  const topo = cartas.filter(c => c.dados.posicao <= TOPO_CARTA);
  const resto = cartas.filter(c => c.dados.posicao > TOPO_CARTA);
  const pronto = !carregando && cartas.length > 0;

  return (
    <Dialog open={aberto} onOpenChange={a => !a && aoFechar()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cartas da Bruxa do Pântano</DialogTitle>
          <DialogDescription>
            Uma carta para cada pessoa que tirou vida dela, com a foto do perfil, o lugar e os números da luta. O arquivo
            já sai com o lugar e o nome («03 - Maria Silva.png»). Use o recorte para enquadrar a foto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {rodadas && rodadas.length > 1 ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Rodada
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                value={rodadaId ?? ''}
                onChange={e => setRodadaId(Number(e.target.value))}
              >
                {rodadas.map(r => <option key={r.id} value={r.id}>{quando(r)}</option>)}
              </select>
            </label>
          ) : <span className="text-xs text-muted-foreground">{rodadas?.[0] ? `Caiu em ${quando(rodadas[0])}` : ''}</span>}
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!pronto} onClick={() => baixarZip(cartas, 'Bruxa do Pântano - todas as cartas.zip')}>
              <PackageOpen className="h-3.5 w-3.5" /> Baixar todas ({cartas.length})
            </Button>
          </span>
        </div>

        {carregando && total > 0 && (
          <p className="flex items-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Desenhando {cartas.length} de {total}…
          </p>
        )}
        {erro && <p className="text-xs text-destructive">Não deu para montar as cartas: {erro}</p>}
        {rodadas && rodadas.length === 0 && (
          <p className="text-xs text-muted-foreground">A Bruxa do Pântano ainda não caiu em nenhuma rodada.</p>
        )}

        {[
          { titulo: 'Top 10', lista: topo, zip: 'Bruxa do Pântano - top 10.zip' },
          { titulo: `Do ${TOPO_CARTA + 1}º em diante`, lista: resto, zip: `Bruxa do Pântano - do ${TOPO_CARTA + 1} em diante.zip` },
        ].filter(g => g.lista.length > 0).map(g => (
          <section key={g.titulo} className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
              <h3 className="text-sm font-semibold">{g.titulo} <span className="font-normal text-muted-foreground">· {g.lista.length}</span></h3>
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" disabled={!pronto} onClick={() => baixarZip(g.lista, g.zip)}>
                <Download className="h-3.5 w-3.5" /> Baixar estas (.zip)
              </Button>
            </div>
            <div className="cdp-grade">
              {g.lista.map(c => <CartaNaTela key={`${rodadaId}:${c.usuario}`} carta={c} aoRecortar={() => setRecortando(c)} />)}
            </div>
          </section>
        ))}

        {recortando && (
          <Recorte carta={recortando} aoSalvar={enq => salvarRecorte(recortando, enq)} aoFechar={() => setRecortando(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CartasDoPantano;
