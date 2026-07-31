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
import { tocarSomComemoracao, tocarArquivoDeSom, estaMudo, definirMudo } from '@/lib/som-comemoracao';
import { efeitoValido, somValido } from '@/pages/Comemoracoes/catalogo';
import { ouvirTeste, type ComemoracaoTeste } from '@/pages/Comemoracoes/testeLocal';
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

  /**
   * Ensaio local do botão "Testar" — nunca vem do banco, nunca vai para os
   * outros. Ver `testeLocal.ts`.
   */
  const [teste, setTeste] = useState<ComemoracaoTeste | null>(null);
  const timerTesteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => ouvirTeste((c) => {
    if (timerTesteRef.current) clearTimeout(timerTesteRef.current);
    setTeste(c);
    // Ensaio ignora o mudo: quem clicou em Testar pediu para ver E ouvir.
    if (c.somUrl) tocarArquivoDeSom(c.somUrl, true);
    else tocarSomComemoracao(somValido(c.som), true);
    timerTesteRef.current = setTimeout(() => setTeste(null), c.duracaoS * 1000);
  }), []);

  useEffect(() => () => {
    if (timerTesteRef.current) clearTimeout(timerTesteRef.current);
  }, []);

  useEffect(() => {
    if (!atual) { tocadoRef.current = null; return; }
    if (tocadoRef.current === atual.id) return;
    tocadoRef.current = atual.id;
    // O som enviado pelo líder tem precedência sobre o do catálogo.
    if (atual.som_url) tocarArquivoDeSom(atual.som_url);
    else tocarSomComemoracao(somValido(atual.som));
  }, [atual]);

  function alternarMudo() {
    const novo = !mudo;
    setMudo(novo);
    definirMudo(novo);
  }

  // O ensaio tem precedência: quem clicou em Testar quer ver o ensaio, não uma
  // comemoração de verdade que entrou no meio.
  const emCena = teste
    ? {
        chave:    'teste',
        titulo:   teste.titulo,
        mensagem: teste.mensagem,
        homenageados: teste.homenageados,
        gifUrl:   teste.gifUrl,
        layout:   teste.layout,
        efeito:   efeitoValido(teste.efeito),
        duracaoS: teste.duracaoS,
        fechar:   () => setTeste(null),
        ehTeste:  true,
      }
    : atual
      ? {
          chave:    atual.id,
          titulo:   atual.titulo,
          mensagem: atual.mensagem,
          homenageados: atual.homenageados,
          gifUrl:   atual.gif_url,
          layout:   atual.layout,
          efeito:   efeitoValido(atual.efeito),
          duracaoS: atual.duracao_s,
          fechar,
          ehTeste:  false,
        }
      : null;

  return (
    <AnimatePresence>
      {emCena && (
        <motion.div
          key={emCena.chave}
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
          <EfeitoComemoracao efeito={emCena.efeito} id={emCena.chave} />

          {/* Sem caixa colorida, o card precisa de largura para o texto
              respirar sobre a tela de trabalho. */}
          <div className="relative w-full max-w-xl">
            {emCena.ehTeste && (
              // Deixa claro que ninguém mais está vendo isto.
              <span className="pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
                Teste · só você vê
              </span>
            )}

            <CardComemoracao
              titulo={emCena.titulo}
              mensagem={emCena.mensagem}
              homenageados={emCena.homenageados}
              gifUrl={emCena.gifUrl}
              layout={emCena.layout}
              tempoTotalS={emCena.duracaoS}
              onFechar={emCena.fechar}
            />

            <button
              type="button"
              onClick={alternarMudo}
              aria-label={mudo ? 'Ligar o som das comemorações' : 'Silenciar as comemorações'}
              title={mudo ? 'Som desligado' : 'Silenciar comemorações'}
              className="pointer-events-auto absolute left-0 top-0 z-20 rounded-full bg-black/40 p-1 text-white/90 transition-colors hover:bg-black/70"
            >
              {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
