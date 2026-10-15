/**
 * O cartão «Cafezinho» da pesquisa de experiência. As regras moram em
 * `pesquisa.ts`; aqui é só a tela.
 *
 * As três carinhas ficam à vista até o fim: a pessoa troca quantas vezes
 * quiser, e cada troca grava a nota de novo (em fila, na ordem dos toques). O
 * texto digitado não se perde ao trocar de carinha.
 *
 * `previa`: aberto pelo «Ver a pergunta» de Configurações — mesma tela, nada
 * gravado.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  LIMITE_COMENTARIO, NOTAS, ROTULO_NOTA, SEGUNDOS_PARA_COMENTAR,
  comentarPesquisa, primeiroNome, votarPesquisa, type NotaPesquisa,
} from './pesquisa';
import './cafezinho.css';

const DICA: Record<NotaPesquisa, string> = {
  ruim: 'Poxa! Conta pra gente o que tá pegando, que a gente arruma.',
  media: 'O que faria virar «tô curtindo»?',
  boa: 'O que você mais curte, ou o que ainda dá pra melhorar?',
};

/** Quanto as telas finais ficam antes de o cartão sair. */
const FIM_COM_COMENTARIO_MS = 3800;
const FIM_SEM_COMENTARIO_MS = 2400;
const SAIDA_MS = 350;

type Fim = 'comentou' | 'so-nota';

export function CartaoPesquisa({ nome, previa = false, esquerda = 0, onFechar }: {
  nome?: string | null;
  previa?: boolean;
  /** Largura do menu lateral, em px: o cartão fica logo depois dele. */
  esquerda?: number;
  onFechar: () => void;
}) {
  const [nota, setNota] = useState<NotaPesquisa | null>(null);
  const [comentando, setComentando] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fim, setFim] = useState<Fim | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [resta, setResta] = useState(SEGUNDOS_PARA_COMENTAR);
  const campo = useRef<HTMLTextAreaElement>(null);
  // As gravações vão em fila: a última carinha tocada é a que fica, e o
  // comentário só sai depois da nota.
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const n1 = primeiroNome(nome);

  const sair = useCallback(() => setSaindo(true), []);
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(onFechar, SAIDA_MS);
    return () => clearTimeout(t);
  }, [saindo, onFechar]);

  // Telas finais: saem sozinhas.
  useEffect(() => {
    if (!fim) return;
    const t = setTimeout(sair, fim === 'comentou' ? FIM_COM_COMENTARIO_MS : FIM_SEM_COMENTARIO_MS);
    return () => clearTimeout(t);
  }, [fim, sair]);

  // «Tá ok» / «Tô curtindo» sem comentar: 5 s e fecha. Recomeça a cada troca.
  const relogioLigado = !fim && !comentando && (nota === 'media' || nota === 'boa');
  useEffect(() => {
    if (!relogioLigado) return;
    setResta(SEGUNDOS_PARA_COMENTAR);
    let r = SEGUNDOS_PARA_COMENTAR;
    const passo = setInterval(() => { r -= 1; setResta(Math.max(r, 0)); }, 1000);
    const fecha = setTimeout(() => setFim('so-nota'), SEGUNDOS_PARA_COMENTAR * 1000);
    return () => { clearInterval(passo); clearTimeout(fecha); };
  }, [relogioLigado, nota]);

  useEffect(() => {
    if (nota === 'ruim' || comentando) campo.current?.focus({ preventScroll: true });
  }, [nota, comentando]);

  const gravar = (fn: () => Promise<void>): Promise<void> => {
    if (previa) return Promise.resolve();
    const proxima: Promise<void> = fila.current.then(fn);
    fila.current = proxima.catch((): void => undefined);
    return proxima;
  };

  const escolher = (n: NotaPesquisa) => {
    if (n === nota || fim) return;
    setNota(n);
    gravar(() => votarPesquisa(n)).catch(() => {
      toast.error('Não deu para registrar a sua resposta', { description: 'Confira a internet e toque na carinha de novo.' });
      setNota(null);
    });
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t) { setFim('so-nota'); return; }
    setEnviando(true);
    try {
      await gravar(() => comentarPesquisa(t));
      setFim('comentou');
    } catch {
      toast.error('Não deu para enviar o comentário', { description: 'Confira a internet e tente de novo.' });
    } finally {
      setEnviando(false);
    }
  };

  const classe = `pq-caf${saindo ? ' pq-sai' : ''}${fim ? ' pq-fim' : ''}`;
  const estilo = { '--pq-esquerda': `${esquerda}px`, '--pq-segundos': `${SEGUNDOS_PARA_COMENTAR}s` } as React.CSSProperties;

  if (fim) {
    return (
      <div className={classe} style={estilo} role="status">
        <CanecaCoracao />
        {fim === 'comentou' ? (
          <>
            <div className="pq-oi">Prontinho, já foi encaminhado!</div>
            <div className="pq-sub" style={{ maxWidth: '30ch' }}>A gente lê todas as mensagens, e a sua já está na fila.</div>
            <div className="pq-assin">com carinho, time do Gestão</div>
          </>
        ) : (
          <>
            <div className="pq-oi">{n1 ? `Valeu, ${n1}!` : 'Valeu!'}</div>
            <div className="pq-sub">Sua resposta já foi registrada.</div>
          </>
        )}
      </div>
    );
  }

  const mostraCampo = nota === 'ruim' || comentando;

  return (
    <div className={classe} style={estilo} role="dialog" aria-label="Pesquisa de experiência">
      {previa && <span className="pq-previa">prévia</span>}
      <div className="pq-cab">
        <Caneca />
        <div>
          <div className="pq-oi">{n1 ? `Oi, ${n1}!` : 'Oi!'}</div>
          <div className="pq-sub">Pega um cafezinho e me conta rapidinho?</div>
        </div>
      </div>
      <p className="pq-perg">Como tá sendo usar o Gestão de Acordos?</p>
      <div className="pq-ops" role="group" aria-label="Sua resposta">
        {NOTAS.map(n => (
          <button key={n} type="button" className={`pq-op ${n}`} aria-pressed={nota === n} onClick={() => escolher(n)}>
            <Rosto nota={n} />
            {ROTULO_NOTA[n]}
          </button>
        ))}
      </div>

      {nota && (
        mostraCampo ? (
          <div className="pq-abaixo">
            <textarea
              ref={campo}
              id="pesquisa-comentario"
              maxLength={LIMITE_COMENTARIO}
              aria-label="Comentário (opcional)"
              placeholder={DICA[nota]}
              value={texto}
              onChange={e => setTexto(e.target.value)}
            />
            <div className={`pq-linha${nota === 'ruim' ? '' : ' pq-so-enviar'}`}>
              {nota === 'ruim' && (
                <button type="button" className="pq-pular" onClick={() => setFim('so-nota')}>Só a carinha mesmo</button>
              )}
              <button type="button" className="pq-env" onClick={() => void enviar()} disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="pq-abaixo pq-obrigado" aria-live="polite">
            <div className="pq-relogio" aria-hidden="true"><i key={nota} /></div>
            <div className="pq-oi" style={{ fontSize: 16 }}>
              {nota === 'boa'
                ? (n1 ? `Que bom, ${n1}! Valeu demais.` : 'Que bom! Valeu demais.')
                : (n1 ? `Valeu, ${n1}! Anotado.` : 'Valeu! Anotado.')}
            </div>
            <div className="pq-sub" style={{ maxWidth: '30ch' }}>
              Se quiser deixar um comentário ou uma sugestão, é só tocar no botão abaixo.
            </div>
            <button type="button" className="pq-add" onClick={() => setComentando(true)}>
              <Lapis /> Adicionar comentário
            </button>
            <span className="pq-fecha-em">fecha em <b>{resta}</b> s</span>
          </div>
        )
      )}
    </div>
  );
}

