/**
 * A tela do celular mora só em `app.gestaodeacordos.com.br` (Cleber, 07/10/2026).
 *
 * No endereço do site (`www.`, `pagueplay.`), qualquer rota do app — link
 * antigo, app instalado pelo endereço velho, toque num aviso antigo — vai para
 * a mesma tela no `app.`. Antes de sair, os avisos do endereço antigo são
 * desligados (`aposentarAvisosDesteEndereco`): eles passam a chegar pelo app.
 *
 * É outro endereço, então a sessão não vai junto: lá a pessoa entra de novo.
 */
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { mobileNesteEndereco, urlNoApp } from '@/lib/mobile/preferencia';
import { aposentarAvisosDesteEndereco } from '@/lib/mobile/push';

/** Quanto esperar a limpeza dos avisos antes de sair mesmo assim. */
const ESPERA_MAXIMA_MS = 2500;

export function SoNoEnderecoDoApp({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (mobileNesteEndereco()) return <>{children}</>;
  return <IrParaOApp caminho={`${location.pathname}${location.search}`} />;
}

function IrParaOApp({ caminho }: { caminho: string }) {
  useEffect(() => {
    let saiu = false;
    const sair = () => {
      if (saiu) return;
      saiu = true;
      window.location.replace(urlNoApp(caminho));
    };
    const espera = window.setTimeout(sair, ESPERA_MAXIMA_MS);
    void aposentarAvisosDesteEndereco().finally(sair);
    return () => window.clearTimeout(espera);
  }, [caminho]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8 text-center">
      <p className="text-sm text-muted-foreground">Abrindo o app…</p>
    </div>
  );
}
