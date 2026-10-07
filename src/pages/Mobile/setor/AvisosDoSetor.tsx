/**
 * Os avisos da gerência na tela do setor — migration 20261007120000.
 *
 * Pedido de 06/10/2026: o gerente recebe os quatro avisos do setor que cuida,
 * cada um com interruptor, todos começando LIGADOS. Na regra Cofen os valores
 * chegam só em H.O. O aparelho é o mesmo das outras telas: ativar aqui ou lá
 * é a mesma inscrição.
 *
 * Quem cuida do setor quem diz é o banco (`gerencia`), pelos atributos do
 * cargo — a tela só aparece para a gerência, e as chaves só com a resposta.
 */
import { useAvisos } from '../useAvisos';
import { usePreferenciasEquipe, type ChaveAviso } from '../equipe/usePreferenciasEquipe';

const CHAVES: { chave: ChaveAviso; titulo: string; detalhe: string }[] = [
  { chave: 'setor_resumo', titulo: 'Resumo do setor a cada hora',
    detalhe: 'Quanto o setor recebeu na última hora e o total do dia. Só chega quando entra pagamento.' },
  { chave: 'setor_meta', titulo: 'Setor alcançou a meta',
    detalhe: 'Um aviso quando o setor fecha a meta do mês.' },
  { chave: 'setor_metas_equipes', titulo: 'Equipes que alcançaram a meta',
    detalhe: 'Um aviso quando uma equipe do setor fecha a meta do mês.' },
  { chave: 'setor_metas_operadores', titulo: 'Metas alcançadas pelas pessoas',
    detalhe: 'Quem do setor alcançou a 1ª, 2ª ou 3ª meta. Várias de uma vez chegam num aviso só.' },
];

export function AvisosDoSetor({ empresaId, onInstalar }: { empresaId: string | null; onInstalar?: () => void }) {
  const avisos = useAvisos(empresaId, 'setor');
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
                  <b>Receba os avisos do setor</b>
                  O resumo de cada hora, a meta do setor e as metas das equipes e das pessoas.
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
            {/* Sem a migration no banco, nenhuma linha promete aviso do setor. */}
            {prefs.disponivel && p?.gerencia && CHAVES.map(c => (
              <label className="e-chave" key={c.chave}>
                <span>
                  <b>{c.titulo}</b>
                  <small>{c.detalhe}</small>
                </span>
                <input type="checkbox" role="switch" checked={p[c.chave]}
                  disabled={prefs.salvando} onChange={e => prefs.definir(c.chave, e.target.checked)} />
              </label>
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
