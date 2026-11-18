/**
 * AvisoNascimento — abre o livro para o setor do aviso (18/11/2026).
 *
 * Quem decide o público é o banco (`fn_nascimento_meu`): pessoa ativa cujo setor
 * do cadastro é o do aviso. Ao liberar, o sinal `permissoes` traz o setor, e só
 * esse setor relê. Sem sinal, a leitura de 15 em 15 min pega quem ficou de fora.
 *
 * Impersonação não recebe o card, para não marcar «viu» em nome de outra pessoa.
 * Banco sem a migration: nada aparece e não pergunta de novo.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { assinarSinal } from '@/lib/sinais';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { faltaMigration, lerMeus, marcarVi, mensagemDoErro, salvarRecado, urlDaFoto, type MeuAviso } from './banco';

const TelaNascimento = lazy(() => import('./TelaNascimento'));

const INTERVALO_MS = 15 * 60_000;
const FOLGA_MS = 2 * 60_000;
const ESPERA_JANELA_MS = 3_000;
const ADIAR_MS = 30 * 60_000;

const chaveVi = (eu: string, id: string) => `nascimento:vi:${eu}:${id}`;
const chaveAdiou = (eu: string, id: string) => `nascimento:adiou:${eu}:${id}`;
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const temJanelaAberta = () => !!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');

export function AvisoNascimento() {
  const { perfil } = useAuth();
  const eu = perfil?.id ?? null, setor = perfil?.setor_id ?? null, empresa = perfil?.empresa_id ?? null;
  const [avisos, setAvisos] = useState<MeuAviso[]>([]);
  const [aberto, setAberto] = useState<{ aviso: MeuAviso; fotoUrl: string } | null>(null);
  const [relogio, setRelogio] = useState(0);
  const semMigration = useRef(false);

  const carregar = useCallback(async () => {
    if (!eu || semMigration.current || getImpersonacaoAtiva()) return;
    try { setAvisos(await lerMeus()); }
    catch (e) { if (faltaMigration(e)) semMigration.current = true; }
  }, [eu]);

  useEffect(() => {
    if (!eu) return;
    void carregar();
    let timer = 0;
    const agendar = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') void carregar();
        agendar();
      }, INTERVALO_MS + Math.random() * FOLGA_MS);
    };
    agendar();
    return () => window.clearTimeout(timer);
  }, [eu, carregar]);

  useEffect(() => {
    if (!empresa || !setor) return;
    return assinarSinal('permissoes', empresa, {
      onMudou: s => { if (s.tabela === `aviso_nascimento:${setor}`) void carregar(); },
      onReconectado: () => { void carregar(); },
    });
  }, [empresa, setor, carregar]);

  const proximo = eu ? avisos.find(a => {
    if (a.vi || ler(chaveVi(eu, a.id))) return false;
    return Number(ler(chaveAdiou(eu, a.id)) ?? 0) <= Date.now();
  }) ?? null : null;

  useEffect(() => {
    if (!proximo || aberto) return;
    let vivo = true, t = 0;
    const tentar = async () => {
      if (!vivo) return;
      if (document.visibilityState !== 'visible' || temJanelaAberta()) { t = window.setTimeout(() => { void tentar(); }, ESPERA_JANELA_MS); return; }
      try {
        const fotoUrl = await urlDaFoto(proximo.foto_caminho);
        const img = new Image();
        img.src = fotoUrl;
        await img.decode();
        if (vivo) setAberto({ aviso: proximo, fotoUrl });
      } catch { t = window.setTimeout(() => { void tentar(); }, 60_000); }
    };
    t = window.setTimeout(() => { void tentar(); }, 800);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [proximo, aberto]);

  // Passou a meia hora do «Abrir depois»: confere de novo.
  useEffect(() => {
    if (!eu || aberto || !avisos.some(a => !a.vi && Number(ler(chaveAdiou(eu, a.id)) ?? 0) > Date.now())) return;
    const t = window.setTimeout(() => setRelogio(n => n + 1), 60_000);
    return () => window.clearTimeout(t);
  }, [eu, aberto, avisos, relogio]);

  if (!eu || !aberto) return null;
  const { aviso, fotoUrl } = aberto;
  return (
    <Suspense fallback={null}>
      <TelaNascimento conteudo={aviso.conteudo} fotoUrl={fotoUrl} podeRecado={aviso.pode_recado} meuRecado={aviso.meu_recado}
        onAberto={() => {
          gravar(chaveVi(eu, aviso.id), '1');
          marcarVi(aviso.id).catch(() => { /* o reforço local segura */ });
        }}
        onRecado={async texto => {
          try { await salvarRecado(aviso.id, texto); }
          catch (e) { throw new Error(mensagemDoErro(e)); }
        }}
        onAdiar={() => { gravar(chaveAdiou(eu, aviso.id), String(Date.now() + ADIAR_MS)); setAberto(null); }}
        onFim={() => { setAvisos(l => l.map(a => (a.id === aviso.id ? { ...a, vi: true } : a))); setAberto(null); }} />
    </Suspense>
  );
}
