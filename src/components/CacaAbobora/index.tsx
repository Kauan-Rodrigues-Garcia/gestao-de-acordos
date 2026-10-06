/**
 * CacaAbobora — as duas portas da caça no `Layout`.
 *
 *   <FaixaDaCaca />    entre a barra do topo e o conteúdo: o nome de quem
 *                      achou passa por 10 min. É um item do fluxo, não um card
 *                      por cima: não cobre botão nenhum. Presa no alto, fora da
 *                      rolagem: está à vista o tempo todo, em qualquer tela.
 *   <AboboraDaCaca />  a abóbora escondida e o recado de quem clicou.
 *
 * Leves de propósito: o que desenha (`cena.tsx`, o CSS) só é baixado quando há
 * abóbora ou faixa. A regra inteira está em `caca.ts` e na migration
 * 20261005120000.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { aboboraNaTela, faixaNaTela, useCacaAbobora } from './caca';

const carregarCena = comNovaTentativa(() => import('./cena'));

/** Altura da faixa, em px — a mesma do `.cacab-faixa` no CSS. */
const ALTURA_FAIXA = 32;
const FaixaAbobora = lazy(() => carregarCena().then(m => ({ default: m.FaixaAbobora })));
const CenaCaca     = lazy(() => carregarCena().then(m => ({ default: m.CenaCaca })));

export function FaixaDaCaca({ empresaId }: { empresaId: string | null | undefined }) {
  const caca = useCacaAbobora(empresaId);
  const rodada = faixaNaTela(caca, Date.now()) ? caca.rodada : null;
  return (
    // `initial={false}`: quem entra com a faixa já passando não vê ela abrir.
    <AnimatePresence initial={false}>
      {rodada && (
        <motion.div
          key={rodada.id}
          // `sticky` e acima dos enfeites do Halloween: mesmo que alguma tela
          // role a coluna inteira, a faixa fica no alto e à vista.
          className="sticky top-0 z-[35] flex-shrink-0 overflow-hidden"
          initial={{ height: 0 }}
          animate={{ height: ALTURA_FAIXA }}
          exit={{ height: 0 }}
          transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1] }}
        >
          <Suspense fallback={null}><FaixaAbobora rodada={rodada} /></Suspense>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AboboraDaCaca({ empresaId }: { empresaId: string | null | undefined }) {
  const caca = useCacaAbobora(empresaId);
  const naTela = aboboraNaTela(caca, Date.now());
  // Depois da primeira abóbora a cena fica montada: o recado de quem clicou
  // precisa sobreviver à abóbora, que some no clique.
  const [montada, setMontada] = useState(false);
  useEffect(() => { if (naTela) setMontada(true); }, [naTela]);
  if (!montada && !naTela) return null;
  return (
    <Suspense fallback={null}>
      <CenaCaca rodada={naTela ? caca.rodada : null} />
    </Suspense>
  );
}
