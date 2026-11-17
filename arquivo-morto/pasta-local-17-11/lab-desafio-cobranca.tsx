// MODELO DE TESTE do «Desafio Cobrança para folgar mais cedo» (16/11/2026).
// Dados fictícios, sem banco, não liberado para ninguém: só existe no
// `npm run dev`, em http://localhost:8080/lab-desafio-cobranca.html.
//
// Mora no Gestão como o Desafio do Dia: uma PÍLULA na barra de cima e, ao
// clicar, a GAVETA da direita (620 px). A barra e a página são de mentira.
//
// As regras (16/11/2026): segunda a quarta; uma meta só, de todos os setores
// que somam: R$ 1,9 mi = todo mundo sai às 14h (precisa ter banco de horas). A regra
// do operador (4,5 médias dele = 1 hora mais cedo) é individual e fica à parte. Quem soma e quem vê se escolhe por setor (Marília soma, mas
// ainda não vê) — a aba «Configurar».
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeftRight, Bell, CalendarDays, Check, Clock, Eye, EyeOff, FlaskConical, Hourglass, Info, Lock, Menu, Moon, Palette, RotateCcw,
  Settings2, Sun, Target, Tv, UserRound, X, Zap,
} from 'lucide-react';
import { PilulaVisual } from '@/components/DesafioDoDia/PilulaDesafioDoDia';
import { estiloDoDia } from '@/components/DesafioDoDia/estilo';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import '@/index.css';
import './lab-desafio-cobranca.css';

import {
  CONFIG_INICIAL, DESAFIO, DIAS_PASSADOS, EU, PREMIO, REGRA_OPERADOR, SETORES, brl, brlCurto, dataCurta, diaLocal, diasRestantes,
  esperadoAteODia, fracaoQueSoma, hojeReal, medias, pct, semana, semanaCurta,
  type ConfigSetor, type Estado,
} from './lab-desafio-cobranca-dados';
import { TelaDesafioTv } from './lab-desafio-cobranca-tv';
import { TEMAS, TEMA_INICIAL, TEMA_PADRAO, cssDoTema, type TemaDoDesafio } from './lab-desafio-cobranca-temas';
import { diasUteisAntesDoDesafio, metaDoOperadorNoDesafio, type MetaDoOperador } from '@/lib/desafioMediaOperador';

type Qual = 'folga' | 'dia';

/** «segunda» → «Segunda» (só a primeira letra). */
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type Visao = 'gestao' | 'tv' | 'config';
/** De que setor é quem está olhando (no modelo, para ver a regra do «vê»). */
type VerComo = 'play2' | 'marilia';

// ── A página de teste: um Gestão de mentira ──────────────────────────────────

