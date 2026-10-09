/**
 * CacaAbobora — as duas portas da Caça aos Zumbis no `Layout` (até 07/10/2026,
 * Caça à Abóbora; o nome da pasta e do banco ficou).
 *
 *   <FaixaDaCaca />    entre a barra do topo e o conteúdo: o nome de quem
 *                      matou passa por 10 min. É um item do fluxo, não um card
 *                      por cima: não cobre botão nenhum. Presa no alto, fora da
 *                      rolagem: está à vista o tempo todo, em qualquer tela.
 *   <AboboraDaCaca />  o zumbi escondido, a morte dele e o recado de quem atirou.
 *
 * Leves de propósito: o que desenha (`cena.tsx`, a física, o CSS) só é baixado
 * quando há zumbi ou faixa. A regra inteira está em `caca.ts` e nas migrations
 * 20261005120000 e 20261007200000.
 *
 * O chefão (o Rei do Pop zumbi, 09/10/2026) vem junto, dentro de
 * `<AboboraDaCaca />`: a cena dele (`cenaChefao.tsx`) também só é baixada
 * quando ele está na tela. A regra está em `chefao.ts` e na migration
 * 20261009120000.
 *
 * No localhost há ainda o laboratório (`?zumbis` no endereço): solta zumbis de
 * mentira, sem banco, para ver tudo funcionando. Fora do `npm run dev` ele nem
 * existe no pacote.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { comNovaTentativa } from '@/lib/sobDemanda';
import { useAuthOpcional } from '@/hooks/useAuth';
import { aboboraNaTela, faixaNaTela, useCacaAbobora } from './caca';
import { EU_NO_ENSAIO, chefaoNaTela, useChefao, useChefaoDesligado } from './chefao';

export { BotaoChefao } from './BotaoChefao';

const carregarCena = comNovaTentativa(() => import('./cena'));

/** Altura da faixa, em px — a mesma do `.zb-faixa` no CSS. */
const ALTURA_FAIXA = 32;
const FaixaAbobora = lazy(() => carregarCena().then(m => ({ default: m.FaixaAbobora })));
const CenaCaca     = lazy(() => carregarCena().then(m => ({ default: m.CenaCaca })));

const carregarChefao = comNovaTentativa(() => import('./cenaChefao'));
const CenaChefao = lazy(() => carregarChefao().then(m => ({ default: m.CenaChefao })));

const Laboratorio = import.meta.env.DEV ? lazy(() => import('./laboratorio')) : null;
const comLaboratorio = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('zumbis');

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
  // Depois do primeiro zumbi a cena fica montada: a morte e o recado precisam
  // sobreviver à rodada, que vira «achada» no tiro.
  const [montada, setMontada] = useState(false);
  useEffect(() => { if (naTela) setMontada(true); }, [naTela]);
  // O laboratório fica sempre no mesmo lugar da árvore: se mudasse de lugar
  // quando o primeiro zumbi sai, remontaria e perderia o zumbi escolhido.
  return (
    <>
      {(montada || naTela) && (
        <Suspense fallback={null}>
          <CenaCaca rodada={caca.rodada} naTela={naTela} />
        </Suspense>
      )}
      <ChefaoDaCaca />
      {Laboratorio && comLaboratorio() && <Suspense fallback={null}><Laboratorio /></Suspense>}
    </>
  );
}

/**
 * O chefão: montado quando ele aparece, e assim fica (com a chave da rodada)
 * até ele cair ou fugir e o ranking fechar.
 */
function ChefaoDaCaca() {
  const rodada = useChefao();
  const auth = useAuthOpcional();
  const usuario = auth?.user?.id ?? null;
  const superAdmin = auth?.perfil?.perfil === 'super_admin';
  // Quem escondeu o chefão (o X no meio da barra do topo) não vê nada dele.
  const desligado = useChefaoDesligado(auth?.perfil?.id);
  const ativo = chefaoNaTela(rodada, Date.now());
  const [cena, setCena] = useState<number | null>(null);
  useEffect(() => { if (ativo && rodada) setCena(rodada.id); }, [ativo, rodada]);
  const acabar = useCallback(() => setCena(null), []);
  if (!rodada || cena !== rodada.id || desligado) return null;
  return (
    <Suspense fallback={null}>
      <CenaChefao key={rodada.id} rodada={rodada} eu={rodada.id < 0 ? EU_NO_ENSAIO : usuario} superAdmin={superAdmin} aoAcabar={acabar} />
    </Suspense>
  );
}
