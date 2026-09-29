# Atlas — Documentação Técnica

## Visão geral da arquitetura

O Atlas é uma aplicação desktop construída com **Electron**, que embute dois processos Node.js separados:

- **Frontend** — React 18 + Vite, servido estaticamente pelo próprio Express em produção
- **Backend** — Express 4 + Prisma 6 + SQLite, responsável por toda a persistência e lógica de negócio

```
Electron (main process)
  ├── spawnBackend()  →  Node.js + Express (porta 3333)
  │                         └── Prisma Client → atlas.db (SQLite)
  └── BrowserWindow  →  http://localhost:3333 (prod) | http://localhost:5173 (dev)
```

Em desenvolvimento, o Vite dev server sobe na porta 5173 e o Express na 3333. Em produção, o Express serve os arquivos estáticos gerados pelo Vite e o Electron aponta para a porta 3333.

---

## Estrutura de pastas

```
atlas-completo/
├── electron/               # Processo principal do Electron
│   ├── main.ts             # Entry point: setup do banco, spawn dos processos, janela
│   ├── preload.ts          # Bridge contextIsolation (atualmente sem uso ativo)
│   └── assets/             # Ícone do app (icon.ico — não incluso no repo)
├── server/
│   └── index.ts            # Servidor Express + todas as rotas REST + auto-migração
├── src/
│   ├── main.tsx            # Todo o frontend React (componente único monolítico)
│   └── styles.css          # Estilos globais
├── prisma/
│   ├── schema.prisma       # Schema do banco de dados
│   ├── dev.db              # Banco local de desenvolvimento (não versionado)
│   └── empty.db            # Banco vazio para seed do instalador (gerado no build)
├── scripts/
│   └── create-empty-db.mjs # Gera prisma/empty.db antes do electron:build
├── docs/
│   ├── DOCUMENTACAO-TECNICA.md  # Este arquivo
│   └── GUIA-DO-USUARIO.md       # Documentação para usuário final
├── dist/                   # Output do Vite (gerado, não versionado)
├── dist-main/              # Output do tsc para electron/server (gerado)
├── dist-electron/          # Output do electron-builder (instalador)
├── vite.config.ts
├── tsconfig.json           # Base
├── tsconfig.app.json       # Frontend (src/)
├── tsconfig.electron.json  # Electron + server
└── package.json
```

---

## Stack de tecnologias

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Desktop shell | Electron | 43.1.0 |
| Empacotamento | electron-builder | 26.15.3 |
| Frontend framework | React | 18.3.1 |
| Bundler | Vite | 6.0.5 |
| Backend | Express | 4.21.2 |
| ORM | Prisma | 6.1.0 |
| Banco de dados | SQLite (via Prisma) | — |
| Animações | Framer Motion | 11.15.0 |
| Gráficos | Chart.js + react-chartjs-2 | 4.4.7 / 5.3.0 |
| Ícones | Lucide React | 0.468.0 |
| Linguagem | TypeScript | 5.7.2 |
| Runner de testes | Vitest | 4.1.10 |
| Testes de propriedade | fast-check | 4.9.0 |

---

## Banco de dados

### Localização

| Ambiente | Caminho |
|----------|---------|
| Desenvolvimento | `prisma/dev.db` (relativo à raiz do projeto) |
| Produção (instalado) | `%APPDATA%\Atlas\atlas.db` |

### Schema

```prisma
model Asset {
  id            String   @id @default(cuid())
  name          String
  category      String   // Tesouro | CDB | ETF | Ações | FII | Conta | Dinheiro | Outros
  institution   String?
  value         Float    // valor atual (marcado a mercado)
  investedValue Float    @default(0)  // custo de aquisição acumulado
  yieldRate     Float?   // taxa nominal informada (a.a.), não usada em cálculos
  liquidity     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  goal          Goal?    // relação 1-para-1 reversa
}

model Goal {
  id          String    @id @default(cuid())
  name        String
  description String?
  category    String
  priority    String    @default("Média")
  target      Float
  current     Float     @default(0)  // campo legado, não usado na UI
  deadline    DateTime?
  status      String    @default("Ativa")
  assetId     String?   @unique      // FK para Asset (1 goal → 0..1 asset)
  asset       Asset?    @relation(fields: [assetId], references: [id])
  createdAt   DateTime  @default(now())
}

model Transaction {
  id        String   @id @default(cuid())
  type      String   // Receita | Despesa | Aporte | Resgate
  category  String
  amount    Float
  date      DateTime @default(now())
  note      String?
  createdAt DateTime @default(now())
}

model Profile {
  id        String @id @default("local-profile")  // sempre "local-profile"
  name      String @default("Seu nome")
  level     Int    @default(1)
  xp        Int    @default(0)
  createdAt DateTime @default(now())
}
```

