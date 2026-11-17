/**
 * AvisoArte — a arte lançada abrindo sozinha na tela de cada um (17/11/2026).
 *
 * Montado no `Layout` e nas telas do app do celular, para todo mundo logado.
 * Pergunta ao banco (`fn_artes_minhas`) quais artes estão no ar para a pessoa;
 * a que ela ainda não viu abre sozinha, uma vez. Ao fechar, fica registrado
 * (`fn_artes_vi`) — o painel do super_admin mostra quantos já viram. Se outra
 * janela estiver aberta (a votação, por exemplo), espera ela fechar.
 *
 * Mesmo cuidado com o banco dos outros avisos: a cada 5 min com folga sorteada,
 * nada com a aba escondida, volta à aba com espera sorteada. Banco sem a
 * migration: nada aparece e não pergunta de novo até recarregar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { faltaMigration, lerMinhas, marcarVi, type MinhaArte } from './banco';
import { TelaArte } from './TelaArte';

const INTERVALO_MS = 5 * 60_000;
const FOLGA_MS = 60_000;
const VOLTA_MS = 20_000;
const RECENTE_MS = 2 * 60_000;
const ESPERA_JANELA_MS = 3_000;

// Reforço local: o «vi» do banco pode demorar (ou falhar) e a arte não pode voltar.
const chave = (eu: string, id: string) => `artes:vi:${eu}:${id}`;
const viAqui = (eu: string, id: string) => { try { return localStorage.getItem(chave(eu, id)) === '1'; } catch { return false; } };
const marcarAqui = (eu: string, id: string) => { try { localStorage.setItem(chave(eu, id), '1'); } catch { /* sem armazenamento */ } };

/** Outra janela modal aberta por cima da tela? */
const temJanelaAberta = () => !!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');

export function AvisoArte() {
  const { perfil } = useAuth();
  const eu = perfil?.id ?? null;
  const [artes, setArtes] = useState<MinhaArte[]>([]);
  const [aberta, setAberta] = useState<MinhaArte | null>(null);
  const semMigration = useRef(false);
  const ultimaLeitura = useRef(0);

  const carregar = useCallback(async (forcar = false) => {
    if (!eu || semMigration.current) return;
    if (!forcar && Date.now() - ultimaLeitura.current < RECENTE_MS) return;
    ultimaLeitura.current = Date.now();
    try {
      setArtes(await lerMinhas());
    } catch (e) {
      if (faltaMigration(e)) semMigration.current = true;
    }
  }, [eu]);

  useEffect(() => {
    if (!eu) return;
    void carregar(true);
    let timer = 0;
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

  const proxima = eu ? artes.find(a => !a.vi && !viAqui(eu, a.id)) ?? null : null;

  // Abre a próxima não vista assim que não houver outra janela por cima.
  useEffect(() => {
    if (!proxima || aberta) return;
    let t = 0;
    const tentar = () => {
      if (document.visibilityState === 'visible' && !temJanelaAberta()) setAberta(proxima);
      else t = window.setTimeout(tentar, ESPERA_JANELA_MS);
    };
    t = window.setTimeout(tentar, 1_200);
    return () => window.clearTimeout(t);
  }, [proxima, aberta]);

  const fechar = useCallback(() => {
    if (!aberta || !eu) return;
    marcarAqui(eu, aberta.id);
    setArtes(l => l.map(a => (a.id === aberta.id ? { ...a, vi: true } : a)));
    setAberta(null);
    marcarVi(aberta.id).catch(() => { /* o reforço local segura */ });
  }, [aberta, eu]);

  if (!eu || !aberta) return null;
  return <TelaArte arte={{ modelo: aberta.modelo, conteudo: aberta.conteudo, tema: aberta.tema }} titulo={aberta.titulo} onFechar={fechar} />;
}
