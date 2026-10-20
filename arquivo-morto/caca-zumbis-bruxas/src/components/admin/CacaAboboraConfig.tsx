/**
 * CacaAboboraConfig.tsx — liga e desliga a Caça aos Zumbis, e mostra o dia.
 * (Até 07/10/2026, Caça à Abóbora; o nome do arquivo e do banco ficou.)
 *
 * Só para o super_admin, em Configurações → Geral (as funções do banco
 * conferem de novo). Ligada, a caça vale SÓ PARA HOJE: na virada da
 * meia-noite desliga sozinha, e amanhã é preciso ligar de novo — decisão do
 * Cleber, 05/10/2026.
 *
 * O painel responde «e aí, o zumbi apareceu?»: a próxima hora marcada, o que
 * está na tela, qual zumbi saiu, quem matou cada um, em quanto tempo, com ou
 * sem headshot, e os dois recordes do dia. Ver as migrations 20261005120000 e
 * 20261007200000 e `CacaAbobora/caca.ts`.
 *
 * Embaixo, o CHEFÃO (09/10/2026): o Rei do Pop zumbi, que todo mundo derruba
 * junto. O super_admin escolhe a vida e solta; ele fica 2 min na tela. Ver
 * `CacaAbobora/chefao.ts` e a migration 20261009120000. E quem parece estar
 * atirando de autoclick (`CacaAbobora/autoclick.ts`): só aqui, só para ele.
 *
 * Os dois temas são separados (Cleber, 14/10/2026): com bruxas, o cartão
 * mostra as bruxas (desenho, cores, palavras) e o chefão some — o Rei do Pop
 * é do tema zumbi. No lugar dele, a CHEFONA (15/10/2026): a Bruxa do Pântano,
 * solta do mesmo jeito (`CacaAbobora/bruxas/chefona/banco.ts`, migration
 * 20261015230000). Um chefe de cada vez: o botão de um espera o outro sair.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Crosshair, Loader2, Music2, RefreshCw, Skull, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { SpriteZumbi } from '@/components/CacaAbobora/SpriteZumbi';
import { ZUMBIS, zumbiDaRodada } from '@/components/CacaAbobora/zumbis';
import {
  formatarTempo, lerPainelCaca, ligarCaca, mudarTemaCaca, nomeCurto, soltarAboboraAgora, useCacaAbobora,
  type PainelCaca, type RodadaAbobora, type TemaCaca,
} from '@/components/CacaAbobora/caca';
import { BRUXAS, bruxaDaRodada } from '@/components/CacaAbobora/bruxas/arte';
import { SpriteBruxa } from '@/components/CacaAbobora/bruxas/SpriteBruxa';
import { CHEFAO } from '@/components/CacaAbobora/chefaoArte';
import {
  DIFICULDADES, ESPERA_S, PRAZO_MIN, chefaoChegando, chefaoNaTela, lerSuspeitos, soltarChefao, useChefao, vidaCom,
  type RodadaChefao,
} from '@/components/CacaAbobora/chefao';
import { ordenarFichas, type Avaliacao, type FichaDeCliques, type Nivel } from '@/components/CacaAbobora/autoclick';
import {
  DIFICULDADES_CHEFONA, ESPERA_S as ESPERA_CHEFONA_S, PRAZO_MIN as PRAZO_CHEFONA_MIN, chefonaChegando, chefonaNaTela,
  ensaioAdiantarChefona, ensaioArrancarChefona, ensaioFugirChefona, ensaioIrParaChefona, ensaioLimparChefona, ensaioPularContagemChefona, ensaioRobosChefona,
  ensaioSoltarChefona, lerSuspeitosChefona, motivoDoErroDaChefona, soltarChefona, useChefona,
} from '@/components/CacaAbobora/bruxas/chefona/banco';
import { cabecaMC } from '@/components/CacaAbobora/bruxas/chefona/arte';
import { PONTO_DA_BRUXA_S } from '@/components/CacaAbobora/bruxas/chefona/lobby/trilha';
import { canvasDaImagem } from '@/components/CacaAbobora/bruxas/pixels';
import { cn } from '@/lib/utils';

const FUSO = 'America/Sao_Paulo';
const hora = (iso: string | null | undefined) => (iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  : '—');
const diaCurto = (isoDia: string | null | undefined) => (isoDia ? `${isoDia.slice(8, 10)}/${isoDia.slice(5, 7)}` : '—');

/** Releitura enquanto o cartão está aberto: o cron marca o próximo sozinho. */
const RELER_MS = 20_000;

const ETIQUETA = 'inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold';

/** As palavras de cada tema, para o cartão falar do que está valendo. */
const PALAVRAS: Record<TemaCaca, { titulo: string; um: string; Um: string; emoji: string; voltou: string }> = {
  zumbis: { titulo: 'Caça aos Zumbis', um: 'um zumbi', Um: 'Zumbi', emoji: '🧟', voltou: 'voltou para a cova' },
  bruxas: { titulo: 'Caça às Bruxas', um: 'uma bruxa', Um: 'Bruxa', emoji: '🧙', voltou: 'foi embora rindo' },
};