// ── Desenhos ────────────────────────────────────────────────────────────────

const FUNDO_ROSTO: Record<NotaPesquisa, string> = { ruim: '#ffb8a6', media: '#ffd774', boa: '#9fdcaa' };
const BOCA: Record<NotaPesquisa, string> = { ruim: 'M15 33 Q24 25 33 33', media: 'M16 31 L32 31', boa: 'M14 27 Q24 38 34 27' };
const TINTA = '#4a2e22';

export function Rosto({ nota, className }: { nota: NotaPesquisa; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <circle cx="24" cy="24" r="21" fill={FUNDO_ROSTO[nota]} />
      {nota !== 'ruim' && <><circle cx="12.5" cy="28" r="3.6" fill="#ff9f87" /><circle cx="35.5" cy="28" r="3.6" fill="#ff9f87" /></>}
      {nota === 'ruim' && <path d="M12 15 L20 18 M36 15 L28 18" stroke={TINTA} strokeWidth="2.4" strokeLinecap="round" />}
      <circle cx="17.5" cy="21" r="2.7" fill={TINTA} />
      <circle cx="30.5" cy="21" r="2.7" fill={TINTA} />
      <path d={BOCA[nota]} fill="none" stroke={TINTA} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Caneca({ className = 'pq-caneca' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <g className="pq-vapor" fill="none" stroke="#d9a679" strokeWidth="2.4" strokeLinecap="round"><path d="M22 14c-3-4 3-6 0-10" /><path d="M31 14c-3-4 3-6 0-10" /><path d="M40 14c-3-4 3-6 0-10" /></g>
      <path d="M12 22h38v18a14 14 0 0 1-14 14H26a14 14 0 0 1-14-14z" fill="#f28c5b" />
      <path d="M12 22h38v6H12z" fill="#e5784a" />
      <path d="M50 27h3a7 7 0 0 1 0 14h-4" fill="none" stroke="#f28c5b" strokeWidth="4.5" />
      <path d="M25 37c0-3 6-3 6 0 0-3 6-3 6 0 0 4-6 7-6 7s-6-3-6-7z" fill="#fff4e6" />
      <ellipse cx="31" cy="57" rx="22" ry="3" fill="#e9c9ad" />
    </svg>
  );
}

function CanecaCoracao() {
  return (
    <svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true">
      <path className="pq-coracao" d="M24 10c0-5 8-5 8 0 0-5 8-5 8 0 0 6-8 10-8 10s-8-4-8-10z" fill="#ff7a6b" />
      <path d="M12 22h38v18a14 14 0 0 1-14 14H26a14 14 0 0 1-14-14z" fill="#f28c5b" />
      <path d="M50 27h3a7 7 0 0 1 0 14h-4" fill="none" stroke="#f28c5b" strokeWidth="4.5" />
      <ellipse cx="31" cy="57" rx="22" ry="3" fill="#e9c9ad" />
    </svg>
  );
}

function Lapis() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
