/**
 * Estudio.tsx — onde o líder desenha a «Cena livre» (30/10/2026).
 *
 * Três colunas, no molde do Estúdio das Comemorações: à esquerda o que se
 * acrescenta e a lista de camadas; no meio o palco, que é o MESMO `CenaLivre`
 * da TV com uma camada de alças por cima; à direita as propriedades do
 * elemento escolhido (ou do fundo, sem nada escolhido).
 *
 * Nada vai para a TV daqui: «Aplicar» devolve a cena para a tela do painel, e
 * ela continua rascunho até o «Publicar na TV» da montagem.
 *
 * Teclado (fora de campo de texto): Delete apaga, setas empurram (Shift = mais),
 * Ctrl+Z desfaz, Ctrl+D duplica, Esc solta a seleção.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownToLine, ArrowUpToLine, Clapperboard, Clock, Copy, Hash, ImagePlus, Image as IconeImagem,
  Shapes, Trash2, Type, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PAPEIS_DE_PAREDE } from '@/components/comemoracao2/papeisDeParede';
import type { TemaId } from '../tipos';
import type { VisaoTv } from '../numeros';
import { PalcoTv } from '../TelaTv';
import { enviarMidia } from '../servico';
import { CenaLivre } from './CenaLivre';
import {
  EFEITOS_LIVRES, ENTRADAS_LIVRES, FONTES_LIVRES, MAX_ELEMENTOS, MAX_TEXTO, METRICAS, MODELOS_LIVRES,
  TAMANHO_MAX, TAMANHO_MIN, cenaDoModelo, cenaValida, duplicarElemento, moverElemento, mudarCamada,
  novoElemento, redimensionar,
  type Canto, type CenaLivre as Cena, type ElementoLivre, type EstiloTexto, type FundoCena, type TipoElemento,
} from './cena';

const NOVOS: { tipo: TipoElemento; nome: string; icone: ReactNode }[] = [
  { tipo: 'texto',   nome: 'Texto',           icone: <Type className="h-4 w-4" /> },
  { tipo: 'numero',  nome: 'Número ao vivo',  icone: <Hash className="h-4 w-4" /> },
  { tipo: 'imagem',  nome: 'Imagem',          icone: <IconeImagem className="h-4 w-4" /> },
  { tipo: 'relogio', nome: 'Relógio',         icone: <Clock className="h-4 w-4" /> },
  { tipo: 'forma',   nome: 'Forma',           icone: <Shapes className="h-4 w-4" /> },
];

const CORES_RAPIDAS = ['#ffffff', '#0b1220', '#5eead4', '#f5c542', '#fb7185', '#38bdf8', '#4ade80', '#a78bfa'];

const HISTORICO_MAX = 40;

/** Quanto tempo a prévia da animação fica tocando antes de o palco voltar a ser editável. */
const PREVIA_MS = 4500;

