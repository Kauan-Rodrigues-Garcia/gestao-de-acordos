import { useTermoUso } from '@/hooks/useTermoUso';
import { useAuth } from '@/hooks/useAuth';
import { ModalTermoUso } from '@/components/ModalTermoUso';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';

interface TermoUsoGateProps {
  children: React.ReactNode;
}

export function TermoUsoGate({ children }: TermoUsoGateProps) {
  const { termoAtivo, precisaAceitar, loading, registrarAceite } = useTermoUso();
  const { signOut } = useAuth();
  // No «Entrar como» o termo não aparece: o aceite é da pessoa, e quem está na
  // tela é o super admin (28/10/2026).
  const impersonando = !!getImpersonacaoAtiva();

  return (
    <>
      {children}
      {!loading && precisaAceitar && !impersonando && (
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
