/**
 * ChefeDeTeste — o Cavalo da Guerra do «Testar só na minha tela» (ver
 * `ensaioDoChefe.ts`), montado no Layout: o super_admin anda pelo Gestão com ele
 * na tela. Sem teste, não monta nada (nem baixa o chefe).
 */
import { lazy, Suspense } from 'react';
import { golpearNoTeste, limparChefeDeTeste, registrarPalcoDeTeste, useChefeDeTeste } from './ensaioDoChefe';
import type { LoteDeGolpes } from './regras';

const CenaGuerra = lazy(() => import('./CenaGuerra'));
const agora = () => Date.now();
const meus = (l: LoteDeGolpes) => { golpearNoTeste('Você', l); return Promise.resolve(true); };

export function ChefeDeTeste() {
  const teste = useChefeDeTeste();
  if (!teste) return null;
  return (
    <Suspense fallback={null}>
      {/* Quem testa é o super_admin: sem escudo, o clique dele fora do chefe continua sendo clique no Gestão. */}
      <CenaGuerra key={teste.numero} estado={teste.estado} agora={agora} numero={teste.numero} dono="teste" eu="Você" volume={1} escudo={false} medalha="teste"
        aoGolpear={meus} aoGolpearSim={golpearNoTeste} aoFim={limparChefeDeTeste} aoMontar={registrarPalcoDeTeste} />
    </Suspense>
  );
}