export function Estudio({ aberto, inicial, tema, visao, painelId, aoAplicar, aoFechar }: {
  aberto: boolean;
  /** O que está gravado na tela (passa pelo `cenaValida`). */
  inicial: unknown;
  tema: TemaId;
  visao: VisaoTv | null;
  painelId: string;
  aoAplicar: (cena: Cena) => void;
  aoFechar: () => void;
}) {
  const [cena, setCena] = useState<Cena>(() => cenaValida(inicial));
  const [sel, setSel] = useState<string | null>(null);
  const [passado, setPassado] = useState<Cena[]>([]);
  const [animando, setAnimando] = useState(0);
  const original = useRef('');

  // Abrir de novo recomeça do que está na tela.
  useEffect(() => {
    if (!aberto) return;
    const c = cenaValida(inicial);
    setCena(c);
    original.current = JSON.stringify(c);
    setSel(null);
    setPassado([]);
    setAnimando(0);
  }, [aberto, inicial]);

  useEffect(() => {
    if (!animando) return;
    const t = setTimeout(() => setAnimando(0), PREVIA_MS);
    return () => clearTimeout(t);
  }, [animando]);

  // A cena de agora, para as mudanças não dependerem de qual render as criou.
  const cenaRef = useRef(cena);
  cenaRef.current = cena;
  const trocar = useCallback((nova: Cena) => { cenaRef.current = nova; setCena(nova); }, []);
  const empilhar = useCallback((anterior: Cena) => setPassado(p => [...p.slice(-(HISTORICO_MAX - 1)), anterior]), []);

  /** Toda mudança que o líder pode querer desfazer passa por aqui. */
  const mudar = useCallback((f: (c: Cena) => Cena) => {
    const atual = cenaRef.current;
    const nova = f(atual);
    if (nova === atual) return;
    empilhar(atual);
    trocar(nova);
  }, [empilhar, trocar]);

  /** Mudança contínua (arrasto, controle deslizante): o histórico marca só o começo do gesto. */
  const mudarSemHistorico = useCallback((f: (c: Cena) => Cena) => trocar(f(cenaRef.current)), [trocar]);
  const marcarHistorico = useCallback(() => empilhar(cenaRef.current), [empilhar]);

  const desfazer = useCallback(() => {
    if (!passado.length) return;
    trocar(passado[passado.length - 1]);
    setPassado(passado.slice(0, -1));
  }, [passado, trocar]);

  const elemento = cena.elementos.find(e => e.id === sel) ?? null;
  const mudarElemento = (id: string, parcial: Partial<ElementoLivre>) =>
    mudar(c => ({ ...c, elementos: c.elementos.map(e => (e.id === id ? { ...e, ...parcial } as ElementoLivre : e)) }));
  const mudarElementoSemHistorico = (id: string, parcial: Partial<ElementoLivre>) =>
    mudarSemHistorico(c => ({ ...c, elementos: c.elementos.map(e => (e.id === id ? { ...e, ...parcial } as ElementoLivre : e)) }));

  const acrescentar = (tipo: TipoElemento) => {
    if (cena.elementos.length >= MAX_ELEMENTOS) { toast.error(`Até ${MAX_ELEMENTOS} elementos por cena.`); return; }
    const novo = novoElemento(tipo, cena);
    mudar(c => ({ ...c, elementos: [...c.elementos, novo] }));
    setSel(novo.id);
  };
  const apagar = useCallback((id: string) => {
    mudar(c => ({ ...c, elementos: c.elementos.filter(e => e.id !== id) }));
    setSel(null);
  }, [mudar]);
  const duplicar = useCallback((id: string) => {
    const { cena: nova, novoId } = duplicarElemento(cena, id);
    if (!novoId) { toast.error(`Até ${MAX_ELEMENTOS} elementos por cena.`); return; }
    mudar(() => nova);
    setSel(novoId);
  }, [cena, mudar]);

  // Teclado.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key.toLowerCase() === 'z') { ev.preventDefault(); desfazer(); return; }
      if (!sel) return;
      if (ctrl && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicar(sel); return; }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); apagar(sel); return; }
      if (ev.key === 'Escape') { setSel(null); return; }
      const passo = ev.shiftKey ? 2 : 0.5;
      const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key];
      if (d) {
        ev.preventDefault();
        mudar(c => ({ ...c, elementos: c.elementos.map(e => (e.id === sel ? moverElemento(e, d[0], d[1]) : e)) }));
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, sel, desfazer, duplicar, apagar, mudar]);

  const sujo = JSON.stringify(cena) !== original.current;
  const fechar = () => {
    if (sujo && !window.confirm('Fechar o estúdio e descartar o que mudou?')) return;
    aoFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) fechar(); }}>
      <DialogContent className="max-w-[min(1600px,97vw)] w-[97vw] h-[94vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Topo */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 pr-12">
          <div className="mr-2">
            <DialogTitle className="text-base">Estúdio da cena livre</DialogTitle>
            <DialogDescription className="text-xs">Arraste para mover, puxe os cantos para mudar o tamanho.</DialogDescription>
          </div>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm" value=""
            onChange={e => {
              const id = e.target.value as typeof MODELOS_LIVRES[number]['id'];
              if (!id) return;
              if (cena.elementos.length && !window.confirm('Trocar pelo modelo apaga o que está no palco. Continuar?')) return;
              mudar(() => cenaDoModelo(id));
              setSel(null);
            }}
          >
            <option value="">Começar de um modelo…</option>
            {MODELOS_LIVRES.map(m => <option key={m.id} value={m.id}>{m.nome} — {m.descricao}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={desfazer} disabled={!passado.length}>
            <Undo2 className="h-4 w-4 mr-1.5" />Desfazer
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSel(null); setAnimando(n => n + 1); }}>
            <Clapperboard className="h-4 w-4 mr-1.5" />Ver animação
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={fechar}>Cancelar</Button>
            <Button size="sm" onClick={() => { aoAplicar(cena); aoFechar(); }}>Aplicar na tela</Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[200px_minmax(0,1fr)_320px]">
          {/* Esquerda: acrescentar e camadas */}
          <div className="border-r p-3 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acrescentar</div>
              {NOVOS.map(n => (
                <Button key={n.tipo} variant="outline" size="sm" className="w-full justify-start" onClick={() => acrescentar(n.tipo)}>
                  {n.icone}<span className="ml-2">{n.nome}</span>
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Camadas <span className="font-normal normal-case">({cena.elementos.length}/{MAX_ELEMENTOS})</span>
              </div>
              <button onClick={() => setSel(null)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-sm ${sel == null ? 'bg-primary/10 font-medium' : 'hover:bg-accent'}`}>
                Fundo
              </button>
              {[...cena.elementos].reverse().map(e => (
                <button key={e.id} onClick={() => setSel(e.id)}
                  className={`w-full text-left rounded-md px-2 py-1.5 text-sm truncate ${sel === e.id ? 'bg-primary/10 font-medium' : 'hover:bg-accent'}`}>
                  {rotuloDoElemento(e)}
                </button>
              ))}
            </div>
          </div>

          {/* Meio: o palco */}
          <Palco
            cena={cena} tema={tema} visao={visao} sel={sel} animando={animando}
            aoSelecionar={setSel}
            aoComecarGesto={marcarHistorico}
            aoMover={(id, f) => mudarSemHistorico(c => ({ ...c, elementos: c.elementos.map(e => (e.id === id ? f(e) : e)) }))}
          />

          {/* Direita: propriedades */}
          <div className="border-l p-4 overflow-y-auto space-y-4">
            {elemento ? (
              <Propriedades
                e={elemento} painelId={painelId}
                aoMudar={p => mudarElemento(elemento.id, p)}
                aoMudarContinuo={p => mudarElementoSemHistorico(elemento.id, p)}
                aoComecarGesto={marcarHistorico}
                aoCamada={para => mudar(c => mudarCamada(c, elemento.id, para))}
                aoDuplicar={() => duplicar(elemento.id)}
                aoApagar={() => apagar(elemento.id)}
              />
            ) : (
              <PropriedadesDoFundo fundo={cena.fundo} painelId={painelId} aoMudar={f => mudar(c => ({ ...c, fundo: f }))} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function rotuloDoElemento(e: ElementoLivre): string {
  switch (e.tipo) {
    case 'texto': return `Texto · ${e.texto.slice(0, 24) || 'vazio'}`;
    case 'numero': return `Número · ${METRICAS.find(m => m.id === e.metrica)?.nome ?? ''}`;
    case 'relogio': return 'Relógio';
    case 'imagem': return e.url ? 'Imagem' : 'Imagem (sem arquivo)';
    case 'forma': return e.forma === 'circulo' ? 'Círculo' : 'Retângulo';
  }
}

// ── O palco com as alças ─────────────────────────────────────────────────────

/** O maior 16:9 que cabe na caixa. */
function useEncaixe() {
  const ref = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ l: 0, a: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const l = Math.max(0, Math.min(el.clientWidth - 32, (el.clientHeight - 32) * 16 / 9));
      setTam({ l, a: l * 9 / 16 });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, tam] as const;
}

type Gesto = { id: string; canto: Canto | null; x0: number; y0: number; el: ElementoLivre; largura: number; altura: number };

function Palco({ cena, tema, visao, sel, animando, aoSelecionar, aoComecarGesto, aoMover }: {
  cena: Cena; tema: TemaId; visao: VisaoTv | null; sel: string | null; animando: number;
  aoSelecionar: (id: string | null) => void;
  aoComecarGesto: () => void;
  aoMover: (id: string, f: (e: ElementoLivre) => ElementoLivre) => void;
}) {
  const [caixa, tam] = useEncaixe();
  const palco = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);

  const comecar = (ev: React.PointerEvent, e: ElementoLivre, canto: Canto | null) => {
    ev.stopPropagation();
    ev.preventDefault();
    const r = palco.current?.getBoundingClientRect();
    if (!r) return;
    aoSelecionar(e.id);
    aoComecarGesto();
    gesto.current = { id: e.id, canto, x0: ev.clientX, y0: ev.clientY, el: e, largura: r.width, altura: r.height };
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  };
  const mover = (ev: React.PointerEvent) => {
    const g = gesto.current;
    if (!g) return;
    const dx = ((ev.clientX - g.x0) / g.largura) * 100;
    const dy = ((ev.clientY - g.y0) / g.altura) * 100;
    aoMover(g.id, () => (g.canto ? redimensionar(g.el, g.canto, dx, dy) : moverElemento(g.el, dx, dy)));
  };
  const soltar = () => { gesto.current = null; };

  return (
    <div ref={caixa} className="relative min-w-0 min-h-0 flex items-center justify-center bg-muted/40"
      onPointerDown={() => aoSelecionar(null)}>
      <div ref={palco} className="relative shadow-lg rounded-md overflow-hidden" style={{ width: tam.l, height: tam.a }}
        onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <PalcoTv tema={tema} style={{ position: 'absolute', inset: 0 }}>
          <CenaLivre key={animando} cena={cena} visao={visao} editor animar={animando > 0} />
        </PalcoTv>
        {!animando && cena.elementos.map(e => {
          const escolhido = e.id === sel;
          return (
            <div key={e.id}
              onPointerDown={ev => comecar(ev, e, null)}
              className={`absolute cursor-move ${escolhido ? 'outline outline-2 outline-sky-400' : 'hover:outline hover:outline-1 hover:outline-sky-300/70'}`}
              style={{ left: `${e.x}%`, top: `${e.y}%`, width: `${e.l}%`, height: `${e.a}%`, transform: e.rot ? `rotate(${e.rot}deg)` : undefined, touchAction: 'none' }}
            >
              {escolhido && (['no', 'ne', 'so', 'se'] as Canto[]).map(canto => (
                <span key={canto}
                  onPointerDown={ev => comecar(ev, e, canto)}
                  className="absolute h-3.5 w-3.5 rounded-sm border-2 border-sky-400 bg-white"
                  style={{
                    left: canto.endsWith('o') ? -7 : undefined, right: canto.endsWith('e') ? -7 : undefined,
                    top: canto.startsWith('n') ? -7 : undefined, bottom: canto.startsWith('s') ? -7 : undefined,
                    cursor: canto === 'no' || canto === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Propriedades ─────────────────────────────────────────────────────────────

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{titulo}</div>
      {children}
    </div>
  );
}

function Deslizante({ rotulo, valor, min, max, passo = 1, sufixo = '', aoComecar, aoMudar }: {
  rotulo: string; valor: number; min: number; max: number; passo?: number; sufixo?: string;
  aoComecar: () => void; aoMudar: (v: number) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="flex justify-between"><span>{rotulo}</span><span className="text-muted-foreground tabular-nums">{valor}{sufixo}</span></span>
      <input type="range" min={min} max={max} step={passo} value={valor} className="w-full accent-primary"
        onPointerDown={aoComecar} onKeyDown={aoComecar}
        onChange={e => aoMudar(Number(e.target.value))} />
    </label>
  );
}

function EscolhaCor({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (c: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-normal">{rotulo}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="color" value={valor.slice(0, 7)} onChange={e => aoMudar(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" />
        {CORES_RAPIDAS.map(c => (
          <button key={c} title={c} onClick={() => aoMudar(c)}
            className={`h-6 w-6 rounded-full border ${valor.toLowerCase() === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function Lista<T extends string>({ rotulo, valor, opcoes, aoMudar }: {
  rotulo: string; valor: T; opcoes: readonly { id: T; nome: string }[]; aoMudar: (v: T) => void;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span>{rotulo}</span>
      <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={valor}
        onChange={e => aoMudar(e.target.value as T)}>
        {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </label>
  );
}

function EnviarImagem({ painelId, temArquivo, aoEnviar }: { painelId: string; temArquivo: boolean; aoEnviar: (url: string) => void }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <>
      <input ref={arquivo} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setEnviando(true);
          try { aoEnviar(await enviarMidia(painelId, f, 'imagem')); }
          catch (err) { toast.error(err instanceof Error ? err.message : 'Não deu para enviar.'); }
          finally { setEnviando(false); }
        }} />
      <Button variant="outline" className="w-full" disabled={enviando} onClick={() => arquivo.current?.click()}>
        <ImagePlus className="h-4 w-4 mr-2" />{enviando ? 'Enviando…' : temArquivo ? 'Trocar imagem' : 'Escolher imagem'}
      </Button>
      <p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou GIF até 8 MB.</p>
    </>
  );
}

function Propriedades({ e, painelId, aoMudar, aoMudarContinuo, aoComecarGesto, aoCamada, aoDuplicar, aoApagar }: {
  e: ElementoLivre; painelId: string;
  aoMudar: (p: Partial<ElementoLivre>) => void;
  aoMudarContinuo: (p: Partial<ElementoLivre>) => void;
  aoComecarGesto: () => void;
  aoCamada: (para: 'frente' | 'tras' | 'subir' | 'descer') => void;
  aoDuplicar: () => void;
  aoApagar: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={() => aoCamada('frente')} title="Trazer para a frente"><ArrowUpToLine className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => aoCamada('tras')} title="Mandar para trás"><ArrowDownToLine className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={aoDuplicar} title="Duplicar (Ctrl+D)"><Copy className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" className="ml-auto text-destructive" onClick={aoApagar} title="Apagar (Delete)"><Trash2 className="h-4 w-4" /></Button>
      </div>

      {e.tipo === 'texto' && (
        <Secao titulo="Texto">
          <Textarea value={e.texto} maxLength={MAX_TEXTO} rows={3} onChange={ev => aoMudar({ texto: ev.target.value })} />
        </Secao>
      )}
      {e.tipo === 'numero' && (
        <Secao titulo="Número ao vivo">
          <Lista rotulo="Mostrar" valor={e.metrica} opcoes={METRICAS} aoMudar={v => aoMudar({ metrica: v })} />
          <label className="block space-y-1.5 text-sm">
            <span>Legenda em cima (opcional)</span>
            <Input value={e.rotulo} maxLength={40} onChange={ev => aoMudar({ rotulo: ev.target.value })} />
          </label>
          <p className="text-xs text-muted-foreground">Atualiza sozinho a cada relatório, como as outras telas.</p>
        </Secao>
      )}
      {e.tipo === 'relogio' && (
        <Secao titulo="Relógio">
          <Lista rotulo="Mostrar" valor={e.formato}
            opcoes={[{ id: 'hora', nome: 'Hora' }, { id: 'data', nome: 'Data' }, { id: 'hora_data', nome: 'Hora e data' }] as const}
            aoMudar={v => aoMudar({ formato: v })} />
        </Secao>
      )}
      {(e.tipo === 'texto' || e.tipo === 'numero' || e.tipo === 'relogio') && (
        <EstiloDeTexto e={e} aoMudar={aoMudar} aoMudarContinuo={aoMudarContinuo} aoComecarGesto={aoComecarGesto} />
      )}
      {e.tipo === 'imagem' && (
        <Secao titulo="Imagem">
          <EnviarImagem painelId={painelId} temArquivo={!!e.url} aoEnviar={url => aoMudar({ url })} />
          <Lista rotulo="Encaixe" valor={e.ajuste}
            opcoes={[{ id: 'contain', nome: 'Inteira' }, { id: 'cover', nome: 'Preencher a caixa' }] as const}
            aoMudar={v => aoMudar({ ajuste: v })} />
          <Deslizante rotulo="Cantos arredondados" valor={e.raio} min={0} max={50}
            aoComecar={aoComecarGesto} aoMudar={v => aoMudarContinuo({ raio: v })} />
        </Secao>
      )}
      {e.tipo === 'forma' && (
        <Secao titulo="Forma">
          <Lista rotulo="Formato" valor={e.forma}
            opcoes={[{ id: 'retangulo', nome: 'Retângulo' }, { id: 'circulo', nome: 'Círculo' }] as const}
            aoMudar={v => aoMudar({ forma: v })} />
          <EscolhaCor rotulo="Cor" valor={e.cor} aoMudar={c => aoMudar({ cor: c })} />
          {e.forma === 'retangulo' && (
            <Deslizante rotulo="Cantos arredondados" valor={e.raio} min={0} max={50}
              aoComecar={aoComecarGesto} aoMudar={v => aoMudarContinuo({ raio: v })} />
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            Borda
            <Switch checked={e.borda != null} onCheckedChange={v => aoMudar({ borda: v ? '#ffffff' : null })} />
          </label>
          {e.borda != null && <EscolhaCor rotulo="Cor da borda" valor={e.borda} aoMudar={c => aoMudar({ borda: c })} />}
        </Secao>
      )}

      <Secao titulo="Movimento">
        <Lista rotulo="Entrada" valor={e.entrada} opcoes={ENTRADAS_LIVRES} aoMudar={v => aoMudar({ entrada: v })} />
        {e.entrada !== 'nenhuma' && (
          <Deslizante rotulo="Espera antes de entrar" valor={e.atraso} min={0} max={5} passo={0.1} sufixo=" s"
            aoComecar={aoComecarGesto} aoMudar={v => aoMudarContinuo({ atraso: v })} />
        )}
        <Lista rotulo="Depois de entrar" valor={e.efeito} opcoes={EFEITOS_LIVRES} aoMudar={v => aoMudar({ efeito: v })} />
      </Secao>

      <Secao titulo="Posição">
        <Deslizante rotulo="Girar" valor={e.rot} min={-180} max={180} sufixo="°"
          aoComecar={aoComecarGesto} aoMudar={v => aoMudarContinuo({ rot: v })} />
        <Deslizante rotulo="Opacidade" valor={Math.round(e.opacidade * 100)} min={10} max={100} sufixo="%"
          aoComecar={aoComecarGesto} aoMudar={v => aoMudarContinuo({ opacidade: v / 100 })} />
      </Secao>
    </>
  );
}

function EstiloDeTexto({ e, aoMudar, aoMudarContinuo, aoComecarGesto }: {
  e: EstiloTexto;
  aoMudar: (p: Partial<EstiloTexto>) => void;
  aoMudarContinuo: (p: Partial<EstiloTexto>) => void;
  aoComecarGesto: () => void;
}) {
  return (
    <Secao titulo="Letra">
      <div className="grid grid-cols-2 gap-1.5">
        {FONTES_LIVRES.map(f => (
          <button key={f.id} onClick={() => aoMudar({ fonte: f.id })}
            className={`h-9 rounded-md border text-sm truncate px-2 ${e.fonte === f.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
            style={{ fontFamily: f.familia, fontWeight: f.peso, fontSize: f.id === 'pixel' ? 10 : undefined }}>
            {f.nome}
          </button>
        ))}
      </div>
      <Deslizante rotulo="Tamanho" valor={e.tamanho} min={TAMANHO_MIN} max={TAMANHO_MAX}
        aoComecar={aoComecarGesto} aoMudar={v => aoMudarContinuo({ tamanho: v })} />
      <EscolhaCor rotulo="Cor" valor={e.cor} aoMudar={c => aoMudar({ cor: c })} />
      <div className="flex rounded-md border overflow-hidden">
        {([['esq', 'Esquerda'], ['centro', 'Centro'], ['dir', 'Direita']] as const).map(([v, nome]) => (
          <button key={v} onClick={() => aoMudar({ alinhar: v })}
            className={`flex-1 h-8 text-xs ${e.alinhar === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{nome}</button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        Contorno escuro <Switch checked={e.contorno} onCheckedChange={v => aoMudar({ contorno: v })} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Sombra <Switch checked={e.sombra} onCheckedChange={v => aoMudar({ sombra: v })} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Tarja atrás do texto <Switch checked={e.tarja != null} onCheckedChange={v => aoMudar({ tarja: v ? '#0b1220' : null })} />
      </label>
      {e.tarja != null && <EscolhaCor rotulo="Cor da tarja" valor={e.tarja} aoMudar={c => aoMudar({ tarja: c })} />}
    </Secao>
  );
}

function PropriedadesDoFundo({ fundo, painelId, aoMudar }: { fundo: FundoCena; painelId: string; aoMudar: (f: FundoCena) => void }) {
  const tipos: { id: FundoCena['tipo']; nome: string }[] = [
    { id: 'tema', nome: 'Do tema' }, { id: 'cor', nome: 'Cor' }, { id: 'degrade', nome: 'Degradê' },
    { id: 'papel', nome: 'Papel de parede' }, { id: 'imagem', nome: 'Imagem' },
  ];
  const trocar = (t: FundoCena['tipo']) => {
    if (t === fundo.tipo) return;
    aoMudar(
      t === 'cor' ? { tipo: 'cor', cor: '#0b1220' }
        : t === 'degrade' ? { tipo: 'degrade', de: '#7c2d92', para: '#1e1b4b', angulo: 135 }
          : t === 'papel' ? { tipo: 'papel', id: PAPEIS_DE_PAREDE[0].id }
            : t === 'imagem' ? { tipo: 'imagem', url: '', escurecer: 0.3 }
              : { tipo: 'tema' },
    );
  };
  return (
    <Secao titulo="Fundo da cena">
      <p className="text-xs text-muted-foreground">Clique num elemento do palco para mexer nele. Sem nada escolhido, aqui é o fundo.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {tipos.map(t => (
          <button key={t.id} onClick={() => trocar(t.id)}
            className={`h-9 rounded-md border text-sm ${fundo.tipo === t.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}>
            {t.nome}
          </button>
        ))}
      </div>
      {fundo.tipo === 'tema' && <p className="text-xs text-muted-foreground">Usa as cores do tema do painel.</p>}
      {fundo.tipo === 'cor' && <EscolhaCor rotulo="Cor" valor={fundo.cor} aoMudar={c => aoMudar({ ...fundo, cor: c })} />}
      {fundo.tipo === 'degrade' && (
        <>
          <EscolhaCor rotulo="De" valor={fundo.de} aoMudar={c => aoMudar({ ...fundo, de: c })} />
          <EscolhaCor rotulo="Para" valor={fundo.para} aoMudar={c => aoMudar({ ...fundo, para: c })} />
          <Deslizante rotulo="Ângulo" valor={fundo.angulo} min={0} max={360} sufixo="°"
            aoComecar={() => undefined} aoMudar={v => aoMudar({ ...fundo, angulo: v })} />
        </>
      )}
      {fundo.tipo === 'papel' && (
        <div className="grid grid-cols-3 gap-1.5">
          {PAPEIS_DE_PAREDE.map(p => (
            <button key={p.id} title={p.nome} onClick={() => aoMudar({ tipo: 'papel', id: p.id })}
              className={`aspect-video rounded-md border ${fundo.id === p.id ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              style={{ background: p.fundo }} />
          ))}
        </div>
      )}
      {fundo.tipo === 'imagem' && (
        <>
          <EnviarImagem painelId={painelId} temArquivo={!!fundo.url} aoEnviar={url => aoMudar({ ...fundo, url })} />
          <Deslizante rotulo="Escurecer" valor={Math.round(fundo.escurecer * 100)} min={0} max={90} sufixo="%"
            aoComecar={() => undefined} aoMudar={v => aoMudar({ ...fundo, escurecer: v / 100 })} />
        </>
      )}
    </Secao>
  );
}
