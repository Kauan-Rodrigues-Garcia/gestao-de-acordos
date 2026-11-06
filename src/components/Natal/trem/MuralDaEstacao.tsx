import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { pedirFotoDoPerfil } from '@/lib/fotoDoPerfil';
import { cn } from '@/lib/utils';
import { carregarFonteDoNatal } from '../fonteDoNatal';
import { SemFotoDePerfil, type Inscricao } from './passageiros';
import { MapaDoTicket } from './MapaDoTicket';
import { ROTA_DO_TREM } from './rota';

/** O ticket entra na validadora e volta carimbado: o tempo da animação. */
const VALIDANDO_MS = 900;

/**
 * O ticket da estação (Cleber, 05/11/2026): clicou na estação, aparece uma
 * passagem de trem — «insira seu ticket» —, e o texto é só o essencial: é uma
 * viagem de trem pelo Gestão, e cada viagem sorteia cinco pessoas.
 *
 * Só com foto de perfil: sem ela, o botão fica cinza e o aviso diz por quê
 * (o banco também recusa — migration 20261105090000). A foto é relida ao
 * abrir e quando muda (`useInscricao`): quem põe a foto agora já pode entrar.
 */
export function MuralDaEstacao({ aberto, aoFechar, inscricao, mudando, mudar, saida, horario, primeiraViagem }: {
  aberto: boolean;
  aoFechar: () => void;
  inscricao: Inscricao | null;
  mudando: boolean;
  mudar: (entrar: boolean) => Promise<void>;
  /** A linha da próxima saída (ou de quando abre, ou de por que está parado). */
  saida: ReactNode;
  /** «08:00 – 17:00», quando se sabe. */
  horario: string | null;
  /** O trem ainda espera os cinco primeiros: «faltam N». */
  primeiraViagem: { faltam: number } | null;
}) {
  const inscrito = inscricao?.inscrito ?? false;
  const semFoto = inscricao !== null && !inscricao.temFoto;
  const [validando, setValidando] = useState(false);
  /** Indo pôr a foto: o foco não volta para a estação (senão fecha o menu do perfil). */
  const indoParaFoto = useRef(false);
  useEffect(() => { if (aberto) carregarFonteDoNatal(); }, [aberto]);

  const inserir = async () => {
    setValidando(true);
    try {
      await Promise.all([mudar(true), new Promise(r => setTimeout(r, VALIDANDO_MS))]);
      toast.success('Ticket validado! 🎄', { description: 'Agora é torcer: a cada viagem, 5 pessoas são sorteadas.' });
    } catch (e) {
      if (e instanceof SemFotoDePerfil) toast.error('Coloque uma foto de perfil para inserir o ticket.');
      else toast.error('Não deu para validar o ticket agora. Tente de novo daqui a pouco.');
    } finally {
      setValidando(false);
    }
  };
  const tirar = async () => {
    try { await mudar(false); } catch { toast.error('Não deu para tirar o ticket agora. Tente de novo daqui a pouco.'); }
  };
  const irParaFoto = () => {
    indoParaFoto.current = true;
    aoFechar();
    window.setTimeout(pedirFotoDoPerfil, 120);
  };

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) aoFechar(); }}>
      {/*
        Fechava sozinho ao entrar na fila (04/11/2026): o botão some (vira o
        carimbo) e o foco cai fora do mural — o diálogo achava que era um clique
        fora. Perder o foco não fecha mais; o X, o Esc e o clique fora, sim. O
        clique no aviso (toast) também não fecha.
      */}
      <DialogContent
        className="nt-ticket-dialogo max-w-[52rem] border-0 bg-transparent p-0 shadow-none"
        onFocusOutside={e => e.preventDefault()}
        onInteractOutside={e => { if ((e.target as HTMLElement | null)?.closest?.('[data-sonner-toaster]')) e.preventDefault(); }}
        onCloseAutoFocus={e => { if (indoParaFoto.current) { e.preventDefault(); indoParaFoto.current = false; } }}
      >
        {/* O ticket à esquerda e, ao lado, o mapa da linha (por onde o trem passa). */}
        <div className="nt-ticket-com-mapa">
        <div className="nt-ticket-coluna">
        <div className={cn('nt-ticket', validando && 'validando', inscrito && !validando && 'valido', semFoto && 'sem-foto')}>
          <div className="nt-ticket-corpo">
            <div className="nt-ticket-topo">
              <span className="nt-ticket-marca">🚂 Expresso de Natal</span>
              <span className="nt-ticket-numero">Nº 2512</span>
            </div>
            <DialogTitle className="nt-ticket-titulo">Uma viagem de trem pelo Gestão</DialogTitle>
            <DialogDescription className="nt-ticket-texto">
              A cada viagem, <b>5 pessoas são sorteadas</b> para embarcar.
            </DialogDescription>
            <dl className="nt-ticket-campos">
              <div><dt>Embarque</dt><dd>Estação</dd></div>
              <div><dt>Lugares</dt><dd>5 por viagem</dd></div>
              {horario && <div><dt>Horário</dt><dd>{horario}</dd></div>}
              <div><dt>Na fila</dt><dd>{inscricao?.total ?? '—'}</dd></div>
            </dl>
            {primeiraViagem && (
              <p className="nt-ticket-primeira">
                ⭐ A 1ª viagem leva os 5 primeiros — {primeiraViagem.faltam === 1 ? 'falta 1' : `faltam ${primeiraViagem.faltam}`}
              </p>
            )}
            <p className="nt-ticket-saida">{saida}</p>
          </div>
          <div className="nt-ticket-canhoto" aria-hidden="true">
            <span className="nt-ticket-canhoto-texto">Embarque</span>
            <span className="nt-ticket-barras" />
            <span className="nt-ticket-furo" />
          </div>
          {inscrito && !validando && <span className="nt-ticket-carimbo" aria-hidden="true">Na fila ✓</span>}
        </div>

        <div className="nt-ticket-acoes">
          {semFoto && (
            <div className="nt-ticket-sem-foto" role="alert">
              <p className="nt-ticket-sem-foto-titulo">📷 Só com foto de perfil</p>
              <p>
                {inscrito
                  ? 'Seu ticket está na fila, mas sem foto você não entra nos sorteios.'
                  : 'Só quem tem foto de perfil pode inserir o ticket — e o sorteio é só para quem tem foto.'}
              </p>
              <button type="button" className="nt-ticket-botao-foto" onClick={irParaFoto}>
                <Camera className="h-4 w-4" aria-hidden /> Colocar minha foto
              </button>
            </div>
          )}
          {inscrito ? (
            <button type="button" className="nt-ticket-tirar" disabled={mudando || validando} onClick={() => void tirar()}>
              Tirar meu ticket da fila
            </button>
          ) : (
            <button
              type="button"
              className="nt-ticket-botao"
              disabled={!inscricao || semFoto || mudando || validando}
              onClick={() => void inserir()}
            >
              {validando ? 'Validando…' : '🎟️ Inserir meu ticket'}
            </button>
          )}
        </div>
        </div>
        <MapaDoTicket rota={ROTA_DO_TREM} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