### Auto-migração

O servidor executa `ensureSchema()` na inicialização, que verifica via `PRAGMA table_info` se colunas adicionadas em versões posteriores existem, e as cria com `ALTER TABLE` caso não existam. Isso permite que instalações antigas atualizem o schema sem perder dados:

- `Asset.investedValue` — adicionado na v2 (backfill: `investedValue = value`)
- `Goal.assetId` — adicionado na v2 (+ índice único `Goal_assetId_key`)

---

## API REST

Todas as rotas são prefixadas com `/api`. O servidor roda na porta **3333**.

### Assets

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/assets` | Lista todos os ativos (ordem: `createdAt DESC`) |
| POST | `/api/assets` | Cria ativo. `investedValue` é inicializado com `value` |
| PATCH | `/api/assets/:id` | Atualiza campos parcialmente |
| DELETE | `/api/assets/:id` | Remove ativo (204) ou 404 se não existir |

**POST body:**
```json
{
  "name": "Tesouro Selic 2029",
  "category": "Tesouro",
  "institution": "Tesouro Direto",
  "value": 5000,
  "yieldRate": 12.5,
  "liquidity": "D+1"
}
```

### Goals

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/goals` | Lista todos os objetivos (ordem: `createdAt ASC`) |
| POST | `/api/goals` | Cria objetivo. Retorna 409 se `assetId` já vinculado |
| PATCH | `/api/goals/:id` | Atualiza campos (incluindo `assetId` e `priority`) |
| DELETE | `/api/goals/:id` | Remove objetivo |

### Transactions

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/transactions` | Lista todas as transações (ordem: `date DESC`) |
| POST | `/api/transactions` | Cria transação e concede XP automaticamente ao perfil |
| PATCH | `/api/transactions/:id` | Atualiza transação |
| DELETE | `/api/transactions/:id` | Remove transação |

### Profile

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/profile` | Retorna o perfil (upsert — cria se não existir) |
| PATCH | `/api/profile` | Atualiza campos do perfil (name, level, xp) |

### Summary

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/summary` | Calcula e retorna resumo financeiro do mês atual |

**Response:**
```json
{
  "total": 45000,
  "invested": 35800,
  "cash": 9200,
  "monthlyIncome": 6100,
  "monthlyExpenses": 3200,
  "monthlySavings": 2900,
  "savingsRate": 47.5,
  "totalReceived": 36600,
  "totalSpent": 19200,
  "totalContributed": 24000,
  "goals": [...]
}
```

- `total` = soma de todos os `Asset.value`
- `invested` = soma de ativos com `category` ≠ "Conta" e ≠ "Dinheiro"
- `cash` = soma de ativos com `category` = "Conta" ou "Dinheiro"
- `monthlyIncome/Expenses/Savings` = apenas transações do mês corrente

### Patrimony History

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/patrimony-history` | Reconstrói histórico patrimonial dos últimos 5 meses |

**Algoritmo:** parte do patrimônio atual (`total` dos ativos) e percorre os meses de trás para frente subtraindo o saldo líquido de cada mês (receitas − despesas). Meses sem nenhuma transação retornam `0` — o Atlas não interpola valores desconhecidos.

**Response:**
```json
{
  "labels": ["Maio", "Junho", "Julho", "Agosto", "Setembro"],
  "data": [0, 0, 38200, 41500, 45000]
}
```

