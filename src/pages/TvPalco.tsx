/**
 * TvPalco.tsx — a tela que fica na parede.
 *
 * Roda no PC ligado à TV por HDMI. Sem sessão, sem barra lateral, sem cursor,
 * o dia inteiro, com ninguém sentado na frente. Tudo aqui existe para que
 * NINGUÉM PRECISE ATRAVESSAR O ESCRITÓRIO.
 *
 * ## As três garantias
 *
 * 1. NUNCA cair para tela de login. Não há login: a página fala com uma RPC
 *    pública e só. Se a rede cair, aparece um aviso discreto no canto e a
 *    página continua exibindo a última cena boa — dado velho por alguns
 *    segundos é infinitamente melhor que tela preta na frente da operação.
 *
 * 2. NUNCA apagar. `wakeLock` segura a tela acesa, e ele é RE-PEDIDO quando a
 *    aba volta a ficar visível: o navegador solta o bloqueio sozinho ao
 *    minimizar, e sem repedir a TV apagaria depois do primeiro soluço.
 *
 * 3. SEMPRE voltar sozinha. O estado mora em `tv_estado`, no banco. Faltou luz,
 *    o Windows reiniciou de madrugada: o atalho em `--kiosk` reabre esta página
 *    e ela relê a cena que estava no ar. Ninguém precisa reconfigurar nada.
 *
 * ## Por que dois caminhos para a mesma informação
 *
 * O `broadcast` faz a parede mudar no MESMO SEGUNDO em que a mesa corta — é o
 * que dá a sensação de transmissão de verdade. A releitura periódica é a rede
 * de segurança: se o canal cair sem avisar (acontece), a TV se corrige sozinha
 * em até 20 segundos. E ela seria necessária de qualquer forma, porque os
 * números do ranking mudam ao longo do dia sem ninguém cortar nada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Palco } from './ModoTV/Palco';
import { AlertaAoVivo } from './ModoTV/AlertaAoVivo';
import { DURACAO_TRANSICAO_MS, type CenaNoAr, type Fonte, type Transicao, type Alerta } from './ModoTV/geometria';

/** De quanto em quanto tempo a TV se corrige sozinha. */
const INTERVALO_RELEITURA_MS = 20_000;
/** De quanto em quanto tempo ela avisa a mesa que está de pé. */
const INTERVALO_SINAL_MS = 30_000;

