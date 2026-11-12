/**
 * TelaVotacao — a votação como o líder vai ver (DEMONSTRAÇÃO, 04/11/2026).
 *
 *   abertura  → quantas perguntas, voto secreto, «Começar»
 *   categorias → (formato padrão, 04/11/2026) todas as perguntas juntas, como
 *               uma cédula: toca na categoria e escolhe o líder (`QuadroDeCategorias`)
 *   pergunta  → (formato «uma por vez») 1 de N: TODOS os líderes encaixados (`GradeDeLideres`);
 *               clicou, vai para a próxima
 *   revisão   → todas as respostas, dá para trocar qualquer uma
 *   enviado   → na demonstração nada vai para o banco
 *   diretoria → a apuração que só a diretoria vê; empates decididos aqui,
 *               e «Liberar o resultado» (`VisaoDiretoria`)
 *   resultado → a revelação (`ResultadoVotacao`), já sem empate
 *
 * Na demonstração os votos dos outros são sorteados e alguns empates são
 * forçados, para a diretoria ter o que decidir.
 *
 * Não dá para votar em si mesmo: o próprio cartão aparece, apagado, para a
 * cédula continuar igual para todos. E cada colega só pode ser escolhido UMA
 * vez (04/11/2026): quem já foi escolhido em outra pergunta fica travado até
 * aquela resposta ser trocada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, Lock, SkipForward, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { textosDo, type TipoDaVotacao } from './textos';
import {
  aplicarDesempates, apurar, forcarEmpates, jaEscolhidos, nomeCurto, respostasExigidas, simularVotos, somarMeusVotos,
  type Candidato, type Desempates, type ItemDaCedula, type MeusVotos, type Pergunta,
} from './cedula';
import { FotoLider } from './FotoLider';
import { GradeDeLideres } from './GradeDeLideres';
import { QuadroDeCategorias } from './QuadroDeCategorias';
import { ResultadoVotacao } from './ResultadoVotacao';
import { VisaoDiretoria } from './VisaoDiretoria';

interface Props {
  cedula: ItemDaCedula[];
  pessoas: ReadonlyMap<string, Candidato>;
  /** Quem está votando (na demonstração, «votar como»). */
  eleitorId: string | null;
  semente: number;
  /** `categorias`: todas juntas, escolhe o líder de cada (padrão). `uma_por_vez`: uma pergunta por tela. */
  formato?: FormatoDaVotacao;
  /**
   * `demo` (padrão): nada é gravado; depois do envio vem a apuração simulada.
   * `real`: o envio vai para o banco por `onEnviar` e a tela termina no «Votos enviados».
   */
  modo?: 'demo' | 'real';
  /** Só no modo real: grava os votos. Recusou? A tela mostra o erro e deixa tentar de novo. */
  onEnviar?: (meus: MeusVotos, comecouEm: string | null) => Promise<void>;
  /** Guarda as escolhas neste navegador até enviar: fechou no meio, volta onde parou. */
  rascunhoChave?: string;
  /** 12/11/2026: liderança (padrão) ou gerentes — muda as palavras. */
  tipo?: TipoDaVotacao;
  /** Cada pessoa só pode ser escolhida uma vez por quem vota (padrão: sim). */
  umPorCandidato?: boolean;
  /** A mesma pessoa em 1º em mais de uma pede decisão da diretoria (padrão: sim). Só na demonstração. */
  umTitulo?: boolean;
  /** Quem vota não concorre (gerentes): o nome dele para o cabeçalho. */
  nomeEleitor?: string;
  /** Demonstração dos gerentes: quem vota de verdade, para sortear os votos dos outros. */
  eleitoresSimulados?: readonly string[];
  onFechar: () => void;
}

function lerRascunhoDoVoto(chave: string | undefined): MeusVotos {
  if (!chave) return {};
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : {};
  } catch { return {}; }
}

export type FormatoDaVotacao = 'categorias' | 'uma_por_vez';

type Etapa = 'abertura' | 'categorias' | 'pergunta' | 'revisao' | 'enviado' | 'diretoria' | 'resultado';

