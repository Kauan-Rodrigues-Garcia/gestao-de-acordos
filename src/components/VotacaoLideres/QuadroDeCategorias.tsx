/**
 * QuadroDeCategorias — a votação por CATEGORIAS (pedido de 04/11/2026).
 *
 * Todas as perguntas juntas, como uma cédula: cada cartão é uma categoria
 * («Quem é o líder mais comunicativo?») com o líder escolhido ou «Escolher
 * líder». Tocar num cartão abre o seletor daquela categoria — as fotos de todos
 * encaixadas (`GradeDeLideres`), com busca — e, escolhido, volta ao quadro.
 *
 * As regras são as mesmas: não vota em si mesmo, e cada colega só pode ser
 * escolhido em UMA categoria (quem já foi escolhido aparece travado, com o
 * emoji de onde está; trocar lá destrava). Só envia com TUDO preenchido
 * (`exigidas`: todas, ou o máximo possível quando há mais categorias que colegas).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, Search, UserPlus, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { textosDo, type TipoDaVotacao } from './textos';
import {
  jaEscolhidos, nomeCurto,
  type Candidato, type ItemDaCedula, type MeusVotos, type Pergunta,
} from './cedula';
import { FotoLider } from './FotoLider';
import { GradeDeLideres } from './GradeDeLideres';

interface Props {
  cedula: ItemDaCedula[];
  pessoas: ReadonlyMap<string, Candidato>;
  eleitorId: string | null;
  meus: MeusVotos;
  /** `null` tira a escolha da categoria. */
  onEscolher: (perguntaId: string, liderId: string | null) => void;
  /** Quantas precisam estar preenchidas para enviar. */
  exigidas: number;
  enviando?: boolean;
  erro?: string | null;
  onEnviar: () => void;
  /** 12/11/2026: muda as palavras (líder / gerente). */
  tipo?: TipoDaVotacao;
  /** Cada pessoa só pode ser escolhida uma vez (padrão). Sem a regra, ninguém trava. */
  umPorCandidato?: boolean;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function QuadroDeCategorias({ cedula, pessoas, eleitorId, meus, onEscolher, exigidas, enviando, erro, onEnviar, tipo = 'lideranca', umPorCandidato = true }: Props) {
  const t = textosDo(tipo);
  const [aberta, setAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [soFaltando, setSoFaltando] = useState(false);
  const [recente, setRecente] = useState<string | null>(null);
  const cartoes = useRef(new Map<string, HTMLElement>());

  const porId = useMemo(() => new Map(cedula.map(c => [c.pergunta.id, c])), [cedula]);
  const respondidas = cedula.filter(c => meus[c.pergunta.id]).length;
  const faltam = cedula.length - respondidas;
  const faltamParaEnviar = Math.max(0, exigidas - respondidas);
  const item = aberta ? porId.get(aberta) : undefined;

  // Quem já está em OUTRA categoria (na aberta dá para trocar).
  const bloqueados = useMemo(() => {
    const m = new Map<string, Pergunta>();
    if (!umPorCandidato) return m;
    for (const [cid, pid] of jaEscolhidos(meus, aberta ?? undefined)) { const q = porId.get(pid)?.pergunta; if (q) m.set(cid, q); }
    return m;
  }, [meus, aberta, porId, umPorCandidato]);

  const idsDoSeletor = useMemo(() => {
    if (!item) return [];
    const termo = semAcento(busca.trim());
    return termo ? item.candidatos.filter(id => semAcento(pessoas.get(id)?.nome ?? '').includes(termo)) : item.candidatos;
  }, [item, busca, pessoas]);

  const abrir = (pid: string) => { setBusca(''); setAberta(pid); };
  const fechar = () => {
    const pid = aberta;
    setAberta(null);
    if (pid) window.setTimeout(() => cartoes.current.get(pid)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  };
  const escolher = (id: string) => {
    if (!aberta || id === eleitorId || bloqueados.has(id)) return;
    onEscolher(aberta, id);
    setRecente(aberta);
    window.setTimeout(fechar, 380);
  };

  // Esc fecha o seletor antes de fechar a votação (captura: roda antes do Esc da tela).
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      fechar();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  });

  useEffect(() => {
    if (!recente) return;
    const t = window.setTimeout(() => setRecente(null), 1600);
    return () => window.clearTimeout(t);
  }, [recente]);

  const lista = soFaltando ? cedula.filter(c => !meus[c.pergunta.id]) : cedula;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-3 pb-28 pt-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Escolha o {t.pessoa} de cada categoria</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Toque numa categoria e escolha quem mais combina com ela.
            {umPorCandidato ? ' Cada um só pode ser escolhido em uma categoria.' : ` O mesmo ${t.pessoa} pode aparecer em mais de uma.`}
            {exigidas < cedula.length
              ? <> Preencha {exigidas} das {cedula.length} para enviar.</>
              : <> Preencha todas para enviar.</>}
          </p>
        </div>
        <div role="radiogroup" aria-label="Mostrar" className="flex overflow-hidden rounded-md border text-xs">
          {([[false, `Todas (${cedula.length})`], [true, `Faltando (${faltam})`]] as const).map(([v, t]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={soFaltando === v} onClick={() => setSoFaltando(v)}
              className={cn('px-3 py-1.5', soFaltando === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
          ))}
        </div>
      </div>

      {lista.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {faltamParaEnviar ? `Nenhuma categoria sem ${t.pessoa}.` : 'Tudo preenchido. Confira e envie.'}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Categorias">
        {lista.map(({ pergunta }) => {
          const escolhido = meus[pergunta.id] ? pessoas.get(meus[pergunta.id]) : undefined;
          const n = cedula.findIndex(c => c.pergunta.id === pergunta.id) + 1;
          return (
            <motion.li key={pergunta.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n * 0.02, 0.4) }}
              ref={(el: HTMLElement | null) => { if (el) cartoes.current.set(pergunta.id, el); else cartoes.current.delete(pergunta.id); }}>
              <button type="button" onClick={() => abrir(pergunta.id)}
                aria-label={`${pergunta.texto} ${escolhido ? `— escolhido: ${escolhido.nome}` : '— sem escolha'}`}
                className={cn(
                  'group flex h-full w-full items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left transition-colors',
                  escolhido ? 'border-primary/50 hover:border-primary' : 'border-dashed border-border hover:border-primary/60',
                  recente === pergunta.id && 'ring-2 ring-success/60',
                )}>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-2xl" aria-hidden="true">{pergunta.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categoria {n}</span>
                  <span className="block text-sm font-semibold leading-snug">{pergunta.texto}</span>
                  {escolhido ? (
                    <span className="mt-1.5 flex items-center gap-2">
                      <FotoLider lider={escolhido} className="h-7 w-7 rounded-lg text-[10px]" />
                      <span className="min-w-0 truncate text-sm font-medium text-primary">{nomeCurto(escolhido.nome)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground group-hover:text-foreground">Trocar</span>
                    </span>
                  ) : (
                    <span className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground group-hover:text-primary">
                      <UserPlus className="h-4 w-4" /> Escolher {t.pessoa}
                    </span>
                  )}
                </span>
                {escolhido && <Check className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />}
              </button>
            </motion.li>
          );
        })}
      </ul>

      {/* A barra de enviar, sempre à vista. */}
      {/* Sem desfoque de fundo: refazer o blur a cada rolagem pesa no vídeo integrado (09/11/2026). */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium"><span className="tabular-nums">{respondidas}</span> de {exigidas} categorias escolhidas</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <motion.div className={cn('h-full rounded-full', faltamParaEnviar ? 'bg-primary' : 'bg-success')}
                animate={{ width: `${Math.min(1, respondidas / Math.max(1, exigidas)) * 100}%` }} />
            </div>
            {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
          </div>
          <Button className="shrink-0 gap-2" disabled={faltamParaEnviar > 0 || enviando} onClick={onEnviar}
            title={faltamParaEnviar ? `Preencha mais ${faltamParaEnviar} para enviar` : undefined}>
            <Vote className="h-4 w-4" />
            {enviando ? 'Enviando…' : faltamParaEnviar ? `Faltam ${faltamParaEnviar}` : 'Enviar meus votos'}
          </Button>
        </div>
      </div>

      {/* O seletor da categoria: as fotos de todos, encaixadas. */}
      {createPortal(
        <AnimatePresence>
          {item && (
            <motion.div key="seletor" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[96] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={item.pergunta.texto}>
              <div className="flex shrink-0 items-center gap-3 border-b px-3 py-3 sm:px-6">
                <Button variant="ghost" size="icon" onClick={fechar} aria-label="Voltar às categorias"><ArrowLeft className="h-5 w-5" /></Button>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-2xl" aria-hidden="true">{item.pergunta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                    Categoria {cedula.findIndex(c => c.pergunta.id === item.pergunta.id) + 1} de {cedula.length}
                  </p>
                  <h2 className="line-clamp-2 text-base font-bold leading-tight sm:truncate sm:text-2xl">{item.pergunta.texto}</h2>
                </div>
                <div className="relative hidden w-56 sm:block">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder={`Buscar ${t.pessoa}`} className="h-9 pl-8" aria-label={`Buscar ${t.pessoa}`} />
                </div>
              </div>
              <div className="border-b px-3 py-2 sm:hidden">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder={`Buscar ${t.pessoa}`} className="h-9 pl-8" aria-label={`Buscar ${t.pessoa} no celular`} />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-6">
                {idsDoSeletor.length > 0 ? (
                  <GradeDeLideres key={`${item.pergunta.id}:${busca}`} ids={idsDoSeletor} pessoas={pessoas} escolhido={meus[item.pergunta.id]}
                    eleitorId={eleitorId} rotulo={item.pergunta.texto} onEscolher={escolher} bloqueados={bloqueados} />
                ) : (
                  <p className="grid flex-1 place-items-center text-sm text-muted-foreground">Ninguém com esse nome.</p>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2.5 sm:px-6">
                {meus[item.pergunta.id] ? (
                  <Button variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => { onEscolher(item.pergunta.id, null); }}>
                    <X className="h-4 w-4" /> Tirar a escolha
                  </Button>
                ) : <span />}
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {bloqueados.size ? `${bloqueados.size} já ${bloqueados.size === 1 ? 'escolhido' : 'escolhidos'} em outras categorias` : 'Toque na foto de quem mais combina'}
                </span>
                <Button variant="ghost" className="gap-1.5" onClick={fechar}>Categorias <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
