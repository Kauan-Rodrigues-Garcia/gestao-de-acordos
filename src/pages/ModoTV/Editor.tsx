/**
 * Editor.tsx — um painel aberto na montagem.
 *
 * ## Duas coisas que não podem se confundir: o que eu edito e o que está na TV
 *
 * Tudo o que se mexe aqui é RASCUNHO até «Publicar na TV». A faixa do topo diz,
 * sem ambiguidade, em qual dos estados o painel está:
 *
 *   amarelo  há mudança que a TV ainda não recebeu — falta publicar
 *   azul     publicado, a TV está pegando a versão nova (segundos)
 *   verde    a TV está mostrando exatamente a versão publicada
 *   cinza    publicado, mas nenhuma TV ligada / nenhuma conectada
 *
 * A prévia tem as duas vistas: «Editando» (o rascunho, parado na tela
 * escolhida) e «Na TV agora» (a versão publicada, rodando como na parede).
 *
 * ## Fixar não é editar
 *
 * Parar a TV numa tela e voltar ao rodízio é controle remoto: vai na hora,
 * sem «Publicar», e só vale para tela que já está publicada.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, CheckCircle2, CircleDashed, ImagePlus, Loader2, Pause, Pin, PinOff, Play, Plus,
  Trash2, Tv, TriangleAlert, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { AlvoTv, ConexaoTv, NumerosTv, Painel, TelaDoPainel, TemaId, Unidade } from './tipos';
import {
  CATEGORIAS, SEGUNDOS_MAX, SEGUNDOS_MIN, TEMAS, TEMPLATES, TEMPOS_PRONTOS,
  novaTela, opcao, rotuloTempo, segundosDaTela, templateDe, type CampoOpcao,
} from './templates';
import { CORES } from './TelaTv';
import { Rodizio } from './Rodizio';
import { numerosDemo } from './demo';
import {
  conectarTv, desconectarTv, enviarMidia, excluirPainel, fixarTela, previa, salvarPainel,
} from './servico';
import { estadoDaTv, horaCurta, rotuloAlvo, situacaoDoPainel, type EstadoTv } from './apoio';

interface Rascunho {
  nome: string; tema: TemaId; unidade: Unidade; segundos_por_tela: number; telas: TelaDoPainel[];
}

const doPainel = (p: Painel): Rascunho => ({
  nome: p.nome, tema: p.tema, unidade: p.unidade, segundos_por_tela: p.segundos_por_tela, telas: p.telas,
});

/**
 * Igualdade que não liga para a ordem das chaves: o jsonb do banco devolve as
 * opções reordenadas, e sem isto o painel recém-publicado continuaria «sujo».
 */
function estavel(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>)
        .filter(([, y]) => y !== undefined && y !== null)
        .sort(([a], [b]) => a.localeCompare(b)))
    : x));
}

