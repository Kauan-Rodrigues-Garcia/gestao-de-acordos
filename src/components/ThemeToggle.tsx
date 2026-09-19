import { Moon, Sun, Monitor, Flower2, Leaf, PanelLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DESTAQUE_PAGUEPLAY, TEMAS, ehTemaEscuro,
  type EscolhaTema, type TemaInfo,
} from '@/lib/temas';

/*
 * Quem aplica o tema é o `next-themes` (ThemeProvider em App.tsx).
 *
 * Até 19/09/2026 este componente trocava as classes do <html> na mão e gravava
 * a mesma chave `theme` do localStorage que o next-themes lê. Eram dois donos
 * para o mesmo estado: o `useTheme()` dos gráficos e do toast ficava parado no
 * tema da carga, e com «Sistema» na carga o next-themes seguia reagindo à troca
 * do SO — punha `.dark` por cima do Rosa escolhido depois. Agora há um dono só.
 */

/**
 * Menu lateral escuro sobre tema claro.
 *
 * Interruptor independente do tema: liga e o <aside> fica escuro mesmo com o
 * resto da tela claro. Quem faz o trabalho e o CSS — a classe redefine so os
 * tokens `--sidebar-*`, e o seletor dela ignora os temas que ja sao escuros,
 * para nao sobrescrever o sidebar proprio do Cinza Escuro e do Azul Profundo.
 * No Rosa e no Verde o menu escurece no tom do tema. Ver o bloco
 * `.menu-lateral-escuro` em `index.css`.
 *
 * A classe mora fora da lista de temas do next-themes: ele so remove do <html>
 * as classes de tema, entao esta sobrevive a qualquer troca.
 */
const CLASSE_MENU_ESCURO = 'menu-lateral-escuro';
const CHAVE_MENU_ESCURO = 'menuLateralEscuro';

function aplicarMenuEscuro(ligado: boolean) {
  document.documentElement.classList.toggle(CLASSE_MENU_ESCURO, ligado);
  try { localStorage.setItem(CHAVE_MENU_ESCURO, ligado ? 'true' : 'false'); }
  catch { /* modo privado */ }
}

function lerMenuEscuro(): boolean {
  try { return localStorage.getItem(CHAVE_MENU_ESCURO) === 'true'; }
  catch { return false; }
}

/**
 * Bolinha dividida: metade o fundo do tema, metade o destaque.
 *
 * A empresa é lida aqui, na hora em que o menu abre, e não no ThemeToggle: ele
 * não re-renderiza quando o seletor de empresa troca o `data-tenant`.
 */
function Amostra({ tema }: { tema: TemaInfo }) {
  const pagueplay = document.documentElement.getAttribute('data-tenant') === 'pagueplay';
  const destaque = (pagueplay && DESTAQUE_PAGUEPLAY[tema.valor]) || tema.amostra.destaque;
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-border"
      style={{ background: `linear-gradient(135deg, ${tema.amostra.fundo} 50%, ${destaque} 50%)` }}
    />
  );
}

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const atual = (theme ?? 'system') as EscolhaTema;
  const escuroEmVigor = ehTemaEscuro(resolvedTheme);
  const [menuEscuro, setMenuEscuro] = useState(lerMenuEscuro);

  // Reaplica na montagem: o script do index.html ja pos a classe antes da
  // pintura, isto so garante o estado caso ele nao tenha rodado.
  useEffect(() => { aplicarMenuEscuro(menuEscuro); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarMenuEscuro() {
    setMenuEscuro(v => {
      const novo = !v;
      aplicarMenuEscuro(novo);
      return novo;
    });
  }

  const rotuloAtual = atual === 'system' ? 'Sistema' : TEMAS.find(t => t.valor === atual)?.rotulo;
  const claros = TEMAS.filter(t => !t.escuro);
  const escuros = TEMAS.filter(t => t.escuro);

  const itemTema = (t: TemaInfo) => (
    <DropdownMenuItem key={t.valor} onClick={() => setTheme(t.valor)} className="gap-2">
      <Amostra tema={t} />
      {t.rotulo}
      {atual === t.valor && <span className="ml-auto text-primary">✓</span>}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8" title={`Tema: ${rotuloAtual ?? 'Sistema'}`}>
          {atual === 'system' ? (
            <Monitor className="h-4 w-4" />
          ) : escuroEmVigor ? (
            <Moon className="h-4 w-4" />
          ) : atual === 'rosa' ? (
            <Flower2 className="h-4 w-4 text-primary" />
          ) : atual === 'verde' ? (
            <Leaf className="h-4 w-4 text-primary" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="sr-only">Alternar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[190px]">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Temas Claros</div>
        {itemTema(claros[0])}
        {/*
          Interruptor, nao tema: fica logo abaixo do Claro porque e nos claros
          que ele importa. `preventDefault` no onSelect mantem o menu aberto —
          quem liga o menu escuro quer ver o efeito e decidir na hora.
        */}
        <DropdownMenuCheckboxItem
          checked={menuEscuro}
          onCheckedChange={alternarMenuEscuro}
          onSelect={e => e.preventDefault()}
          disabled={escuroEmVigor}
          title={escuroEmVigor
            ? 'O tema atual ja e escuro — o menu lateral tambem.'
            : 'Deixa so o menu lateral escuro, mantendo o resto claro.'}
          className="gap-2"
        >
          <PanelLeft className="h-3.5 w-3.5" />
          Menu lateral escuro
        </DropdownMenuCheckboxItem>
        {claros.slice(1).map(itemTema)}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Temas Escuros</div>
        {escuros.map(itemTema)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
          <Monitor className="h-3.5 w-3.5" />
          Sistema
          {atual === 'system' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
