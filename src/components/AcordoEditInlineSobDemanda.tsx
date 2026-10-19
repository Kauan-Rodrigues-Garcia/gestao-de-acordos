import { lazy, Suspense, useEffect, useRef, type ComponentProps } from 'react';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { carregarAcordoEditInline } from '@/hooks/usePrecarregarAcordoEditInline';
import type { AcordoEditInline as AcordoEditInlineEstatico } from '@/components/AcordoEditInline';

/**
 * A área de editar acordo, baixada só quando alguém clica em Editar (19/10/2026).
 *
 * Era import estático nas tabelas do Dashboard e de Acordos, e os ~38 kB gzip
 * dela vinham junto com a página — para quem só lia a lista. As tabelas chamam
 * `usePrecarregarAcordoEditInline`, que traz o pedaço depois que a tela assenta,
 * então o clique costuma encontrar tudo no cache. Ver `lib/sobDemanda.ts`.
 *
 * Não usa `PainelSobDemanda`: aqui a casca vive dentro de um `<tbody>`, e o
 * `<span>` de aviso dele seria DOM inválido. O aviso daqui não desenha nada.
 */
const AcordoEditInlineLazy = lazy(() =>
  carregarAcordoEditInline().then(m => ({ default: m.AcordoEditInline })),
);

type Props = ComponentProps<typeof AcordoEditInlineEstatico>;

export function AcordoEditInline(props: Props) {
  return (
    <ErrorBoundary
      scope="AcordoEditInlineSobDemanda"
      fallback={<AvisoFalha onCancel={props.onCancel} />}
    >
      <Suspense fallback={null}>
        <AcordoEditInlineLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * O download falhou mesmo com a segunda tentativa — quase sempre deploy novo
 * com a aba antiga aberta. Avisa e fecha a edição, para a linha não ficar
 * «editando» sem área nenhuma na tela.
 */
function AvisoFalha({ onCancel }: { onCancel: () => void }): null {
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  useEffect(() => {
    toast.error('Não foi possível abrir a edição do acordo', {
      description: 'Pode ser uma versão nova do sistema. Recarregue a página e tente de novo.',
    });
    onCancelRef.current();
  }, []);
  return null;
}