export function Editor({ painel, alvo, conexoes, aoMudar, aoMudarConexoes }: {
  painel: Painel; alvo: AlvoTv | null; conexoes: ConexaoTv[];
  aoMudar: () => Promise<void> | void; aoMudarConexoes: () => void;
}) {
  const [r, setR] = useState<Rascunho>(() => doPainel(painel));
  const [sel, setSel] = useState(0);
  const [numeros, setNumeros] = useState<NumerosTv | null>(null);
  const [vista, setVista] = useState<'edicao' | 'no_ar'>('edicao');
  const [galeria, setGaleria] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [, tique] = useState(0);

  const sujo = estavel(r) !== estavel(doPainel(painel));
  const ehCofen = (numeros?.regra ?? alvo?.regra) === 'cofen';
  const situacao = situacaoDoPainel(sujo, conexoes, painel.atualizado_em);
  const telaFixa = painel.tela_fixa ? painel.telas.find(t => t.id === painel.tela_fixa) ?? null : null;
  const publicadas = useMemo(() => new Set(painel.telas.map(t => t.id)), [painel.telas]);

  // Os números da prévia: na abertura e a cada minuto (o cache do banco é de 1 min).
  useEffect(() => {
    let vivo = true;
    const ler = () => previa(painel.id).then(n => { if (vivo) setNumeros(n); }, () => {});
    void ler();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void ler(); }, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [painel.id]);

  // «Sem sinal desde» depende do relógio, não só das conexões.
  useEffect(() => {
    const t = setInterval(() => tique(x => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const mudar = (parcial: Partial<Rascunho>) => setR(atual => ({ ...atual, ...parcial }));
  const mudarTela = (i: number, parcial: Partial<TelaDoPainel>) =>
    setR(atual => ({ ...atual, telas: atual.telas.map((t, j) => j === i ? { ...t, ...parcial } : t) }));
  const mudarOpcao = (i: number, opcoes: Record<string, unknown>) =>
    setR(atual => ({ ...atual, telas: atual.telas.map((t, j) => j === i ? { ...t, opcoes: { ...t.opcoes, ...opcoes } } : t) }));
  const mover = (i: number, d: -1 | 1) => setR(atual => {
    const j = i + d;
    if (j < 0 || j >= atual.telas.length) return atual;
    const telas = [...atual.telas];
    [telas[i], telas[j]] = [telas[j], telas[i]];
    setSel(j);
    return { ...atual, telas };
  });
  const remover = (i: number) => {
    setR(atual => ({ ...atual, telas: atual.telas.filter((_, j) => j !== i) }));
    setSel(s => Math.max(0, s >= i ? s - 1 : s));
  };

  const publicar = async () => {
    if (!r.nome.trim()) { toast.error('Dê um nome ao painel.'); return; }
    setSalvando(true);
    try {
      await salvarPainel({ id: painel.id, ...r, nome: r.nome.trim() });
      toast.success(conexoes.length ? 'Publicado. A TV troca em poucos segundos.' : 'Publicado.');
      await aoMudar();
      aoMudarConexoes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para publicar.');
    } finally {
      setSalvando(false);
    }
  };

  const fixar = async (telaId: string | null) => {
    try {
      await fixarTela(painel.id, telaId);
      toast.success(telaId ? 'A TV vai parar nesta tela em poucos segundos.' : 'A TV volta ao rodízio em poucos segundos.');
      await aoMudar();
      aoMudarConexoes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para mudar a TV.');
    }
  };

  const painelDaPrevia: Painel = vista === 'edicao' ? { ...painel, ...r, tela_fixa: null } : painel;
  const telaSel = r.telas[sel] ?? null;
  const tplSel = telaSel ? templateDe(telaSel.template) : null;
  const volta = r.telas.reduce((s, t) => s + segundosDaTela(t, r.segundos_por_tela), 0);

  return (
    <div className="space-y-5 min-w-0">
      <FaixaDeSituacao
        situacao={situacao}
        telaFixa={telaFixa ? templateDe(telaFixa.template)?.nome ?? 'uma tela' : null}
        salvando={salvando}
        aoPublicar={publicar}
        aoDescartar={() => setR(doPainel(painel))}
        aoConectar={() => setConectando(true)}
        aoSoltar={() => fixar(null)}
      />

      {/* Nome, tema, unidade */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <Label>Nome do painel</Label>
          <Input value={r.nome} maxLength={60} onChange={e => mudar({ nome: e.target.value })} />
        </div>
        {ehCofen && (
          <div className="space-y-1.5">
            <Label>Valores</Label>
            <Segmentado
              valor={r.unidade}
              opcoes={[{ valor: 'ho', rotulo: 'H.O.' }, { valor: 'bruto', rotulo: 'Bruto' }]}
              aoMudar={v => mudar({ unidade: v as Unidade })}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Tema</span>
        {TEMAS.map(t => (
          <button key={t.id} onClick={() => mudar({ tema: t.id })} title={t.nome}
            className={`h-8 pl-1 pr-3 rounded-full border text-xs flex items-center gap-2 ${r.tema === t.id ? 'ring-2 ring-primary' : ''}`}>
            <span className="h-6 w-6 rounded-full" style={{ background: `linear-gradient(135deg, ${CORES[t.id].fundo2}, ${CORES[t.id].fundo})`, boxShadow: `inset 0 0 0 3px ${CORES[t.id].destaque}` }} />
            {t.nome}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{alvo ? rotuloAlvo(alvo) : ''}</span>
      </div>

      {/* A prévia, com as duas vistas */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Segmentado
            valor={vista}
            opcoes={[{ valor: 'edicao', rotulo: 'Editando' }, { valor: 'no_ar', rotulo: 'Na TV agora' }]}
            aoMudar={v => setVista(v as 'edicao' | 'no_ar')}
          />
          <span className="text-xs text-muted-foreground">
            {vista === 'edicao'
              ? sujo ? 'Seu rascunho — ainda não está na TV.' : 'Igual ao que está publicado.'
              : telaFixa ? 'A versão publicada, parada na tela fixa.' : 'A versão publicada, rodando como na parede.'}
          </span>
        </div>
        <div className={`relative rounded-xl overflow-hidden border-2 shadow-sm ${vista === 'edicao' && sujo ? 'border-amber-500' : vista === 'no_ar' ? 'border-emerald-500' : 'border-border'}`}>
          <Rodizio
            key={vista}
            painel={painelDaPrevia}
            numeros={numeros}
            fixarEm={vista === 'edicao' ? sel : null}
            style={{ width: '100%', aspectRatio: '16 / 9' }}
          />
          <span className={`absolute top-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${vista === 'edicao' ? (sujo ? 'bg-amber-600' : 'bg-slate-600') : 'bg-emerald-600'}`}>
            {vista === 'edicao' ? (sujo ? 'RASCUNHO' : 'PRÉVIA') : 'NO AR'}
          </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* As telas e o tempo */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Telas do rodízio</h2>
            <Button size="sm" onClick={() => setGaleria(true)} disabled={r.telas.length >= 12}>
              <Plus className="h-4 w-4 mr-1.5" />Adicionar tela
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tempo padrão de cada tela</span>
            <SeletorTempo valor={r.segundos_por_tela} aoMudar={v => mudar({ segundos_por_tela: v ?? 20 })} />
            {r.telas.length > 1 && (
              <span className="ml-auto text-xs text-muted-foreground">Uma volta completa: {rotuloTempo(volta)}</span>
            )}
          </div>

          {!r.telas.length && (
            <button onClick={() => setGaleria(true)} className="w-full rounded-xl border border-dashed p-8 text-sm text-muted-foreground hover:bg-accent">
              Nenhuma tela ainda. Clique para escolher na vitrine.
            </button>
          )}

          {r.telas.map((t, i) => {
            const fixada = painel.tela_fixa === t.id;
            const publicada = publicadas.has(t.id);
            return (
              <div key={t.id}
                onClick={() => { setSel(i); setVista('edicao'); }}
                className={`flex flex-wrap items-center gap-2 rounded-xl border p-2.5 cursor-pointer ${i === sel && vista === 'edicao' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="flex-1 min-w-[140px]">
                  <div className="font-medium truncate flex items-center gap-2">
                    {templateDe(t.template)?.nome}
                    {fixada && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">FIXA NA TV</span>}
                    {!publicada && <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white">NOVA</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {opcao<string>(t, 'titulo') || opcao<string>(t, 'texto') || opcao<string>(t, 'legenda') || templateDe(t.template)?.descricao}
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <SeletorTempo valor={t.segundos ?? null} padrao={r.segundos_por_tela} aoMudar={v => mudarTela(i, { segundos: v })} />
                </div>
                <Button
                  variant={fixada ? 'secondary' : 'ghost'} size="sm"
                  disabled={!publicada}
                  title={publicada ? undefined : 'Publique primeiro para poder fixar esta tela na TV'}
                  onClick={e => { e.stopPropagation(); void fixar(fixada ? null : t.id); }}
                >
                  {fixada ? <><PinOff className="h-4 w-4 mr-1" />Soltar</> : <><Pin className="h-4 w-4 mr-1" />Fixar</>}
                </Button>
                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); mover(i, -1); }} disabled={i === 0} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); mover(i, 1); }} disabled={i === r.telas.length - 1} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); remover(i); }} aria-label="Tirar"><X className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </div>

        {/* As opções da tela escolhida */}
        <div className="rounded-xl border p-4 space-y-4 self-start">
          {telaSel && tplSel ? (
            <>
              <div>
                <div className="font-semibold">{tplSel.nome}</div>
                <div className="text-xs text-muted-foreground">{tplSel.descricao}</div>
              </div>
              {tplSel.campos.map(campo => (
                <CampoDaTela key={campo.chave} campo={campo} tela={telaSel} painelId={painel.id}
                  aoMudar={v => mudarOpcao(sel, { [campo.chave]: v })} />
              ))}
              {!tplSel.campos.length && <p className="text-sm text-muted-foreground">Esta tela não tem opções.</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Escolha uma tela da lista para ajustar.</p>
          )}
        </div>
      </div>

      {/* As TVs */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Tv className="h-4 w-4" />TVs deste painel</h2>
          <Button size="sm" variant="outline" onClick={() => setConectando(true)}>Conectar TV</Button>
        </div>
        {!conexoes.length && (
          <p className="text-sm text-muted-foreground">
            No PC da TV, abra <code className="px-1 rounded bg-muted">{window.location.origin}/#/tv</code> em tela cheia (F11).
            Ela mostra um código; clique em «Conectar TV» e digite o código.
          </p>
        )}
        {conexoes.map(c => {
          const e = estadoDaTv(c, painel.atualizado_em);
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <PontoEstado estado={e} />
              <span className="font-medium">{c.nome || 'TV sem nome'}</span>
              <span className="text-muted-foreground">{textoEstado(e, c)}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={async () => {
                try { await desconectarTv(c.id); toast.success('TV desconectada. Ela volta para a tela do código.'); await aoMudar(); }
                catch (err) { toast.error(err instanceof Error ? err.message : 'Não deu para desconectar.'); }
              }}>Desconectar</Button>
            </div>
          );
        })}
      </div>

      {/* Barra de publicar */}
      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-background/90 backdrop-blur flex flex-wrap items-center gap-3 border-t">
        <Button variant="ghost" className="text-destructive" onClick={() => setExcluindo(true)}>
          <Trash2 className="h-4 w-4 mr-1.5" />Excluir painel
        </Button>
        <span className={`ml-auto text-sm ${sujo ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
          {sujo ? 'Há mudanças que ainda não estão na TV' : 'Nada pendente'}
        </span>
        <Button variant="outline" disabled={!sujo || salvando} onClick={() => setR(doPainel(painel))}>Descartar</Button>
        <Button disabled={!sujo || salvando} onClick={publicar}>
          {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Tv className="h-4 w-4 mr-1.5" />}
          Publicar na TV
        </Button>
      </div>

      <Galeria
        aberto={galeria}
        tema={r.tema}
        numeros={numeros}
        aoFechar={() => setGaleria(false)}
        aoEscolher={tpl => {
          const nova = novaTela(tpl);
          setR(atual => ({ ...atual, telas: [...atual.telas, nova] }));
          setSel(r.telas.length);
          setVista('edicao');
          setGaleria(false);
        }}
      />

      <DialogConectar aberto={conectando} painelId={painel.id} aoFechar={() => setConectando(false)}
        aoConectar={async () => { setConectando(false); await aoMudar(); }} />

      <Dialog open={excluindo} onOpenChange={setExcluindo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir «{painel.nome}»?</DialogTitle>
            <DialogDescription>As TVs conectadas a ele voltam para a tela do código. Não tem como desfazer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              try { await excluirPainel(painel.id); setExcluindo(false); toast.success('Painel excluído.'); await aoMudar(); }
              catch (e) { toast.error(e instanceof Error ? e.message : 'Não deu para excluir.'); }
            }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── A faixa do topo: em que pé está a TV ────────────────────────────────────

function FaixaDeSituacao({ situacao, telaFixa, salvando, aoPublicar, aoDescartar, aoConectar, aoSoltar }: {
  situacao: ReturnType<typeof situacaoDoPainel>; telaFixa: string | null; salvando: boolean;
  aoPublicar: () => void; aoDescartar: () => void; aoConectar: () => void; aoSoltar: () => void;
}) {
  let cor: string, icone: React.ReactNode, titulo: string, texto: string, acoes: React.ReactNode = null;
  switch (situacao.tipo) {
    case 'rascunho':
      cor = 'border-amber-500/50 bg-amber-500/10';
      icone = <TriangleAlert className="h-5 w-5 text-amber-600" />;
      titulo = 'Você está editando — a TV ainda NÃO mostra estas mudanças';
      texto = 'A TV continua com a última versão publicada. Clique em «Publicar na TV» para mandar.';
      acoes = (
        <>
          <Button size="sm" variant="outline" onClick={aoDescartar} disabled={salvando}>Descartar</Button>
          <Button size="sm" onClick={aoPublicar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Publicar na TV
          </Button>
        </>
      );
      break;
    case 'enviando':
      cor = 'border-sky-500/50 bg-sky-500/10';
      icone = <Loader2 className="h-5 w-5 text-sky-600 animate-spin" />;
      titulo = 'Publicado — a TV está pegando a versão nova';
      texto = 'Leva poucos segundos. Não precisa fazer nada.';
      break;
    case 'no_ar':
      cor = 'border-emerald-500/50 bg-emerald-500/10';
      icone = <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
      titulo = 'A TV está mostrando exatamente o que está publicado';
      texto = situacao.total > 1
        ? `${situacao.ligadas} de ${situacao.total} TVs ligadas e em dia.`
        : 'TV ligada e em dia.';
      break;
    case 'tvs_desligadas':
      cor = 'border-border bg-muted/50';
      icone = <CircleDashed className="h-5 w-5 text-muted-foreground" />;
      titulo = 'Publicado, mas nenhuma TV está ligada agora';
      texto = situacao.ultimoSinal
        ? `Último sinal às ${horaCurta(situacao.ultimoSinal)}. Quando a TV ligar, ela já abre na versão publicada.`
        : 'Quando a TV ligar, ela já abre na versão publicada.';
      break;
    default:
      cor = 'border-border bg-muted/50';
      icone = <CircleDashed className="h-5 w-5 text-muted-foreground" />;
      titulo = 'Nenhuma TV conectada a este painel';
      texto = 'Abra /#/tv no PC da TV e conecte pelo código.';
      acoes = <Button size="sm" variant="outline" onClick={aoConectar}>Conectar TV</Button>;
  }

  return (
    <div className={`rounded-xl border p-3 sm:p-4 space-y-2 ${cor}`}>
      <div className="flex flex-wrap items-center gap-3">
        {icone}
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold text-sm">{titulo}</div>
          <div className="text-xs text-muted-foreground">{texto}</div>
        </div>
        {acoes}
      </div>
      {telaFixa && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sky-600/10 px-3 py-2 text-sm">
          <Pause className="h-4 w-4 text-sky-600" />
          <span className="flex-1">A TV está <b>parada</b> em «{telaFixa}». O rodízio está pausado.</span>
          <Button size="sm" variant="outline" onClick={aoSoltar}><Play className="h-4 w-4 mr-1.5" />Voltar ao rodízio</Button>
        </div>
      )}
    </div>
  );
}

function PontoEstado({ estado }: { estado: EstadoTv }) {
  const cor = { em_dia: 'bg-emerald-500', atualizando: 'bg-sky-500 animate-pulse', fechada: 'bg-muted-foreground/40', sem_sinal: 'bg-red-500/70' }[estado];
  return <span className={`h-2.5 w-2.5 rounded-full ${cor}`} />;
}

function textoEstado(e: EstadoTv, c: ConexaoTv): string {
  switch (e) {
    case 'em_dia': return 'Ligada · mostrando a versão publicada';
    case 'atualizando': return 'Ligada · recebendo a versão nova…';
    case 'fechada': return `Página fechada${c.saiu_em ? ` às ${horaCurta(c.saiu_em)}` : ''}`;
    case 'sem_sinal': return c.ultimo_sinal ? `Sem sinal desde ${horaCurta(c.ultimo_sinal)} (PC desligado ou sem internet)` : 'Ainda não deu sinal';
  }
}

// ── Peças pequenas ───────────────────────────────────────────────────────────

function Segmentado({ valor, opcoes, aoMudar }: {
  valor: string; opcoes: { valor: string; rotulo: string }[]; aoMudar: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border overflow-hidden">
      {opcoes.map(o => (
        <button key={o.valor} onClick={() => aoMudar(o.valor)}
          className={`px-3 h-9 text-sm ${valor === o.valor ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Escolha de tempo: os prontos, ou «Outro» com minutos e segundos.
 * Com `padrao`, a primeira opção é «Padrão (20 s)» e devolve `null`.
 */
function SeletorTempo({ valor, padrao, aoMudar }: {
  valor: number | null; padrao?: number; aoMudar: (v: number | null) => void;
}) {
  const [outro, setOutro] = useState(false);
  const [min, setMin] = useState('');
  const [seg, setSeg] = useState('');
  const atual = valor == null ? 'padrao' : TEMPOS_PRONTOS.includes(valor) ? String(valor) : 'custom';

  if (outro) {
    const total = (Number(min) || 0) * 60 + (Number(seg) || 0);
    const ok = total >= SEGUNDOS_MIN && total <= SEGUNDOS_MAX;
    return (
      <div className="inline-flex items-center gap-1">
        <Input className="h-8 w-14 px-2" inputMode="numeric" placeholder="min" value={min} onChange={e => setMin(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        <span className="text-xs">min</span>
        <Input className="h-8 w-14 px-2" inputMode="numeric" placeholder="seg" value={seg} onChange={e => setSeg(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        <span className="text-xs">s</span>
        <Button size="sm" className="h-8" disabled={!ok} onClick={() => { aoMudar(total); setOutro(false); }}>OK</Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setOutro(false)}><X className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }

  return (
    <select
      className="h-8 rounded-md border bg-background px-2 text-sm"
      value={atual}
      title="Quanto tempo esta tela fica na TV"
      onChange={e => {
        const v = e.target.value;
        if (v === 'padrao') aoMudar(null);
        else if (v === 'outro') {
          const base = valor ?? padrao ?? 20;
          setMin(String(Math.floor(base / 60)));
          setSeg(String(base % 60));
          setOutro(true);
        } else if (v !== 'custom') aoMudar(Number(v));
      }}
    >
      {padrao != null && <option value="padrao">Padrão ({rotuloTempo(padrao)})</option>}
      {TEMPOS_PRONTOS.map(s => <option key={s} value={s}>{rotuloTempo(s)}</option>)}
      {atual === 'custom' && valor != null && <option value="custom">{rotuloTempo(valor)}</option>}
      <option value="outro">Outro tempo…</option>
    </select>
  );
}

// ── Um campo de opção ────────────────────────────────────────────────────────

function CampoDaTela({ campo, tela, painelId, aoMudar }: {
  campo: CampoOpcao; tela: TelaDoPainel; painelId: string; aoMudar: (v: unknown) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  switch (campo.tipo) {
    case 'texto': {
      const v = opcao<string>(tela, campo.chave);
      return (
        <div className="space-y-1.5">
          <Label>{campo.rotulo}</Label>
          {campo.max > 60
            ? <Textarea value={v} maxLength={campo.max} rows={3} onChange={e => aoMudar(e.target.value)} />
            : <Input value={v} maxLength={campo.max} onChange={e => aoMudar(e.target.value)} />}
        </div>
      );
    }
    case 'numero': {
      const v = opcao<number | null>(tela, campo.chave);
      return (
        <div className="space-y-1.5">
          <Label>{campo.rotulo}</Label>
          <Input type="number" min={0} step={100} value={v ?? ''} placeholder="Automático"
            onChange={e => aoMudar(e.target.value === '' ? null : Number(e.target.value))} />
          {campo.dica && <p className="text-xs text-muted-foreground">{campo.dica}</p>}
        </div>
      );
    }
    case 'liga':
      return (
        <label className="flex items-center justify-between gap-3 text-sm">
          {campo.rotulo}
          <Switch checked={opcao<boolean>(tela, campo.chave)} onCheckedChange={aoMudar} />
        </label>
      );
    case 'escolha': {
      const v = opcao<string>(tela, campo.chave);
      return (
        <div className="space-y-1.5">
          <Label>{campo.rotulo}</Label>
          <div className="flex rounded-md border overflow-hidden">
            {campo.escolhas.map(e => (
              <button key={e.valor} onClick={() => aoMudar(e.valor)}
                className={`flex-1 h-9 text-sm ${v === e.valor ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
                {e.rotulo}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'midia': {
      const v = opcao<string>(tela, campo.chave);
      return (
        <div className="space-y-1.5">
          <Label>{campo.rotulo}</Label>
          <input ref={arquivo} type="file" hidden
            accept={campo.aceita === 'imagem' ? 'image/png,image/jpeg,image/webp,image/gif' : 'video/mp4,video/webm'}
            onChange={async e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setEnviando(true);
              try { aoMudar(await enviarMidia(painelId, f, campo.aceita)); }
              catch (err) { toast.error(err instanceof Error ? err.message : 'Não deu para enviar.'); }
              finally { setEnviando(false); }
            }} />
          <Button variant="outline" className="w-full" disabled={enviando} onClick={() => arquivo.current?.click()}>
            <ImagePlus className="h-4 w-4 mr-2" />
            {enviando ? 'Enviando…' : v ? 'Trocar arquivo' : campo.aceita === 'imagem' ? 'Escolher imagem' : 'Escolher vídeo'}
          </Button>
          <p className="text-xs text-muted-foreground">
            {campo.aceita === 'imagem' ? 'PNG, JPG ou WEBP até 8 MB. Ideal 1920×1080.' : 'MP4 até 40 MB. Toca sem som, em laço.'}
          </p>
        </div>
      );
    }
  }
}

// ── A vitrine ────────────────────────────────────────────────────────────────

function Galeria({ aberto, tema, numeros, aoFechar, aoEscolher }: {
  aberto: boolean; tema: TemaId; numeros: NumerosTv | null;
  aoFechar: () => void; aoEscolher: (t: TelaDoPainel['template']) => void;
}) {
  // Sem número real ainda (painel novo, mês sem meta), a vitrine mostra o exemplo.
  const amostra = useMemo(() => {
    if (numeros && numeros.meta > 0) return numeros;
    return numerosDemo();
  }, [numeros]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolha uma tela</DialogTitle>
          <DialogDescription>Cada tela ocupa a TV inteira. Dá para ajustar o título, o tempo e as opções depois.</DialogDescription>
        </DialogHeader>
        {aberto && CATEGORIAS.map(cat => (
          <div key={cat.id} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{cat.nome}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.filter(t => t.categoria === cat.id).map(t => (
                <button key={t.id} onClick={() => aoEscolher(t.id)}
                  className="text-left rounded-xl border overflow-hidden hover:ring-2 hover:ring-primary transition-shadow">
                  <Rodizio
                    painel={{ id: `amostra-${t.id}`, nome: '', tema, unidade: 'bruto', segundos_por_tela: 20, tela_fixa: null, telas: [{ id: t.id, template: t.id, opcoes: {} }] }}
                    numeros={amostra}
                    parado
                    style={{ width: '100%', aspectRatio: '16 / 9' }}
                  />
                  <div className="p-3">
                    <div className="font-medium text-sm">{t.nome}</div>
                    <div className="text-xs text-muted-foreground">{t.descricao}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

// ── Conectar uma TV ──────────────────────────────────────────────────────────

function DialogConectar({ aberto, painelId, aoFechar, aoConectar }: {
  aberto: boolean; painelId: string; aoFechar: () => void; aoConectar: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (aberto) { setCodigo(''); setNome(''); } }, [aberto]);

  const digitos = codigo.replace(/\D/g, '').slice(0, 6);

  const conectar = async () => {
    setEnviando(true);
    try {
      await conectarTv(digitos, painelId, nome);
      toast.success('TV conectada! Ela mostra o painel em poucos segundos.');
      aoConectar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para conectar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar TV</DialogTitle>
          <DialogDescription>
            No PC da TV, abra <b>{window.location.origin}/#/tv</b>. Digite aqui o código de 6 dígitos que aparecer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            autoFocus inputMode="numeric" placeholder="000 000" value={digitos}
            onChange={e => setCodigo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && digitos.length === 6) void conectar(); }}
            className="text-center text-3xl tracking-[0.4em] h-16 font-bold"
          />
          <div className="space-y-1.5">
            <Label>Nome da TV (opcional)</Label>
            <Input value={nome} maxLength={40} onChange={e => setNome(e.target.value)} placeholder="Ex.: TV da entrada" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={conectar} disabled={enviando || digitos.length !== 6}>Conectar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
