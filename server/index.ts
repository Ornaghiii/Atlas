import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const app = express();
const db = new PrismaClient();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const asNumber = (value: unknown) => Number(value ?? 0);

// --- Sistema de XP ---
// Regras de ganho de XP por ação:
const XP_RULES = {
  transaction_receita: 10,
  transaction_despesa: 5,
  transaction_aporte: 20,
  transaction_resgate: 5,
  asset_created: 30,
  goal_created: 25,
} as const;

// XP necessário para passar do nível N para N+1: N * 1000 (mesmo cálculo do frontend)
const xpForLevel = (level: number) => level * 1000;

async function grantXp(
  amount: number,
): Promise<void> {
  const profile = await db.profile.upsert({
    where: { id: "local-profile" },
    create: { id: "local-profile" },
    update: {},
  });

  let newXp = profile.xp + amount;
  let newLevel = profile.level;

  // Verifica level-up (pode subir mais de um nível de uma vez)
  while (newXp >= xpForLevel(newLevel)) {
    newXp -= xpForLevel(newLevel);
    newLevel += 1;
  }

  await db.profile.update({
    where: { id: "local-profile" },
    data: { xp: newXp, level: newLevel },
  });
}

const route =
  (
    handler: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<unknown>,
  ) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void handler(req, res, next).catch(next);
  };

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get(
  "/api/assets",
  route(async (_, res) =>
    res.json(await db.asset.findMany({ orderBy: { createdAt: "desc" } })),
  ),
);
app.post(
  "/api/assets",
  route(async (req, res) => {
    const asset = await db.asset.create({
      data: {
        name: String(req.body.name),
        category: String(req.body.category),
        institution: req.body.institution || null,
        value: asNumber(req.body.value),
        investedValue: asNumber(req.body.value),
        yieldRate:
          req.body.yieldRate === undefined || req.body.yieldRate === ""
            ? null
            : asNumber(req.body.yieldRate),
        liquidity: req.body.liquidity || null,
      },
    });
    void grantXp(XP_RULES.asset_created);
    return res.status(201).json(asset);
  }),
);
app.patch(
  "/api/assets/:id",
  route(async (req, res) =>
    res.json(
      await db.asset.update({
        where: { id: String(req.params.id) },
        data: {
          ...req.body,
          value:
            req.body.value === undefined ? undefined : asNumber(req.body.value),
          investedValue:
            req.body.investedValue === undefined
              ? undefined
              : asNumber(req.body.investedValue),
        },
      }),
    ),
  ),
);
app.delete(
  "/api/assets/:id",
  route(async (req, res) => {
    const result = await db.asset.deleteMany({
      where: { id: String(req.params.id) },
    });
    if (!result.count)
      return res.status(404).json({ error: "Ativo não encontrado." });
    res.status(204).end();
  }),
);

