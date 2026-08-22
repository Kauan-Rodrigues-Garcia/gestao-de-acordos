import { Moon, Sun, Monitor, Circle, Flower2, PanelLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Temas disponíveis para os dois tenants
const TEMAS = [
  { value: 'light',      label: 'Claro',              class: '' },
  { value: 'rosa',       label: 'Rosa',               class: 'rosa' },
  { value: 'dark',       label: 'Escuro (Padrão)',     class: 'dark' },
  { value: 'dark-grey',  label: 'Cinza Escuro',        class: 'dark-grey' },
  { value: 'deep-blue',  label: 'Azul Profundo',       class: 'deep-blue' },
  { value: 'system',     label: 'Sistema',             class: '' },
] as const;

type ThemeValue = typeof TEMAS[number]['value'];

const ALL_THEME_CLASSES = ['dark', 'dark-grey', 'deep-blue', 'rosa'] as const;

/**
 * Menu lateral escuro sobre tema claro.
 *
 * Interruptor independente do tema: liga e o <aside> fica escuro mesmo com o
 * resto da tela claro. Quem faz o trabalho e o CSS — a classe redefine so os
 * tokens `--sidebar-*`, e o seletor dela ignora os temas que ja sao escuros,
 * para nao sobrescrever o sidebar proprio do Cinza Escuro e do Azul Profundo.
 * Ver o bloco `.menu-lateral-escuro` em `index.css`.
 */
const CLASSE_MENU_ESCURO = 'menu-lateral-escuro';
const CHAVE_MENU_ESCURO = 'menuLateralEscuro';

function aplicarMenuEscuro(ligado: boolean) {
  document.documentElement.classList.toggle(CLASSE_MENU_ESCURO, ligado);
  try { localStorage.setItem(CHAVE_MENU_ESCURO, ligado ? 'true' : 'false'); }
  catch { /* modo privado */ }
}

/** `true` quando o tema em vigor ja e escuro — ai o interruptor nao tem efeito. */
function temaEscuroEmVigor(): boolean {
  const c = document.documentElement.classList;
  return c.contains('dark') || c.contains('dark-grey') || c.contains('deep-blue');
}

function applyTheme(value: ThemeValue) {
  const html = document.documentElement;
  html.classList.remove(...ALL_THEME_CLASSES);

  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) html.classList.add('dark');
  } else if (value === 'dark') {
    html.classList.add('dark');
  } else if (value === 'dark-grey') {
    html.classList.add('dark-grey');
  } else if (value === 'deep-blue') {
    html.classList.add('deep-blue');
  } else if (value === 'rosa') {
    html.classList.add('rosa');
  }
  // 'light' não adiciona classe
  localStorage.setItem('theme', value);
}

export function ThemeToggle() {
  const [current, setCurrent] = useState<ThemeValue>('light');
  const [menuEscuro, setMenuEscuro] = useState(false);
  // Recalculado a cada troca de tema: o interruptor fica inerte nos escuros.
  const [escuroEmVigor, setEscuroEmVigor] = useState(false);

  // Inicializar tema salvo
  useEffect(() => {
    const saved = (localStorage.getItem('theme') as ThemeValue) ?? 'system';
    setCurrent(saved);
    applyTheme(saved);

    let ligado = false;
    try { ligado = localStorage.getItem(CHAVE_MENU_ESCURO) === 'true'; }
    catch { /* modo privado */ }
    setMenuEscuro(ligado);
    aplicarMenuEscuro(ligado);
    setEscuroEmVigor(temaEscuroEmVigor());

    // Listener para mudança de preferência do sistema
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (current === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function setTheme(value: ThemeValue) {
    setCurrent(value);
    applyTheme(value);
    setEscuroEmVigor(temaEscuroEmVigor());
  }

  function alternarMenuEscuro() {
    setMenuEscuro(v => {
      const novo = !v;
      aplicarMenuEscuro(novo);
      return novo;
    });
  }

  const isDarkish = current === 'dark' || current === 'dark-grey' || current === 'deep-blue';
  const isRosa = current === 'rosa';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8" title={`Tema: ${TEMAS.find(t => t.value === current)?.label}`}>
          {current === 'system' ? (
            <Monitor className="h-4 w-4" />
          ) : isDarkish ? (
            <Moon className="h-4 w-4" />
          ) : isRosa ? (
            <Flower2 className="h-4 w-4 text-pink-400" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="sr-only">Alternar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Temas Claros</div>
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
          <Sun className="h-3.5 w-3.5" />
          Claro
          {current === 'light' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        {/*
          Interruptor, nao tema: fica ao lado do Claro porque e la que ele
          importa. `preventDefault` no onSelect mantem o menu aberto — quem
          liga o menu escuro quer ver o efeito e decidir na hora.
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
        <DropdownMenuItem onClick={() => setTheme('rosa')} className="gap-2">
          <Flower2 className="h-3.5 w-3.5 text-pink-400" />
          Rosa
          {current === 'rosa' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Temas Escuros</div>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2">
          <Moon className="h-3.5 w-3.5" />
          Escuro (Padrão)
          {current === 'dark' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark-grey')} className="gap-2">
          <Circle className="h-3.5 w-3.5 fill-zinc-500 text-zinc-500" />
          Cinza Escuro
          {current === 'dark-grey' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('deep-blue')} className="gap-2">
          <Circle className="h-3.5 w-3.5 fill-blue-700 text-blue-700" />
          Azul Profundo
          {current === 'deep-blue' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
          <Monitor className="h-3.5 w-3.5" />
          Sistema
          {current === 'system' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