function Lab() {
  const [hoje, setHoje] = useState(hojeReal);
  /** O de hoje de TODOS os setores; o que conta sai da configuração. */
  const [somadoHoje, setSomadoHoje] = useState(410_000);
  /** O que EU (o operador que está olhando) recebi hoje — a meta individual. */
  const [meuHoje, setMeuHoje] = useState(6_000);
  const [escuro, setEscuro] = useState(false);
  const [aberto, setAberto] = useState(false);
  // No Gestão, a abertura do ingresso aparece só na 1ª vez (por pessoa).
  const [jaRevelou, setJaRevelou] = useState(false);
  const [testeAberto, setTesteAberto] = useState(false);
  /** Se hoje também tem Desafio do Dia — aí a pessoa escolhe qual fica na barra. */
  const [temDia, setTemDia] = useState(true);
  const [naBarra, setNaBarra] = useState<Qual>('folga');
  /** A aba da gaveta: abre na do desafio que foi clicado. */
  const [aba, setAba] = useState<Qual>('folga');
  const [config, setConfig] = useState<ConfigSetor[]>(CONFIG_INICIAL);
  const [verComo, setVerComo] = useState<VerComo>('play2');
  const [visao, setVisao] = useState<Visao>(() => {
    const v = new URLSearchParams(location.search).get('ver');
    return v === 'tv' || v === 'config' ? v : 'gestao';
  });

  useEffect(() => { document.documentElement.classList.toggle('dark', escuro); }, [escuro]);

  // As cores do desafio: ?cores=oceano, ou a última escolhida neste navegador.
  const [temaId, setTemaId] = useState<string>(() => {
    const daUrl = new URLSearchParams(location.search).get('cores');
    let salvo: string | null = null;
    try { salvo = localStorage.getItem('lab-dc-cores'); } catch { /* sem armazenamento */ }
    return [daUrl, salvo].find(id => TEMAS.some(t => t.id === id)) ?? TEMA_INICIAL.id;
  });
  const tema = TEMAS.find(t => t.id === temaId) ?? TEMA_PADRAO;
  const escolherTema = (id: string) => {
    setTemaId(id);
    try { localStorage.setItem('lab-dc-cores', id); } catch { /* sem armazenamento */ }
    const url = new URL(location.href);
    url.searchParams.set('cores', id);
    history.replaceState(null, '', url);
  };
  const [coresAbertas, setCoresAbertas] = useState(true);
  // Neve caindo no céu do ingresso, nos temas de Natal.
  useEffect(() => {
    if (tema.neve) document.documentElement.setAttribute('data-dc-neve', '');
    else document.documentElement.removeAttribute('data-dc-neve');
  }, [tema.neve]);
  const cores = <EscolhaDeCores tema={tema} onEscolher={escolherTema} aberta={coresAbertas} setAberta={setCoresAbertas} />;

  // Só o recebimento dos setores que SOMAM entra no desafio.
  const fracao = fracaoQueSoma(config);
  const passados = DIAS_PASSADOS.slice(0, hoje).map((v) => Math.round(v * fracao));
  const somadoContado = Math.round(somadoHoje * fracao);
  const estado: Estado = { hoje, somadoHoje: somadoContado, passados, total: passados.reduce((s, v) => s + v, 0) + somadoContado };
  // A meta individual: 4,5 médias diárias dele (a conta é a de `desafioMediaOperador`).
  const meu = metaDoOperadorNoDesafio({
    recebidoAntes: EU.recebidoAntes,
    diasUteisAntes: diasUteisAntesDoDesafio(DESAFIO.dias[0], EU.feriados),
    recebidoNoDesafio: DESAFIO.dias.map((_, i) => (i < hoje ? EU.passados[i] : i === hoje ? meuHoje : 0)),
    hoje,
    fator: REGRA_OPERADOR.medias,
  });
  // A folga aparece só para quem é de um setor que VÊ.
  const folgaVisivel = !!config.find((c) => c.id === verComo)?.ve;

  const teste = (
    <PainelTeste
      aberto={testeAberto} setAberto={setTesteAberto}
      hoje={hoje} setHoje={setHoje} somadoHoje={somadoHoje} setSomadoHoje={setSomadoHoje} estado={estado}
      meuHoje={meuHoje} setMeuHoje={setMeuHoje} meu={meu}
      escuro={escuro} setEscuro={setEscuro}
      temDia={temDia} setTemDia={setTemDia} jaRevelou={jaRevelou} onFechar={() => setJaRevelou(false)}
      verComo={verComo} setVerComo={setVerComo} folgaVisivel={folgaVisivel}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="dc-faixa" role="note">
        <FlaskConical size={14} aria-hidden />
        <span className="dc-faixa-texto">Modelo de teste · dados fictícios · não liberado</span>
        <span className="dc-visao" role="group" aria-label="Onde ver">
          <button type="button" aria-pressed={visao === 'gestao'} onClick={() => setVisao('gestao')}>No Gestão</button>
          <button type="button" aria-pressed={visao === 'tv'} onClick={() => setVisao('tv')}><Tv size={13} aria-hidden /> No Modo TV</button>
          <button type="button" aria-pressed={visao === 'config'} onClick={() => setVisao('config')}><Settings2 size={13} aria-hidden /> Configurar</button>
        </span>
        <button type="button" className="dc-faixa-cores" onClick={() => setCoresAbertas(!coresAbertas)} aria-expanded={coresAbertas}>
          <Amostra tema={tema} /> <Palette size={13} aria-hidden /> Cores: {tema.nome}
        </button>
      </div>

      {visao === 'tv' && <TelaDesafioTv estado={estado} style={{ width: '100%', height: 'calc(100vh - 34px)' }} />}

      {visao === 'config' && <Configuracao config={config} setConfig={setConfig} />}

      {visao === 'gestao' && (
        <>
          {/* A barra de cima do Gestão (imitação) com a pílula do desafio. */}
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-3 sm:px-5">
            <Menu className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="hidden text-sm font-semibold sm:inline">Gestão de Acordos</span>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <BarraDosDesafios
                estado={estado} temDia={temDia} folgaVisivel={folgaVisivel} naBarra={naBarra} setNaBarra={setNaBarra}
                folgaFechada={!jaRevelou} onAbrir={(q) => { setAba(q); setAberto(true); }}
              />
              <Bell className="hidden h-5 w-5 text-muted-foreground sm:block" aria-hidden />
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary" aria-hidden>
                {verComo === 'marilia' ? 'R' : 'M'}
              </span>
            </div>
          </header>

          {/* A página do Gestão (imitação). */}
          <main className="mx-auto grid max-w-6xl gap-4 p-4 sm:grid-cols-3 sm:p-6" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-32 rounded-xl border border-border bg-card p-4">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="mt-4 h-6 w-32 rounded bg-muted" />
                <div className="mt-3 h-2 w-full rounded bg-muted" />
              </div>
            ))}
          </main>

          {/* Com a gaveta aberta, o painel de teste vai DENTRO dela: a gaveta,
              como a do Gestão, prende o foco e bloqueia o resto da tela. */}
          <GavetaFolga
            aba={temDia && folgaVisivel ? aba : temDia ? 'dia' : 'folga'} setAba={setAba} temDia={temDia && folgaVisivel}
            aberta={aberto} onFechar={() => setAberto(false)} estado={estado}
            jaRevelou={jaRevelou} onRevelou={() => setJaRevelou(true)} onVerAbertura={() => setJaRevelou(false)}
            meu={meu}
            extra={<>{teste}{cores}</>}
          />
        </>
      )}

      {(!aberto || visao !== 'gestao') && <>{teste}{cores}</>}
      <style>{cssDoTema(tema)}</style>
    </div>
  );
}

// ── As cores (só do modelo): escolher e ver na hora ─────────────────────────

