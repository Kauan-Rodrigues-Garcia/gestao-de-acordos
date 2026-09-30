/**
 * Os avisos na visão Equipe — migrations 20260930192744 e 20260930210000.
 *
 * Pedido de 30/09/2026:
 *   • líder: recebe sempre (com o aparelho ativo) o resumo da equipe a cada
 *     hora, cada operador que alcança uma meta e a equipe que alcança a meta;
 *   • elite: escolhe cada um desses três à parte (começam desligados). Os
 *     próprios pagamentos e metas ele recebe sempre, como a operação.
 *
 * Quem escolhe e quem recebe sempre é o banco que diz (`fixo`). O aparelho é o
 * mesmo da `/m`: ativar aqui ou lá é a mesma inscrição.
 */
import { useAvisos } from '../useAvisos';
import { usePreferenciasEquipe, type ChaveAviso } from './usePreferenciasEquipe';

const CHAVES: { chave: ChaveAviso; titulo: string; detalhe: string }[] = [
  { chave: 'resumo_equipe', titulo: 'Resumo da equipe a cada hora',
    detalhe: 'Quanto a equipe recebeu e o total do dia. Só chega quando entra pagamento.' },
  { chave: 'metas_operadores', titulo: 'Metas alcançadas pelos operadores',
    detalhe: 'Um aviso quando alguém da equipe alcança uma meta.' },
  { chave: 'meta_equipe', titulo: 'Equipe alcançou a meta',
    detalhe: 'Um aviso quando a equipe fecha a meta do mês.' },
];

export function AvisosDaEquipe({ empresaId, onInstalar }: { empresaId: string | null; onInstalar?: () => void }) {
  const avisos = useAvisos(empresaId, 'equipe');
  const ativo = avisos.estado === 'ativo';
  const prefs = usePreferenciasEquipe(ativo);
  const p = prefs.preferencias;

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
                  <b>Receba os avisos da equipe</b>
                  O resumo de cada hora, as metas alcançadas pelos operadores e a meta da equipe.
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
            {/* Sem a migration no banco, nenhuma linha promete aviso da equipe. */}
            {prefs.disponivel && p && (p.fixo ? (
              CHAVES.map(c => (
                <div className="e-lin" key={c.chave}>
                  <span className="e-r">{c.titulo}</span>
                  <span className="e-v">sempre avisa</span>
                </div>
              ))
            ) : (
              CHAVES.map(c => (
                <label className="e-chave" key={c.chave}>
                  <span>
                    <b>{c.titulo}</b>
                    <small>{c.detalhe}</small>
                  </span>
                  <input type="checkbox" role="switch" checked={p[c.chave]}
                    disabled={prefs.salvando} onChange={e => prefs.definir(c.chave, e.target.checked)} />
                </label>
              ))
            ))}
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
