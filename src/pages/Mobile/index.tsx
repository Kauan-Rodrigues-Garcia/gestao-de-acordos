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
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS, getTodayISO } from '@/lib/index';
import { ehSuperAdmin, gravarVersao } from '@/lib/mobile/preferencia';
import { registrarServiceWorker } from '@/lib/mobile/sw';
import { useInstalacao } from '@/lib/mobile/instalar';
import {
  CartaoComissao, CartaoRecebido, ListaPagamentos, ParHojeRanking,
} from './partes';
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
  return <TelaDoOperador />;
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
      <div className="m-conteudo">
        <header className="m-topo">
          <img src="/icons/app-192.png" alt="" />
          <div className="m-quem">
            <div className="m-nome">{tela.nome || ' '}</div>
            <div className="m-sub">
              {[tela.empresaNome, mesPorExtenso(tela.mes)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <SinoAvisos ativo={avisos.estado === 'ativo'} ocupado={avisos.ocupado}
            onDesativar={() => { void avisos.desativar(); }} />
        </header>

        {tela.carregando ? <Esqueleto /> : (
          <>
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
          </>
        )}

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
