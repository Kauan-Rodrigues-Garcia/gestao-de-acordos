/**
 * AvisoVotacao — quando o card da Votação da Liderança aparece (04/11/2026).
 *
 * Montado no `Layout`, para todo mundo logado. Pergunta ao banco:
 *   - `fn_votacao_lideranca_minha`: há votação aberta em que eu participo e
 *     ainda não votei? → card «Votar agora», que abre a votação de verdade;
 *   - `fn_votacao_lideranca_meus_resultados`: saiu resultado em que participei
 *     e eu ainda não vi? → card «Ver resultado».
 *
 * Quem não participa de nada não vê nada. Banco sem a migration: o card não
 * aparece e não pergunta de novo até recarregar a página.
 *
 * Cuidado com o banco (a lição da Caça às Bruxas, 15/10/2026): pergunta a cada
 * 5 min com folga sorteada, e na volta à aba espera um tempo sorteado, para as
 * telas não chegarem todas juntas. Desde 05/11/2026: aba escondida não
 * pergunta (a volta à aba põe em dia), e a volta não pergunta de novo se a
 * última leitura foi há menos de 2 min.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  enviarVotos, faltaMigration, lerMeusResultados, lerMinhasVotacoes, lerResultado, mensagemDoErro,
  montarDoRetrato, resultadosDoRetrato, type ResultadoLiberado, type RetratoDaVotacao,
} from './banco';
import { CardDaVotacao } from './CardDaVotacao';

// As telas grandes só carregam quando alguém clica: o card está em toda tela.
const TelaVotacao = lazy(() => import('./TelaVotacao').then(m => ({ default: m.TelaVotacao })));
const TelaResultado = lazy(() => import('./TelaResultado').then(m => ({ default: m.TelaResultado })));

const INTERVALO_MS = 5 * 60_000;
const FOLGA_MS = 60_000;
const VOLTA_MS = 20_000;
/** Leitura mais recente que isto: a volta à aba não pergunta de novo. */
const RECENTE_MS = 2 * 60_000;

const ler = (chave: string) => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravar = (chave: string, v: string) => { try { localStorage.setItem(chave, v); } catch { /* sem armazenamento: só nesta tela */ } };
const chaveVisto = (id: string) => `votacao-lideres:resultado-visto:${id}`;
const chaveMinimizado = (id: string) => `votacao-lideres:minimizado:${id}`;

