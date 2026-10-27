/**
 * TvPalco.tsx — a tela que fica na parede (`/tv`). Modo TV 2, 27/10/2026.
 *
 * Roda no PC ligado à TV, o dia inteiro, sem ninguém na frente e SEM LOGIN.
 *
 * ## Como ela entra
 *
 * Na primeira vez, pede um código (`fn_tv_conexao_nova`) e mostra os 6 dígitos
 * em tela cheia. O líder digita o código no Gestão (Modo TV → Conectar TV) e
 * a TV passa a mostrar o painel dele. O que fica no navegador é só um token,
 * que abre os números daquele painel e nada mais. Desconectar no Gestão apaga
 * o token no banco; a TV percebe na próxima leitura e volta para o código.
 *
 * ## As garantias da TV antiga, mantidas
 *
 * 1. Rede caiu: continua mostrando o último painel bom, com um aviso no canto.
 * 2. Tela sempre acesa: `wakeLock`, re-pedido quando a aba volta a aparecer.
 * 3. Faltou luz: o atalho reabre `/tv`, o token está no navegador, e ela volta
 *    sozinha para o mesmo painel.
 *
 * ## Tempo real sem peso
 *
 * A cada 5 s a TV faz a pergunta curta (`fn_tv_versao`: «o painel mudou?»),
 * que é uma busca por índice. Mudou — o líder publicou, fixou ou soltou uma
 * tela —, ela lê tudo na hora. Os números ela relê a cada 30 s, e o banco os
 * guarda por 1 minuto (`tv_numeros_cache`): dez TVs no mesmo setor custam um
 * cálculo por minuto. O relatório que entra aparece em até ~1 min e meio.
 *
 * Ao fechar a página, `pagehide` avisa o banco (`fn_tv_sair`), e a montagem
 * mostra «página fechada» sem esperar o sinal de vida vencer.
 *
 * `/tv?demo=1` mostra um painel de mentira, sem banco (`&tema=oceano`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Rodizio } from './ModoTV/Rodizio';
import { PalcoTv, CORES } from './ModoTV/TelaTv';
import { numerosDemo, painelDemo } from './ModoTV/demo';
import { avisarSaida, pedirCodigo, versaoTv, verTv } from './ModoTV/servico';
import type { NumerosTv, Painel } from './ModoTV/tipos';

const CHAVE_TOKEN = 'tv2:token';
/** «O painel mudou?» — o que faz o Publicar chegar em segundos. */
const PERGUNTA_CURTA_MS = 5_000;
/** Os números, mesmo sem mudança no painel. */
const LEITURA_CONECTADA_MS = 30_000;
const LEITURA_AGUARDANDO_MS = 4_000;

function lerToken(): string | null {
  try { return localStorage.getItem(CHAVE_TOKEN); } catch { return null; }
}
function gravarToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(CHAVE_TOKEN, t);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch { /* sem armazenamento: pareia de novo a cada abertura */ }
}

type Estado =
  | { tipo: 'iniciando' }
  | { tipo: 'codigo'; codigo: string; expiraEm: string }
  | { tipo: 'painel'; painel: Painel; numeros: NumerosTv | null };

export default function TvPalco() {
  const [params] = useSearchParams();
  if (params.get('demo') === '1') {
    const tela = Number(params.get('tela'));
    return <TvDemo tema={params.get('tema')} fixarEm={Number.isInteger(tela) && tela > 0 ? tela - 1 : null} />;
  }
  return <TvPareada />;
}

