/**
 * Os avisos na visão Equipe — L2 da liderança (migration 20260930200000).
 *
 *   • «Equipe bateu a meta»: sempre, para quem lidera e para a equipe;
 *   • resumo por hora do recebido da equipe — pedido de 30/09/2026: o líder
 *     recebe; o elite, que tem as duas visões, escolhe. A chave mora aqui, e o
 *     padrão vem do banco (ligado para quem só lidera, desligado para os outros).
 *
 * O aparelho é o mesmo da `/m`: ativar aqui ou lá é a mesma inscrição.
 */
import { useAvisos } from '../useAvisos';
import { useResumoEquipe } from './useResumoEquipe';

export function AvisosDaEquipe({ empresaId, onInstalar }: { empresaId: string | null; onInstalar?: () => void }) {
  const avisos = useAvisos(empresaId, 'equipe');
  const ativo = avisos.estado === 'ativo';
  const resumo = useResumoEquipe(ativo);

  if (avisos.estado === 'desligado' || avisos.estado === 'sem-suporte') return null;

  return (
    <>
      <div className="e-sec"><span className="e-olho">Avisos no celular</span></div>
      <div className="e-grupo">
        {!ativo ? (
          <div className="e-aviso-ativar">
            {avisos.estado === 'negado' ? (
              <p>
                <b>Avisos bloqueados neste aparelho</b>
                Para liberar, permita as notificações do app nas configurações do celular e volte aqui.
              </p>
            ) : avisos.estado === 'precisa-instalar' ? (
              <>
                <p>
                  <b>Instale o app para receber avisos</b>
                  No iPhone, os avisos só chegam com o app na tela de início.
                </p>
                {onInstalar && (
                  <button type="button" className="e-btn" style={{ margin: '12px 0 4px', width: '100%' }}
                    onClick={onInstalar}>
                    Como instalar
                  </button>
                )}
              </>
            ) : (
              <>
                <p>
                  <b>Saiba quando a equipe bater a meta</b>
                  E, se quiser, receba de hora em hora quanto a equipe recebeu.
                </p>
                <button type="button" className="e-btn" style={{ margin: '12px 0 4px', width: '100%' }}
                  disabled={avisos.ocupado} onClick={avisos.ativar}>
                  {avisos.ocupado ? 'Ativando…' : 'Ativar avisos'}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* As duas linhas dependem da migration: sem ela, nenhuma das duas promete nada. */}
            {resumo.disponivel && (
              <label className="e-chave">
                <span>
                  <b>Resumo da equipe a cada hora</b>
                  <small>Quanto entrou desde o último resumo e o total do dia. Só chega quando entra pagamento.</small>
                </span>
                <input type="checkbox" role="switch" checked={resumo.ligado}
                  disabled={resumo.salvando} onChange={e => resumo.definir(e.target.checked)} />
              </label>
            )}
            {resumo.disponivel && (
              <div className="e-lin">
                <span className="e-r">Equipe bateu a meta</span>
                <span className="e-v">sempre avisa</span>
              </div>
            )}
            <div className="e-lin">
              <span className="e-r">Neste aparelho</span>
              <button type="button" className="e-desativar" disabled={avisos.ocupado} onClick={avisos.desativar}>
                Desativar
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