app.get(
  "/api/goals",
  route(async (_, res) =>
    res.json(await db.goal.findMany({ orderBy: { createdAt: "asc" } })),
  ),
);
app.post(
  "/api/goals",
  route(async (req, res) => {
    try {
      const goal = await db.goal.create({
        data: {
          name: String(req.body.name),
          description: req.body.description || null,
          category: String(req.body.category),
          priority: req.body.priority || "Média",
          target: asNumber(req.body.target),
          deadline: req.body.deadline ? new Date(req.body.deadline) : null,
          status: req.body.status || "Ativa",
          assetId: req.body.assetId || null,
        },
      });
      void grantXp(XP_RULES.goal_created);
      return res.status(201).json(goal);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return res
          .status(409)
          .json({ error: "Esse investimento já está vinculado a outro objetivo." });
      }
      throw error;
    }
  }),
);
app.patch(
  "/api/goals/:id",
  route(async (req, res) => {
    try {
      return res.json(
        await db.goal.update({
          where: { id: String(req.params.id) },
          data: {
            ...req.body,
            target:
              req.body.target === undefined
                ? undefined
                : asNumber(req.body.target),
            current:
              req.body.current === undefined
                ? undefined
                : asNumber(req.body.current),
            deadline: req.body.deadline
              ? new Date(req.body.deadline)
              : undefined,
          },
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return res
          .status(409)
          .json({ error: "Esse investimento já está vinculado a outro objetivo." });
      }
      throw error;
    }
  }),
);
app.delete(
  "/api/goals/:id",
  route(async (req, res) => {
    const result = await db.goal.deleteMany({
      where: { id: String(req.params.id) },
    });
    if (!result.count)
      return res.status(404).json({ error: "Objetivo não encontrado." });
    res.status(204).end();
  }),
);

app.get(
  "/api/transactions",
  route(async (_, res) =>
    res.json(await db.transaction.findMany({ orderBy: { date: "desc" } })),
  ),
);
app.post(
  "/api/transactions",
  route(async (req, res) => {
    const tx = await db.transaction.create({
      data: {
        type: String(req.body.type),
        category: String(req.body.category),
        note: req.body.note || null,
        amount: asNumber(req.body.amount),
        date: req.body.date ? new Date(req.body.date) : new Date(),
      },
    });
    const type = String(req.body.type).toLowerCase();
    const xpKey = `transaction_${type}` as keyof typeof XP_RULES;
    if (xpKey in XP_RULES) void grantXp(XP_RULES[xpKey]);
    return res.status(201).json(tx);
  }),
);
app.patch(
  "/api/transactions/:id",
  route(async (req, res) =>
    res.json(
      await db.transaction.update({
        where: { id: String(req.params.id) },
        data: {
          ...req.body,
          amount:
            req.body.amount === undefined
              ? undefined
              : asNumber(req.body.amount),
          date: req.body.date ? new Date(req.body.date) : undefined,
        },
      }),
    ),
  ),
);
app.delete(
  "/api/transactions/:id",
  route(async (req, res) => {
    const result = await db.transaction.deleteMany({
      where: { id: String(req.params.id) },
    });
    if (!result.count)
      return res.status(404).json({ error: "Lançamento não encontrado." });
    res.status(204).end();
  }),
);

app.get("/api/profile", async (_, res) =>
  res.json(
    await db.profile.upsert({
      where: { id: "local-profile" },
      create: { id: "local-profile" },
      update: {},
    }),
  ),
);
app.patch("/api/profile", async (req, res) =>
  res.json(
    await db.profile.upsert({
      where: { id: "local-profile" },
      create: { id: "local-profile", ...req.body },
      update: req.body,
    }),
  ),
);

// Rota de histórico patrimonial: reconstrói mês a mês nos últimos 7 meses
// somando o valor atual dos ativos (snapshot recente) e ajustando pelo
// fluxo líquido (receitas − despesas − aportes) de cada mês passado.
// Como o banco não guarda snapshots históricos de ativos, usamos a melhor
// aproximação possível: patrimônio atual como base e "voltamos no tempo"
// subtraindo o saldo líquido de cada mês.
app.get("/api/patrimony-history", async (_, res) => {
  const [assets, transactions] = await Promise.all([
    db.asset.findMany(),
    db.transaction.findMany({ orderBy: { date: "asc" } }),
  ]);

  const currentTotal = assets.reduce((s, a) => s + a.value, 0);
  const now = new Date();

  // Gera os 5 rótulos (mês atual + 4 anteriores, do mais antigo pro mais novo)
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("pt-BR", { month: "long" });
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      // Capitaliza a primeira letra: "setembro" → "Setembro"
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
  }

  // Saldo líquido de cada mês (receitas - despesas; aportes não entram aqui
  // pois são transferências internas de patrimônio, não criação de riqueza)
  const netByMonth: Record<string, number> = {};
  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const sign =
      t.type === "Receita"
        ? 1
        : t.type === "Despesa"
          ? -1
          : 0; // Aporte e Resgate = movimentação interna
    netByMonth[key] = (netByMonth[key] ?? 0) + t.amount * sign;
  }

  // Reconstrói o histórico partindo do mês atual e voltando.
  // Só exibe um ponto histórico se houve ao menos uma transação naquele mês
  // — sem movimentação registrada, o valor daquele período é desconhecido
  // e exibimos zero em vez de propagar o patrimônio atual para trás.
  const data: number[] = new Array(5).fill(0);
  data[4] = currentTotal; // mês atual = valor real
  for (let i = 3; i >= 0; i--) {
    const m = months[i + 1];
    const key = `${m.year}-${m.month}`;
    if (!(key in netByMonth)) {
      // Nenhuma transação nesse mês: ponto desconhecido → zero
      data[i] = 0;
    } else {
      const net = netByMonth[key];
      data[i] = Math.max(0, data[i + 1] - net);
    }
  }

  res.json({
    labels: months.map((m) => m.label),
    data: data.map((v) => Math.round(v * 100) / 100),
  });
});