function EscolhaDeCores({ tema, onEscolher, aberta, setAberta }: {
  tema: TemaDoDesafio; onEscolher: (id: string) => void; aberta: boolean; setAberta: (v: boolean) => void;
}) {
  return (
    <div className="dc-cores">
      <button type="button" className="dc-cores-botao" onClick={() => setAberta(!aberta)} aria-expanded={aberta}>
        <Amostra tema={tema} /> <Palette size={15} aria-hidden /> Cores: {tema.nome}
      </button>
      {aberta && (
        <div className="dc-cores-lista" role="group" aria-label="Cores do desafio">
          <p className="dc-cores-titulo">Escolha as cores · gaveta, ingresso e TV</p>
          {(['natal', 'outros'] as const).map(g => (
            <div key={g}>
              <p className="dc-cores-grupo">{g === 'natal' ? '🎄 Natal' : 'Outras'}</p>
              {TEMAS.filter(t => t.grupo === g).map(t => (
                <button key={t.id} type="button" className="dc-cor" aria-pressed={t.id === tema.id} onClick={() => onEscolher(t.id)}>
                  <Amostra tema={t} />
                  <span>
                    <span className="dc-cor-nome">{t.nome}{t.id === TEMA_PADRAO.id ? ' (o de hoje)' : ''}</span>
                    <span className="dc-cor-sobre">{t.sobre}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** O céu do tema com o ingresso no canto. */
function Amostra({ tema }: { tema: TemaDoDesafio }) {
  const c = tema.cores;
  return (
    <span className="dc-cor-amostra" aria-hidden style={{ background: `linear-gradient(160deg, ${c.noite}, ${c.noite3})` }}>
      <i style={{ background: `linear-gradient(115deg, ${c.quente1}, ${c.quente3})` }} />
    </span>
  );
}

// ── 1. A barra de cima: a pílula (e a troca, se tem Desafio do Dia) ───────

/** O Desafio do Dia de mentira, para ver a troca. No Gestão vem do placar real. */
const DIA = {
  nome: 'Virada da tarde',
  ate: '18h',
  andamento: { realizado: 85_800, meta: 120_000, falta: 34_200, progresso: 71.5, bateu: false, porQuantidade: false },
  ranking: [
    { nome: 'Play 2', valor: 31_400 },
    { nome: 'Receptivo', valor: 24_900 },
    { nome: 'Jornada', valor: 17_300 },
  ],
};

/** Quanto falta para a meta geral — a das 14h. */
const faltaGeral = (total: number) => Math.max(DESAFIO.metaGeral - total, 0);

/**
 * A barra mostra UMA pílula. Com Desafio do Dia no mesmo dia, o botão de troca
 * ao lado deixa a pessoa escolher qual fica à vista — e trocar quando quiser.
 *
 * Enquanto a folga não foi aberta, ela chama: a pílula pisca forte; se a
 * pessoa deixou o Desafio do Dia na barra, quem pisca é o botão de troca.
 * Quem é de setor que não vê a folga (Marília, por ora) não tem pílula dela.
 */
function BarraDosDesafios({ estado, temDia, folgaVisivel, naBarra, setNaBarra, folgaFechada, onAbrir }: {
  estado: Estado; temDia: boolean; folgaVisivel: boolean; naBarra: Qual; setNaBarra: (q: Qual) => void;
  folgaFechada: boolean; onAbrir: (q: Qual) => void;
}) {
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const podeTrocar = temDia && folgaVisivel;
  const mostrar: Qual | null = podeTrocar ? naBarra : folgaVisivel ? 'folga' : temDia ? 'dia' : null;
  const trocaChama = folgaFechada && mostrar === 'dia' && folgaVisivel;

  // Fecha o menu ao clicar fora ou no Esc.
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);

  if (!mostrar) return null;

  const falta = faltaGeral(estado.total);
  const opcoes: { q: Qual; Icone: typeof Sun; titulo: string; sub: string }[] = [
    {
      q: 'folga', Icone: Sun, titulo: 'Folga mais cedo',
      sub: folgaFechada ? 'Novo — ainda não abriu' : falta > 0 ? `saída 14h: faltam ${brlCurto(falta)}` : 'Saída às 14h garantida!',
    },
    { q: 'dia', Icone: Zap, titulo: `Desafio do dia · ${DIA.nome}`, sub: `faltam ${brlCurto(DIA.andamento.falta)} · até ${DIA.ate}` },
  ];

  return (
    <div ref={caixa} className="relative flex items-center gap-1.5">
      {mostrar === 'folga' ? (
        <PilulaFolga estado={estado} chamando={folgaFechada} onAbrir={() => onAbrir('folga')} />
      ) : (
        <PilulaVisual
          estilo={estiloDoDia('violeta')} situacao="valendo" andamento={DIA.andamento}
          rotuloTempo={`até ${DIA.ate}`} onClick={() => onAbrir('dia')}
        />
      )}

      {podeTrocar && (
        <>
          <button
            type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
            title="Escolher o desafio da barra"
            aria-label={trocaChama ? 'Trocar o desafio da barra — tem a folga para abrir' : 'Escolher o desafio que aparece na barra'}
            className={cn(
              'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              trocaChama && 'dc-chamando',
            )}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {trocaChama && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-card" aria-hidden />}
          </button>

          {menu && (
            <div role="menu" aria-label="Qual desafio fica na barra" className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
              <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mostrar na barra</p>
              {opcoes.map(({ q, Icone, titulo, sub }) => (
                <button
                  key={q} type="button" role="menuitemradio" aria-checked={mostrar === q}
                  onClick={() => { setNaBarra(q); setMenu(false); }}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent', mostrar === q && 'bg-accent/60')}
                >
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    q === 'folga' ? 'bg-gradient-to-br from-amber-300 to-orange-500 text-amber-950' : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
                  )}>
                    <Icone className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{titulo}</span>
                      {q === 'folga' && folgaFechada && (
                        <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[9px] font-bold uppercase text-white">novo</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                  </span>
                  {mostrar === q && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                </button>
              ))}
              <p className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">Os dois continuam valendo — muda só o que fica à vista.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Mesmo molde da pílula do Desafio do Dia (h-9, arredondada), com o sol da
 * folga. Mostra quanto falta para a meta geral (a saída às 14h).
 * `chamando`: a folga ainda não foi aberta — pisca forte com «ABRA!».
 */
function PilulaFolga({ estado, chamando, onAbrir }: { estado: Estado; chamando: boolean; onAbrir: () => void }) {
  const p = pct(estado.total, DESAFIO.metaGeral);
  const falta = faltaGeral(estado.total);
  return (
    <button
      type="button" onClick={onAbrir}
      title="Abrir o Desafio Cobrança"
      aria-label={chamando
        ? 'Novo desafio para você: abra o Desafio Cobrança para folgar mais cedo'
        : falta > 0
          ? `Abrir o Desafio Cobrança: saída às 14h, faltam ${brl(falta)}`
          : 'Abrir o Desafio Cobrança: saída às 14h garantida'}
      className={cn(
        'relative flex h-9 max-w-[22rem] items-center gap-2 rounded-full border border-amber-500/40 bg-card pl-1 pr-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        chamando && 'dc-chamando',
      )}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500">
        <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-25" aria-hidden />
        <Sun className="relative h-4 w-4 text-amber-950" aria-hidden />
      </span>
      {chamando ? (
        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
          <span className="hidden sm:inline">Novo desafio · </span>abra a folga!
        </span>
      ) : falta > 0 ? (
        <>
          <span className="flex min-w-0 items-baseline gap-1">
            <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:inline">Saída 14h · faltam</span>
            <span className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{brlCurto(falta)}</span>
          </span>
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-700" style={{ width: `${p}%` }} />
          </span>
          <span className="hidden text-[11px] font-semibold tabular-nums sm:inline">{p}%</span>
        </>
      ) : (
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Saída às 14h garantida!</span>
      )}
      {chamando && <span className="dc-abra" aria-hidden>ABRA!</span>}
    </button>
  );
}

// ── 2. A gaveta ──────────────────────────────────────────────────────────────

function GavetaFolga({ aba, setAba, temDia, aberta, onFechar, estado, meu, jaRevelou, onRevelou, onVerAbertura, extra }: {
  aba: Qual; setAba: (q: Qual) => void; temDia: boolean; meu: MetaDoOperador;
  aberta: boolean; onFechar: () => void; estado: Estado;
  jaRevelou: boolean; onRevelou: () => void; onVerAbertura: () => void;
  /** Só do modelo: o painel de teste. */
  extra?: ReactNode;
}) {
  const { hoje } = estado;
  const folga = aba === 'folga';
  const ultimo = DESAFIO.dias.length - 1;
  return (
    <Dialog.Root open={aberta} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="veu-desfocado fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-[620px] max-w-[calc(100vw-1rem)] flex-col shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:duration-300 data-[state=closed]:duration-200',
            // A folga tem o próprio céu; o Desafio do Dia é a gaveta de sempre do Gestão.
            folga ? 'dc' : 'border-l border-border bg-background text-foreground',
          )}
        >
          {folga ? (
            <header className="dc-cabeca">
              <div className="dc-cabeca-linha">
                {temDia
                  ? <AbasDaGaveta aba={aba} setAba={setAba} folgaFechada={!jaRevelou} escuro />
                  : <span className="dc-selo"><Sun size={14} aria-hidden /> Desafio geral · todos os setores</span>}
                <Dialog.Close className="dc-fechar" aria-label="Fechar"><X size={18} aria-hidden /></Dialog.Close>
              </div>
              <Dialog.Title className="dc-titulo">
                {DESAFIO.titulo} <span>{DESAFIO.subtitulo}</span>
              </Dialog.Title>
              <p className="dc-periodo">
                <CalendarDays size={14} aria-hidden />
                <span>{`${maiuscula(semana(DESAFIO.dias[0]))} a ${semana(DESAFIO.dias[ultimo])} · ${dataCurta(DESAFIO.dias[0])} a ${dataCurta(DESAFIO.dias[ultimo])}`}</span>
                <span className="dc-pilula">Dia {hoje + 1} de {DESAFIO.dias.length}{hoje === ultimo ? ' · último!' : ''}</span>
              </p>
            </header>
          ) : (
            <header className="shrink-0 border-b border-border bg-card px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                {temDia
                  ? <AbasDaGaveta aba={aba} setAba={setAba} folgaFechada={!jaRevelou} />
                  : <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400"><Zap className="h-4 w-4" aria-hidden /> Desafio do dia</span>}
                <Dialog.Close aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-4 w-4" aria-hidden />
                </Dialog.Close>
              </div>
              <Dialog.Title className="mt-2 text-xl font-semibold tracking-tight">{DIA.nome}</Dialog.Title>
              <p className="mt-1 text-xs text-muted-foreground">Desafio do dia · todos os setores · até {DIA.ate}</p>
            </header>
          )}

          <div className={folga ? 'dc-corpo' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-5'}>
            {!folga ? (
              <PainelDoDia />
            ) : jaRevelou ? (
              <Conteudo estado={estado} meu={meu} onVerAbertura={onVerAbertura} />
            ) : (
              <Ingresso onAbrir={onRevelou} />
            )}
          </div>
          {extra}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** As duas abas da gaveta: a folga e o Desafio do Dia. A folga fechada chama. */
function AbasDaGaveta({ aba, setAba, folgaFechada, escuro = false }: {
  aba: Qual; setAba: (q: Qual) => void; folgaFechada: boolean; escuro?: boolean;
}) {
  const abas: { q: Qual; Icone: typeof Sun; rotulo: string }[] = [
    { q: 'folga', Icone: Sun, rotulo: 'Folga mais cedo' },
    { q: 'dia', Icone: Zap, rotulo: 'Desafio do dia' },
  ];
  return (
    <div role="tablist" aria-label="Qual desafio ver" className={escuro ? 'dc-abas' : 'inline-flex rounded-full border border-border bg-muted/50 p-0.5'}>
      {abas.map(({ q, Icone, rotulo }) => {
        const chama = q === 'folga' && folgaFechada && aba !== 'folga';
        return (
          <button
            key={q} type="button" role="tab" aria-selected={aba === q} onClick={() => setAba(q)}
            className={escuro
              ? cn('dc-aba', chama && 'dc-chamando')
              : cn(
                'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                aba === q ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                chama && 'dc-chamando',
              )}
          >
            <Icone size={13} aria-hidden /> {rotulo}
            {chama && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * O Desafio do Dia DE MENTIRA, no visual da gaveta de sempre. No Gestão aqui
 * entra o painel real (`PainelDesafioDoDia`) — isto é só para ver a troca.
 */
function PainelDoDia() {
  const a = DIA.andamento;
  const maior = Math.max(...DIA.ranking.map((r) => r.valor));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 via-card to-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Faltam</p>
        <p className="text-4xl font-bold tabular-nums text-violet-600 dark:text-violet-400">{brl(a.falta)}</p>
        <p className="mt-1 text-sm text-muted-foreground">da meta de {brl(a.meta)} · até {DIA.ate}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500" style={{ width: `${Math.min(a.progresso, 100)}%` }} />
        </div>
        <p className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{brl(a.realizado)} de {brl(a.meta)}</span><span className="font-semibold text-foreground">{Math.floor(a.progresso)}%</span>
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quem mais fez hoje</p>
        <ul className="space-y-2.5">
          {DIA.ranking.map((r, i) => (
            <li key={r.nome} className="text-sm">
              <span className="flex justify-between"><span className="font-medium">{i + 1}º {r.nome}</span><span className="tabular-nums">{brl(r.valor)}</span></span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${(r.valor / maior) * 100}%`, background: 'rgba(139, 92, 246, .75)' }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Prévia: no Gestão, aqui entra o painel real do Desafio do Dia.</p>
    </div>
  );
}

/** A 1ª vez: o ingresso fechado. Rasga ao tocar e revela o desafio. */
function Ingresso({ onAbrir }: { onAbrir: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => { botao.current?.focus(); }, []);
  function abrir() {
    if (abrindo) return;
    setAbrindo(true);
    window.setTimeout(onAbrir, 900);
  }
  const ultimo = DESAFIO.dias.length - 1;
  return (
    <div className="dc-palco">
      <div className="dc-ceu" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37 + 11) % 97}%`, top: `${(i * 23 + 7) % 80}%`, ['--i' as string]: i }} />
        ))}
      </div>
      <button ref={botao} type="button" className={`dc-ingresso${abrindo ? ' abrindo' : ''}`} onClick={abrir} aria-label="Abrir o desafio">
        <span className="dc-ingresso-corpo">
          <span className="dc-ingresso-sol" aria-hidden><Sun size={32} /></span>
          <span className="dc-ingresso-chamada">Chegou um desafio para toda a Cobrança</span>
          <span className="dc-ingresso-titulo">Folgar mais cedo</span>
          <span className="dc-ingresso-datas">
            <CalendarDays size={14} aria-hidden /> <span>{`${maiuscula(semanaCurta(DESAFIO.dias[0]))} a ${semanaCurta(DESAFIO.dias[ultimo])} · ${dataCurta(DESAFIO.dias[0])} a ${dataCurta(DESAFIO.dias[ultimo])}`}</span>
          </span>
          <span className="dc-ingresso-niveis">
            <span>Batendo <strong>{brlCurto(DESAFIO.metaGeral)}</strong> juntos, <strong>todo mundo sai às 14h</strong></span>
            <em>folga na {semana(PREMIO.dia)}, {dataCurta(PREMIO.dia)} · {PREMIO.requisito.toLowerCase()}</em>
          </span>
        </span>
        <span className="dc-ingresso-picote" aria-hidden />
        <span className="dc-ingresso-canhoto">
          <span className="dc-toque">Toque para abrir</span>
        </span>
      </button>
    </div>
  );
}

function Conteudo({ estado, meu, onVerAbertura }: { estado: Estado; meu: MetaDoOperador; onVerAbertura: () => void }) {
  const { hoje, somadoHoje, total, passados } = estado;
  const porDia = DESAFIO.dias.map((_, i) => (i < hoje ? passados[i] : i === hoje ? somadoHoje : null));
  const diasBatidos = porDia.filter((v) => v !== null && v >= DESAFIO.metaDia).length;
  const faltaHoje = Math.max(DESAFIO.metaDia - somadoHoje, 0);

  return (
    <div className="dc-conteudo">
      {/* O foco: a meta geral. */}
      <section className="dc-cartao dc-heroi dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Desafio geral">
        <RelogioDaFolga valor={total} meta={DESAFIO.metaGeral} hoje={hoje} />
        <div className="dc-heroi-texto">
          <p className="dc-rotulo">Todos os setores juntos</p>
          <p className="dc-heroi-valor">{brl(total)}</p>
          <p className="dc-heroi-meta">de {brl(DESAFIO.metaGeral)}</p>
          <Ritmo total={total} hoje={hoje} />
        </div>
      </section>

      <PremioGeral total={total} hoje={hoje} />

      <MinhaMeta meu={meu} hoje={hoje} />

      {/* A parte de hoje. */}
      <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 3 }} aria-label="A parte de hoje">
        <div className="dc-hoje-linha">
          <p className="dc-rotulo"><Target size={14} aria-hidden /> Hoje · todos juntos</p>
          <p className="dc-hoje-dias"><strong>{diasBatidos}</strong>/{DESAFIO.dias.length} dias batidos</p>
        </div>
        {faltaHoje === 0 ? (
          <p className="dc-hoje-valor ok"><Check size={22} strokeWidth={3} aria-hidden /> Parte de hoje feita!</p>
        ) : (
          <p className="dc-hoje-valor">faltam <strong>{brl(faltaHoje)}</strong></p>
        )}
        <Barra valor={somadoHoje} meta={DESAFIO.metaDia} rotulo={`${brl(somadoHoje)} de ${brl(DESAFIO.metaDia)}`} />
      </section>

      {/* Os 3 dias. */}
      <section className="dc-sobe" style={{ ['--d' as string]: 4 }} aria-labelledby="dc-dias-titulo">
        <h3 id="dc-dias-titulo" className="dc-rotulo dc-rotulo-solto">
          <CalendarDays size={14} aria-hidden /> Os {DESAFIO.dias.length} dias <span>toque para ver o detalhe</span>
        </h3>
        <ol className="dc-dias dc-dias-3">
          {DESAFIO.dias.map((d, i) => (
            <li key={d}><CartaoDia iso={d} indice={i} hoje={hoje} valor={porDia[i]} /></li>
          ))}
        </ol>
      </section>

      <button type="button" className="dc-rever" onClick={onVerAbertura}>
        <RotateCcw size={14} aria-hidden /> Ver a abertura de novo
      </button>
    </div>
  );
}

/**
 * O prêmio do desafio geral, como um ingresso: batendo a meta (R$ 1,9 mi),
 * todo mundo sai às 14h; ter banco de horas é requisito (informação extra). A regra
 * individual do operador (4,5 médias = 1 hora mais cedo) — ela não conta para
 * a meta geral e não aparece na TV.
 */
function PremioGeral({ total, hoje }: { total: number; hoje: number }) {
  const ok = total >= DESAFIO.metaGeral;
  return (
    <section className="dc-niveis dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="O prêmio">
      <div className="dc-niveis-topo">
        <p className="dc-rotulo"><Clock size={14} aria-hidden /> Folga na {semana(PREMIO.dia)}, {dataCurta(PREMIO.dia)}</p>
        <span className="dc-niveis-prazo">{diasRestantes(hoje)}</span>
      </div>
      <div className={cn('dc-nivel maior', ok && 'ok')}>
        <div className="dc-nivel-canhoto" aria-hidden>
          <span>saída</span>
          <strong>{PREMIO.hora}</strong>
        </div>
        <div className="dc-nivel-texto">
          <p className="dc-nivel-titulo">{ok ? 'Meta batida! Todo mundo sai às 14h' : 'Bateu a meta, todo mundo sai às 14h'}</p>
          <p className="dc-nivel-regra">Meta geral · {brl(DESAFIO.metaGeral)}</p>
        </div>
        <div className="dc-nivel-situacao">
          {ok ? (
            <span className="dc-nivel-ok"><Check size={16} strokeWidth={3} aria-hidden /> Garantido!</span>
          ) : (
            <>
              <span className="dc-nivel-falta-rotulo">faltam</span>
              <span className="dc-nivel-falta">{brlCurto(DESAFIO.metaGeral - total)}</span>
            </>
          )}
        </div>
      </div>
      <p className="dc-info-extra"><Info size={14} aria-hidden /> {PREMIO.requisito} para sair mais cedo.</p>
    </section>
  );
}

/**
 * A meta INDIVIDUAL de quem está olhando (16/11/2026): 4,5 médias diárias
 * dele nos dias do desafio = sai 1 hora mais cedo. A média é a do sistema
 * (recebido no mês ÷ dias úteis trabalhados), congelada na véspera — o que ele
 * faz no desafio não mexe na meta. Só ele vê; não conta para a meta geral.
 */
function MinhaMeta({ meu, hoje }: { meu: MetaDoOperador; hoje: number }) {
  const fator = REGRA_OPERADOR.medias;
  const ultimo = DESAFIO.dias.length - 1;
  if (meu.meta === null) {
    return (
      <section className="dc-minha dc-sobe" style={{ ['--d' as string]: 2 }} aria-label="Sua meta individual">
        <p className="dc-rotulo"><UserRound size={14} aria-hidden /> Sua meta individual · 1 hora mais cedo</p>
        <p className="dc-dica">Você ainda não tem média em {nomeDoMes(DESAFIO.dias[0])} (sem dia trabalhado antes do desafio), então a regra das {medias(fator)} não vale para você agora.</p>
      </section>
    );
  }
  const p = Math.min((meu.feito / meu.meta) * 100, 100);
  return (
    <section className={cn('dc-minha dc-sobe', meu.bateu && 'ok')} style={{ ['--d' as string]: 2 }} aria-label="Sua meta individual">
      <div className="dc-hoje-linha">
        <p className="dc-rotulo"><UserRound size={14} aria-hidden /> Sua meta individual · 1 hora mais cedo</p>
        <span className="dc-minha-selo">só você vê</span>
      </div>

      <p className="dc-minha-media">
        Sua média diária: <strong>{brl(meu.mediaDiaria)}</strong>
        <span>({brl(EU.recebidoAntes)} recebidos em {nomeDoMes(DESAFIO.dias[0])} ÷ {diasDaBase} dias úteis, até {dataCurta(vesperaUtil())})</span>
      </p>

      <div className="dc-minha-placar">
        <p className="dc-minha-feito">
          {meu.bateu ? <Check size={22} strokeWidth={3} aria-hidden /> : null}
          <strong>{medias(meu.medias)}</strong> de {medias(fator)}
        </p>
        <p className="dc-minha-valores">{brl(meu.feito)} de {brl(meu.meta)}</p>
      </div>

      {/* A régua: uma marca por média, até as 4,5. */}
      <div className="dc-minha-regua" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(p)}
        aria-label={`Você fez ${medias(meu.medias)} de ${medias(fator)}`}>
        <div className="dc-minha-cheia" style={{ width: `${p}%` }} />
        {Array.from({ length: Math.floor(fator) }, (_, i) => (
          <span key={i} className="dc-minha-marca" style={{ left: `${((i + 1) / fator) * 100}%` }} aria-hidden>
            <em>{i + 1}</em>
          </span>
        ))}
      </div>

      <p className={cn('dc-minha-status', meu.bateu && 'ok')}>
        {meu.bateu
          ? 'Bateu! Você sai 1 hora mais cedo.'
          : meu.porDia !== null
            ? <>Faltam <strong>{brl(meu.falta ?? 0)}</strong> — {meu.diasRestantes > 1 ? <><strong>{brl(meu.porDia)}</strong> por dia até {semana(DESAFIO.dias[ultimo])}</> : <>tudo <strong>hoje</strong>, o último dia</>}.</>
            : 'O desafio acabou.'}
      </p>

      <ol className="dc-minha-dias" aria-label="Seus dias no desafio">
        {DESAFIO.dias.map((d, i) => (
          <li key={d} className={cn(i === hoje && 'hoje', i > hoje && 'depois')}>
            <span>{semanaCurta(d)}</span>
            <strong>{i > hoje ? '—' : reais(i < hoje ? EU.passados[i] : meu.feito - EU.passados.slice(0, hoje).reduce((s, v) => s + v, 0))}</strong>
          </li>
        ))}
      </ol>

      <p className="dc-minha-nota">
        A média é a de antes do desafio: o que você faz agora não muda a sua meta. Não conta para a meta geral.
        {' '}{PREMIO.requisito}.
      </p>
    </section>
  );
}

/** «R$ 9.400» — sem centavos, para caber no quadradinho do dia. */
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
/** «novembro». */
const nomeDoMes = (iso: string) => diaLocal(iso).toLocaleDateString('pt-BR', { month: 'long' });
/** O último dia útil antes do desafio (a média vai até ele). */
function vesperaUtil(): string {
  const d = diaLocal(DESAFIO.dias[0]);
  do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Os dias úteis da base da média (antes do desafio, sem os feriados). */
const diasDaBase = diasUteisAntesDoDesafio(DESAFIO.dias[0], EU.feriados);

/** Onde o ponteiro está em relação ao ponto do fim de hoje — sem falar em «atraso». */
function Ritmo({ total, hoje }: { total: number; hoje: number }) {
  const alvo = esperadoAteODia(hoje);
  const pAlvo = pct(alvo, DESAFIO.metaGeral);
  const falta = Math.max(alvo - total, 0);
  const emDia = falta === 0;
  return (
    <div className={`dc-ritmo${emDia ? ' em-dia' : ''}`}>
      <p className="dc-ritmo-titulo">
        {emDia ? <Check size={16} strokeWidth={3} aria-hidden /> : <Clock size={16} aria-hidden />}
        {emDia ? `No ponto de hoje (${pAlvo}%)${total > alvo ? ' e adiantado!' : '!'}` : `Ponto de hoje: ${pAlvo}%`}
      </p>
      <p className="dc-ritmo-texto">
        {emDia
          ? (total > alvo ? `${brl(total - alvo)} à frente.` : 'Bora adiantar amanhã!')
          : `Faltam ${brl(falta)} para chegar.`}
      </p>
    </div>
  );
}

/**
 * O relógio: o sol anda pelo anel conforme todos somam. O anel tem os 3 dias
 * (um terço cada) e as duas marcas dos prêmios — «1h» em 4,5 médias e «14h»
 * no fim (5 médias). A marca tracejada é o ponto do fim de hoje.
 */
function RelogioDaFolga({ valor, meta, hoje }: { valor: number; meta: number; hoje: number }) {
  const p = pct(valor, meta);
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setMostrado(p), 150);
    return () => window.clearTimeout(t);
  }, [p]);
  const r = 96;
  const volta = 2 * Math.PI * r;
  const alvo = Math.min(esperadoAteODia(hoje) / meta, 1) * 2 * Math.PI;
  return (
    <div className="dc-relogio" role="img" aria-label={`${p}% da meta de todos os setores: ${brl(valor)} de ${brl(meta)}`}>
      <svg viewBox="0 0 240 240" aria-hidden>
        <defs>
          <linearGradient id="dc-anel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--dc-ouro)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--dc-coral)' }} />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={r} className="dc-relogio-fundo" />
        <circle
          cx="120" cy="120" r={r} className="dc-relogio-anel"
          strokeDasharray={volta} strokeDashoffset={volta * (1 - mostrado / 100)}
          transform="rotate(-90 120 120)"
        />
        {DESAFIO.dias.map((d, i) => {
          const a = (i / DESAFIO.dias.length) * 2 * Math.PI;
          const meio = ((i + 0.5) / DESAFIO.dias.length) * 2 * Math.PI;
          return (
            <g key={d}>
              <line
                x1={120 + Math.sin(a) * 82} y1={120 - Math.cos(a) * 82}
                x2={120 + Math.sin(a) * 110} y2={120 - Math.cos(a) * 110}
                className="dc-marca"
              />
              <text
                x={120 + Math.sin(meio) * 64} y={120 - Math.cos(meio) * 64 + 5}
                className={`dc-marca-dia${i === hoje ? ' hoje' : ''}`} textAnchor="middle"
              >
                {semanaCurta(d)}
              </text>
            </g>
          );
        })}
        {/* O prêmio no anel: a volta inteira é a meta geral, a saída às 14h. */}
        <text x={120 + 14} y={120 - 116} className="dc-marca-premio-txt" textAnchor="start">14h</text>
        <line
          x1={120 + Math.sin(alvo) * 84} y1={120 - Math.cos(alvo) * 84}
          x2={120 + Math.sin(alvo) * 112} y2={120 - Math.cos(alvo) * 112}
          className="dc-marca-alvo"
        />
        <g className="dc-ponteiro" style={{ transform: `rotate(${(mostrado / 100) * 360}deg)` }}>
          <circle cx="120" cy={120 - r} r="14" className="dc-sol-halo" />
          <circle cx="120" cy={120 - r} r="9" className="dc-sol" />
        </g>
      </svg>
      <div className="dc-relogio-centro">
        <span className="dc-relogio-pct">{p}%</span>
      </div>
    </div>
  );
}

function Barra({ valor, meta, rotulo }: { valor: number; meta: number; rotulo: string }) {
  const p = pct(valor, meta);
  return (
    <div className="dc-barra-caixa">
      <div className="dc-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`Hoje: ${rotulo}`}>
        <div className="dc-barra-cheia" style={{ width: `${p}%` }} />
      </div>
      <p className="dc-barra-texto"><span>{rotulo}</span><strong>{p}%</strong></p>
    </div>
  );
}

type EstadoDia = 'batido' | 'nao' | 'hoje' | 'hoje-batido' | 'futuro';

/** Cada dia vira (como uma carta) para mostrar o detalhe. */
function CartaoDia({ iso, indice, hoje, valor }: { iso: string; indice: number; hoje: number; valor: number | null }) {
  const [virado, setVirado] = useState(false);
  const estado: EstadoDia = indice > hoje ? 'futuro'
    : indice === hoje ? ((valor ?? 0) >= DESAFIO.metaDia ? 'hoje-batido' : 'hoje')
      : (valor ?? 0) >= DESAFIO.metaDia ? 'batido' : 'nao';

  const Icone = estado === 'batido' || estado === 'hoje-batido' ? Check : estado === 'nao' ? X : estado === 'hoje' ? Hourglass : Lock;
  const legenda = { batido: 'Batida', 'hoje-batido': 'Batida', hoje: 'Hoje', nao: 'Não bateu', futuro: 'Em breve' }[estado];
  const legendaLonga = {
    batido: 'meta batida', 'hoje-batido': 'hoje, meta batida', hoje: 'hoje, em andamento', nao: 'não bateu', futuro: 'ainda vai chegar',
  }[estado];
  const falta = Math.max(DESAFIO.metaDia - (valor ?? 0), 0);

  return (
    <button
      type="button" className={`dc-dia ${estado}${virado ? ' virado' : ''}`}
      onClick={() => setVirado((v) => !v)} aria-pressed={virado}
      aria-label={`${semana(iso)}, ${dataCurta(iso)}: ${legendaLonga}${valor !== null ? `, ${brl(valor)}` : ''}. Toque para ${virado ? 'voltar' : 'ver o detalhe'}.`}
    >
      <span className="dc-dia-interno">
        <span className="dc-dia-frente">
          <span className="dc-dia-semana">{semanaCurta(iso)}</span>
          <span className="dc-dia-data">{dataCurta(iso)}</span>
          <span className="dc-dia-icone" aria-hidden><Icone size={18} strokeWidth={2.8} /></span>
          <span className="dc-dia-legenda">{legenda}</span>
        </span>
        <span className="dc-dia-verso">
          {estado === 'futuro' ? (
            <>
              <span className="dc-dia-verso-titulo">Meta</span>
              <span className="dc-dia-verso-valor">{brlCurto(DESAFIO.metaDia)}</span>
              <span className="dc-dia-verso-texto">abre {semanaCurta(iso)}</span>
            </>
          ) : (
            <>
              <span className="dc-dia-verso-titulo">Fizemos</span>
              <span className="dc-dia-verso-valor">{brlCurto(valor ?? 0)}</span>
              <span className="dc-dia-verso-texto">
                {falta === 0 ? `+${brlCurto((valor ?? 0) - DESAFIO.metaDia)}` : `faltam ${brlCurto(falta)}`}
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

// ── 3. A configuração: quem soma e quem vê ───────────────────────────────────

/**
 * Por setor, duas chaves separadas: «Soma no recebimento» (o dinheiro do
 * setor entra na meta) e «Vê o desafio» (a equipe tem a pílula e a gaveta).
 * Marília começa somando e sem ver; ligar o «vê» depois não muda a conta.
 */
function Configuracao({ config, setConfig }: { config: ConfigSetor[]; setConfig: (c: ConfigSetor[]) => void }) {
  const mudar = (id: string, campo: 'soma' | 've', v: boolean) =>
    setConfig(config.map((c) => (c.id === id ? { ...c, [campo]: v } : c)));
  const fracao = fracaoQueSoma(config);
  const somam = config.filter((c) => c.soma).length;
  const veem = config.filter((c) => c.ve).length;
  const ultimo = DESAFIO.dias.length - 1;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Configurar desafio</p>
        <h1 className="mt-1 text-2xl font-bold">{DESAFIO.titulo} {DESAFIO.subtitulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">No Gestão, isto mora na aba Desafios. Aqui é só o modelo — nada é gravado.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Período</p>
          <p className="mt-1 text-lg font-semibold">{maiuscula(semana(DESAFIO.dias[0]))} a {semana(DESAFIO.dias[ultimo])}</p>
          <p className="text-sm text-muted-foreground">{dataCurta(DESAFIO.dias[0])} a {dataCurta(DESAFIO.dias[ultimo])} · {DESAFIO.dias.length} dias</p>
          <p className="mt-2 text-sm">Folga na <strong>{semana(PREMIO.dia)}, {dataCurta(PREMIO.dia)}</strong>.</p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" aria-hidden /> {PREMIO.requisito}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prêmio</p>
          <p className="mt-1 text-sm">
            <strong>Meta geral {brl(DESAFIO.metaGeral)}</strong> → todo mundo sai às {PREMIO.hora}.
          </p>
          <p className="mt-2 border-t border-border pt-2 text-sm text-muted-foreground">
            <strong className="text-foreground">Individual:</strong> operador com {medias(REGRA_OPERADOR.medias)} dele {REGRA_OPERADOR.premio}.
            Fica fora da meta geral e da TV.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <p className="font-semibold">Setores</p>
          <p className="text-sm text-muted-foreground">
            «Soma» põe o recebimento do setor na meta. «Vê» mostra o desafio para a equipe. São separados: um setor pode somar sem ver.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Setor</th>
                <th className="px-2 py-2 font-semibold">Cidade</th>
                <th className="px-2 py-2 text-center font-semibold">Soma no recebimento</th>
                <th className="px-4 py-2 text-center font-semibold">Vê o desafio</th>
              </tr>
            </thead>
            <tbody>
              {SETORES.map((s) => {
                const c = config.find((x) => x.id === s.id)!;
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      {s.nome}
                      {c.soma && !c.ve && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <EyeOff className="h-3 w-3" aria-hidden /> soma sem ver
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">{s.cidade}</td>
                    <td className="px-2 py-3 text-center">
                      <Switch checked={c.soma} onCheckedChange={(v) => mudar(s.id, 'soma', v)} aria-label={`${s.nome}: soma no recebimento`} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={c.ve} onCheckedChange={(v) => mudar(s.id, 've', v)} aria-label={`${s.nome}: vê o desafio`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border p-4 text-sm">
          <span><strong>{somam}</strong> {somam === 1 ? 'setor soma' : 'setores somam'} · {Math.round(fracao * 100)}% do recebimento</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4 text-muted-foreground" aria-hidden /> <strong>{veem}</strong> {veem === 1 ? 'vê' : 'veem'} o desafio</span>
        </div>
      </section>
    </main>
  );
}

// ── O painel de teste (só no modelo) ─────────────────────────────────────────

function PainelTeste(p: {
  aberto: boolean; setAberto: (v: boolean) => void;
  hoje: number; setHoje: (n: number) => void;
  somadoHoje: number; setSomadoHoje: (n: number) => void; estado: Estado;
  meuHoje: number; setMeuHoje: (n: number) => void; meu: MetaDoOperador;
  escuro: boolean; setEscuro: (v: boolean) => void;
  temDia: boolean; setTemDia: (v: boolean) => void; jaRevelou: boolean; onFechar: () => void;
  verComo: VerComo; setVerComo: (v: VerComo) => void; folgaVisivel: boolean;
}) {
  const { aberto, setAberto } = p;
  return (
    <aside className="dc-teste" aria-label="Painel de teste do modelo">
      {aberto && (
        <div className="dc-teste-corpo">
          <p className="dc-teste-titulo">Simular (não grava nada)</p>
          <label>
            Que dia é hoje
            <select value={p.hoje} onChange={(e) => p.setHoje(Number(e.target.value))}>
              {DESAFIO.dias.map((d, i) => <option key={d} value={i}>{semana(d)}, {dataCurta(d)}</option>)}
            </select>
          </label>
          <label>
            Recebido hoje (todos os setores): <strong>{brl(p.somadoHoje)}</strong>
            <input type="range" min={0} max={1_200_000} step={5000} value={p.somadoHoje} onChange={(e) => p.setSomadoHoje(Number(e.target.value))} />
          </label>
          <p className="dc-teste-total">
            Conta no desafio: <strong>{brl(p.estado.total)}</strong> de {brl(DESAFIO.metaGeral)}
          </p>
          <label>
            Eu ({EU.nome.split(' ')[0]}) recebi hoje: <strong>{brl(p.meuHoje)}</strong>
            <input type="range" min={0} max={30_000} step={100} value={p.meuHoje} onChange={(e) => p.setMeuHoje(Number(e.target.value))} />
          </label>
          <p className="dc-teste-total">
            Minha meta: {brl(p.meu.meta ?? 0)} · fiz {medias(p.meu.medias)}{p.meu.bateu ? ' · bateu!' : ''}
          </p>
          <label>
            Ver o Gestão como
            <select value={p.verComo} onChange={(e) => p.setVerComo(e.target.value as VerComo)}>
              <option value="play2">Pessoa de Birigui (Play 2)</option>
              <option value="marilia">Pessoa de Marília</option>
            </select>
          </label>
          {!p.folgaVisivel && <p className="dc-teste-nota">Este setor soma, mas não vê o desafio: sem pílula da folga.</p>}
          <label className="dc-teste-check">
            <input type="checkbox" checked={p.temDia} onChange={(e) => p.setTemDia(e.target.checked)} />
            <Zap size={14} aria-hidden /> Hoje também tem Desafio do Dia
          </label>
          <button type="button" className="dc-teste-acao" onClick={p.onFechar} disabled={!p.jaRevelou}>
            {p.jaRevelou ? 'Voltar a «ainda não abriu a folga» (pisca)' : 'A folga ainda não foi aberta (piscando)'}
          </button>
          <label className="dc-teste-check">
            <input type="checkbox" checked={p.escuro} onChange={(e) => p.setEscuro(e.target.checked)} />
            <Moon size={14} aria-hidden /> Gestão no tema escuro
          </label>
          <p className="dc-teste-nota">
            Os dias que já passaram e os valores por setor são fictícios.
          </p>
        </div>
      )}
      <button type="button" className="dc-teste-botao" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <FlaskConical size={16} aria-hidden /> {aberto ? 'Fechar teste' : 'Testar'}
      </button>
    </aside>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>);
