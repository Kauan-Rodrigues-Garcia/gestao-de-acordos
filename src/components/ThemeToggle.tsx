import { Moon, Sun, Monitor, Circle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Temas disponíveis
const TEMAS = [
  { value: 'light',      label: 'Claro',              class: '' },
  { value: 'dark',       label: 'Escuro (Padrão)',     class: 'dark' },
  { value: 'dark-grey',  label: 'Cinza Escuro',        class: 'dark-grey' },
  { value: 'deep-blue',  label: 'Azul Profundo',       class: 'deep-blue' },
  { value: 'system',     label: 'Sistema',             class: '' },
] as const;

type ThemeValue = typeof TEMAS[number]['value'];

function applyTheme(value: ThemeValue) {
  const html = document.documentElement;
  // Remover todas as classes de tema
  html.classList.remove('dark', 'dark-grey', 'deep-blue');

  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) html.classList.add('dark');
  } else if (value === 'dark') {
    html.classList.add('dark');
  } else if (value === 'dark-grey') {
    html.classList.add('dark-grey');
  } else if (value === 'deep-blue') {
    html.classList.add('deep-blue');
  }
  // 'light' não adiciona classe
  localStorage.setItem('theme', value);
}

export function ThemeToggle() {
  const [current, setCurrent] = useState<ThemeValue>('light');

  // Inicializar tema salvo
  useEffect(() => {
    const saved = (localStorage.getItem('theme') as ThemeValue) ?? 'system';
    setCurrent(saved);
    applyTheme(saved);

    // Listener para mudança de preferência do sistema
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (current === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function setTheme(value: ThemeValue) {
    setCurrent(value);
    applyTheme(value);
  }

  const isDarkish = current === 'dark' || current === 'dark-grey' || current === 'deep-blue';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8" title={`Tema: ${TEMAS.find(t => t.value === current)?.label}`}>
          {current === 'system' ? (
            <Monitor className="h-4 w-4" />
          ) : isDarkish ? (
            <Moon className="h-4 w-4" />
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
