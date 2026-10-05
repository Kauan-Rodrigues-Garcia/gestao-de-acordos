/**
 * O topo da aba Usuários 2.0: três cartões, e cada número é um filtro.
 *
 *   Online agora   quem está no sistema, e quanto disso é BookPlay e PaguePlay
 *                  (a marca da cidade do setor — etiqueta, não regra)
 *   Situação       ativos, de férias e desligados; e o atalho «só online»
 *   Para resolver  o que precisa de alguém: sem setor, sem equipe, sem meta no
 *                  mês e senha provisória. Antes só se descobria rolando.
 *
 * Contam sobre TODA a gente que este cargo enxerga, e não sobre o recorte da
 * tela: um número que muda quando se digita na busca não informa nada.
 */
import { memo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { SituacaoUsuario } from '@/lib/supabase';
import { PENDENCIAS, type ChavePendencia, type FiltroSituacao, type MarcaDaPessoa } from './modelo';

const COR_SITUACAO: Record<SituacaoUsuario, string> = {
  ativo: 'var(--success)', ferias: 'var(--warning)', desligado: 'var(--destructive)',
};
const ROTULO_SITUACAO: Record<SituacaoUsuario, string> = { ativo: 'Ativos', ferias: 'De férias', desligado: 'Desligados' };
const COR_TOM = { ruim: 'var(--destructive)', alerta: 'var(--warning)', info: 'var(--primary)' } as const;

export interface NumerosDoPulso {
  online: number;
  ativos: number;
  porMarca: Record<MarcaDaPessoa, { online: number; ativos: number }>;
  /** Há gente com marca? Sem cidade em setor nenhum, os dois cartões somem. */
  temMarca: boolean;
  situacao: Record<SituacaoUsuario, number>;
  pendencias: Record<ChavePendencia, number>;
}

export const PulsoDeUsuarios = memo(function PulsoDeUsuarios({ n, marca, situacao, pendencia, onMarca, onSituacao, onPendencia }: {
  n: NumerosDoPulso;
  marca: MarcaDaPessoa | null; situacao: FiltroSituacao | null; pendencia: ChavePendencia | null;
  onMarca: (m: MarcaDaPessoa | null) => void;
  onSituacao: (s: FiltroSituacao | null) => void;
  onPendencia: (p: ChavePendencia | null) => void;
}) {
  const totalSit = n.situacao.ativo + n.situacao.ferias + n.situacao.desligado;
  const abertas = PENDENCIAS.filter(p => n.pendencias[p.chave] > 0);
  return (
    <section className="us-pulso" aria-label="Agora">
      <div className="us-cart">
        <div className="us-cart-cab"><span className="us-rot">Online agora</span><span className="us-vivo" aria-hidden="true" /></div>
        <div className="us-grande"><b>{n.online}</b><span>de {n.ativos} ativos{n.temMarca ? ' · clique numa marca para filtrar' : ''}</span></div>
        {n.temMarca && (
          <div className="us-marcas">
            {(['bp', 'pp'] as const).map(m => (
              <button key={m} type="button" className={`us-marca ${m}`} aria-pressed={marca === m}
                onClick={() => onMarca(marca === m ? null : m)}>
                <small><span className="us-ponto" style={{ background: 'var(--cc)' }} />{m === 'bp' ? 'BOOKPLAY · BIRIGUI' : 'PAGUEPLAY · MARÍLIA'}</small>
                <b>{n.porMarca[m].online}<em>de {n.porMarca[m].ativos}</em></b>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="us-cart">
        <div className="us-cart-cab">
          <span className="us-rot">Situação</span>
          <button type="button" className="us-link" aria-pressed={situacao === 'online'} onClick={() => onSituacao(situacao === 'online' ? null : 'online')}>
            {situacao === 'online' ? 'mostrando só online' : 'ver só online'}
          </button>
        </div>
        {totalSit > 0 && (
          <div className="us-barra-sit" aria-hidden="true">
            {(['ativo', 'ferias', 'desligado'] as const).map(s => <i key={s} style={{ flexGrow: n.situacao[s], background: COR_SITUACAO[s] }} />)}
          </div>
        )}
        <div className="us-sits">
          {(['ativo', 'ferias', 'desligado'] as const).map(s => (
            <button key={s} type="button" className="us-sit" style={{ ['--s' as string]: COR_SITUACAO[s] }} aria-pressed={situacao === s}
              onClick={() => onSituacao(situacao === s ? null : s)}>
              <small><span className="us-ponto" style={{ background: COR_SITUACAO[s] }} />{ROTULO_SITUACAO[s]}</small>
              <b>{n.situacao[s]}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="us-cart">
        <div className="us-cart-cab"><span className="us-rot">Para resolver</span></div>
        {abertas.length ? (
          <div className="us-pend">
            {abertas.map(p => (
              <button key={p.chave} type="button" style={{ ['--s' as string]: COR_TOM[p.tom] }} aria-pressed={pendencia === p.chave}
                onClick={() => onPendencia(pendencia === p.chave ? null : p.chave)}>
                <b>{n.pendencias[p.chave]}</b>
                <span>{p.titulo}<small>{p.porque}</small></span>
                <span aria-hidden="true" style={{ flex: 'none', color: 'var(--muted-foreground)' }}>›</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="us-tudo-certo"><CheckCircle2 className="w-4 h-4 text-success" /> Nada para resolver: todo mundo com setor, equipe, meta e senha própria.</p>
        )}
      </div>
    </section>
  );
});
