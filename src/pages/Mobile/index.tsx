/**
 * Tela mínima do celular — `/m`.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §2.
 * Visual aprovado: docs/mobile/prototipo-m.html.
 *
 * Uma coluna, mês corrente: recebido e régua das faixas, comissão (quando a
 * pessoa tem), hoje e ranking, últimos pagamentos, e o rodapé com instalar,
 * versão completa e sair. O card «Ativar notificações» entra na Etapa 2.
 */
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS, getTodayISO } from '@/lib/index';
import { ehLider, ehSuperAdmin, gravarVersao } from '@/lib/mobile/preferencia';
import { registrarServiceWorker } from '@/lib/mobile/sw';
import { useInstalacao } from '@/lib/mobile/instalar';
import {
  AvisoSaidas, CartaoComissao, CartaoQuartil, CartaoRecebido, ListaPagamentos, ParHojeRanking,
} from './partes';
import { FotoOuLogo, FundoVivo } from './comum/partesComuns';
import { mesPorExtenso } from '@/pages/Dashboard/Analitico/mensagemOperador';
import { useTelaMobile } from './useTelaMobile';
import { EscolherOperador } from './EscolherOperador';
import { CartaoAvisos, SinoAvisos } from './Avisos';
import { useAvisos } from './useAvisos';
import { useEmpresa } from '@/hooks/useEmpresa';
import { getImpersonacaoAtiva, sairImpersonacao } from '@/services/impersonacao.service';
import './mobile.css';

/** Quantos pagamentos a tela mostra antes de «Ver todos». */
const LIMITE_LISTA = 8;

export default function Mobile() {
  const { perfil } = useAuth();
  // Super admin testa entrando como um operador — ver `EscolherOperador`.
  if (ehSuperAdmin(perfil?.perfil)) return <EscolherOperador />;
  // Líder não recebe em nome próprio: a tela dele é a da equipe.
  if (ehLider(perfil?.perfil)) return <Navigate to={ROUTE_PATHS.MOBILE_EQUIPE} replace />;
  return <TelaDoOperador />;
}

/**
 * Quem tem a visão da equipe ganha a troca Eu / Equipe: a chave
 * `ver_painel_lider` (a mesma da rota) e uma equipe para mostrar — a de que a
 * pessoa faz parte ou uma que ela lidera. Pedido de 30/09/2026: o elite não
 * precisa estar em `equipe_lideres`, basta pertencer à equipe.
 */
function useTemVisaoEquipe(): boolean {
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  const podeVerEquipe = temPermissao('ver_painel_lider');
  const temEquipePropria = !!perfil?.equipe_id;
  const { data } = useQuery({
    queryKey: ['mobile-lidera-alguma', perfil?.id],
    enabled: podeVerEquipe && !temEquipePropria && !!perfil?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: linhas, error } = await supabase
        .from('equipe_lideres').select('equipe_id').eq('lider_id', perfil!.id).limit(1);
      if (error) return false;
      return (linhas ?? []).length > 0;
    },
  });
  return podeVerEquipe && (temEquipePropria || data === true);
}

/**
 * Deixa a visão da equipe pronta antes do toque em «Equipe» (30/09/2026 — a
 * troca demorava). Depois que a tela pessoal carregou, com o aparelho ocioso,
 * baixa o código da tela da equipe e as fontes dela para o cache. Import
 * dinâmico: quem não tem a visão da equipe não baixa nada disso.
 */
function usePreparaVisaoEquipe(pronto: boolean, empresaId: string | null, mes: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!pronto || !empresaId) return;
    let cancelado = false;
    const preparar = () => {
      if (cancelado) return;
      void import('./equipe');
      void import('./equipe/useTelaEquipe').then(m => {
        if (cancelado) return;
        void queryClient.prefetchQuery({
          queryKey: m.chaveFontesEquipe(empresaId, mes),
          queryFn: () => m.carregarFontes(empresaId, mes),
          staleTime: 60_000,
        });
      });
    };
    const ocioso = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const id = ocioso ? ocioso(preparar) : window.setTimeout(preparar, 1200);
    return () => {
      cancelado = true;
      if (!ocioso) window.clearTimeout(id);
    };
  }, [pronto, empresaId, mes, queryClient]);
}