### Backup / Restore

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/backup` | Exporta todos os dados como JSON |
| POST | `/api/restore` | Substitui todos os dados (operação atômica) |

**Estrutura do backup:**
```json
{
  "version": 1,
  "exportedAt": "2026-09-27T12:00:00.000Z",
  "assets": [...],
  "goals": [...],
  "transactions": [...],
  "profile": {...}
}
```

O restore valida `version === 1` e os arrays antes de executar. A substituição é feita dentro de uma única `db.$transaction()` — se qualquer etapa falhar, nada é alterado.

---

## Sistema de XP e níveis

A lógica roda inteiramente no servidor. A função `grantXp(amount)` em `server/index.ts`:

1. Lê o perfil via upsert
2. Soma o XP
3. Verifica level-up: enquanto `xp >= level * 1000`, subtrai e incrementa o nível
4. Persiste o resultado

```typescript
const XP_RULES = {
  transaction_receita: 10,
  transaction_despesa: 5,
  transaction_aporte: 20,
  transaction_resgate: 5,
  asset_created: 30,
  goal_created: 25,
}
```

XP necessário por nível: `nível_atual × 1000` (ex.: sair do nível 3 para o 4 requer 3.000 XP).

---

## Conquistas

Definidas em `ACHIEVEMENTS_CONFIG` no frontend (`src/main.tsx`). Cada conquista tem uma função `check(total, txCount, assetCount, goalCount)` que retorna `boolean`. São avaliadas em tempo real com dados buscados da API — sem campo de "desbloqueada" no banco.

| Conquista | Critério |
|-----------|----------|
| Primeiros R$ 1.000 | `total >= 1000` |
| Patrimônio de R$ 5.000 | `total >= 5000` |
| Patrimônio de R$ 10.000 | `total >= 10000` |
| Primeiro investimento | `assetCount >= 1` |
| Primeira meta | `goalCount >= 1` |
| Movimentador | `txCount >= 10` |
| Patrimônio de R$ 50.000 | `total >= 50000` |
| R$ 100.000 | `total >= 100000` |
| R$ 1 milhão | `total >= 1000000` |

---

## Simulações — fórmula

O componente `Simulator` usa a fórmula de valor futuro com aportes mensais e taxa mensal equivalente:

```
r_mensal = (1 + taxa_anual / 100)^(1/12) - 1
n = anos * 12
FV = PV * (1 + r)^n  +  PMT * [((1 + r)^n - 1) / r]
```

Onde `PV` = patrimônio inicial, `PMT` = aporte mensal, `r` = taxa mensal equivalente.

---

## Processo de build e empacotamento

### Desenvolvimento

```bash
npm install
npm run db:push       # cria/atualiza prisma/dev.db com o schema atual
npm run electron:dev  # compila electron/main.ts em watch + abre o Electron
```

O `electron:dev` não sobe o Vite — o Electron lê o `electron/main.ts` compilado e o servidor Express sobe o backend. Para o frontend com hot-reload, rode `npm run dev` separadamente e ajuste a URL no `main.ts` (já configurado para `localhost:5173` em dev).

### Build para produção

```bash
npm run electron:build
```

Executa em sequência:
1. `tsc -b && vite build` — compila TypeScript e gera `dist/`
2. `npx prisma generate` — gera o Prisma Client
3. `node scripts/create-empty-db.mjs` — cria `prisma/empty.db` (banco vazio para seed)
4. `tsc -p tsconfig.electron.json` — compila `electron/` e `server/` para `dist-main/`
5. `electron-builder` — gera o instalador NSIS em `dist-electron/`

### Ícone

Coloque o arquivo `electron/assets/icon.ico` antes de gerar o instalador. O `.ico` precisa ter no mínimo **256×256 pixels**.

### Banco no instalador

O `electron-builder` empacota `prisma/empty.db` (banco vazio) como `resources/prisma/dev.db` dentro do instalador. Na primeira execução em uma nova máquina, `electron/main.ts` copia esse arquivo para `%APPDATA%\Atlas\atlas.db`. Nas execuções seguintes, o arquivo já existe e não é sobrescrito — os dados do usuário são preservados.

### Prisma Client no pacote

O `.prisma` (pasta com ponto) é ignorado pelo empacotador do electron-builder. A solução é copiar `.prisma` e `@prisma/client` via `extraResources` para `resources/prisma-client/node_modules/`, e injetar esse caminho no `NODE_PATH` ao spawnar o backend em produção.

---

## Configurações de TypeScript

| Arquivo | Escopo |
|---------|--------|
| `tsconfig.json` | Raiz — referencia os outros |
| `tsconfig.app.json` | `src/` — frontend, alvo ES2020, JSX React |
| `tsconfig.electron.json` | `electron/` e `server/` — alvo CommonJS Node |
| `tsconfig.node.json` | Configurações do Vite |

---

## Testes

```bash
npm test
```

Os testes em `server/backup.property.test.ts` usam **property-based testing** com `fast-check` para verificar invariantes do ciclo backup → restore (ex.: exportar e reimportar deve produzir o mesmo estado).

---

## Notas de arquitetura

**Por que um monolito no frontend?**
Todo o React está em `src/main.tsx` (~2.400 linhas). Isso foi uma decisão deliberada de simplicidade para um projeto pessoal — sem necessidade de roteamento, code splitting ou múltiplos bundles. A navegação é feita via `useState("Visão geral")` no componente `App`.

**Por que Express embutido e não apenas IPC do Electron?**
Facilita o desenvolvimento web puro (`npm run dev` sem Electron) e isola o backend do processo renderer, seguindo boas práticas de segurança do Electron (`contextIsolation: true`, `nodeIntegration: false`).

**Por que SQLite e não localStorage/JSON?**
Permite queries relacionais, transações atômicas, e o backup/restore são operações simples sobre um único arquivo. O banco fica em `%APPDATA%` e sobrevive a atualizações e reinstalações do app.
