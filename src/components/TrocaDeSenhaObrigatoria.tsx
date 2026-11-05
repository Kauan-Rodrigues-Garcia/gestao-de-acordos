/**
 * TrocaDeSenhaObrigatoria — o portão da senha resetada por pedido (05/11/2026).
 *
 * Quem teve a senha resetada pelo canal «Senhas» (`perfis.senha_troca_obrigatoria`)
 * entra com a senha provisória e encontra este modal por cima de tudo: não
 * fecha, e o sistema só fica usável depois de criar uma senha nova. A saída
 * é «Sair».
 *
 * Monta uma vez no `App`, dentro do Router, para valer no site E no app do
 * celular (as rotas `/m…` não passam pelo `Layout`). No «Entrar como» não
 * aparece: a senha é da pessoa, e quem está na tela é o super admin.
 *
 * A trava de verdade é do banco: só `fn_senha_troca_concluida` desliga a
 * coluna (`trg_perfis_guarda_troca_obrigatoria`).
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { TrocarSenhaModal } from './TrocarSenhaModal';

export function TrocaDeSenhaObrigatoria(): React.ReactElement | null {
  const { perfil, signOut, refreshPerfil } = useAuth();
  const [trocou, setTrocou] = useState<string | null>(null);
  const exigida = perfil?.senha_troca_obrigatoria === true;

  // Outro login na mesma aba: a marca de «já trocou» é por pessoa.
  useEffect(() => { if (trocou && trocou !== perfil?.id) setTrocou(null); }, [perfil?.id, trocou]);

  if (!perfil?.id || !exigida || trocou === perfil.id || getImpersonacaoAtiva()) return null;

  return (
    <TrocarSenhaModal
      open
      obrigatoria
      perfilId={perfil.id}
      onOpenChange={() => {}}
      onTrocada={() => { setTrocou(perfil.id); void refreshPerfil(); }}
      onSair={() => { void signOut(); }}
    />
  );
}