function TelaDoOperador() {
  const tela = useTelaMobile();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [verTodos, setVerTodos] = useState(false);
  const impersonando = !!getImpersonacaoAtiva();
  const { empresa } = useEmpresa();
  const avisos = useAvisos(empresa?.id ?? null);
  const [passoIPhone, setPassoIPhone] = useState(false);
  const lideraEquipe = useTemVisaoEquipe();
  usePreparaVisaoEquipe(lideraEquipe && !tela.carregando, empresa?.id ?? null, tela.mes);

  useEffect(() => { void registrarServiceWorker(); }, []);

  // Veio de um aviso (`?novos=1`): leva a pessoa direto aos pagamentos.
  const veioDeAviso = new URLSearchParams(location.search).get('novos') === '1';
  useEffect(() => {
    if (!veioDeAviso || tela.carregandoPagamentos) return;
    document.getElementById('m-pagamentos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [veioDeAviso, tela.carregandoPagamentos]);

  const abrirVersaoCompleta = () => {
    gravarVersao('completa');
    navigate(ROUTE_PATHS.DASHBOARD);
  };

  return (
    <div className="tela-mobile">
      <FundoVivo />
      <div className="m-conteudo">
        <header className="m-topo">
          <FotoOuLogo foto={tela.fotoUrl} nome={tela.nome} />
          <div className="m-quem">
            <div className="m-nome">{tela.nome || ' '}</div>
            <div className="m-sub">
              {[tela.empresaNome, mesPorExtenso(tela.mes)].filter(Boolean).join(' · ')}
            </div>
          </div>
          {lideraEquipe && (
            <div className="m-troca" role="group" aria-label="Visão">
              <button type="button" aria-pressed={true}>Eu</button>
              <button type="button" aria-pressed={false}
                onClick={() => navigate(ROUTE_PATHS.MOBILE_EQUIPE)}>Equipe</button>
            </div>
          )}
          <SinoAvisos ativo={avisos.estado === 'ativo'} ocupado={avisos.ocupado}
            onDesativar={() => { void avisos.desativar(); }} />
        </header>

        {tela.carregando ? <Esqueleto /> : (
          <div className="v-entra">
            <CartaoRecebido
              recebido={tela.recebidoMes}
              meta={tela.meta}
              faixas={tela.faixas}
              pctMeta={tela.pctMeta}
              unidadeHO={tela.isPaguePlay}
              semRelatorio={tela.semRelatorio}
            />
            {tela.comissao && <CartaoComissao comissao={tela.comissao} />}
            <ParHojeRanking
              hoje={tela.recebidoHoje}
              qtdHoje={tela.qtdHoje}
              podeVerRanking={tela.podeVerRanking}
              ranking={tela.ranking}
            />
            {tela.quartil && <CartaoQuartil quartil={tela.quartil} />}
          </div>
        )}

        <AvisoSaidas saidas={tela.saidas} onDispensar={tela.dispensarSaidas} />

        {/* No teste do super admin (impersonação) o card some: ativar ali
            inscreveria o celular do admin nos pagamentos do operador. */}
        {!impersonando && (
          <CartaoAvisos
            estado={avisos.estado} ocupado={avisos.ocupado}
            onAtivar={() => { void avisos.ativar(); }}
            onInstalar={() => setPassoIPhone(true)}
          />
        )}

        <ListaPagamentos
          pagamentos={tela.pagamentos}
          hoje={getTodayISO()}
          carregando={tela.carregandoPagamentos}
          limite={verTodos ? null : LIMITE_LISTA}
          onVerTodos={() => setVerTodos(v => !v)}
        />

        {/* Em teste (super admin impersonando), «Sair» deslogaria a sessão
            emprestada e a volta para a conta do admin se perderia. */}
        <Rodape
          passoIPhone={passoIPhone}
          setPassoIPhone={setPassoIPhone}
          onVersaoCompleta={abrirVersaoCompleta}
          rotuloSair={impersonando ? 'Voltar à minha conta' : 'Sair'}
          onSair={() => { void (impersonando ? sairImpersonacao() : signOut()); }}
        />
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="m-esq" style={{ margin: '0 16px', height: 188, borderRadius: 28 }} />
      <div className="m-esq" style={{ margin: '12px 16px 0', height: 150 }} />
      <div className="m-esq" style={{ margin: '12px 16px 0', height: 104 }} />
    </div>
  );
}

function Rodape({ onVersaoCompleta, onSair, rotuloSair, passoIPhone, setPassoIPhone }: {
  passoIPhone: boolean;
  setPassoIPhone: (v: boolean) => void;
  onVersaoCompleta: () => void;
  onSair: () => void;
  rotuloSair: string;
}) {
  const { modo, instalar } = useInstalacao();

  return (
    <div className="m-rodape">
      {modo === 'convite' && (
        <button type="button" className="m-btn m-pri" onClick={() => { void instalar(); }}>
          Instalar app
        </button>
      )}
      {modo === 'iphone' && (
        <button type="button" className="m-btn m-pri" onClick={() => setPassoIPhone(true)}>
          Instalar app
        </button>
      )}
      <div className="m-links">
        <button type="button" onClick={onVersaoCompleta}>Versão completa</button>
        <button type="button" onClick={onSair}>{rotuloSair}</button>
      </div>

      {passoIPhone && (
        <div className="m-folha-fundo" role="dialog" aria-modal="true" aria-labelledby="m-folha-titulo"
          onClick={() => setPassoIPhone(false)}>
          <div className="m-folha" onClick={e => e.stopPropagation()}>
            <h3 id="m-folha-titulo">Instalar no iPhone</h3>
            <ol>
              <li>Abra esta página no <b>Safari</b>.</li>
              <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
              <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li>
            </ol>
            <p style={{ fontSize: 13.5, color: 'var(--m-tinta-2)', marginBottom: 16 }}>
              No iPhone, os avisos de pagamento só chegam com o app instalado.
            </p>
            <button type="button" className="m-btn m-sec" onClick={() => setPassoIPhone(false)}>Entendi</button>
          </div>
        </div>
      )}
    </div>
  );
}
