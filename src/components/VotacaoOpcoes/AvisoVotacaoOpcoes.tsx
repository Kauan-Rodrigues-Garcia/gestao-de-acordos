/**
 * AvisoVotacaoOpcoes — a mensagem que chama para votar (16/11/2026).
 *
 * Montado no `Layout` e nas telas do app do celular, para todo mundo logado.
 * Pergunta ao banco (`fn_votacao_opcoes_minhas`) se há votação aberta em que a
 * pessoa vota e ainda não votou. Se há:
 *   - a TELA DA VOTAÇÃO abre sozinha, uma vez por sessão do navegador (a
 *     pessoa pode deixar para depois);
 *   - fica uma PÍLULA no pé da tela, «Votação de dezembro · Votar», até votar.
 *
 * Quem não vota em nada não vê nada. Banco sem a migration: nada aparece e
 * não pergunta de novo até recarregar.
 *
 * Mesmo cuidado com o banco do aviso da liderança: a cada 5 min com folga
 * sorteada, nada com a aba escondida, volta à aba com espera sorteada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Vote } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { faltaMigration, lerMinhas, mensagemDoErro, votar, type MinhaVotacaoOpcoes } from './banco';
import { TelaVotacaoOpcoes } from './TelaVotacaoOpcoes';

const INTERVALO_MS = 5 * 60_000;
const FOLGA_MS = 60_000;
const VOLTA_MS = 20_000;
const RECENTE_MS = 2 * 60_000;

const chaveAbriu = (id: string) => `votacao-opcoes:abriu:${id}`;
const jaAbriu = (id: string) => { try { return sessionStorage.getItem(chaveAbriu(id)) === '1'; } catch { return false; } };
const marcarAbriu = (id: string) => { try { sessionStorage.setItem(chaveAbriu(id), '1'); } catch { /* sem armazenamento */ } };

export function PilulaVotacaoOpcoes({ titulo, onAbrir, acimaDoRodape }: { titulo: string; onAbrir: () => void; acimaDoRodape?: number }) {
  return (
    // No meio do pé: o canto esquerdo é do card da liderança e o direito, da bolha do chat.
    // O centro fica na caixa de fora: o framer-motion escreve o transform do botão.
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
      className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center print:hidden"
      style={{ bottom: acimaDoRodape !== undefined ? `calc(env(safe-area-inset-bottom) + ${16 + acimaDoRodape}px)` : 16 }}>
      <button type="button" onClick={onAbrir}
        className="pointer-events-auto flex max-w-[calc(100vw-9rem)] items-center gap-2.5 rounded-full border border-primary/50 bg-card py-2 pl-2.5 pr-4 text-[15px] font-semibold shadow-xl hover:border-primary">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Vote className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-warning" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate">{titulo}</span>
        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">Votar</span>
      </button>
    </motion.div>
  );
}

export function AvisoVotacaoOpcoes({ acimaDoRodape }: { acimaDoRodape?: number }) {
  const { perfil } = useAuth();
  const eu = perfil?.id ?? null;
  const [abertas, setAbertas] = useState<MinhaVotacaoOpcoes[]>([]);
  const [aberta, setAberta] = useState<MinhaVotacaoOpcoes | null>(null);
  const semMigration = useRef(false);
  const ultimaLeitura = useRef(0);

  const carregar = useCallback(async (forcar = false) => {
    if (!eu || semMigration.current) return;
    if (!forcar && Date.now() - ultimaLeitura.current < RECENTE_MS) return;
    ultimaLeitura.current = Date.now();
    try {
      setAbertas(await lerMinhas());
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

  const aVotar = abertas.find(v => !v.meu_voto) ?? null;

  // A primeira vez nesta sessão: a votação abre sozinha.
  useEffect(() => {
    if (aVotar && !aberta && !jaAbriu(aVotar.id)) {
      marcarAbriu(aVotar.id);
      setAberta(aVotar);
    }
  }, [aVotar, aberta]);

  if (!eu) return null;
  return (
    <>
      <AnimatePresence>
        {aVotar && !aberta && (
          <PilulaVotacaoOpcoes key={aVotar.id} titulo={aVotar.titulo} acimaDoRodape={acimaDoRodape} onAbrir={() => setAberta(aVotar)} />
        )}
      </AnimatePresence>
      {aberta && (
        <TelaVotacaoOpcoes titulo={aberta.titulo} pergunta={aberta.pergunta} opcoes={aberta.opcoes} meuVoto={aberta.meu_voto}
          onVotar={async opcao => {
            try { await votar(aberta.id, opcao); }
            catch (e) { throw new Error(mensagemDoErro(e)); }
            setAbertas(l => l.map(v => (v.id === aberta.id ? { ...v, meu_voto: opcao, votado_em: new Date().toISOString() } : v)));
          }}
          onFechar={() => { setAberta(null); void carregar(true); }} />
      )}
    </>
  );
}
