/**
 * VotoNoGerente — a cédula da votação dos gerentes (12/11/2026, pedido do
 * Kauan: «Selecione a opção que mais se encaixa com seu gerente… como serão
 * operadores votando nos gerentes é algo diferente»).
 *
 * O operador não escolhe gerente por pergunta: ele vê o gerente DELE (foto e
 * nome) e marca UMA opção — «Mais resolve problemas», «Mais inspirador»,
 * «Referência para todos»… Com 2 gerentes no setor, marca uma para cada, e
 * cada opção vale para um só (o mesmo voto de sempre: {opção: gerente}; o
 * banco confere com «um por candidato»).
 *
 *   abertura → escolha → enviado; na demonstração, depois, o perfil que a
 *   diretoria vê e o resultado (`PerfilDosGerentes`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Lock, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  apurar, opcoesPorGerente, simularVotosNoGerente, somarMeusVotos, votoDosGerentes,
  type Candidato, type ItemDaCedula, type MeusVotos,
} from './cedula';
import { FotoLider } from './FotoLider';
import { PerfilDosGerentes } from './PerfilDosGerentes';
import { SeloDemonstracao } from './SeloDemonstracao';

export interface PropsVotoNoGerente {
  cedula: ItemDaCedula[];
  pessoas: ReadonlyMap<string, Candidato>;
  eleitorId: string | null;
  nomeEleitor?: string;
  semente: number;
  modo?: 'demo' | 'real';
  onEnviar?: (meus: MeusVotos, comecouEm: string | null) => Promise<void>;
  rascunhoChave?: string;
  /** Demonstração: quem vota de verdade, para sortear os votos dos outros. */
  eleitoresSimulados?: readonly string[];
  onFechar: () => void;
}

type Etapa = 'abertura' | 'escolha' | 'enviado' | 'diretoria' | 'resultado';

function lerRascunho(chave: string | undefined): MeusVotos {
  if (!chave) return {};
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : {};
  } catch { return {}; }
}