app.get("/api/summary", async (_, res) => {
  const [assets, transactions, goals] = await Promise.all([
    db.asset.findMany(),
    db.transaction.findMany(),
    db.goal.findMany(),
  ]);
  type TxItem = (typeof transactions)[number];
  type AssetItem = (typeof assets)[number];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = transactions.filter((t: TxItem) => t.date >= monthStart);
  const sum = (items: TxItem[]) =>
    items.reduce((total: number, item: TxItem) => total + item.amount, 0);
  const sumAssets = (items: AssetItem[]) =>
    items.reduce((total: number, item: AssetItem) => total + item.value, 0);
  const income = sum(month.filter((t: TxItem) => t.type === "Receita"));
  const expenses = sum(month.filter((t: TxItem) => t.type === "Despesa"));
  const invested = sumAssets(
    assets.filter(
      (a: AssetItem) => !["Conta", "Dinheiro"].includes(a.category),
    ),
  );
  const cash = sumAssets(
    assets.filter((a: AssetItem) => ["Conta", "Dinheiro"].includes(a.category)),
  );
  const total = sumAssets(assets);
  res.json({
    total,
    invested,
    cash,
    monthlyIncome: income,
    monthlyExpenses: expenses,
    monthlySavings: income - expenses,
    savingsRate: income ? ((income - expenses) / income) * 100 : 0,
    totalReceived: sum(
      transactions.filter((t: TxItem) => t.type === "Receita"),
    ),
    totalSpent: sum(transactions.filter((t: TxItem) => t.type === "Despesa")),
    totalContributed: sum(
      transactions.filter((t: TxItem) => t.type === "Aporte"),
    ),
    goals,
  });
});

app.get("/api/backup", async (_, res) =>
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    assets: await db.asset.findMany(),
    goals: await db.goal.findMany(),
    transactions: await db.transaction.findMany(),
    profile: await db.profile.findUnique({ where: { id: "local-profile" } }),
  }),
);

app.post(
  "/api/restore",
  route(async (req, res) => {
    const backup = req.body as {
      version?: number;
      assets?: any[];
      goals?: any[];
      transactions?: any[];
      profile?: any;
    };
    if (
      backup.version !== 1 ||
      !Array.isArray(backup.assets) ||
      !Array.isArray(backup.goals) ||
      !Array.isArray(backup.transactions)
    ) {
      return res.status(400).json({ error: "Arquivo de backup inválido." });
    }

    const assets = backup.assets;
    const goals = backup.goals;
    const transactions = backup.transactions;

    await db.$transaction(async (tx) => {
      await tx.transaction.deleteMany();
      await tx.goal.deleteMany();
      await tx.asset.deleteMany();
      await tx.profile.deleteMany();

      if (assets.length)
        await tx.asset.createMany({
          data: assets.map((a) => ({
            id: String(a.id),
            name: String(a.name),
            category: String(a.category),
            institution: a.institution || null,
            value: asNumber(a.value),
            investedValue: asNumber(a.investedValue ?? a.value),
            yieldRate:
              a.yieldRate === null || a.yieldRate === undefined
                ? null
                : asNumber(a.yieldRate),
            liquidity: a.liquidity || null,
            createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
          })),
        });
      if (goals.length)
        await tx.goal.createMany({
          data: goals.map((g) => ({
            id: String(g.id),
            name: String(g.name),
            description: g.description || null,
            category: String(g.category),
            priority: g.priority || "Média",
            target: asNumber(g.target),
            current: asNumber(g.current),
            deadline: g.deadline ? new Date(g.deadline) : null,
            status: g.status || "Ativa",
            assetId: g.assetId || null,
            createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
          })),
        });
      if (transactions.length)
        await tx.transaction.createMany({
          data: transactions.map((t) => ({
            id: String(t.id),
            type: String(t.type),
            category: String(t.category),
            amount: asNumber(t.amount),
            note: t.note || null,
            date: t.date ? new Date(t.date) : new Date(),
            createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
          })),
        });
      if (backup.profile)
        await tx.profile.create({
          data: {
            id: "local-profile",
            name: String(backup.profile.name || "Seu nome"),
            level: Number(backup.profile.level || 1),
            xp: Number(backup.profile.xp || 0),
            createdAt: backup.profile.createdAt
              ? new Date(backup.profile.createdAt)
              : new Date(),
          },
        });
    });
    res.json({ ok: true });
  }),
);