function LinhaRodada({ r }: { r: RodadaAbobora }) {
  const zumbi = zumbiDaRodada(r);
  const bruxa = r.tema === 'bruxas' ? bruxaDaRodada(r) : null;
  return (
    <li className="flex items-center gap-3 py-2 text-xs">
      <span className="w-11 shrink-0 font-mono tabular-nums text-muted-foreground">{hora(r.solta_em)}</span>
      {bruxa ? (
        <span className="flex w-32 shrink-0 items-center gap-1.5 text-violet-700 dark:text-violet-300" title={bruxa.nome}>
          <SpriteBruxa bruxa={bruxa} soCabeca morta={r.situacao === 'achada' && !bruxa.fofa} className="shrink-0" />
          <span className="truncate">{bruxa.nome.replace(/^(o|a) /, '')}</span>
        </span>
      ) : (
        <SpriteZumbi zumbi={zumbi} soCabeca morta={r.situacao === 'achada'} escala={1} titulo={zumbi.nome} className="shrink-0" />
      )}
      {r.situacao === 'solta' && (
        <span className="flex items-center gap-1.5 font-medium text-lime-700 dark:text-lime-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-500" />
          </span>
          Na tela agora — {bruxa ? 'vai embora' : 'volta para a cova'} às {hora(r.expira_em)} se ninguém {bruxa ? 'acertar' : 'matar'}
        </span>
      )}
      {r.situacao === 'achada' && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {r.achada_por_foto
            ? <img src={r.achada_por_foto} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            : null}
          <span className="truncate font-medium text-foreground">{r.achada_por_nome}</span>
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatarTempo(r.ms)}</span>
          {r.headshot && (
            <span className={cn(ETIQUETA, 'bg-red-600 text-white')}>
              <Crosshair className="h-2.5 w-2.5" /> HEADSHOT
            </span>
          )}
          {r.mais_rapida_do_dia && (
            <span className={cn(ETIQUETA, 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}>
              <Zap className="h-2.5 w-2.5" /> mais rápido
            </span>
          )}
          {r.headshot_mais_rapido_do_dia && (
            <span className={cn(ETIQUETA, 'bg-red-500/15 text-red-700 dark:text-red-400')}>
              <Crosshair className="h-2.5 w-2.5" /> headshot mais rápido
            </span>
          )}
          {r.tiro === 'vassoura' && (
            <span className={cn(ETIQUETA, 'bg-orange-500/15 text-orange-700 dark:text-orange-400')}>VASSOURADA</span>
          )}
          {r.dobrado && (
            <span className={cn(ETIQUETA, 'bg-red-700 text-amber-300')}>2x · derrubou e finalizou</span>
          )}
          {r.finalizada_por && !r.dobrado && (
            <span className="shrink-0 text-muted-foreground">finalizada por {nomeCurto(r.finalizada_por_nome)}</span>
          )}
        </span>
      )}
      {r.situacao === 'sumiu' && (
        <span className="text-muted-foreground">Ninguém acertou — {PALAVRAS[r.tema].voltou}</span>
      )}
      {r.origem === 'teste' && (
        <span className="ml-auto shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground">na mão</span>
      )}
    </li>
  );
}

function Recorde({ titulo, r, icone }: { titulo: string; r: RodadaAbobora | null; icone: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border px-2 py-2">
      <p className="truncate text-sm font-bold tabular-nums">{r ? formatarTempo(r.ms) : '—'}</p>
      <p className="flex items-center justify-center gap-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {icone}{r ? `${titulo} · ${r.achada_por_nome?.split(' ')[0] ?? ''}` : titulo}
      </p>
    </div>
  );
}

/**
 * A vida do chefão cresce com quem entra na caçada (`DIFICULDADES` em
 * `chefao.ts`, onde está a conta). O cartão mostra o que dá com 10, 30 e 60
 * pessoas, para o admin ter uma ideia antes de soltar.
 */
const EXEMPLOS_DE_PESSOAS = [10, 30, 60] as const;
/** Quanto ele fica depois de chegar (`PRAZO_MIN` em `chefao.ts`, onde está a conta da vida). */
const MINUTOS_DO_CHEFAO = PRAZO_MIN;

/** Com ele na tela, a lista se atualiza sozinha a cada tanto. */
const RELER_SUSPEITOS_MS = 15_000;

const COR_DO_NIVEL: Readonly<Record<Nivel, string>> = {
  suspeito: 'bg-red-600 text-white',
  atencao: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  limpo: 'bg-muted text-muted-foreground',
};
const NOME_DO_NIVEL: Readonly<Record<Nivel, string>> = { suspeito: 'suspeito', atencao: 'pista', limpo: 'ok' };

/**
 * Quem parece estar atirando de autoclick no chefão (pedido de 09/10/2026).
 * É pista, não prova: o selo diz o porquê, e a decisão é do super_admin.
 */
