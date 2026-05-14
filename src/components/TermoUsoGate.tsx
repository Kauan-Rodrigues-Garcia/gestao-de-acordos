import { useTermoUso } from '@/hooks/useTermoUso';
import { useAuth } from '@/hooks/useAuth';
import { ModalTermoUso } from '@/components/ModalTermoUso';

interface TermoUsoGateProps {
  children: React.ReactNode;
}

export function TermoUsoGate({ children }: TermoUsoGateProps) {
  const { termoAtivo, precisaAceitar, loading, registrarAceite } = useTermoUso();
  const { signOut } = useAuth();

  return (
    <>
      {children}
      {!loading && precisaAceitar && (
        <ModalTermoUso
          open={true}
          termo={termoAtivo}
          onAceitar={registrarAceite}
          onRecusar={() => signOut()}
        />
      )}
    </>
  );
}