export function VotoNoGerente({ cedula, pessoas, eleitorId, nomeEleitor, semente, modo = 'demo', onEnviar, rascunhoChave, eleitoresSimulados, onFechar }: PropsVotoNoGerente) {
  const demo = modo === 'demo';
  const opcoes = useMemo(() => cedula.map(c => c.pergunta), [cedula]);
  const gerentes = useMemo(() => (cedula[0]?.candidatos ?? []).filter(id => id !== eleitorId), [cedula, eleitorId]);
  const [etapa, setEtapa] = useState<Etapa>('abertura');
  const [escolhas, setEscolhas] = useState<Map<string, string>>(() => {
    // Só vale o rascunho que ainda cabe: opção e gerente que existem.
    const validas = new Set(opcoes.map(o => o.id));
    const m = opcoesPorGerente(lerRascunho(rascunhoChave));
    return new Map([...m].filter(([g, o]) => gerentes.includes(g) && validas.has(o)));
  });
  useEffect(() => {
    if (!rascunhoChave) return;
    try { localStorage.setItem(rascunhoChave, JSON.stringify(votoDosGerentes(escolhas))); } catch { /* só nesta tela */ }
  }, [rascunhoChave, escolhas]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const comecouEm = useRef<string | null>(null);
  const corpo = useRef<HTMLElement>(null);
  useEffect(() => { if (corpo.current) corpo.current.scrollTop = 0; }, [etapa]);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla); };
  }, [onFechar]);

  const completo = gerentes.length > 0 && gerentes.every(g => escolhas.has(g));
  const escolher = (gerente: string, opcao: string) => setEscolhas(atual => {
    const n = new Map(atual);
    // A opção é de um gerente só: marcar aqui tira de onde estava.
    for (const [g, o] of n) if (o === opcao && g !== gerente) n.delete(g);
    if (n.get(gerente) === opcao) n.delete(gerente); else n.set(gerente, opcao);
    return n;
  });

  const enviar = useCallback(async () => {
    if (!completo || enviando) return;
    setErro(null);
    if (!demo && onEnviar) {
      setEnviando(true);
      try { await onEnviar(votoDosGerentes(escolhas), comecouEm.current); }
      catch (e) { setErro(e instanceof Error ? e.message : String(e)); return; }
      finally { setEnviando(false); }
      if (rascunhoChave) { try { localStorage.removeItem(rascunhoChave); } catch { /* nada */ } }
    }
    setEtapa('enviado');
  }, [completo, enviando, demo, onEnviar, escolhas, rascunhoChave]);

  // Demonstração: os outros votos sorteados + o de quem testou.
  const fechou = etapa === 'diretoria' || etapa === 'resultado';
  const resultados = useMemo(() => {
    if (!fechou) return [];
    const outros = (eleitoresSimulados ?? []).filter(id => id !== eleitorId);
    return apurar(cedula, somarMeusVotos(simularVotosNoGerente(cedula, outros, semente), votoDosGerentes(escolhas)));
  }, [fechou, cedula, eleitoresSimulados, eleitorId, semente, escolhas]);
  const daCedula = useMemo(() => new Map(gerentes.map(g => [g, pessoas.get(g)!]).filter((e): e is [string, Candidato] => !!e[1])), [gerentes, pessoas]);

  const varios = gerentes.length > 1;
  const nomeDe = (id: string) => pessoas.get(id)?.nome ?? 'Gerente';

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label="Votação dos Gerentes">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Vote className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Votação dos Gerentes</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {nomeEleitor ? <>Votando como <strong className="text-foreground">{nomeEleitor}</strong></> : 'Votando como visitante'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="hidden sm:inline-flex"><SeloDemonstracao /></span>}
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label={demo ? 'Sair da demonstração' : 'Fechar a votação'}><X className="h-5 w-5" /></Button>
        </div>
      </header>

      <main ref={corpo} className="min-h-0 flex-1 overflow-y-auto">
        {etapa === 'abertura' && (
          <section className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-5 px-6 py-10 text-center">
            {demo && <span className="sm:hidden"><SeloDemonstracao /></span>}
            <div className="flex -space-x-3">
              {gerentes.slice(0, 3).map(g => <FotoLider key={g} lider={pessoas.get(g)} className="h-20 w-20 rounded-2xl text-2xl ring-4 ring-background" />)}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{varios ? 'Como você vê os seus gerentes?' : 'Como você vê o seu gerente?'}</h1>
              <p className="mt-3 text-muted-foreground">
                {varios
                  ? <>Para cada um dos seus gerentes, marque <strong className="text-foreground">a opção que mais se encaixa</strong> com ele. Cada opção vale para um só.</>
                  : <>Marque <strong className="text-foreground">a opção que mais se encaixa</strong> com {nomeDe(gerentes[0] ?? '')}. São {opcoes.length} opções.</>}
              </p>
            </div>
            <ul className="grid w-full gap-2 text-left text-sm">
              <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"><Lock className="h-4 w-4 shrink-0 text-primary" /> O voto é secreto: ninguém vê o que você marcou.</li>
              <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"><Check className="h-4 w-4 shrink-0 text-primary" /> Leva menos de um minuto. Dá para trocar antes de enviar.</li>
            </ul>
            <Button size="lg" className="mt-2 gap-2 px-8" disabled={!gerentes.length}
              onClick={() => { comecouEm.current = new Date().toISOString(); setEtapa('escolha'); }}>
              Começar <ChevronRight className="h-4 w-4" />
            </Button>
          </section>
        )}

        {etapa === 'escolha' && (
          <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6">
            {gerentes.map(g => {
              const pessoa = pessoas.get(g);
              const minha = escolhas.get(g);
              return (
                <div key={g} className="space-y-3">
                  {/* Em 2 colunas as 10 opções cabem numa tela de celular, logo abaixo do gerente. */}
                  <div className="flex items-center gap-4 rounded-2xl border bg-card p-3 sm:p-4">
                    <FotoLider lider={pessoa} className="h-16 w-16 rounded-2xl text-xl sm:h-24 sm:w-24 sm:text-2xl" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{varios ? 'Um dos seus gerentes' : 'Seu gerente'}</p>
                      <p className="truncate text-xl font-bold sm:text-2xl">{pessoa?.nome ?? 'Gerente'}</p>
                      <p className="text-sm text-muted-foreground">Selecione a opção que mais se encaixa com {varios ? 'ele' : 'seu gerente'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" role="radiogroup" aria-label={`Opções para ${pessoa?.nome ?? 'o gerente'}`}>
                    {opcoes.map(o => {
                      const marcada = minha === o.id;
                      const deOutro = [...escolhas].find(([outro, op]) => outro !== g && op === o.id)?.[0];
                      return (
                        <button key={o.id} type="button" role="radio" aria-checked={marcada} onClick={() => escolher(g, o.id)}
                          className={cn('flex items-center gap-2 rounded-xl border-2 px-2 py-2.5 text-left transition-colors sm:gap-3 sm:px-3 sm:py-3',
                            marcada ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/60',
                            deOutro && !marcada && 'opacity-60')}>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-lg sm:h-10 sm:w-10 sm:text-xl" aria-hidden="true">{o.emoji}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold leading-snug sm:text-sm">{o.texto}</span>
                            {deOutro && !marcada && <span className="block text-[11px] text-muted-foreground">marcada para {nomeDe(deOutro).split(' ')[0]} — toque para trocar</span>}
                          </span>
                          {marcada && <Check className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background px-4 py-3">
              <div className="mx-auto flex max-w-4xl items-center gap-3">
                <div className="min-w-0 flex-1 text-sm">
                  {completo
                    ? <span className="font-medium text-success">Tudo marcado. Confira e envie.</span>
                    : <span className="text-muted-foreground">{varios ? `Marque uma opção para cada gerente (${escolhas.size} de ${gerentes.length}).` : 'Marque uma opção para enviar.'}</span>}
                  {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
                </div>
                <Button className="shrink-0 gap-2" disabled={!completo || enviando} onClick={() => { void enviar(); }}>
                  <Vote className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar meu voto'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {etapa === 'enviado' && (
          <section className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success"><Check className="h-10 w-10" /></span>
            <h2 className="text-2xl font-bold">Voto enviado!</h2>
            <p className="text-muted-foreground">Obrigado. Quando todos votarem, a diretoria confere e libera o resultado.</p>
            {demo && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Isto é a demonstração: o voto ficou só nesta tela e some ao fechar.
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant={demo ? 'outline' : 'default'} onClick={onFechar}>Fechar</Button>
              {demo && <Button className="gap-2" onClick={() => setEtapa('diretoria')}>Ver o que a diretoria vê <ChevronRight className="h-4 w-4" /></Button>}
            </div>
          </section>
        )}

        {etapa === 'diretoria' && (
          <PerfilDosGerentes resultados={resultados} pessoas={daCedula} selo="Só a diretoria vê" onLiberar={() => setEtapa('resultado')} />
        )}
        {etapa === 'resultado' && <PerfilDosGerentes resultados={resultados} pessoas={daCedula} />}
      </main>
    </div>,
    document.body,
  );
}
