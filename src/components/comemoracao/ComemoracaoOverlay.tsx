/**
 * ComemoracaoOverlay — a comemoração explodindo na tela.
 *
 * Montado no `Layout`, vizinho do `NotificacaoToast`: assim aparece em qualquer
 * página, que é o ponto — a meta é batida enquanto as pessoas trabalham, não
 * enquanto olham uma aba específica.
 *
 * Três decisões de convivência, porque isto passa por cima de gente atendendo:
 *   • o card NÃO bloqueia cliques (`pointer-events-none`, exceto os botões);
 *   • dá para silenciar, e a preferência fica no navegador de cada um;
 *   • uma comemoração por vez — duas sobrepostas seriam ilegíveis.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useComemoracoes, useComemoracaoNoAr } from '@/hooks/useComemoracoes';
import { tocarSomComemoracao, estaMudo, definirMudo } from '@/lib/som-comemoracao';
import { efeitoValido, somValido } from '@/pages/Comemoracoes/catalogo';
import { CardComemoracao } from './CardComemoracao';
import { EfeitoComemoracao } from './EfeitoComemoracao';

export function ComemoracaoOverlay() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  const setorId   = perfil?.setor_id ?? null;

  const { comemoracoes, agoraCorrigido } = useComemoracoes(empresaId, !!usuarioId);
  const { atual, fechar } = useComemoracaoNoAr({
    comemoracoes,
    meuSetorId:   setorId,
    meuUsuarioId: usuarioId,
    agoraCorrigido,
  });

  const [mudo, setMudo] = useState(() => estaMudo());
  /** Evita tocar duas vezes a mesma comemoração se o efeito reexecutar. */
  const tocadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!atual) { tocadoRef.current = null; return; }
    if (tocadoRef.current === atual.id) return;
    tocadoRef.current = atual.id;
    tocarSomComemoracao(somValido(atual.som));
  }, [atual]);

  function alternarMudo() {
    const novo = !mudo;
    setMudo(novo);
    definirMudo(novo);
  }

  return (
    <AnimatePresence>
      {atual && (
        <motion.div
          key={atual.id}
          // O container inteiro ignora o mouse: sem isto a comemoração de um
          // minuto travaria quem está tabulando embaixo dela.
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-4"
          initial={{ opacity: 0, y: -60, scale: 0.9 }}
          animate={{ opacity: 1, y: 0,   scale: 1 }}
          exit={{    opacity: 0, y: -40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          role="status"
          aria-live="polite"
        >
          <EfeitoComemoracao efeito={efeitoValido(atual.efeito)} id={atual.id} />

          <div className="relative w-full max-w-lg">
            <CardComemoracao
              titulo={atual.titulo}
              mensagem={atual.mensagem}
              homenageados={atual.homenageados}
              tempoTotalS={atual.duracao_s}
              onFechar={fechar}
            />

            <button
              type="button"
              onClick={alternarMudo}
              aria-label={mudo ? 'Ligar o som das comemorações' : 'Silenciar as comemorações'}
              title={mudo ? 'Som desligado' : 'Silenciar comemorações'}
              className="pointer-events-auto absolute left-2 top-2 z-10 rounded-full bg-black/20 p-1 text-white/80 transition-colors hover:bg-black/40 hover:text-white"
            >
              {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