/**
 * Lightweight self-migration: adds the `investedValue` column if it's
 * missing (e.g. an already-installed database created before this
 * column existed). Existing rows are backfilled with investedValue =
 * value, so lucro/prejuízo starts at zero until the user updates the
 * current value going forward — we have no way to know what was
 * actually invested historically, so this is the safest default.
 */
async function ensureSchema(): Promise<void> {
  const assetColumns = await db.$queryRawUnsafe<{ name: string }[]>(
    `PRAGMA table_info(Asset)`,
  );
  const hasInvestedValue = assetColumns.some((c) => c.name === "investedValue");
  if (!hasInvestedValue) {
    console.log("[migration] adicionando coluna investedValue em Asset...");
    await db.$executeRawUnsafe(
      `ALTER TABLE "Asset" ADD COLUMN "investedValue" REAL NOT NULL DEFAULT 0`,
    );
    await db.$executeRawUnsafe(
      `UPDATE "Asset" SET "investedValue" = "value"`,
    );
    console.log("[migration] concluída.");
  }

  const goalColumns = await db.$queryRawUnsafe<{ name: string }[]>(
    `PRAGMA table_info(Goal)`,
  );
  const hasAssetId = goalColumns.some((c) => c.name === "assetId");
  if (!hasAssetId) {
    console.log("[migration] adicionando coluna assetId em Goal...");
    // Objetivos deixam de ter saldo próprio: passam a apontar para um
    // Investimento (Asset), cujo valor atual vira o progresso do
    // objetivo. Um mesmo investimento só pode estar vinculado a um
    // objetivo por vez (índice único).
    await db.$executeRawUnsafe(`ALTER TABLE "Goal" ADD COLUMN "assetId" TEXT`);
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "Goal_assetId_key" ON "Goal"("assetId")`,
    );
    console.log("[migration] concluída.");
  }
}

// Serve the built frontend in production. When packaged, this compiled
// file lives at dist-main/server/index.js, two levels below the app
// root, where the Vite build output (dist/) also lives.
const distCandidates = [
  path.join(__dirname, "..", "..", "dist"),
  path.join(process.cwd(), "dist"),
];
const distPath = distCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, "index.html")),
);
if (distPath) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_req, res) =>
    res.sendFile(path.join(distPath, "index.html")),
  );
}

app.use(
  (
    error: Error,
    _: express.Request,
    res: express.Response,
    __: express.NextFunction,
  ) => {
    console.error(error);
    res.status(400).json({ error: "Não foi possível concluir esta operação." });
  },
);

ensureSchema()
  .catch((error) => {
    console.error("[migration] falhou:", error);
  })
  .finally(() => {
    const server = app.listen(3333, () =>
      console.log("Atlas API local em http://localhost:3333"),
    );
    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          "A porta 3333 já está em uso por outro processo do Atlas que ficou aberto. " +
            "Feche-o (Gerenciador de Tarefas > processos node.exe/Atlas.exe) e tente novamente.",
        );
        process.exit(1);
      }
      throw error;
    });
  });
