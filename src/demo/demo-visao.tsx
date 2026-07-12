/**
 * Entry point da demo isolada (dev-only): apenas monta <DemoVisao />.
 * Acesse em: http://localhost:8080/demo-visao.html
 * Não entra no build de produção (não está em rollupOptions.input).
 */
import { createRoot } from 'react-dom/client';
import '../index.css';
import { DemoVisao } from './DemoVisao';

createRoot(document.getElementById('root')!).render(<DemoVisao />);