export default function TvPalco() {
  const { slug = '' } = useParams<{ slug: string }>();

  const [cena, setCena] = useState<CenaNoAr | null>(null);
  const [offline, setOffline] = useState(false);
  const [saindo, setSaindo] = useState<{ fontes: Fonte[]; transicao: Transicao } | null>(null);
  /**
   * O áudio começa travado e isso NÃO é defeito.
   *
   * O navegador só deixa uma página emitir som depois de alguém ter interagido
   * com ela, e no PC da TV ninguém vai interagir. Enquanto estiver travado, os
   * vídeos tocam mudos e um aviso discreto oferece destravar num clique.
   *
   * A solução definitiva para o quiosque é a flag no atalho do Chrome:
   *   --autoplay-policy=no-user-gesture-required
   */
  const [audioLiberado, setAudioLiberado] = useState(false);
  /*
   * A primeira leitura é a única que pode mostrar "carregando". Depois disso a
   * tela JÁ TEM conteúdo, e trocar conteúdo bom por um esqueleto a cada 20
   * segundos faria a parede piscar o dia inteiro.
   */
  const primeiraLeitura = useRef(true);

  const ler = useCallback(async () => {
    if (!slug) return;
    const { data, error } = await (supabase.rpc as unknown as (
      f: string, a: Record<string, unknown>,
    ) => Promise<{ data: CenaNoAr | null; error: unknown }>)('fn_tv_palco', { p_slug: slug });

    if (error || !data) {
      // Não apaga o que está no ar: marca offline e mantém a última cena boa.
      setOffline(true);
      return;
    }
    setOffline(false);

    /*
     * A transição.
     *
     * Trocou a cena: a que estava sai guardada em `saindo` e é desenhada POR
     * CIMA da nova, sumindo. Só uma camada anima — a que chega já está no lugar,
     * inteira, embaixo. Se a animação falhar por qualquer motivo, o pior caso é
     * a cena nova aparecer de uma vez, que é o corte seco.
     */
    setCena(atual => {
      const idAtual = atual?.cena?.id ?? null;
      const idNovo = data.cena?.id ?? null;
      const trocou = idAtual !== null && idNovo !== null && idAtual !== idNovo;
      const comoEntra = data.cena?.transicao ?? 'corte';

      if (trocou && comoEntra !== 'corte' && atual?.fontes?.length) {
        setSaindo({ fontes: atual.fontes, transicao: comoEntra });
      }
      return data;
    });

    primeiraLeitura.current = false;
  }, [slug]);

  /*
   * Some com a camada que está saindo assim que a animação termina. Deixá-la
   * montada seguraria vídeos tocando fora da tela — som de um vídeo que ninguém
   * mais vê é o tipo de defeito que demora a ser diagnosticado.
   */
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => setSaindo(null), DURACAO_TRANSICAO_MS);
    return () => clearTimeout(t);
  }, [saindo]);

  // ── Leitura inicial, releitura periódica e o corte instantâneo ────────────

  useEffect(() => {
    if (!slug) return;
    void ler();

    const relogio = setInterval(() => { void ler(); }, INTERVALO_RELEITURA_MS);

    const canal = supabase
      .channel(`tv-palco-${slug}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'cortar' }, () => { void ler(); })
      .subscribe();

    return () => {
      clearInterval(relogio);
      void supabase.removeChannel(canal);
    };
  }, [slug, ler]);

  /*
   * A rotação troca de cena no relógio do banco, e a releitura de 20s é grossa
   * demais para uma cena de 15. Aqui o palco agenda a releitura para o instante
   * exato da troca, usando o `proxima_em_s` que a RPC devolve.
   *
   * O meio segundo de folga evita chegar cedo demais e receber a mesma cena de
   * volta — o que produziria um pedido a mais a cada troca, o dia inteiro.
   */
  const proximaEmS = cena?.proxima_em_s ?? null;
  useEffect(() => {
    if (proximaEmS == null || proximaEmS < 0) return;
    const t = setTimeout(() => { void ler(); }, proximaEmS * 1000 + 500);
    return () => clearTimeout(t);
  }, [proximaEmS, ler]);

  // ── Sinal de vida para a mesa ─────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return;
    /*
     * `.then()` obrigatório: o builder do supabase-js é preguiçoso e `void`
     * sozinho descarta o thenable sem disparar a requisição. Sem isto o palco
     * nunca avisava que estava de pé, e a mesa exibia "Sem sinal" com a TV
     * ligada e funcionando na frente de todo mundo.
     */
    const bater = () => {
      void (supabase.rpc as unknown as (
        f: string, a: Record<string, unknown>,
      ) => PromiseLike<unknown>)('fn_tv_sinal_vida', { p_slug: slug }).then(
        () => {}, () => {},
      );
    };
    bater();
    const relogio = setInterval(bater, INTERVALO_SINAL_MS);
    return () => clearInterval(relogio);
  }, [slug]);

  // ── Tela sempre acesa ─────────────────────────────────────────────────────

  useEffect(() => {
    interface Sentinela { released: boolean; release: () => Promise<void> }
    const navegador = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<Sentinela> };
    };
    if (!navegador.wakeLock) return;

    let travinha: Sentinela | null = null;
    let vivo = true;

    const pedir = async () => {
      try {
        travinha = await navegador.wakeLock!.request('screen');
      } catch {
        // Aba em segundo plano ou navegador sem suporte. O plano de energia do
        // Windows continua sendo a rede de segurança — ver o README do quiosque.
      }
    };

    void pedir();

    // O navegador SOLTA o bloqueio quando a aba deixa de ser visível. Sem este
    // repedido, a TV apaga depois do primeiro momento em que a janela sai da
    // frente — e ninguém está lá para mexer no mouse.
    const aoVoltar = () => {
      if (vivo && document.visibilityState === 'visible') void pedir();
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      void travinha?.release().catch(() => {});
    };
  }, []);

  // ── O que desenhar ────────────────────────────────────────────────────────

  const fontes: Fonte[] = cena?.fontes ?? [];
  /* Só oferece destravar o áudio se houver de fato algo com som na cena. */
  const alertas: Alerta[] = cena?.alertas ?? [];
  /* Oferece destravar se houver som na cena OU num alerta vivo. */
  const temSom = fontes.some(f => f.mudo === false) || alertas.some(a => !!a.som_url);

  let aviso: string | null = null;
  if (!cena && primeiraLeitura.current) aviso = 'Carregando…';
  else if (cena && !cena.encontrada)    aviso = `Tela "${slug}" não encontrada`;
  else if (cena?.encontrada && !cena.cena) aviso = 'Nenhuma cena no ar';

  return (
    <div
      className="fixed inset-0 bg-[#0a0f13]"
      // O PC da TV tem mouse plugado e ninguém o usa. A setinha parada no meio
      // da parede é a diferença entre parecer produto e parecer navegador aberto.
      style={{ cursor: 'none' }}
    >
      <Palco
        fontes={audioLiberado ? fontes : fontes.map(f => ({ ...f, mudo: true }))}
        aviso={aviso}
      />

      {/*
        A cena que está saindo, por cima da que chegou. `pointerEvents: none`
        porque ela é puramente decorativa e não deve interceptar nada.
      */}
      {saindo && (
        <div
          key={saindo.fontes[0]?.id ?? 'saindo'}
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            animation: `tv-sai-${saindo.transicao} ${DURACAO_TRANSICAO_MS}ms ease forwards`,
          }}
        >
          {/* Sempre muda: a camada que sai não pode continuar tocando som. */}
          <Palco fontes={saindo.fontes.map(f => ({ ...f, mudo: true }))} />
        </div>
      )}

      <style>{`
        @keyframes tv-sai-fade    { to { opacity: 0; } }
        @keyframes tv-sai-deslize { to { transform: translateX(-100%); } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tv-sai-deslize { to { opacity: 0; } }
        }
      `}</style>

      {/* O alerta fica ACIMA de tudo, inclusive da transicao. */}
      <AlertaAoVivo alertas={cena?.alertas ?? []} audioLiberado={audioLiberado} />

      {temSom && !audioLiberado && (
        <button
          onClick={() => setAudioLiberado(true)}
          style={{
            position: 'absolute', left: 24, bottom: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.25)',
            borderRadius: 999, padding: '10px 20px',
            color: '#e8f1f3', fontSize: 18, fontWeight: 600,
          }}
        >
          Tocar o som desta tela
        </button>
      )}

      {offline && (
        <div
          style={{
            position: 'absolute', right: 24, bottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '8px 18px',
            color: '#e8a33d', fontSize: 18, fontWeight: 600,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e8a33d' }} />
          Reconectando…
        </div>
      )}
    </div>
  );
}
