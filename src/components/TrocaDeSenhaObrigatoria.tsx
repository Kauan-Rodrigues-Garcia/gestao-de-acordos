/**
 * TrocaDeSenhaObrigatoria — o portão da senha que precisa ser trocada.
 *
 * Dois portões, um de cada vez (`SenhaInicial/liberacao.ts › qualPortao`):
 *
 *   • 'pedido' (05/11/2026): senha resetada pelo canal «Senhas», resetada
 *     direto pela administração ou conta recém-criada
 *     (`perfis.senha_troca_obrigatoria`). A pessoa entra com a senha
 *     provisória e encontra o modal de sempre.
 *   • 'inicial' (10/11/2026): a campanha da senha inicial. Quem ainda estava
 *     com a senha igual para todo mundo (`perfis.senha_inicial_pendente`) vê o
 *     card «Uma senha só sua» — mas só depois de o super admin liberar em
 *     Configurações › Geral.
 *
 * Nos dois, o modal fica por cima de tudo e não fecha: o sistema só fica
 * usável depois de criar a senha nova. A saída é «Sair».
 *
 * Monta uma vez no `App`, dentro do Router, para valer no site E no app do
 * celular (as rotas `/m…` não passam pelo `Layout`). No «Entrar como» não
 * aparece: a senha é da pessoa, e quem está na tela é o super admin.
 *
 * A trava de verdade é do banco: só `fn_senha_troca_concluida` desliga as
 * colunas (`trg_perfis_guarda_troca_obrigatoria`), e só se a senha mudou.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { CardSenhaInicial } from './SenhaInicial/CardSenhaInicial';
import { qualPortao, useSenhaInicialLiberada } from './SenhaInicial/liberacao';
import { TrocarSenhaModal } from './TrocarSenhaModal';

export function TrocaDeSenhaObrigatoria(): React.ReactElement | null {
  const { perfil, signOut, refreshPerfil } = useAuth();
  const [trocou, setTrocou] = useState<string | null>(null);
  // Só quem está marcado pergunta pela liberação: os demais não leem a tabela.
  const marcada = perfil?.senha_inicial_pendente === true;
  const liberada = useSenhaInicialLiberada(perfil?.empresa_id, marcada);
  const portao = qualPortao(perfil, liberada);

  // Outro login na mesma aba: a marca de «já trocou» é por pessoa.
  useEffect(() => { if (trocou && trocou !== perfil?.id) setTrocou(null); }, [perfil?.id, trocou]);

  if (!perfil?.id || !portao || trocou === perfil.id || getImpersonacaoAtiva()) return null;

  const aoTrocar = () => { setTrocou(perfil.id); void refreshPerfil(); };
  const sair = () => { void signOut(); };

  if (portao === 'inicial') {
    return <CardSenhaInicial nome={perfil.nome} usuario={perfil.usuario} onTrocada={aoTrocar} onSair={sair} />;
  }

  return (
    <TrocarSenhaModal
      open
      obrigatoria
      perfilId={perfil.id}
      onOpenChange={() => {}}
      onTrocada={aoTrocar}
      onSair={sair}
    />
  );
}
