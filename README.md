# Atlas

Aplicação pessoal e local para acompanhar a evolução patrimonial ao longo da vida.

## Executar

1. Instale as dependências: `npm install`
2. Crie o banco local: `npm run db:push`
3. Inicie a aplicação: `npm run dev`
4. Abra `http://localhost:5173`

O frontend roda em Vite e a API local em `http://localhost:3333`. Todos os dados são projetados para permanecer em SQLite no seu computador; não há autenticação, conta online ou envio a terceiros.

## Estrutura

- `src/`: experiência React responsiva e interface do Atlas
- `server/`: API Express local
- `prisma/schema.prisma`: modelos de patrimônio, metas, transações e perfil

## Próximos incrementos sugeridos

- Ligar o formulário de registro às rotas da API
- Preencher Dashboard, Cronograma e Estatísticas com dados reais do SQLite
- Criar os formulários completos de investimentos, objetivos e simulações de financiamento
- Adicionar exportação de backup em JSON/CSV

## Ícone do Aplicativo (Electron)

O diretório `electron/assets/` existe no repositório por meio do arquivo `electron/assets/.gitkeep`. Esse arquivo é apenas um marcador para que o git rastreie o diretório vazio — ele não é usado em nenhuma etapa do build.

Para que o instalador e a barra de tarefas do Windows exibam o ícone do Atlas, coloque um arquivo `.ico` real em:

```
electron/assets/icon.ico
```

**Antes de executar `npm run electron:build`**, substitua o `.gitkeep` (ou simplesmente adicione o arquivo ao lado dele) pelo ícone real. Sem o `icon.ico`, o electron-builder prosseguirá normalmente e gerará o instalador sem ícone — o build não falhará, mas o aplicativo aparecerá com o ícone padrão do Electron.
