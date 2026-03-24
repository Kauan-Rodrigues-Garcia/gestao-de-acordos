# Stack Tecnológica
Este projeto utiliza a seguinte stack tecnológica:
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

# Fluxo de Desenvolvimento
1. Ajuste o estilo do tema em `src/index.css` e `tailwind.config.ts` conforme as necessidades do usuário.
2. Divida as páginas a serem implementadas de acordo com os requisitos do usuário.
3. Organize as funções necessárias para cada página e crie a pasta correspondente em `pages` com o ponto de entrada `Index.tsx`.
4. Crie a configuração de rota em `App.tsx` e importe os arquivos `Index.tsx` criados.
5. Se o requisito for simples, o trabalho pode ser feito diretamente no arquivo `Index.tsx`.
6. Se o requisito for complexo, a página pode ser dividida em vários componentes, seguindo a estrutura:
    - `Index.tsx`: Ponto de entrada
    - `/components/`: Componentes
    - `/hooks/`: Hooks customizados
    - `/stores/`: Para comunicações complexas, pode-se usar zustand.
7. Após concluir as tarefas, execute `pnpm i` para instalar dependências e use `npm run lint` & `npx tsc --noEmit -p tsconfig.app.json --strict` para verificar e corrigir problemas.

# Integração com Backend
- Ao adicionar novas interfaces ou operar no Supabase, crie um novo arquivo de API em `src/api` e exporte os tipos de dados correspondentes (pode consultar o arquivo `src/demo.ts` como referência). Se for utilizar Supabase, a implementação deve ser feita adequadamente.
- A implementação entre o frontend e o Supabase deve seguir rigorosamente os tipos de dados definidos, evitando alterações neles. Se houver mudanças, verifique todos os arquivos que referenciam esse tipo.
