/**
 * A tela do Pix Automático — item próprio no menu, embaixo de Novo Acordo.
 *
 * ## Por que saiu de dentro de Acordos (16/10/2026)
 *
 * Até aqui ela era a quinta aba da lista de acordos (`/acordos?tab=pix`), e
 * tudo dividia uma página só: registro, metas, fila de NR em disputa,
 * premiação da dobra, ranking e a tabela. Coisa demais na mesma rolagem — a
 * fila de NR, que precisa de decisão, ficava no meio de painéis de
 * acompanhamento, e passava batida.
 *
 * Agora a tela é do Pix, e as perguntas viraram sub-abas (ver
 * `PixAutomatico`). O conteúdo continua em `pages/Acordos/`, onde sempre
 * morou: mudar a tela de lugar não pedia mudar meia centena de imports.
 *
 * O link antigo continua valendo — as notificações já gravadas no banco
 * apontam para ele, e a página Acordos o redireciona para cá.
 */
import { Navigate } from 'react-router-dom';
import { useTenant } from '@/lib/tenant-config';
import { PixAutomatico } from '@/pages/Acordos/PixAutomatico';

export default function PaginaPixAutomatico() {
  // A mesma porta da página de onde ela saiu: Acordos manda a PaguePlay para o
  // Dashboard, e a aba do Pix nunca existiu lá.
  const tenant = useTenant();
  if (tenant.isPaguePlay) return <Navigate to="/" replace />;

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-[1400px] mx-auto">
        <PixAutomatico />
      </div>
    </div>
  );
}
