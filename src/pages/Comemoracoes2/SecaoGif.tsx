/**
 * SecaoGif — etapa 5: o GIF do card, buscado no GIPHY.
 *
 * Abre com os GIFs que já entraram em alguma comemoração ("Usados
 * recentemente") e os GIFs em alta. As buscas que alguém já fez aparecem como
 * atalhos e abrem na hora, sem gastar chamada do GIPHY. Os dois valem para
 * todas as empresas e setores: GIF do GIPHY é público (Cleber, 15/10/2026).
 * Sem GIF — ou se o GIPHY cair — o card usa o troféu desenhado no app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buscarGifs, gifsEmAlta, listarBuscasSalvas, listarGifsUsados, normalizarTermo,
  type BuscaSalva, type ResultadoGifs,
} from '@/services/gifs.service';
import { aplicarModelo, type GifCard } from '@/components/comemoracao2/design';
import { TrofeuIlustracao } from '@/components/comemoracao2/TrofeuIlustracao';
import type { Rascunho } from './rascunho';
import type { MudarRascunho } from './tipos';

const SUGESTOES = ['parabéns', 'comemoração', 'troféu', 'campeão', 'dancinha', 'vitória'];
const ESPERA_DIGITACAO_MS = 700;

export function SecaoGif({
  r, mudar, empresaId, usuarioId, recentes,
}: {
  r: Rascunho;
  mudar: MudarRascunho;
  empresaId: string;
  usuarioId: string;
  /**
   * GIFs das comemorações que o estúdio já tem em mãos — reserva para quando
   * o banco ainda não tem a lista de GIFs usados.
   */
  recentes: GifCard[];
}) {
  const [termo, setTermo] = useState('');
  const [buscado, setBuscado] = useState<string | null>(null);
  const [gifs, setGifs] = useState<GifCard[]>([]);
  const [proximo, setProximo] = useState<number | null>(null);
  const [origem, setOrigem] = useState<'giphy' | 'salvo' | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'nao-configurado' | 'erro'; texto: string } | null>(null);
  const [salvas, setSalvas] = useState<BuscaSalva[]>([]);
  const [usados, setUsados] = useState<GifCard[] | null>(null);
  const [verTodosUsados, setVerTodosUsados] = useState(false);
  const pedidoRef = useRef(0);
  /** Último termo pedido — o atraso da digitação não repete o que o clique já buscou. */
  const termoPedidoRef = useRef<string | null>(null);

  const tratar = useCallback((res: ResultadoGifs, acrescentar: boolean) => {
    if (res.status === 'ok') {
      setGifs((atual) => {
        if (!acrescentar) return res.gifs;
        const ja = new Set(atual.map((g) => g.id));
        return [...atual, ...res.gifs.filter((g) => !ja.has(g.id))];
      });
      setProximo(res.proximo);
      setOrigem(res.origem);
      setAviso(null);
    } else if (res.status === 'nao-configurado') {
      setAviso({
        tipo: 'nao-configurado',
        texto: 'A busca de GIFs ainda não foi ligada: falta a chave GIPHY_API_KEY no servidor. Enquanto isso, o card usa o troféu.',
      });
    } else {
      setAviso({ tipo: 'erro', texto: res.mensagem });
    }
  }, []);

  const recarregarSalvas = useCallback(async () => {
    setSalvas(await listarBuscasSalvas(empresaId));
  }, [empresaId]);

  // Abre nos GIFs em alta, com as buscas salvas ao lado.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      setCarregando(true);
      const [res, listaUsados] = await Promise.all([gifsEmAlta(), listarGifsUsados(), recarregarSalvas()]);
      if (!vivo) return;
      setUsados(listaUsados);
      tratar(res, false);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [recarregarSalvas, tratar]);

  const buscar = useCallback(async (texto: string, opcoes: { offset?: number; renovar?: boolean } = {}) => {
    const t = normalizarTermo(texto);
    if (t.length < 2) return;
    termoPedidoRef.current = t;
    const meu = ++pedidoRef.current;
    setCarregando(true);
    const res = await buscarGifs({ empresaId, usuarioId, termo: t, ...opcoes });
    if (meu !== pedidoRef.current) return;
    setBuscado(t);
    tratar(res, !!opcoes.offset);
    setCarregando(false);
    if (res.status === 'ok' && res.origem === 'giphy' && !opcoes.offset) void recarregarSalvas();
  }, [empresaId, usuarioId, tratar, recarregarSalvas]);

  // Busca sozinha depois que a pessoa para de digitar — economiza chamada.
  useEffect(() => {
    const t = normalizarTermo(termo);
    if (t.length < 2 || t === buscado || t === termoPedidoRef.current) return;
    const id = setTimeout(() => { void buscar(t); }, ESPERA_DIGITACAO_MS);
    return () => clearTimeout(id);
  }, [termo, buscado, buscar]);

  function escolher(gif: GifCard | null) {
    mudar((a) => {
      if (!gif) return { design: { ...a.design, gif: null } };
      // Quem estava no "Só texto" e escolheu um GIF quer ver o GIF.
      const base = a.design.comMidia ? a.design : aplicarModelo(a.design, 'classico');
      return { design: { ...base, gif } };
    });
  }

  const atual = r.design.gif;
  const atalhos = salvas.length > 0 ? salvas.map((s) => s.termo) : SUGESTOES;
  const usadosLista = usados ?? recentes;
  const usadosVisiveis = verTodosUsados ? usadosLista : usadosLista.slice(0, 8);

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={termo} onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(termo); } }}
          className="h-9 pl-9 pr-9 text-sm" placeholder="Buscar GIF: parabéns, troféu, dancinha…"
          aria-label="Buscar GIF" />
        {carregando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          {salvas.length > 0 ? 'Buscas já feitas (abrem na hora)' : 'Experimente'}
        </p>
        <div className="flex flex-wrap gap-1">
          {atalhos.map((t) => (
            <button key={t} type="button" onClick={() => { setTermo(t); void buscar(t); }}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                buscado === t ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <div className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug',
          aviso.tipo === 'nao-configurado'
            ? 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100'
            : 'border-destructive/40 bg-destructive/10 text-destructive',
        )}>
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {aviso.texto}
        </div>
      )}

      {usadosLista.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium text-muted-foreground">Usados recentemente · todas as equipes</p>
            {usadosLista.length > 8 && (
              <button type="button" onClick={() => setVerTodosUsados((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground">
                {verTodosUsados ? 'Ver menos' : `Ver todos (${usadosLista.length})`}
              </button>
            )}
          </div>
          <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {usadosVisiveis.map((g) => (
              <Miniatura key={g.id} gif={g} ativo={atual?.id === g.id} onClick={() => escolher(g)} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">
          {buscado ? <>Resultados para <strong className="text-foreground">{buscado}</strong></> : 'Em alta agora'}
          {origem === 'salvo' && buscado && ' · da busca salva'}
        </p>
        {buscado && origem === 'salvo' && (
          <button type="button" onClick={() => void buscar(buscado, { renovar: true })}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3 w-3" /> Buscar de novo
          </button>
        )}
      </div>

      <div className="grid max-h-[340px] grid-cols-3 gap-1.5 overflow-y-auto pr-1">
        <button type="button" onClick={() => escolher(null)} aria-pressed={!atual}
          className={cn(
            'relative flex aspect-square flex-col items-center justify-center rounded-lg border bg-gradient-to-b from-amber-950 to-stone-950',
            !atual ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border',
          )}>
          <TrofeuIlustracao className="h-14 w-14" />
          <span className="text-[10px] font-semibold text-amber-100">Sem GIF</span>
          {!atual && <Selo />}
        </button>
        {gifs.map((g) => (
          <Miniatura key={g.id} gif={g} ativo={atual?.id === g.id} onClick={() => escolher(g)} />
        ))}
        {!carregando && gifs.length === 0 && !aviso && (
          <p className="col-span-2 self-center text-center text-[11px] text-muted-foreground">Nada encontrado. Tente outra palavra.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {proximo !== null && buscado ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={carregando}
            onClick={() => void buscar(buscado, { offset: proximo })}>
            Ver mais
          </Button>
        ) : <span />}
        {/* Exigência do GIPHY: a marca onde a busca acontece. */}
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Powered by GIPHY</span>
      </div>
    </>
  );
}

function Selo() {
  return (
    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Check className="h-3 w-3" />
    </span>
  );
}

function Miniatura({ gif, ativo, onClick }: { gif: GifCard; ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} title={gif.titulo}
      className={cn(
        'relative aspect-square overflow-hidden rounded-lg bg-muted',
        ativo ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'hover:opacity-90',
      )}>
      <img src={gif.previa} alt={gif.titulo || 'GIF'} loading="lazy" className="h-full w-full object-cover" />
      {ativo && <Selo />}
    </button>
  );
}