export function SeloDemonstracao() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" aria-hidden="true" />
      Demonstração · nada é gravado
    </span>
  );
}

export function TelaVotacao({
  cedula, pessoas, eleitorId, semente, formato = 'categorias', modo = 'demo', onEnviar, rascunhoChave,
  tipo = 'lideranca', umPorCandidato = true, umTitulo = true, nomeEleitor, eleitoresSimulados, onFechar,
}: Props) {
  const demo = modo === 'demo';
  const t = textosDo(tipo);
  const [etapa, setEtapa] = useState<Etapa>('abertura');
  const [i, setI] = useState(0);
  const [meus, setMeus] = useState<MeusVotos>(() => {
    // Só vale o rascunho que ainda cabe nesta cédula (pergunta e pessoa que existem).
    const salvo = lerRascunhoDoVoto(rascunhoChave);
    const validas = new Map(cedula.map(c => [c.pergunta.id, new Set(c.candidatos)]));
    const meusSalvos = Object.fromEntries(Object.entries(salvo).filter(([pid, cid]) => validas.get(pid)?.has(cid) && cid !== eleitorId));
    // Votação dos gerentes (12/11/2026): setor com UM gerente só — não há o que
    // escolher, então ele já vem marcado em todas (a pessoa só confere e envia).
    const opcoes = (cedula[0]?.candidatos ?? []).filter(id => id !== eleitorId);
    if (!umPorCandidato && opcoes.length === 1) return Object.fromEntries(cedula.map(c => [c.pergunta.id, opcoes[0]]));
    return meusSalvos;
  });
  useEffect(() => {
    if (!rascunhoChave) return;
    try { localStorage.setItem(rascunhoChave, JSON.stringify(meus)); } catch { /* sem armazenamento: só nesta tela */ }
  }, [rascunhoChave, meus]);
  /** Veio da revisão para trocar uma resposta: volta para a revisão depois. */
  const [corrigindo, setCorrigindo] = useState(false);
  const [desempates, setDesempates] = useState<Desempates>({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  /** Quando clicou em «Começar»: vai para o banco junto com os votos (os horários). */
  const comecouEm = useRef<string | null>(null);
  const eleitor = eleitorId ? pessoas.get(eleitorId) : undefined;
  const item = cedula[i];
  const respondidas = cedula.filter(c => meus[c.pergunta.id]).length;
  const eleitorConcorre = !!eleitorId && (cedula[0]?.candidatos.includes(eleitorId) ?? false);
  const maximo = respostasExigidas({ candidatos: cedula[0]?.candidatos.length ?? 0, perguntas: cedula.length, eleitorConcorre, umPorCandidato });
  // Quem já foi escolhido em outra pergunta (na atual dá para trocar). Sem a regra, ninguém trava.
  const bloqueados = useMemo(() => {
    if (!umPorCandidato) return new Map<string, Pergunta>();
    const porId = new Map<string, Pergunta>(cedula.map(c => [c.pergunta.id, c.pergunta]));
    const m = new Map<string, Pergunta>();
    for (const [cid, pid] of jaEscolhidos(meus, item?.pergunta.id)) { const q = porId.get(pid); if (q) m.set(cid, q); }
    return m;
  }, [meus, item, cedula, umPorCandidato]);
  const restam = item ? item.candidatos.filter(id => id !== eleitorId && !bloqueados.has(id)).length : 0;
  // Só envia com tudo preenchido (pedido de 04/11/2026): todas as categorias, ou o
  // máximo possível quando há mais categorias que colegas (cada um vale uma vez).
  const completo = respondidas >= maximo;

  const enviar = useCallback(async () => {
    if (!completo || enviando) return;
    setErroEnvio(null);
    if (!demo && onEnviar) {
      setEnviando(true);
      try { await onEnviar(meus, comecouEm.current); }
      catch (e) { setErroEnvio(e instanceof Error ? e.message : String(e)); return; }
      finally { setEnviando(false); }
      if (rascunhoChave) { try { localStorage.removeItem(rascunhoChave); } catch { /* nada */ } }
    }
    setEtapa('enviado');
  }, [completo, enviando, demo, onEnviar, meus, rascunhoChave]);

  // A apuração só existe depois do envio (os votos de quem testou entram por cima dos sorteados).
  const fechou = etapa === 'diretoria' || etapa === 'resultado';
  const apuracao = useMemo(() => {
    if (!fechou) return [];
    const outros = (eleitoresSimulados ?? [...pessoas.keys()]).filter(id => id !== eleitorId);
    const sorteados = simularVotos(cedula, outros, semente, umPorCandidato);
    const comEmpates = forcarEmpates(sorteados, cedula, Math.min(3, Math.max(1, Math.floor(cedula.length / 8))), semente);
    return apurar(cedula, somarMeusVotos(comEmpates, meus));
  }, [fechou, cedula, pessoas, eleitorId, semente, meus, eleitoresSimulados, umPorCandidato]);
  const finais = useMemo(() => aplicarDesempates(apuracao, desempates), [apuracao, desempates]);

  // Cada etapa começa do topo (11/11/2026): o «Começar» fica no pé da abertura,
  // e no celular a rolagem de lá passava para as categorias, que abriam no meio,
  // sem o título e as instruções.
  const corpo = useRef<HTMLElement>(null);
  useEffect(() => { if (corpo.current) corpo.current.scrollTop = 0; }, [etapa]);

  // Trava a rolagem da página de trás enquanto a votação está aberta.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);

  const avancar = useCallback(() => {
    if (corrigindo || i >= cedula.length - 1) { setCorrigindo(false); setEtapa('revisao'); return; }
    setI(n => n + 1);
  }, [corrigindo, i, cedula.length]);

  // Entre o clique e a próxima pergunta, um segundo clique não pula pergunta.
  const indo = useRef(false);
  const proxima = useRef(0);
  useEffect(() => () => window.clearTimeout(proxima.current), []);
  const votar = useCallback((id: string) => {
    if (!item || id === eleitorId || bloqueados.has(id) || indo.current) return;
    setMeus(m => ({ ...m, [item.pergunta.id]: id }));
    indo.current = true;
    proxima.current = window.setTimeout(() => { indo.current = false; avancar(); }, 420);
  }, [item, eleitorId, bloqueados, avancar]);

  const voltar = useCallback(() => {
    if (corrigindo) { setCorrigindo(false); setEtapa('revisao'); return; }
    if (i === 0) setEtapa('abertura'); else setI(n => n - 1);
  }, [corrigindo, i]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onFechar(); return; }
      if (etapa !== 'pergunta' || !item) return;
      if (e.key === 'ArrowLeft') voltar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [etapa, item, voltar, onFechar]);

  const progresso = etapa === 'categorias' ? respondidas / Math.max(1, cedula.length) : etapa === 'pergunta' ? (i + (meus[item?.pergunta.id ?? ''] ? 1 : 0)) / cedula.length : etapa === 'abertura' ? 0 : 1;

  const conteudo = (
    <div className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={t.nome}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Vote className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t.nome}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {eleitor || nomeEleitor ? <>Votando como <strong className="text-foreground">{eleitor?.nome ?? nomeEleitor}</strong></> : 'Votando como visitante'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="hidden sm:inline-flex"><SeloDemonstracao /></span>}
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label={demo ? 'Sair da demonstração' : 'Fechar a votação'}><X className="h-5 w-5" /></Button>
        </div>
      </header>
      {!fechou && (
        <div className="h-1 bg-muted" aria-hidden="true">
          <motion.div className="h-full bg-primary" animate={{ width: `${progresso * 100}%` }} transition={{ duration: 0.35 }} />
        </div>
      )}

      <main ref={corpo} className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {etapa === 'abertura' && (
            <motion.section key="abertura" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-5 px-6 py-10 text-center">
              {demo && <span className="sm:hidden"><SeloDemonstracao /></span>}
              <motion.span initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}
                className="grid h-20 w-20 place-items-center rounded-2xl bg-primary/15 text-5xl" aria-hidden="true">🗳️</motion.span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.chamada}</h1>
                <p className="mt-3 text-muted-foreground">
                  São <strong className="text-foreground">{cedula.length} categorias</strong> sobre a personalidade dos {t.pessoas}.
                  Em cada uma, escolha {tipo === 'lideranca' ? 'o colega' : `o ${t.pessoa}`} que mais combina.
                </p>
              </div>
              <ul className="grid w-full gap-2 text-left text-sm">
                <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"><Lock className="h-4 w-4 shrink-0 text-primary" /> O voto é secreto: ninguém vê em quem você votou.</li>
                {eleitorConcorre && <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"><Check className="h-4 w-4 shrink-0 text-primary" /> Não dá para votar em si mesmo.</li>}
                {umPorCandidato ? (
                  <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                    <Lock className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Cada {tipo === 'lideranca' ? 'colega' : t.pessoa} só pode ser escolhido <strong>uma vez</strong>: quem você já escolheu fica travado nas outras perguntas.
                      {maximo < cedula.length && <> Dá para responder até {maximo} das {cedula.length} perguntas.</>}
                    </span>
                  </li>
                ) : (
                  <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>O mesmo {t.pessoa} pode ser escolhido em mais de uma categoria.</span>
                  </li>
                )}
                <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"><ArrowLeft className="h-4 w-4 shrink-0 text-primary" /> Antes de enviar, dá para revisar e trocar qualquer resposta.</li>
                <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <Vote className="h-4 w-4 shrink-0 text-primary" />
                  {maximo < cedula.length
                    ? <span>Para enviar, preencha <strong>{maximo}</strong> categorias (o máximo possível).</span>
                    : <span>Para enviar, preencha <strong>todas</strong> as categorias.</span>}
                </li>
              </ul>
              <Button size="lg" className="mt-2 gap-2 px-8" onClick={() => { comecouEm.current = new Date().toISOString(); setI(0); setEtapa(formato === 'categorias' ? 'categorias' : 'pergunta'); }}>
                Começar <ChevronRight className="h-4 w-4" />
              </Button>
            </motion.section>
          )}

          {etapa === 'pergunta' && item && (
            <motion.section key={`p-${item.pergunta.id}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}
              className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-3 px-3 pb-3 pt-4 sm:gap-4 sm:px-6 sm:pt-5">
              {/* A pergunta ocupa pouco: o espaço é das fotos. */}
              <div className="flex shrink-0 items-center justify-center gap-3 text-center sm:gap-4">
                <motion.span initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 13 }}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-3xl sm:h-16 sm:w-16 sm:text-4xl" aria-hidden="true">
                  {item.pergunta.emoji}
                </motion.span>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Pergunta {i + 1} de {cedula.length}</p>
                  <h2 className="text-xl font-bold leading-tight tracking-tight sm:text-3xl">{item.pergunta.texto}</h2>
                </div>
              </div>

              <GradeDeLideres ids={item.candidatos} pessoas={pessoas} escolhido={meus[item.pergunta.id]}
                eleitorId={eleitorId} rotulo={item.pergunta.texto} onEscolher={votar} bloqueados={bloqueados} />

              <div className="flex shrink-0 items-center justify-between gap-2">
                <Button variant="ghost" className="gap-1.5" onClick={voltar}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
                <span className="hidden text-center text-xs text-muted-foreground sm:inline">
                  {restam === 0 && !meus[item.pergunta.id]
                    ? 'Você já escolheu todos os colegas: pule esta ou troque uma resposta na revisão'
                    : `${item.candidatos.length} ${t.pessoas}${umPorCandidato ? ` · cada um só pode ser escolhido uma vez${bloqueados.size ? ` · ${bloqueados.size} já ${bloqueados.size === 1 ? 'escolhido' : 'escolhidos'}` : ''}` : ''}`}
                </span>
                <Button variant="ghost" className="gap-1.5" onClick={avancar}>
                  {meus[item.pergunta.id] ? 'Próxima' : 'Pular'} {meus[item.pergunta.id] ? <ChevronRight className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
                </Button>
              </div>
            </motion.section>
          )}

          {etapa === 'categorias' && (
            <motion.section key="categorias" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-h-full">
              <QuadroDeCategorias cedula={cedula} pessoas={pessoas} eleitorId={eleitorId} meus={meus} tipo={tipo} umPorCandidato={umPorCandidato}
                onEscolher={(pid, id) => setMeus(m => {
                  const n = { ...m };
                  if (id) n[pid] = id; else delete n[pid];
                  return n;
                })}
                exigidas={maximo} enviando={enviando} erro={erroEnvio} onEnviar={() => { void enviar(); }} />
            </motion.section>
          )}

          {etapa === 'revisao' && (
            <motion.section key="revisao" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Confira antes de enviar</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {respondidas} de {maximo} respondidas{completo ? '' : ` — faltam ${maximo - respondidas}; toque numa pergunta para responder`}.
                </p>
              </div>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {cedula.map((c, n) => {
                  const escolhido = meus[c.pergunta.id] ? pessoas.get(meus[c.pergunta.id]) : undefined;
                  return (
                    <li key={c.pergunta.id}>
                      <button type="button" onClick={() => { setI(n); setCorrigindo(true); setEtapa('pergunta'); }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
                        <span className="w-7 text-center text-xl" aria-hidden="true">{c.pergunta.emoji}</span>
                        <span className="min-w-0 flex-1 text-sm">{c.pergunta.texto}</span>
                        {escolhido ? (
                          <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
                            <FotoLider lider={escolhido} className="h-7 w-7 text-[10px]" /> {nomeCurto(escolhido.nome)}
                          </span>
                        ) : <span className="shrink-0 text-xs font-medium text-warning">Sem resposta</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={() => { setI(cedula.length - 1); setEtapa('pergunta'); }}>Voltar às perguntas</Button>
                <Button className="gap-2" disabled={!completo || enviando} onClick={() => { void enviar(); }}>
                  <Vote className="h-4 w-4" /> {enviando ? 'Enviando…' : completo ? 'Enviar meus votos' : `Faltam ${maximo - respondidas}`}
                </Button>
              </div>
              {erroEnvio && <p className="text-center text-sm text-destructive">{erroEnvio}</p>}
            </motion.section>
          )}

          {etapa === 'enviado' && (
            <motion.section key="enviado" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center gap-4 px-6 py-10 text-center">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 11 }}
                className="grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success"><Check className="h-10 w-10" /></motion.span>
              <h2 className="text-2xl font-bold">Votos enviados!</h2>
              <p className="text-muted-foreground">
                Obrigado. Quando todos votarem, a diretoria confere a apuração, decide os empates e libera o resultado.
              </p>
              {demo && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Isto é a demonstração: os {respondidas} votos ficaram só nesta tela e somem ao fechar.
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant={demo ? 'outline' : 'default'} onClick={onFechar}>Fechar</Button>
                {demo && <Button className="gap-2" onClick={() => setEtapa('diretoria')}>Ver a apuração da diretoria <ChevronRight className="h-4 w-4" /></Button>}
              </div>
            </motion.section>
          )}

          {etapa === 'diretoria' && (
            <motion.section key="diretoria" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-h-full">
              <VisaoDiretoria resultados={apuracao} pessoas={pessoas} desempates={desempates} umTitulo={umTitulo} tipo={tipo}
                onDesempatar={(pid, id) => setDesempates(d => ({ ...d, [pid]: id }))}
                onLiberar={() => setEtapa('resultado')} />
            </motion.section>
          )}

          {etapa === 'resultado' && (
            <motion.section key="resultado" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-full">
              <ResultadoVotacao cedula={cedula} resultados={finais} pessoas={pessoas} meus={meus} demo={demo} tipo={tipo} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );

  return createPortal(conteudo, document.body);
}
