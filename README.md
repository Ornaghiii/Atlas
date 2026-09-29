# Atlas

Aplicação desktop de controle financeiro pessoal. Roda inteiramente no seu computador — sem conta, sem internet, sem envio de dados a terceiros. Todos os dados ficam em SQLite no próprio sistema.

Construído com Electron + React + Express + Prisma.

---

## Funcionalidades

- **Visão geral** — dashboard com patrimônio total, gráfico histórico dos últimos 5 meses, missão atual e métricas do mês
- **Receitas e despesas** — registro e histórico de lançamentos por categoria
- **Patrimônio** — gerenciamento de ativos com aporte, resgate, atualização de saldo e cálculo de lucro/prejuízo
- **Objetivos** — metas financeiras vinculadas a ativos, com progresso automático
- **Simulações** — projeção patrimonial com juros compostos, comparação de cenários e gráfico ano a ano
- **Cronograma** — histórico real + projeção futura baseada na taxa de economia atual
- **Conquistas** — marcos desbloqueados automaticamente com base em dados reais
- **Perfil financeiro** — nível, XP (ganho automaticamente por ações), score e título
- **Backup / Restore** — exportação completa em JSON e restauração atômica
- **Estatísticas** — totais acumulados de receitas, aportes e sequências

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- npm 9 ou superior

---

## Desenvolvimento

```bash
# 1. Instalar dependências
npm install

# 2. Criar o banco de dados local
npm run db:push

# 3. Iniciar em modo desenvolvimento (Vite + Express simultâneos)
npm run dev
```

O frontend sobe em `http://localhost:5173` e a API em `http://localhost:3333`.

Para rodar no Electron em modo desenvolvimento:

```bash
npm run electron:dev
```

---

## Build (instalador Windows)

Antes de buildar, coloque o ícone em `electron/assets/icon.ico` (mínimo 256×256 px).

```bash
npm run electron:build
```

O comando executa em sequência:
1. Compilação TypeScript + build do Vite
2. Geração do Prisma Client
3. Criação do banco vazio de seed (`prisma/empty.db`)
4. Compilação do Electron/servidor
5. Empacotamento com electron-builder → `dist-electron/`

> O instalador empacota um banco vazio. Na primeira execução em uma nova máquina, o banco é copiado para `%APPDATA%\Atlas\atlas.db`. Dados de usuários existentes nunca são sobrescritos.

---

## Testes

```bash
npm test
```

Testes de propriedade (property-based) sobre o ciclo backup → restore usando [fast-check](https://fast-check.io/).

---

## Estrutura do projeto

```
├── electron/          # Processo principal do Electron (main.ts, preload.ts)
├── server/            # API Express + lógica de negócio + auto-migração
├── src/               # Frontend React (main.tsx monolítico + styles.css)
├── prisma/            # Schema Prisma e banco de desenvolvimento
├── scripts/           # Scripts de build (create-empty-db.mjs)
└── docs/              # Documentação técnica e guia do usuário
```

Documentação completa em [`docs/DOCUMENTACAO-TECNICA.md`](docs/DOCUMENTACAO-TECNICA.md).
Guia para usuário final em [`docs/GUIA-DO-USUARIO.md`](docs/GUIA-DO-USUARIO.md).

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron 43 |
| Frontend | React 18 + Vite 6 |
| Backend | Express 4 |
| ORM / Banco | Prisma 6 + SQLite |
| Linguagem | TypeScript 5.7 |
| Animações | Framer Motion 11 |
| Gráficos | Chart.js 4 + react-chartjs-2 |

---

## Banco de dados

| Ambiente | Localização |
|----------|-------------|
| Desenvolvimento | `prisma/dev.db` |
| Produção (instalado) | `%APPDATA%\Atlas\atlas.db` |

O servidor executa auto-migrações na inicialização para manter compatibilidade com bancos criados em versões anteriores.

---

## Notas

- O projeto não tem autenticação — é projetado para uso pessoal, em máquina local.
- Não há sincronização entre dispositivos. Use backup/restore para migrar dados.
- O frontend é um único arquivo `src/main.tsx`. A navegação é feita via estado React, sem roteador.