function SuspeitosDoChefao({ rodada, ativo, lerFichas = lerSuspeitos, semMigration = /fn_chefao_suspeitos|PGRST202|schema cache/, migration = '20261009120000' }: {
  rodada: Pick<RodadaChefao, 'id'>;
  ativo: boolean;
  /** De qual chefe: o Rei do Pop (padrão) ou a chefona das bruxas. */
  lerFichas?: (id: number) => Promise<{ fichas: FichaDeCliques[]; erro: string | null }>;
  semMigration?: RegExp;
  migration?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [lista, setLista] = useState<{ ficha: FichaDeCliques; avaliacao: Avaliacao }[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ler = useCallback(async () => {
    setLendo(true);
    const r = await lerFichas(rodada.id);
    setLendo(false);
    setErro(r.erro);
    if (!r.erro) setLista(ordenarFichas(r.fichas));
  }, [rodada.id, lerFichas]);

  useEffect(() => { setLista(null); setErro(null); }, [rodada.id]);
  useEffect(() => {
    if (!aberto) return;
    void ler();
    if (!ativo) return;
    const t = setInterval(() => { void ler(); }, RELER_SUSPEITOS_MS);
    return () => clearInterval(t);
  }, [aberto, ativo, ler]);

  if (!aberto) {
    return (
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => setAberto(true)}>
        <Bot className="h-3.5 w-3.5" /> Quem parece autoclick?
      </Button>
    );
  }
  const suspeitos = lista?.filter(l => l.avaliacao.nivel === 'suspeito').length ?? 0;
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-[11px] font-semibold">
          Autoclick{lista ? ` — ${suspeitos === 0 ? 'ninguém suspeito' : suspeitos === 1 ? '1 suspeito' : `${suspeitos} suspeitos`} de ${lista.length}` : ''}
        </p>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={lendo} onClick={() => { void ler(); }} aria-label="Atualizar">
          <RefreshCw className={cn('h-3 w-3', lendo && 'animate-spin')} />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setAberto(false)}>Fechar</Button>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        Pista, não prova. Suspeito = ritmo de máquina, rápido demais ou clique por script em 3+ lotes, ou metade dos
        lotes no teto de 12 acertos. Ninguém perde dano sozinho.
      </p>
      {erro && (
        <p className="mt-1 text-[11px] text-red-600">
          {semMigration.test(erro) ? `O banco ainda não tem a lista (migration ${migration}).` : erro}
        </p>
      )}
      {lista && lista.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">Ninguém atirou ainda.</p>}
      {lista && lista.length > 0 && (
        <ul className="mt-1 max-h-56 divide-y divide-border overflow-y-auto">
          {lista.map(({ ficha, avaliacao }) => (
            <li key={ficha.usuario} className="flex items-center gap-2 py-1 text-[11px]">
              <span className={cn(ETIQUETA, 'w-16 justify-center', COR_DO_NIVEL[avaliacao.nivel])}>{NOME_DO_NIVEL[avaliacao.nivel]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{ficha.nome}</span>
                {avaliacao.motivos.length > 0 && (
                  <span className="block truncate text-[10px] text-muted-foreground">{avaliacao.motivos.join(' · ')}</span>
                )}
              </span>
              <span className="shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {avaliacao.cps.toFixed(1)} cliques/s<br />{ficha.dano} de dano
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O chefão: escolher a vida, soltar, e o resultado do último. */
function SecaoChefao() {
  const chefao = useChefao();
  const [nivel, setNivel] = useState(1);
  const dificuldade = DIFICULDADES[nivel];
  const [confirmando, setConfirmando] = useState(false);
  const [soltando, setSoltando] = useState(false);
  const ativo = chefaoNaTela(chefao, Date.now()) && (chefao?.id ?? 0) > 0;
  const ultimo = chefao && chefao.id > 0 ? chefao : null;
  // Dois chefes ao mesmo tempo, não: com a chefona das bruxas na tela, ele espera.
  const chefona = useChefona();
  const bruxaNaTela = chefonaNaTela(chefona, Date.now()) && (chefona?.id ?? 0) > 0;

  async function soltar() {
    setSoltando(true);
    const { erro } = await soltarChefao(dificuldade, MINUTOS_DO_CHEFAO);
    setSoltando(false);
    setConfirmando(false);
    if (erro) {
      toast.error('Não deu para soltar o chefão', {
        description: erro.includes('JA_TEM_UM')
          ? 'Ele já está na tela.'
          : /fn_chefao_soltar|PGRST202|schema cache/.test(erro)
            ? 'O banco ainda não tem o chefão (migration 20261009120000).'
            : erro,
      });
      return;
    }
    toast.success('Contagem começou 🕺', { description: `O Rei do Pop zumbi chega em ${ESPERA_S / 60} minuto na tela de todo mundo, e dança por ${MINUTOS_DO_CHEFAO} minutos.` });
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-start gap-3">
        <SpriteZumbi zumbi={CHEFAO} animado escala={1} className="shrink-0" titulo={CHEFAO.nome} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Chefão: o Rei do Pop zumbi</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Antes, 1 minuto de contagem na tela de todos. Depois, todo mundo atira junto na mesma vida. Ele
            dança, anda pela tela e desvia dos tiros. Fica {MINUTOS_DO_CHEFAO} minutos; se ninguém derrubar, foge
            no moonwalk. No fim, um ranking de quem
            mais tirou vida e de quem deu o golpe final.
          </p>
          {ultimo && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ativo && chefaoChegando(ultimo, Date.now())
                ? <span className="font-medium text-amber-600 dark:text-amber-400">Contagem na tela: ele chega às {hora(ultimo.solta_em)}.</span>
                : ativo
                ? <span className="font-medium text-pink-600 dark:text-pink-400">Na tela agora: {ultimo.vida} de {ultimo.vida_max} de vida, {ultimo.participantes} na caçada.</span>
                : ultimo.situacao === 'derrotado'
                  ? <>O último caiu às {hora(ultimo.derrotado_em)}: golpe final de {ultimo.golpe_final_nome}, {ultimo.participantes} ajudaram{ultimo.ranking[0] ? ` — quem mais tirou foi ${ultimo.ranking[0].nome} (${ultimo.ranking[0].dano})` : ''}.</>
                  : <>O último fugiu às {hora(ultimo.expira_em)} com {ultimo.vida} de vida.</>}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label="Vida do chefão">
          {DIFICULDADES.map((d, i) => (
            <button
              key={d.nome}
              type="button"
              role="radio"
              aria-checked={nivel === i}
              onClick={() => setNivel(i)}
              title={`Começa com ${d.base} e ganha +${d.porPessoa} a cada pessoa que entra`}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] transition-colors',
                nivel === i ? 'border-pink-500 bg-pink-500/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {d.nome} <span className="tabular-nums opacity-70">+{d.porPessoa}/pessoa</span>
            </button>
          ))}
        </div>
        <Button
          size="sm" variant="outline" className="gap-1.5"
          disabled={ativo || bruxaNaTela || soltando}
          title={bruxaNaTela ? 'A Bruxa do Pântano está na tela: espere ela cair ou fugir' : undefined}
          onClick={() => setConfirmando(true)}
        >
          <Music2 className="h-3.5 w-3.5" /> Soltar o chefão
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A vida cresce com quem entra na caçada: começa em <b className="tabular-nums">{dificuldade.base}</b> e
        ganha <b className="tabular-nums">+{dificuldade.porPessoa}</b> a cada pessoa que acerta o primeiro tiro.
        {' '}{EXEMPLOS_DE_PESSOAS.map((n, i) => (
          <span key={n} className="tabular-nums">{i > 0 ? ' · ' : ''}{n} pessoas → {vidaCom(dificuldade, n).toLocaleString('pt-BR')}</span>
        ))}
      </p>
      {/* A lista de autoclick: do chefão de agora ou do último (também do ensaio, no localhost). */}
      {chefao && <SuspeitosDoChefao rodada={chefao} ativo={chefaoNaTela(chefao, Date.now())} />}

      <AlertDialog open={confirmando} onOpenChange={v => !soltando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soltar o Rei do Pop zumbi?</AlertDialogTitle>
            <AlertDialogDescription>
              Começa agora uma contagem de 1 minuto na tela de todo mundo que está logado, nas duas
              empresas. Depois ele aparece com {dificuldade.base} de vida (+{dificuldade.porPessoa} a cada pessoa que entrar na caçada), dançando por {MINUTOS_DO_CHEFAO} minutos. Os tiros de todos tiram da mesma vida; no fim aparece
              o ranking. Ele não depende da caça estar ligada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={soltando}>Agora não</AlertDialogCancel>
            <AlertDialogAction disabled={soltando} onClick={e => { e.preventDefault(); void soltar(); }}>
              {soltando ? 'Soltando…' : 'Soltar o chefão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * A chefona das bruxas (15/10/2026): a Bruxa do Pântano, solta como o Rei do
 * Pop. Escolher a vida, soltar, e o resultado da última. A Poção de Cura e o
 * Totem são botões no placar dela, na tela, só para o super_admin. Ver
 * `CacaAbobora/bruxas/chefona/banco.ts` e a migration 20261015230000.
 */
function SecaoChefona() {
  const chefona = useChefona();
  const chefao = useChefao();
  const [nivel, setNivel] = useState(1);
  const dificuldade = DIFICULDADES_CHEFONA[nivel];
  const [confirmando, setConfirmando] = useState(false);
  const [soltando, setSoltando] = useState(false);
  const ativa = chefonaNaTela(chefona, Date.now()) && (chefona?.id ?? 0) > 0;
  const ultima = chefona && chefona.id > 0 ? chefona : null;
  // Dois chefes ao mesmo tempo, não (o banco também recusa).
  const reiNaTela = chefaoNaTela(chefao, Date.now()) && (chefao?.id ?? 0) > 0;

  async function soltar() {
    setSoltando(true);
    const { erro } = await soltarChefona(dificuldade);
    setSoltando(false);
    setConfirmando(false);
    if (erro) {
      toast.error('Não deu para soltar a chefona', { description: motivoDoErroDaChefona(erro) });
      return;
    }
    toast.success('Lobby aberto 🧙', { description: `O convite chegou na tela de todo mundo. A Bruxa do Pântano chega em ${ESPERA_CHEFONA_S / 60} minutos para quem entrar no lobby, e fica ${PRAZO_CHEFONA_MIN} minutos.` });
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-start gap-3">
        <CabecaDaChefona />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Chefona: a Bruxa do Pântano</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            A bruxa do Minecraft. Antes, 1 minuto de contagem na tela de todos. Depois, todo mundo atira junto na
            mesma vida: cabeça é crítico, e quem bate enquanto ela prepara a poção tira mais e pode quebrar a
            garrafa. Ela voa, desvia e joga poção na tela (só visual: nada muda nos dados). Fica {PRAZO_CHEFONA_MIN} minutos;
            se ninguém derrubar, ela foge. No fim, o ranking. Na tela, você tem os botões da Poção de Cura e do Totem.
          </p>
          {ultima && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ativa && chefonaChegando(ultima, Date.now())
                ? <span className="font-medium text-amber-600 dark:text-amber-400">Contagem na tela: ela chega às {hora(ultima.solta_em)}.</span>
                : ativa
                ? <span className="font-medium text-violet-600 dark:text-violet-400">Na tela agora: {ultima.vida} de {ultima.vida_max} de vida, {ultima.participantes} na caçada{ultima.protegida ? ', com o totem' : ''}.</span>
                : ultima.situacao === 'derrotado'
                  ? <>A última caiu às {hora(ultima.derrotado_em)}: golpe final de {ultima.golpe_final_nome}, {ultima.participantes} ajudaram{ultima.ranking[0] ? ` — quem mais tirou foi ${ultima.ranking[0].nome} (${ultima.ranking[0].dano})` : ''}.</>
                  : <>A última fugiu às {hora(ultima.expira_em)} com {ultima.vida} de vida.</>}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label="Vida da chefona">
          {DIFICULDADES_CHEFONA.map((d, i) => (
            <button
              key={d.nome}
              type="button"
              role="radio"
              aria-checked={nivel === i}
              onClick={() => setNivel(i)}
              title={`Começa com ${d.base} e ganha +${d.porPessoa} a cada pessoa que entra`}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] transition-colors',
                nivel === i ? 'border-violet-500 bg-violet-500/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {d.nome} <span className="tabular-nums opacity-70">+{d.porPessoa}/pessoa</span>
            </button>
          ))}
        </div>
        <Button
          size="sm" variant="outline" className="gap-1.5"
          disabled={ativa || reiNaTela || soltando}
          title={reiNaTela ? 'O Rei do Pop zumbi está na tela: espere ele cair ou fugir' : undefined}
          onClick={() => setConfirmando(true)}
        >
          <Sparkles className="h-3.5 w-3.5" /> Soltar a chefona
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A vida cresce com quem entra na caçada: começa em <b className="tabular-nums">{dificuldade.base}</b> e
        ganha <b className="tabular-nums">+{dificuldade.porPessoa}</b> a cada pessoa que acerta o primeiro tiro.
        {' '}{EXEMPLOS_DE_PESSOAS.map((n, i) => (
          <span key={n} className="tabular-nums">{i > 0 ? ' · ' : ''}{n} pessoas → {vidaCom(dificuldade, n).toLocaleString('pt-BR')}</span>
        ))}
      </p>
      {chefona && (
        <SuspeitosDoChefao
          rodada={chefona}
          ativo={chefonaNaTela(chefona, Date.now())}
          lerFichas={lerSuspeitosChefona}
          semMigration={/fn_chefona_suspeitos|PGRST202|schema cache/}
          migration="20261015230000"
        />
      )}

      <AlertDialog open={confirmando} onOpenChange={v => !soltando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soltar a Bruxa do Pântano?</AlertDialogTitle>
            <AlertDialogDescription>
              Começa agora uma contagem de 1 minuto na tela de todo mundo que está logado, nas duas
              empresas. Depois ela aparece com {dificuldade.base} de vida (+{dificuldade.porPessoa} a cada pessoa que
              entrar na caçada), voando por {PRAZO_CHEFONA_MIN} minutos. Os tiros de todos tiram da mesma vida; no fim
              aparece o ranking. Ela não depende da caça estar ligada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={soltando}>Agora não</AlertDialogCancel>
            <AlertDialogAction disabled={soltando} onClick={e => { e.preventDefault(); void soltar(); }}>
              {soltando ? 'Soltando…' : 'Soltar a chefona'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Testar a chefona só na tela do super_admin (pedido de 15/10/2026: «liberar só
 * para super admin para eu testar como ela está dentro do gestão»). É o ensaio
 * do laboratório (`ensaioSoltarChefona`, rodada de id negativo): a vida mora
 * só nesta aba, não passa pelo banco nem pelo aviso da caça, e ninguém mais vê.
 * Os robôs fazem o papel do time; a Poção de Cura e o Totem são os mesmos
 * botões da tela. Vale com qualquer tema, sem mexer no que o sorteio solta.
 */
function TesteDaChefona() {
  const chefona = useChefona();
  const chefao = useChefao();
  const [nivel, setNivel] = useState(1);
  const [robos, setRobos] = useState(false);
  const dificuldade = DIFICULDADES_CHEFONA[nivel];
  const noEnsaio = !!chefona && chefona.id < 0 && chefonaNaTela(chefona, Date.now());
  const chegando = noEnsaio && chefonaChegando(chefona, Date.now());
  // Na contagem, o relógio do teste anda a cada segundo (o lobby conta na tela; aqui, para pular).
  const [, tiquetaque] = useState(0);
  useEffect(() => {
    if (!chegando) return;
    const t = setInterval(() => tiquetaque(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [chegando]);
  const falta = chegando && chefona ? Math.max(0, Math.ceil((Date.parse(chefona.solta_em) - Date.now()) / 1000)) : 0;
  // Com uma chefe de verdade (ou o Rei do Pop) na tela, o teste espera: são dois chefes ao mesmo tempo.
  const chefeDeVerdade = (chefonaNaTela(chefona, Date.now()) && (chefona?.id ?? 0) > 0)
    || (chefaoNaTela(chefao, Date.now()) && (chefao?.id ?? 0) > 0);

  function soltar(esperaS: number) {
    setRobos(false);
    ensaioSoltarChefona(dificuldade.base, PRAZO_CHEFONA_MIN, esperaS, dificuldade.porPessoa);
    toast.success('Chefona de teste solta 🧙', { description: 'Só na sua tela. Entre no lobby para ver a bruxa — sem entrar, ela não aparece. Nada vai para o banco.' });
  }
  function virarRobos() { ensaioRobosChefona(!robos); setRobos(!robos); }
  function parar(fn: () => void) { setRobos(false); fn(); }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-semibold">Testar a chefona só na minha tela</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A Bruxa do Pântano aparece só para você, com a vida nesta aba: nada vai para o banco, ninguém recebe aviso
        e o ranking é de mentira. «Soltar o teste» abre o lobby com os 3 minutos de verdade (com a música); entre
        no lobby para ver a bruxa e use os botões para pular os segundos. Os robôs fazem o papel do time; a Poção de Cura e o Totem ficam nos botões da tela.
        Se você escondeu o chefão (o X no meio da barra do topo), mostre de novo para ver.
      </p>
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Vida da chefona de teste">
        {DIFICULDADES_CHEFONA.map((d, i) => (
          <button
            key={d.nome}
            type="button"
            role="radio"
            aria-checked={nivel === i}
            onClick={() => setNivel(i)}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] transition-colors',
              nivel === i ? 'border-violet-500 bg-violet-500/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {d.nome} <span className="tabular-nums opacity-70">{d.base}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={chefeDeVerdade} onClick={() => soltar(ESPERA_CHEFONA_S)}
          title={chefeDeVerdade ? 'Há um chefe de verdade na tela: espere ele cair ou fugir' : 'Com o lobby e os 3 minutos de verdade (dá para pular os segundos aqui)'}>
          <Sparkles className="h-3.5 w-3.5" /> Soltar o teste
        </Button>
        <Button size="sm" variant="outline" disabled={chefeDeVerdade} onClick={() => soltar(0)}>Sem contagem</Button>
        {noEnsaio && (
          <>
            {chegando && (
              <>
                <span className="self-center px-1 text-[11px] tabular-nums text-muted-foreground" aria-live="off">
                  chega em {Math.floor(falta / 60)}:{String(falta % 60).padStart(2, '0')}
                </span>
                <Button size="sm" variant="ghost" onClick={() => ensaioAdiantarChefona(10)}>+10 s</Button>
                <Button size="sm" variant="ghost" onClick={() => ensaioAdiantarChefona(30)}>+30 s</Button>
                <Button size="sm" variant="ghost" onClick={() => ensaioIrParaChefona(PONTO_DA_BRUXA_S + 3)}
                  title="Pula para 3 segundos antes de a música do lobby começar">Música</Button>
                <Button size="sm" variant="ghost" onClick={() => ensaioIrParaChefona(60)}>1:00</Button>
                <Button size="sm" variant="ghost" onClick={() => ensaioIrParaChefona(15)}>0:15</Button>
                <Button size="sm" variant="ghost" onClick={ensaioPularContagemChefona}>Pular contagem</Button>
              </>
            )}
            <Button size="sm" variant="ghost" aria-pressed={robos} onClick={virarRobos} className="gap-1.5">
              <Bot className="h-3.5 w-3.5" /> {robos ? 'Parar os robôs' : 'Robôs atirando'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => ensaioArrancarChefona(0.3)}>Tirar 30%</Button>
            <Button size="sm" variant="ghost" onClick={() => parar(ensaioFugirChefona)}>Fugir</Button>
          </>
        )}
        {chefona && chefona.id < 0 && <Button size="sm" variant="ghost" onClick={() => parar(ensaioLimparChefona)}>Limpar</Button>}
      </div>
    </div>
  );
}

/** A cabeça da Bruxa do Pântano, em pixel, para o cartão. */
function CabecaDaChefona() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const c = canvasDaImagem(cabecaMC(), false);
    c.style.width = `${c.width * 3}px`;
    c.style.height = `${c.height * 3}px`;
    c.style.imageRendering = 'pixelated';
    ref.current?.appendChild(c);
    return () => c.remove();
  }, []);
  return <span ref={ref} className="block shrink-0" title="Bruxa do Pântano" aria-hidden="true" />;
}

const maisRapido = (rs: RodadaAbobora[]) =>
  rs.reduce<RodadaAbobora | null>((m, r) => (!m || (r.ms ?? Infinity) < (m.ms ?? Infinity) ? r : m), null);

export default function CacaAboboraConfig() {
  const { empresa } = useEmpresa();
  // O mesmo estado da faixa: quando um zumbi sai ou alguém mata, o painel
  // relê na hora.
  const caca = useCacaAbobora(empresa?.id);
  const [painel, setPainel] = useState<PainelCaca | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoSoltar, setConfirmandoSoltar] = useState(false);
  const [soltando, setSoltando] = useState(false);

  const reler = useCallback(async () => {
    try { setPainel(await lerPainelCaca()); } catch { /* rede: a próxima releitura tenta */ }
  }, []);

  const marcaDaRodada = `${caca.rodada?.id ?? 0}:${caca.rodada?.situacao ?? ''}`;
  useEffect(() => { void reler(); }, [reler, marcaDaRodada]);

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reler(); }, RELER_MS);
    return () => clearInterval(t);
  }, [reler]);

  const hoje = painel?.hoje ?? null;
  const ligadaHoje = !!hoje && painel?.config?.dia === hoje;
  const doDia = useMemo(() => (painel?.rodadas ?? []).filter(r => r.dia === hoje), [painel, hoje]);
  const naTela = (painel?.rodadas ?? []).find(r => r.situacao === 'solta') ?? null;
  const mortos = doDia.filter(r => r.situacao === 'achada');
  const recorde = maisRapido(mortos);
  const recordeHs = maisRapido(mortos.filter(r => r.headshot));
  const ultimaAntes = doDia.length === 0 ? (painel?.rodadas ?? [])[0] ?? null : null;
  // O desenho do cartão: o que está na tela, ou o último que saiu.
  // O tema que o cron solta. Sem a coluna (migration 20261014200000 pendente), zumbis.
  const temaNoBanco = painel?.config?.tema;
  const tema: TemaCaca = temaNoBanco ?? 'zumbis';
  const p = PALAVRAS[tema];
  const bruxas = tema === 'bruxas';
  // O desenho do cartão, do tema escolhido: o que está na tela, ou o último que saiu.
  const doTema = naTela?.tema === tema ? naTela : doDia.find(r => r.tema === tema) ?? null;
  const zumbiDoCartao = doTema ? zumbiDaRodada(doTema) : ZUMBIS[0];
  const bruxaDoCartao = doTema ? bruxaDaRodada(doTema) : BRUXAS[0];
  const [trocandoTema, setTrocandoTema] = useState(false);
  const nomeNaTela = (r: RodadaAbobora) => (r.tema === 'bruxas' ? bruxaDaRodada(r).nome : zumbiDaRodada(r).nome);

  async function escolherTema(novo: TemaCaca) {
    if (trocandoTema || novo === tema) return;
    setTrocandoTema(true);
    const { erro } = await mudarTemaCaca(novo);
    await reler();
    setTrocandoTema(false);
    if (erro) {
      toast.error('Não foi possível trocar o tema', {
        description: /fn_abobora_tema|PGRST202/.test(erro)
          ? 'O banco ainda não tem as bruxas (migration 20261014200000_caca_bruxas).'
          : erro,
      });
      return;
    }
    toast.success(`${PALAVRAS[novo].titulo} ${PALAVRAS[novo].emoji}`, {
      description: `A partir da próxima rodada sai ${PALAVRAS[novo].um}. A que estiver na tela fica como está.`,
    });
  }

  async function virar(ligar: boolean) {
    if (salvando) return;
    setSalvando(true);
    const { erro } = await ligarCaca(ligar);
    await reler();
    setSalvando(false);
    if (erro) {
      toast.error('Não foi possível salvar', { description: erro });
      return;
    }
    toast.success(ligar ? `${p.titulo} ligada ${p.emoji}` : `${p.titulo} desligada`, {
      description: ligar
        ? `${p.Um === 'Bruxa' ? 'A primeira bruxa' : 'O primeiro zumbi'} sai entre 30 min e 1h10. Vale só para hoje.`
        : `Se havia ${p.um} na tela, ${p.Um === 'Bruxa' ? 'ela foi embora' : 'ele voltou para a cova'} para todos.`,
    });
  }

  async function soltar() {
    setSoltando(true);
    const { erro } = await soltarAboboraAgora();
    await reler();
    setSoltando(false);
    setConfirmandoSoltar(false);
    if (erro) {
      toast.error('Não deu para soltar', {
        description: erro.includes('JA_TEM_UMA') ? 'Já tem uma rodada na tela.' : erro,
      });
      return;
    }
    toast.success(`${p.Um} ${p.Um === 'Bruxa' ? 'solta' : 'solto'} ${p.emoji}`, { description: 'Está na tela de todo mundo agora.' });
  }

  let situacao: string;
  if (naTela) situacao = `Tem ${PALAVRAS[naTela.tema].um} na tela agora — ${nomeNaTela(naTela)}, desde as ${hora(naTela.solta_em)}.`;
  else if (ligadaHoje && painel?.config?.proxima_em) situacao = `Próxima rodada (${p.um}) por volta das ${hora(painel.config.proxima_em)}.`;
  else if (ligadaHoje) situacao = 'Sem próxima rodada hoje — o sorteio passaria da meia-noite.';
  else situacao = 'Desligada. Ao ligar, vale só para hoje; amanhã é preciso ligar de novo.';

  return (
    <Card className={cn('overflow-hidden', ligadaHoje ? (bruxas ? 'border-violet-500/50' : 'border-lime-500/50') : 'border-border')}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {bruxas
            ? <SpriteBruxa bruxa={bruxaDoCartao} animado={ligadaHoje || !!naTela} className="shrink-0" titulo={bruxaDoCartao.nome} />
            : <SpriteZumbi zumbi={zumbiDoCartao} animado={ligadaHoje || !!naTela} escala={1} className="shrink-0" titulo={zumbiDoCartao.nome} />}
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold">{p.titulo}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {bruxas ? (
                <>
                  Uma bruxa chega voando na vassoura na tela de todo mundo, a cada 30 min a 1h10 — uma
                  diferente a cada vez no dia. Quem acertar primeiro leva: cabeça é HEADSHOT, vassoura é
                  VASSOURADA, chapéu não derruba. Os fofos (bruxinha, gatinha, gato e fantasminha) caem
                  desmaiados: quem clicar neles no chão finaliza, e se for quem derrubou ganha o 2x. O
                  nome e a foto passam na faixa do topo por 10 minutos. Ninguém acertou em 15 min, ela
                  vai embora rindo.
                </>
              ) : (
                <>
                  Um zumbi sobe da terra na tela de todo mundo, num canto longe de botões, a cada 30 min a
                  1h10 — um diferente a cada vez no dia. Quem acertar primeiro leva: tiro na cabeça é
                  HEADSHOT. O nome (e a foto, se tiver) passa na faixa do topo por 10 minutos. Ninguém
                  matou em 15 min, ele volta para a cova.
                </>
              )}
            </p>
            {painel?.disponivel && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">Tema</span>
                <div className="inline-flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Tema da caça">
                  {(['zumbis', 'bruxas'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={tema === t}
                      disabled={trocandoTema || temaNoBanco === undefined}
                      onClick={() => { void escolherTema(t); }}
                      className={cn(
                        'rounded px-2 py-0.5 font-medium transition-colors disabled:opacity-60',
                        tema === t
                          ? (t === 'bruxas' ? 'bg-violet-600 text-white' : 'bg-lime-600 text-white')
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {PALAVRAS[t].emoji} {t === 'zumbis' ? 'Zumbis' : 'Bruxas'}
                    </button>
                  ))}
                </div>
                {trocandoTema && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {temaNoBanco === undefined && (
                  <span className="text-muted-foreground">
                    As bruxas chegam com a migration <span className="font-mono">20261014200000_caca_bruxas</span>.
                  </span>
                )}
              </div>
            )}
          </div>
          {painel?.disponivel && (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Switch
                checked={ligadaHoje}
                disabled={salvando}
                onCheckedChange={v => { void virar(v); }}
                aria-label={ligadaHoje ? `Desligar a ${p.titulo}` : `Ligar a ${p.titulo} para hoje`}
                className={bruxas ? 'data-[state=checked]:bg-violet-600' : 'data-[state=checked]:bg-lime-600'}
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!painel && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {painel && !painel.disponivel && (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            O banco ainda não tem a caça (migration <span className="font-mono">20261005120000_caca_abobora</span>).
            O cartão funciona assim que ela for aplicada.
          </p>
        )}

        {painel?.disponivel && (
          <>
            <div className={cn(
              'rounded-lg px-3 py-2.5 text-xs',
              ligadaHoje || naTela
                ? (bruxas ? 'bg-violet-500/10 text-foreground' : 'bg-lime-500/10 text-foreground')
                : 'bg-muted/60 text-muted-foreground',
            )}>
              {ligadaHoje && (
                <p className={cn('mb-0.5 font-semibold', bruxas ? 'text-violet-700 dark:text-violet-300' : 'text-lime-700 dark:text-lime-400')}>
                  Ligada hoje, {diaCurto(hoje)}, até 23h59
                  {painel.config?.ligada_por_nome ? ` · por ${painel.config.ligada_por_nome} às ${hora(painel.config.ligada_em)}` : ''}
                </p>
              )}
              <p>{situacao}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-lg border border-border px-2 py-2">
                <p className="text-lg font-bold tabular-nums">{doDia.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{bruxas ? 'soltas hoje' : 'soltos hoje'}</p>
              </div>
              <div className="rounded-lg border border-border px-2 py-2">
                <p className="text-lg font-bold tabular-nums">{mortos.length}</p>
                <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {bruxas ? <><Sparkles className="h-2.5 w-2.5" /> derrubadas</> : <><Skull className="h-2.5 w-2.5" /> mortos</>}
                </p>
              </div>
              <Recorde titulo="mais rápido" r={recorde} icone={<Zap className="h-2.5 w-2.5 shrink-0" />} />
              <Recorde titulo="headshot" r={recordeHs} icone={<Crosshair className="h-2.5 w-2.5 shrink-0" />} />
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hoje</p>
              {doDia.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  Nenhuma rodada hoje ainda.
                  {ultimaAntes && (
                    <> A última rodada foi em {diaCurto(ultimaAntes.dia)} às {hora(ultimaAntes.solta_em)}
                      {ultimaAntes.situacao === 'achada'
                        ? ` — ${ultimaAntes.achada_por_nome} ${ultimaAntes.tema === 'bruxas' ? 'derrubou' : 'matou'} em ${formatarTempo(ultimaAntes.ms)}${ultimaAntes.headshot ? ', com headshot' : ''}.`
                        : ` — ninguém ${ultimaAntes.tema === 'bruxas' ? 'acertou' : 'matou'}.`}
                    </>
                  )}
                </p>
              ) : (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                  {doDia.map(r => <LinhaRodada key={r.id} r={r} />)}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">Quer testar ou animar o time agora?</p>
              <Button
                size="sm" variant="outline" className="gap-1.5"
                disabled={!!naTela || soltando}
                onClick={() => setConfirmandoSoltar(true)}
              >
                {bruxas ? <Sparkles className="h-3.5 w-3.5" /> : <Skull className="h-3.5 w-3.5" />} Soltar {p.um} agora
              </Button>
            </div>

            {/* Cada tema com o seu chefe: o Rei do Pop nos zumbis, a Bruxa do Pântano nas bruxas. */}
            {bruxas ? <SecaoChefona /> : <SecaoChefao />}
            <TesteDaChefona />
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmandoSoltar} onOpenChange={v => !soltando && setConfirmandoSoltar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soltar {p.um} agora?</AlertDialogTitle>
            <AlertDialogDescription>
              {bruxas ? 'Ela chega voando agora' : 'Ele sobe agora'} na tela de todo mundo que está logado, nas
              duas empresas, e vale como qualquer rodada: quem acertar primeiro passa na faixa.
              {ligadaHoje ? ' O próximo do sorteio é remarcado para depois deste.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={soltando}>Agora não</AlertDialogCancel>
            <AlertDialogAction disabled={soltando} onClick={e => { e.preventDefault(); void soltar(); }}>
              {soltando ? 'Soltando…' : 'Soltar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
