/**
 * Tela da equipe no celular — `/m/equipe`.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md.
 * Visual v2 aprovado: docs/mobile/prototipo-lider.html.
 *
 * O modelo do Painel do Líder em quatro abas no rodapé — Equipe, Quartis,
 * Gráfico, Hoje — só das equipes que a pessoa lidera, só no mês corrente.
 * Líder cai aqui depois do login; o elite chega pela troca Eu / Equipe.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS } from '@/lib/index';
import { ehSuperAdmin, gravarVersao, ofereceVersaoCompleta } from '@/lib/mobile/preferencia';
import { acessoDasVisoes, rotaDaVisao } from '@/lib/mobile/visoes';
import { useUnidadeApp } from '@/lib/mobile/unidadeApp';
import { paraHO, useHoPercentual } from '@/lib/hoPercentual';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { InterruptorUnidade, TrocaDeVisao } from '../comum/Topo';
import { registrarServiceWorker } from '@/lib/mobile/sw';
import { mesPorExtenso } from '@/pages/Dashboard/Analitico/mensagemOperador';
import { getImpersonacaoAtiva, sairImpersonacao } from '@/services/impersonacao.service';
import { useTelaEquipe, useGraficoEquipe, usePagamentosEquipe } from './useTelaEquipe';
import { AbaEquipe } from './AbaEquipe';
import { AbaQuartis } from './AbaQuartis';
import { AbaGrafico } from './AbaGrafico';
import { AbaHoje } from './AbaHoje';
import { AvisosDaEquipe } from './AvisosDaEquipe';
import { BotaoInstalar, PassoIPhone } from './InstalarApp';
import { IconeAba, Seta } from './partes';
import { FotoOuLogo, FundoVivo } from '../comum/partesComuns';
import { ChatDoApp } from '../comum/ChatDoApp';
import './equipe.css';

type Aba = 'equipe' | 'quartis' | 'grafico' | 'hoje';
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'equipe', rotulo: 'Equipe' },
  { id: 'quartis', rotulo: 'Quartis' },
  { id: 'grafico', rotulo: 'Gráfico' },
  { id: 'hoje', rotulo: 'Hoje' },
];

export default function MobileEquipe() {
  const { perfil } = useAuth();
  // Super admin testa entrando como alguém — o seletor mora na `/m`.
  if (ehSuperAdmin(perfil?.perfil)) return <Navigate to={ROUTE_PATHS.MOBILE} replace />;
  return <TelaDaEquipe />;
}

function TelaDaEquipe() {
  const tela = useTelaEquipe();
  const { perfil, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [aba, setAba] = useState<Aba>(() => {
    const pedida = params.get('aba');
    return ABAS.some(a => a.id === pedida) ? (pedida as Aba) : 'equipe';
  });
  const impersonando = !!getImpersonacaoAtiva();
  // As visões do cargo (06/10/2026): elite Eu · Equipe · Setor; líder e
  // gerência Equipe · Setor.
  const { temPermissao } = useCargoPermissoes();
  const acesso = acessoDasVisoes(perfil?.perfil, temPermissao('ver_painel_lider'));
  const { unidade } = useUnidadeApp(tela.isPaguePlay);
  useHoPercentual();

  useEffect(() => { void registrarServiceWorker(); }, []);

  // Veio de um aviso com `?equipe=<id>`: abre nela, se a pessoa a lidera.
  const equipePedida = params.get('equipe');
  const { opcoes, escolherEquipe } = tela;
  useEffect(() => {
    if (equipePedida && opcoes.some(o => o.id === equipePedida)) escolherEquipe(equipePedida);
  }, [equipePedida, opcoes, escolherEquipe]);

  // Rola para o topo ao trocar de aba — cada aba é uma tela.
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [aba]);

  // Gráfico e Hoje dividem a mesma leitura. Ela já começa com a tela aberta
  // (e não no toque da aba): quando a pessoa troca de aba, está pronta.
  const grafico = useGraficoEquipe({
    empresaId: tela.empresaId, mes: tela.mes, isPaguePlay: tela.isPaguePlay,
    operadorIds: tela.equipe?.operadorIds ?? [], ativo: !!tela.equipe,
  });
  // Cofen em H.O.: o diário guarda só o bruto; o H.O. é o percentual da aba
  // Metas sobre ele (`paraHO`), a régua do resto do sistema.
  const linhasNaUnidade = useMemo(
    () => (tela.emHO && grafico.data
      ? grafico.data.map(l => ({ ...l, valor_recebido: paraHO(Number(l.valor_recebido) || 0) }))
      : grafico.data),
    [tela.emHO, grafico.data],
  );
  const pagamentos = usePagamentosEquipe({
    empresaId: tela.empresaId, mes: tela.mes,
    operadorIds: tela.equipe?.operadorIds ?? [], ativo: aba === 'hoje',
  });

  const abrirVersaoCompleta = () => {
    gravarVersao('completa');
    navigate(ROUTE_PATHS.DASHBOARD);
  };
  // O líder cai direto aqui: o «Instalar app» mora neste rodapé também.
  const [passoIPhone, setPassoIPhone] = useState(false);
  const rodape = (
    <>
      <BotaoInstalar onPassoIPhone={() => setPassoIPhone(true)} />
      <div className="e-links">
        {ofereceVersaoCompleta() && <button type="button" onClick={abrirVersaoCompleta}>Versão completa</button>}
        <button type="button" onClick={() => { void (impersonando ? sairImpersonacao() : signOut()); }}>
          {impersonando ? 'Voltar à minha conta' : 'Sair'}
        </button>
      </div>
    </>
  );

  const { equipe } = tela;
  const atual = opcoes.find(o => o.id === equipe?.id);

  return (
    <div className="tela-equipe">
      <FundoVivo />
      <div className="e-conteudo">
        <header className="e-topo">
          <FotoOuLogo foto={tela.fotoUrl} nome={tela.nomePessoa} />
          <div className="e-quem">
            <div className="e-eq">
              <span>{equipe?.nome ?? (tela.carregando ? ' ' : 'Minha equipe')}</span>
              {opcoes.length > 1 && <Seta />}
            </div>
            <div className="e-sub">
              {[atual?.setorNome, mesPorExtenso(tela.mes).split('/')[0]].filter(Boolean).join(' · ')}
            </div>
            {opcoes.length > 1 && (
              <select aria-label="Trocar de equipe" value={equipe?.id ?? ''}
                onChange={e => escolherEquipe(e.target.value)}>
                {opcoes.map(o => (
                  <option key={o.id} value={o.id}>{o.setorNome ? `${o.nome} · ${o.setorNome}` : o.nome}</option>
                ))}
              </select>
            )}
          </div>
        </header>

        <div className="v-faixa-topo">
          <TrocaDeVisao visoes={acesso.visoes} atual="equipe"
            onEscolher={v => navigate(rotaDaVisao(v, acesso.completo))} />
          <InterruptorUnidade unidade={unidade} visivel={tela.isPaguePlay} />
        </div>

        {tela.carregando ? (
          <div aria-busy="true" aria-label="Carregando">
            <div className="e-esq" style={{ margin: '0 16px', height: 170, borderRadius: 24 }} />
            <div className="e-esq" style={{ margin: '14px 16px 0', height: 60 }} />
            <div className="e-esq" style={{ margin: '14px 16px 0', height: 150 }} />
          </div>
        ) : tela.erro ? (
          <>
            <p className="e-vazio"><b>Não foi possível carregar a equipe</b>Confira a conexão e tente de novo.</p>
            <button type="button" className="e-btn e-sec-btn" onClick={tela.recarregar}>Tentar de novo</button>
            {rodape}
          </>
        ) : !equipe ? (
          <>
            <p className="e-vazio">
              <b>Você ainda não lidera nenhuma equipe</b>
              A liderança é definida na tela de Equipes. Enquanto isso, o Painel do Líder segue na versão completa.
            </p>
            {rodape}
          </>
        ) : (
          <main className="v-entra" key={aba}>
            {aba === 'equipe' && (
              <AbaEquipe equipe={equipe} rodape={<>
                {/* No teste do super admin o bloco some: ativar ali inscreveria
                    o celular do admin nos avisos do líder. */}
                {!impersonando && (
                  <AvisosDaEquipe empresaId={tela.empresaId} onInstalar={() => setPassoIPhone(true)} />
                )}
                {rodape}
              </>} />
            )}
            {aba === 'quartis' && <AbaQuartis equipe={equipe} mes={tela.mes} />}
            {aba === 'grafico' && (
              <AbaGrafico escopo={{ tipo: 'equipe', operadores: new Set(equipe.operadorIds) }}
                mes={tela.mes} hojeISO={tela.hojeISO}
                linhas={linhasNaUnidade} carregando={grafico.isLoading} erro={grafico.isError}
                isPaguePlay={tela.isPaguePlay} emHO={tela.emHO} />
            )}
            {aba === 'hoje' && (
              <AbaHoje
                conjunto={{ operadorIds: equipe.operadorIds, nomes: equipe.nomes,
                  totalPessoas: equipe.detalhe.totalOperadores, rotulo: 'da equipe' }}
                hojeISO={tela.hojeISO}
                linhas={linhasNaUnidade} carregando={grafico.isLoading}
                pagamentos={pagamentos.data} carregandoPagamentos={pagamentos.isLoading}
                isPaguePlay={tela.isPaguePlay} emHO={tela.emHO} />
            )}
          </main>
        )}
      </div>

      <PassoIPhone aberto={passoIPhone} onFechar={() => setPassoIPhone(false)} />

      {/* O chat do gestão, acima da barra de abas (05/10/2026). */}
      <ChatDoApp acimaDoRodape={equipe ? 72 : 0} />

      {equipe && (
        <nav className="e-abas" aria-label="Abas">
          {ABAS.map(a => (
            <button key={a.id} type="button" aria-current={aba === a.id ? 'page' : undefined}
              onClick={() => setAba(a.id)}>
              <IconeAba aba={a.id} />{a.rotulo}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
