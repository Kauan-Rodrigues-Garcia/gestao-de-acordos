import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard, Music2, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { entrarNaRadio, fecharAvisoDaMusica, ligarMusica, mudarVolume, sairDaRadio, useMusicaNatal } from './musica';
import { VIDEOS } from './abertura';
import { marcarAssistiu, useAssistiuAbertura } from './assistiuAbertura';
import './musica.css';

const RevisaoDaAbertura = lazy(() => import('./presente/RevisaoDaAbertura').then(m => ({ default: m.RevisaoDaAbertura })));

/** O balão «você não viu a abertura» volta no máximo uma vez por dia. */
const chaveDispensa = (pessoa: string) => `natal:aviso-abertura-dispensado:${pessoa}`;
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');
function dispensouHoje(pessoa: string | null): boolean {
  if (!pessoa) return true;
  try { return localStorage.getItem(chaveDispensa(pessoa)) === hojeLocal(); } catch { return false; }
}
function dispensarHoje(pessoa: string | null) {
  if (!pessoa) return;
  try { localStorage.setItem(chaveDispensa(pessoa), hojeLocal()); } catch { /* modo privado */ }
}

/**
 * O botão da música de Natal, ao lado do sino. Só ligar/desligar e o volume:
 * a música é uma rádio, igual para todos ao mesmo tempo — ver `musica.ts`.
 *
 * O volume é uma barra sem número (Cleber, 04/11/2026): baixo de um lado,
 * alto do outro — e o «alto» é, por trás, 25% do volume (`TETO_DO_VOLUME`).
 *
 * O `Layout` só o monta com o tema de Natal ligado. Montado, volta a tocar se
 * a pessoa tinha deixado ligada; desmontado, silencia sem mexer na escolha.
 *
 * A abertura de novo (09/11/2026): o card tem «Ver a abertura de novo», e quem
 * entrou no Natal sem ver o vídeo inteiro (pulou) ganha um ponto no botão, um
 * aviso no card e um balão (uma vez por dia) — ver `assistiuAbertura.ts`.
 */
