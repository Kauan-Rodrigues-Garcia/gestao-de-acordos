// A folha é pequena e vem junto: o selo do chat e a marca usam as classes dela,
// e o `Layout` e a `BolhaChat` importam este arquivo direto (as camadas descem
// à parte, em `CenaVi.tsx`).
import './vi.css';

/**
 * O nome do sistema no menu no dia do GTA VI (18 e 19/11/2026): o nome na fonte do
 * site do jogo e o «VI» oficial DEPOIS dele, na mesma linha — «Gestão de
 * Acordos VI» (Cleber, 16/11/2026). Sem «Chegou o dia».
 */
export function MarcaVi({ nome }: { nome: string }) {
  return (
    <div className="vi-marca">
      <p className="vi-marca-nome text-sidebar-foreground">{nome}</p>
      <img className="vi-marca-simbolo" src="/vi/logo-vi.webp" alt="" />
    </div>
  );
}

/** A bolha do chat no dia: o «VI» no lugar do ícone; pulsa com mensagem nova (`vi.css`). */
export function SeloVi({ chamando }: { chamando: boolean }) {
  return <img src="/vi/logo-vi.webp" alt="" className={chamando ? 'vi-selo vi-selo-chama' : 'vi-selo'} />;
}

/**
 * A tela de carregamento no dia: o logo da Rockstar com o feixe de luz, igual
 * à do site do jogo (`vi.css`). `data-anima-sempre`: no modo leve ela continua
 * girando — parada, diria «travou» (a mesma exceção do spinner em `index.css`).
 */
export function CarregandoVi() {
  return (
    <div className="vi-carrega" role="status" aria-label="Carregando">
      <div className="vi-carrega-logo" data-anima-sempre="">
        <div className="vi-carrega-brilho" />
        <div className="vi-carrega-traco" />
      </div>
    </div>
  );
}