function TvDemo({ tema, fixarEm }: { tema: string | null; fixarEm: number | null }) {
  useTelaSempreAcesa();
  const [numeros] = useState(numerosDemo);
  const painel = useMemo(() => painelDemo(tema), [tema]);
  return (
    <div style={{ position: 'fixed', inset: 0, cursor: 'none' }}>
      <Rodizio key={tema ?? ''} painel={painel} numeros={numeros} fixarEm={fixarEm} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}

function TvPareada() {
  useTelaSempreAcesa();
  const [estado, setEstado] = useState<Estado>({ tipo: 'iniciando' });
  const [offline, setOffline] = useState(false);
  const vivo = useRef(true);

  // O que a parede está mostrando agora, para a pergunta curta comparar.
  const versaoNaParede = useRef<string | null>(null);
  const ultimaLeituraCheia = useRef(0);

  const ler = useCallback(async (): Promise<number> => {
    try {
      let token = lerToken();
      if (!token) {
        const novo = await pedirCodigo();
        gravarToken(novo.token);
        token = novo.token;
        versaoNaParede.current = null;
        setEstado({ tipo: 'codigo', codigo: novo.codigo, expiraEm: novo.expira_em });
        setOffline(false);
        return LEITURA_AGUARDANDO_MS;
      }

      // Já com painel: a pergunta curta. Só lê tudo se o painel mudou ou se os
      // números estão com mais de 30 s.
      if (versaoNaParede.current && Date.now() - ultimaLeituraCheia.current < LEITURA_CONECTADA_MS) {
        const v = await versaoTv(token);
        setOffline(false);
        if (v.estado === 'conectada' && v.versao === versaoNaParede.current) return PERGUNTA_CURTA_MS;
        if (v.estado === 'desconhecida') { gravarToken(null); versaoNaParede.current = null; return 500; }
      }

      const r = await verTv(token);
      setOffline(false);
      if (r.estado === 'conectada') {
        versaoNaParede.current = r.painel.atualizado_em ?? null;
        ultimaLeituraCheia.current = Date.now();
        // Número nulo (cálculo falhou) não apaga o que já está na parede.
        setEstado(atual => ({
          tipo: 'painel',
          painel: r.painel,
          numeros: r.numeros ?? (atual.tipo === 'painel' ? atual.numeros : null),
        }));
        return PERGUNTA_CURTA_MS;
      }
      versaoNaParede.current = null;
      if (r.estado === 'aguardando') {
        setEstado({ tipo: 'codigo', codigo: r.codigo, expiraEm: r.expira_em });
        return LEITURA_AGUARDANDO_MS;
      }
      // Desconectada no Gestão, ou código vencido: pede outro.
      gravarToken(null);
      return 500;
    } catch {
      // Rede ou banco fora: segura a última tela boa.
      setOffline(true);
      return LEITURA_CONECTADA_MS / 2;
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    let t: ReturnType<typeof setTimeout>;
    const rodar = async () => {
      const espera = await ler();
      if (vivo.current) t = setTimeout(rodar, espera);
    };
    void rodar();
    return () => { vivo.current = false; clearTimeout(t); };
  }, [ler]);

  // Fechou a aba, desligou o PC pelo botão: a montagem fica sabendo na hora.
  useEffect(() => {
    const aoSair = () => { const t = lerToken(); if (t) avisarSaida(t); };
    window.addEventListener('pagehide', aoSair);
    return () => window.removeEventListener('pagehide', aoSair);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, cursor: 'none', background: CORES.noite.fundo }}>
      {estado.tipo === 'painel' && (
        <Rodizio painel={estado.painel} numeros={estado.numeros} style={{ position: 'absolute', inset: 0 }} />
      )}
      {estado.tipo === 'codigo' && <TelaCodigo codigo={estado.codigo} expiraEm={estado.expiraEm} />}
      {estado.tipo === 'iniciando' && (
        <PalcoTv tema="noite" style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: CORES.noite.suave }}>
            Ligando a TV…
          </div>
        </PalcoTv>
      )}
      {offline && (
        <div style={{
          position: 'absolute', right: 24, bottom: 20, display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '8px 18px',
          color: '#e8a33d', fontSize: 18, fontWeight: 600,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e8a33d' }} />
          Reconectando…
        </div>
      )}
    </div>
  );
}

function TelaCodigo({ codigo, expiraEm }: { codigo: string; expiraEm: string }) {
  const c = CORES.noite;
  const [, tique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tique(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const restam = Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000));
  const mm = String(Math.floor(restam / 60)).padStart(2, '0');
  const ss = String(restam % 60).padStart(2, '0');

  return (
    <PalcoTv tema="noite" style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 44, color: c.suave, fontWeight: 600 }}>Conecte esta TV a um painel</div>
        <div style={{ fontSize: 300, fontWeight: 800, letterSpacing: 40, margin: '40px 0 30px', paddingLeft: 40, color: c.texto }}>
          {codigo.slice(0, 3)}<span style={{ color: c.destaque }}>{codigo.slice(3)}</span>
        </div>
        <div style={{ fontSize: 40, color: c.texto, textAlign: 'center', lineHeight: 1.5 }}>
          No Gestão, abra <b style={{ color: c.destaque }}>Modo TV</b>, escolha o painel e clique em <b style={{ color: c.destaque }}>Conectar TV</b>.
        </div>
        <div style={{ fontSize: 30, color: c.suave, marginTop: 40 }}>O código troca sozinho em {mm}:{ss}</div>
      </div>
    </PalcoTv>
  );
}

/** A tela não apaga: o navegador solta o bloqueio ao esconder a aba, então re-pede na volta. */
function useTelaSempreAcesa() {
  useEffect(() => {
    interface Sentinela { release: () => Promise<void> }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinela> } };
    if (!nav.wakeLock) return;
    let trava: Sentinela | null = null;
    let vivo = true;
    const pedir = async () => {
      try { trava = await nav.wakeLock!.request('screen'); } catch { /* sem suporte ou aba oculta */ }
    };
    void pedir();
    const aoVoltar = () => { if (vivo && document.visibilityState === 'visible') void pedir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      void trava?.release().catch(() => {});
    };
  }, []);
}