export function BotaoMusicaNatal() {
  const { ligada, volume, tocando, aviso } = useMusicaNatal();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const { perfil } = useAuth();
  // No «Entrar como» o banco responderia pelo super admin: sem aviso, sem gravar.
  const pessoa = getImpersonacaoAtiva() ? null : (perfil?.id ?? null);
  const { assistiu, video } = useAssistiuAbertura(pessoa);
  const naoViu = assistiu === false;
  const [revendo, setRevendo] = useState(false);
  const [dispensado, setDispensado] = useState(() => dispensouHoje(pessoa));
  useEffect(() => { setDispensado(dispensouHoje(pessoa)); }, [pessoa]);

  const verAbertura = () => { setAberto(false); dispensarHoje(pessoa); setDispensado(true); setRevendo(true); };

  useEffect(() => {
    entrarNaRadio();
    return sairDaRadio;
  }, []);

  const IconeVolume = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <>
      <Popover open={aberto} onOpenChange={v => { setAberto(v); if (v) fecharAvisoDaMusica(); }}>
        <PopoverTrigger asChild>
          <button
            ref={botao}
            type="button"
            className={cn(
              'nt-musica-botao relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              ligada && 'ligada',
              aviso && 'avisando',
            )}
            title={naoViu ? 'Música de Natal — você ainda não viu a abertura' : ligada ? 'Música de Natal — tocando' : 'Música de Natal'}
            aria-label={`${ligada ? 'Música de Natal, ligada' : 'Música de Natal, desligada'}${naoViu ? '. Você ainda não viu a abertura do Natal' : ''}`}
          >
            {ligada && tocando
              ? <span className="nt-musica-eq" aria-hidden><span /><span /><span /></span>
              : <Music2 className="h-4 w-4" />}
            {naoViu && <span className="nt-abertura-ponto" aria-hidden />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
          <div className="nt-musica-topo px-4 pb-3 pt-4">
            <p className="text-sm font-semibold text-foreground">Música de Natal</p>
            <p className="mt-0.5 text-xs text-muted-foreground">A mesma para todo mundo, ao mesmo tempo.</p>
          </div>
          <div className="space-y-4 px-4 py-3.5">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">{ligada ? 'Tocando' : 'Desligada'}</span>
              <Switch checked={ligada} onCheckedChange={ligarMusica} aria-label="Tocar a música de Natal" />
            </label>
            <div>
              <div className="flex items-center gap-3">
                <IconeVolume className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <Slider
                  value={[volume]} min={0} max={100} step={1}
                  onValueChange={([v]) => mudarVolume(v)}
                  aria-label="Volume da música de Natal"
                  aria-valuetext={volume === 0 ? 'mudo' : volume < 34 ? 'baixo' : volume < 67 ? 'médio' : 'alto'}
                  className="flex-1"
                />
              </div>
              <div className="mt-1.5 flex justify-between pl-7 text-[11px] text-muted-foreground">
                <span>Baixo</span>
                <span>Alto</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/80">Festive Lobby Music · Fortnite</p>
          </div>
          {/* A abertura do Natal de novo (09/11/2026). */}
          <div className="border-t border-border px-4 py-3">
            {naoViu ? (
              <div className="rounded-lg bg-warning/10 p-3">
                <p className="text-sm font-semibold text-foreground">Você ainda não viu a abertura do Natal</p>
                <p className="mt-0.5 text-xs text-muted-foreground">É um vídeo de 2 minutos. Dá para assistir quando quiser.</p>
                <button type="button" onClick={verAbertura}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Clapperboard className="h-4 w-4" aria-hidden /> Assistir agora
                </button>
              </div>
            ) : (
              <button type="button" onClick={verAbertura}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent">
                <Clapperboard className="h-4 w-4 text-muted-foreground" aria-hidden /> Ver a abertura de novo
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {aviso && !aberto && <AvisoDaMusica botao={botao} aoAbrir={() => setAberto(true)} />}
      {naoViu && !aviso && !aberto && !revendo && !dispensado && (
        <AvisoDaAbertura botao={botao}
          aoAssistir={verAbertura}
          aoDispensar={() => { dispensarHoje(pessoa); setDispensado(true); }} />
      )}
      {revendo && (
        <Suspense fallback={null}>
          <RevisaoDaAbertura
            src={VIDEOS[video]}
            aoFechar={() => setRevendo(false)}
            aoAssistirInteiro={() => marcarAssistiu(pessoa, video)} />
        </Suspense>
      )}
    </>
  );
}

/** O balão de quem não viu a abertura: o mesmo desenho do aviso da música. */
function AvisoDaAbertura({ botao, aoAssistir, aoDispensar }: {
  botao: React.RefObject<HTMLButtonElement | null>; aoAssistir: () => void; aoDispensar: () => void;
}) {
  const ponto = usePontoDoBotao(botao);
  if (!ponto) return null;
  const largura = 300;
  const esquerda = Math.max(12, Math.min(window.innerWidth - largura - 12, ponto.x - largura + 34));
  return createPortal(
    <div className="nt-musica-aviso" role="status" style={{ left: esquerda, top: ponto.y, width: largura }}>
      <span className="nt-musica-aviso-seta" style={{ left: ponto.x - esquerda }} aria-hidden />
      <p className="nt-musica-aviso-titulo"><span aria-hidden>🎬</span> Você ainda não viu a abertura do Natal</p>
      <p className="nt-musica-aviso-texto">
        É um vídeo de 2 minutos. Quando tiver um tempinho, é só assistir por aqui.
      </p>
      <div className="nt-musica-aviso-acoes">
        <button type="button" onClick={aoDispensar}>Agora não</button>
        <button type="button" className="principal" onClick={aoAssistir}>Assistir agora</button>
      </div>
    </div>,
    document.body,
  );
}

/** Onde fica a ponta do balão: embaixo do botão, no meio. */
function usePontoDoBotao(botao: React.RefObject<HTMLButtonElement | null>) {
  const [ponto, setPonto] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const r = botao.current?.getBoundingClientRect();
      if (r && r.width) setPonto({ x: r.left + r.width / 2, y: r.bottom + 12 });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [botao]);
  return ponto;
}

/**
 * Uma vez, depois da abertura do presente: um balão apontando para o botão,
 * dizendo que dá para desligar e que o volume nunca fica alto. Fica até a
 * pessoa responder (Cleber, 04/11/2026: sumia sozinho antes de dar para ler).
 */
function AvisoDaMusica({ botao, aoAbrir }: { botao: React.RefObject<HTMLButtonElement | null>; aoAbrir: () => void }) {
  const [ponto, setPonto] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const r = botao.current?.getBoundingClientRect();
      if (r && r.width) setPonto({ x: r.left + r.width / 2, y: r.bottom + 12 });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [botao]);

  if (!ponto) return null;
  // O balão fica à esquerda da seta (o botão mora no canto direito do topo).
  const largura = 300;
  const esquerda = Math.max(12, Math.min(window.innerWidth - largura - 12, ponto.x - largura + 34));
  return createPortal(
    <div className="nt-musica-aviso" role="status" style={{ left: esquerda, top: ponto.y, width: largura }}>
      <span className="nt-musica-aviso-seta" style={{ left: ponto.x - esquerda }} aria-hidden />
      <p className="nt-musica-aviso-titulo"><span aria-hidden>🎵</span> A música de Natal está tocando</p>
      <p className="nt-musica-aviso-texto">
        Se preferir, é só desligar aqui neste botão. Você também escolhe o volume —
        ele vai do baixinho ao moderado e nunca fica alto.
      </p>
      <div className="nt-musica-aviso-acoes">
        <button type="button" onClick={fecharAvisoDaMusica}>Entendi</button>
        <button type="button" className="principal" onClick={() => { fecharAvisoDaMusica(); aoAbrir(); }}>Ajustar agora</button>
      </div>
    </div>,
    document.body,
  );
}
