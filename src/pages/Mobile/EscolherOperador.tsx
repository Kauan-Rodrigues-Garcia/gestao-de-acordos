/**
 * Super admin na tela mínima: escolhe um operador antes (pedido de 30/09/2026).
 *
 * A tela mínima é da PRÓPRIA pessoa — comissão, ranking e meta são contas de
 * quem está logado. Mostrá-la «como se fosse» outro operador com a sessão do
 * super admin daria números errados. Então a escolha usa a impersonação que já
 * existe (`iniciarImpersonacao`): login real como o operador, com auditoria em
 * `logs_sistema`, e a faixa amarela (`ImpersonacaoBanner`) para voltar.
 *
 * A página recarrega em `/#/m`, agora com a sessão do operador.
 *
 * Líderes entram na lista desde a versão da liderança (30/09/2026): entrando
 * como um líder, a `/m` leva à tela da equipe (`/m/equipe`).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ROUTE_PATHS, PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { iniciarImpersonacao } from '@/services/impersonacao.service';

interface Operador {
  id: string;
  nome: string | null;
  usuario: string | null;
  perfil: string | null;
}

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function EscolherOperador() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [entrando, setEntrando] = useState<string | null>(null);
  const empresaId = empresa?.id ?? null;

  const { data: operadores = [], isLoading, isError } = useQuery({
    queryKey: ['mobile-teste-operadores', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfis')
        .select('id, nome, usuario, perfil')
        .eq('empresa_id', empresaId as string)
        .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO, 'lider'])
        .eq('ativo', true)
        .order('nome');
      if (error) throw new Error(error.message);
      return (data ?? []) as Operador[];
    },
  });

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return operadores;
    return operadores.filter(o => semAcento(`${o.nome ?? ''} ${o.usuario ?? ''}`).includes(q));
  }, [operadores, busca]);

  async function entrarComo(o: Operador) {
    if (!perfil?.id || entrando) return;
    setEntrando(o.id);
    try {
      await iniciarImpersonacao(o.id, perfil.id, perfil.nome ?? 'super_admin');
      // Recarrega sozinho em caso de sucesso — já na /#/m, como o operador.
    } catch (e) {
      setEntrando(null);
      toast.error(e instanceof Error ? e.message : 'Não foi possível entrar como o operador.');
    }
  }

  return (
    <div className="tela-mobile">
      <div className="m-conteudo">
        <header className="m-topo">
          <img src="/icons/app-192.png" alt="" />
          <div className="m-quem">
            <div className="m-nome">Tela do celular · teste</div>
            <div className="m-sub">{empresa?.nome ?? ''}</div>
          </div>
        </header>

        <section className="m-cartao" style={{ marginTop: 0 }}>
          <div className="m-acao-txt">
            <b>Escolha um operador ou líder</b>
            Esta tela mostra os números de quem está logado. Para testar, você entra
            como a pessoa escolhida — fica registrado na auditoria — e volta para
            a sua conta pela faixa amarela no rodapé. Líder abre a tela da equipe.
          </div>
          <input
            className="m-busca"
            type="search"
            placeholder="Buscar por nome ou usuário"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar operador ou líder"
          />
        </section>

        <section className="m-lista" style={{ marginTop: 12 }}>
          {isLoading && <div className="m-vazio">Carregando…</div>}
          {isError && <div className="m-vazio">Não foi possível carregar os operadores.</div>}
          {!isLoading && !isError && filtrados.length === 0 && (
            <div className="m-vazio">Ninguém encontrado.</div>
          )}
          {filtrados.map(o => (
            <button
              key={o.id} type="button" className="m-pg m-pg-botao"
              onClick={() => { void entrarComo(o); }}
              disabled={!!entrando}
            >
              <div className="m-pg-q">
                <div className="m-pg-c">{o.nome ?? o.usuario ?? 'Sem nome'}</div>
                {(o.usuario || o.perfil === 'lider') && (
                  <div className="m-pg-h">
                    {[o.usuario, o.perfil === 'lider' ? 'líder' : o.perfil === 'elite' ? 'elite' : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <span className="m-pg-h">{entrando === o.id ? 'Entrando…' : 'Ver como'}</span>
            </button>
          ))}
        </section>

        <div className="m-rodape">
          <div className="m-links">
            <button type="button" onClick={() => navigate(ROUTE_PATHS.DASHBOARD)}>Voltar ao site</button>
          </div>
        </div>
      </div>
    </div>
  );
}
