-- Atualiza registros existentes: substitui "AcordosPRO" por "Gestão de Acordos"
-- nos documentos LGPD e termos de uso já inseridos no banco.

UPDATE public.documentos_lgpd
SET
  titulo    = REPLACE(titulo,    'AcordosPRO', 'Gestão de Acordos'),
  conteudo  = REPLACE(conteudo,  'AcordosPRO', 'Gestão de Acordos')
WHERE titulo LIKE '%AcordosPRO%' OR conteudo LIKE '%AcordosPRO%';

UPDATE public.termos_uso
SET
  titulo   = REPLACE(titulo,   'AcordosPRO', 'Gestão de Acordos'),
  conteudo = REPLACE(conteudo, 'AcordosPRO', 'Gestão de Acordos')
WHERE titulo LIKE '%AcordosPRO%' OR conteudo LIKE '%AcordosPRO%';