export function AvisoVotacao({ recuoEsquerda }: { recuoEsquerda: number }) {
  const { perfil } = useAuth();
  const eu = perfil?.id ?? null;
  const [abertas, setAbertas] = useState<RetratoDaVotacao[]>([]);
  const [resultados, setResultados] = useState<ResultadoLiberado[]>([]);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [minimizados, setMinimizados] = useState<Set<string>>(new Set());
  const [votando, setVotando] = useState<RetratoDaVotacao | null>(null);
  const [vendo, setVendo] = useState<{ titulo: string; retrato: RetratoDaVotacao } | null>(null);
  const semMigration = useRef(false);
  const ultimaLeitura = useRef(0);

  /** `forcar`: lê mesmo que a última leitura seja recente (depois de votar). */
  const carregar = useCallback(async (forcar = false) => {
    if (!eu || semMigration.current) return;
    if (!forcar && Date.now() - ultimaLeitura.current < RECENTE_MS) return;
    ultimaLeitura.current = Date.now();
    try {
      const [a, r] = await Promise.all([lerMinhasVotacoes(), lerMeusResultados()]);
      setAbertas(a ?? []);
      setResultados(r ?? []);
    } catch (e) {
      if (faltaMigration(e)) semMigration.current = true;
    }
  }, [eu]);

  useEffect(() => {
    if (!eu) return;
    void carregar();
    let timer = 0;
    // Aba escondida não pergunta: ninguém está olhando, e a volta à aba põe em dia.
    const agendar = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') void carregar();
        agendar();
      }, INTERVALO_MS + Math.random() * FOLGA_MS);
    };
    agendar();
    let volta = 0;
    const visivel = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(volta);
      volta = window.setTimeout(() => { void carregar(); }, Math.random() * VOLTA_MS);
    };
    document.addEventListener('visibilitychange', visivel);
    return () => { window.clearTimeout(timer); window.clearTimeout(volta); document.removeEventListener('visibilitychange', visivel); };
  }, [eu, carregar]);

  // O que mostrar: primeiro votar (se ainda não votou), depois resultado não visto.
  const aVotar = abertas.find(v => !v.enviado_em) ?? null;
  const aVer = resultados.find(r => !vistos.has(r.id) && ler(chaveVisto(r.id)) !== '1') ?? null;
  const alvo = aVotar ? { tipo: 'votar' as const, id: aVotar.votacao.id, titulo: aVotar.votacao.titulo }
    : aVer ? { tipo: 'resultado' as const, id: aVer.id, titulo: aVer.titulo } : null;
  const minimizado = !!alvo && (minimizados.has(alvo.id) || ler(chaveMinimizado(alvo.id)) === '1');

  const minimizar = (sim: boolean) => {
    if (!alvo) return;
    gravar(chaveMinimizado(alvo.id), sim ? '1' : '0');
    setMinimizados(m => { const n = new Set(m); if (sim) n.add(alvo.id); else n.delete(alvo.id); return n; });
  };
  const marcarVisto = (id: string) => { gravar(chaveVisto(id), '1'); setVistos(v => new Set(v).add(id)); };

  const abrir = async () => {
    if (!alvo) return;
    if (alvo.tipo === 'votar' && aVotar) { setVotando(aVotar); return; }
    try {
      const retrato = await lerResultado(alvo.id);
      setVendo({ titulo: alvo.titulo, retrato });
      marcarVisto(alvo.id);
    } catch (e) {
      toast.error('Não deu para abrir o resultado', { description: mensagemDoErro(e) });
    }
  };

  const votacao = useMemo(() => (votando ? montarDoRetrato(votando) : null), [votando]);
  const resultado = useMemo(() => {
    if (!vendo) return null;
    const { cedula, pessoas } = montarDoRetrato(vendo.retrato);
    return { cedula, pessoas, resultados: resultadosDoRetrato(vendo.retrato, cedula) };
  }, [vendo]);

  if (!eu) return null;
  return (
    <Suspense fallback={null}>
      {alvo && !votando && !vendo && (
        <CardDaVotacao tipo={alvo.tipo} titulo={alvo.titulo} minimizado={minimizado} recuoEsquerda={recuoEsquerda}
          onAbrir={() => { void abrir(); }} onMinimizar={() => minimizar(true)} onExpandir={() => minimizar(false)}
          onDispensar={alvo.tipo === 'resultado' ? () => marcarVisto(alvo.id) : undefined} />
      )}
      {votando && votacao && (
        <TelaVotacao modo="real" cedula={votacao.cedula} pessoas={votacao.pessoas} eleitorId={eu} semente={0}
          rascunhoChave={`votacao-lideres:rascunho-voto:${votando.votacao.id}:${eu}`}
          onEnviar={async (meus, comecouEm) => {
            try { await enviarVotos(votando.votacao.id, meus, comecouEm); }
            catch (e) { throw new Error(mensagemDoErro(e)); }
            setAbertas(a => a.map(v => (v.votacao.id === votando.votacao.id ? { ...v, enviado_em: new Date().toISOString() } : v)));
          }}
          onFechar={() => { setVotando(null); void carregar(true); }} />
      )}
      {vendo && resultado && (
        <TelaResultado titulo={vendo.titulo} cedula={resultado.cedula} resultados={resultado.resultados} pessoas={resultado.pessoas}
          onFechar={() => setVendo(null)} />
      )}
    </Suspense>
  );
}
