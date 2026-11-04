/**
 * PalcoDoOrganizador — onde o «Assistir» e o «Testar só na minha tela» do
 * super_admin moram (ver `palcosSoltos.ts`): no Layout, ao lado da
 * `CorridaDaSorte`. Trocar de aba não fecha nada; sem nada aberto, não monta
 * nada (nem baixa a corrida).
 */
import { lazy, Suspense } from 'react';
import { pararDeAssistir, pararDeTestar, usePalcosDoOrganizador } from './palcosSoltos';

const PalcoAoVivo = lazy(() => import('../PalcoAoVivo'));
const TesteCorrida = lazy(() => import('../TesteCorrida'));
const PalcoCavalos = lazy(() => import('../cavalos/PalcoCavalos'));
const TesteCavalos = lazy(() => import('../cavalos/TesteCavalos'));

export function PalcoDoOrganizador() {
  const { assistindo, testando } = usePalcosDoOrganizador();
  if (!assistindo && !testando) return null;
  return (
    <Suspense fallback={null}>
      {assistindo && (assistindo.cavalos
        ? <PalcoCavalos corridaId={assistindo.corridaId} adm onFechar={pararDeAssistir} />
        : <PalcoAoVivo corridaId={assistindo.corridaId} onFechar={pararDeAssistir} />)}
      {testando && (testando.cavalos
        ? <TesteCavalos onFechar={pararDeTestar} />
        : <TesteCorrida premio={testando.premio} onFechar={pararDeTestar} tema={testando.tema} especial={testando.especial} palpiteDemo />)}
    </Suspense>
  );
}
