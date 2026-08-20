import { Moon, Sun, Monitor, Circle, Flower2, PanelLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
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
const SIDEBAR_DARK_STORAGE_KEY = 'sidebar-dark';

function applySidebarDark(ativo: boolean) {
  document.documentElement.classList.toggle('sidebar-dark', ativo);
  localStorage.setItem(SIDEBAR_DARK_STORAGE_KEY, ativo ? '1' : '0');
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
  const [sidebarDark, setSidebarDark] = useState(false);

  // Inicializar tema salvo
  useEffect(() => {
    const saved = (localStorage.getItem('theme') as ThemeValue) ?? 'system';
    setCurrent(saved);
    applyTheme(saved);
    const sidebarEscuraSalva = localStorage.getItem(SIDEBAR_DARK_STORAGE_KEY) === '1';
    setSidebarDark(sidebarEscuraSalva);
    applySidebarDark(sidebarEscuraSalva);

    // Listener para mudança de preferência do sistema
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (localStorage.getItem('theme') === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function setTheme(value: ThemeValue) {
    setCurrent(value);
    applyTheme(value);
  }

  function setSidebarEscura(ativo: boolean) {
    setSidebarDark(ativo);
    applySidebarDark(ativo);
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
        <DropdownMenuItem
          onSelect={event => event.preventDefault()}
          onClick={() => setSidebarEscura(!sidebarDark)}
          className="gap-2"
        >
          <PanelLeft className="h-3.5 w-3.5" />
          <span className="flex-1">Menu lateral escuro</span>
          <Switch
            checked={sidebarDark}
            onCheckedChange={setSidebarEscura}
            onClick={event => event.stopPropagation()}
            aria-label="Menu lateral escuro"
            className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
          />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
          <Sun className="h-3.5 w-3.5" />
          Claro
          {current === 'light' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
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
