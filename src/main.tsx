import React, { useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Gem,
  Goal,
  House,
  LayoutDashboard,
  LineChart,
  Menu,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "./styles.css";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Somas/subtrações em ponto flutuante (ex.: receitas e aportes que se
// cancelam) podem resultar em -0 ou num resíduo minúsculo tipo
// -0.0000000001 em vez de exatamente 0. Isso é visualmente "zero", mas
// o Intl.NumberFormat mostra "-R$ 0,00" nesse caso. Arredondando pros
// centavos antes de formatar, qualquer valor que dê zero centavos vira
// um zero positivo limpo.
const money = {
  format: (value: number) => {
    const cents = Math.round(value * 100);
    return currencyFormatter.format(cents === 0 ? 0 : value);
  },
};
const nav: Array<[string, React.ElementType]> = [
  ["Visão geral", LayoutDashboard],
  ["Receitas", ArrowUpRight],
  ["Despesas", ArrowDownRight],
  ["Patrimônio", Wallet],
  ["Objetivos", Target],
  ["Simulações", LineChart],
  ["Cronograma", Goal],
  ["Orçamento", PiggyBank],
  ["Estatísticas", CircleDollarSign],
  ["Conquistas", Trophy],
  ["Perfil Financeiro", Crown],
];
const fallbackAssets = [
  {
    name: "Tesouro Selic 2029",
    type: "Renda fixa",
    value: 18420,
    color: "#a78bfa",
  },
  {
    name: "Caixinha de reserva",
    type: "Liquidez diária",
    value: 9200,
    color: "#7dd3fc",
  },
  { name: "ETF IVVB11", type: "Renda variável", value: 7120, color: "#fbbf24" },
];
const fallbackGoals = [
  {
    name: "Reserva de emergência",
    emoji: "🛡️",
    now: 6200,
    target: 10000,
    when: "9 meses",
    color: "#a78bfa",
  },
  {
    name: "Entrada do apartamento",
    emoji: "🏡",
    now: 18420,
    target: 100000,
    when: "4 anos",
    color: "#60a5fa",
  },
  {
    name: "Viagem para o Japão",
    emoji: "🗾",
    now: 2100,
    target: 12000,
    when: "11 meses",
    color: "#fb7185",
  },
];
const palette = [
  "#a78bfa",
  "#7dd3fc",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#34d399",
];
const colorFor = (index: number) => palette[index % palette.length];
const goalEmoji = (category: string) =>
  (
    ({
      Reserva: "🛡️",
      Moradia: "🏡",
      Viagem: "🗾",
      Veículo: "🚗",
      Educação: "🎓",
      Tecnologia: "💻",
      Saúde: "🩺",
      Outros: "🎯",
    }) as Record<string, string>
  )[category] || "🎯";
const goalCategories = [
  "Reserva",
  "Moradia",
  "Viagem",
  "Veículo",
  "Educação",
  "Tecnologia",
  "Saúde",
  "Outros",
];
const goalPriorities = ["Muito Alta", "Alta", "Média", "Baixa", "Muito Baixa"];
const goalPriorityRank: Record<string, number> = {
  "Muito Alta": 5,
  Alta: 4,
  Média: 3,
  Baixa: 2,
  "Muito Baixa": 1,
};
// Objetivos não guardam mais dinheiro próprio — o progresso vem do
// valor atual do Investimento Vinculado (assetId). Sem investimento
// vinculado, o progresso é 0 (não há de onde tirar o valor atual).
const goalCurrentValue = (
  goal: { assetId: string | null },
  assets: { id: string; value: number }[],
) => assets.find((a) => a.id === goal.assetId)?.value ?? 0;
// Um objetivo é considerado concluído quando o investimento vinculado
// atinge 100% ou mais da meta. Derivado sempre de current/target — não
// depende de um campo "status" mantido manualmente, então nunca fica
// desatualizado, e reflete automaticamente aportes/resgates feitos no
// investimento (na tela de Investimentos).
const isGoalCompleted = (
  goal: { assetId: string | null; target: number },
  assets: { id: string; value: number }[],
) => goal.target > 0 && goalCurrentValue(goal, assets) >= goal.target;
// Objetivo em destaque: entre os ainda não concluídos, o de maior
// prioridade. Em caso de empate, o primeiro cadastrado (a lista já vem
// ordenada por createdAt asc da API, e Array.sort é estável em JS).
function pickPrimaryGoal<
  T extends { assetId: string | null; target: number; priority: string },
>(goalList: T[], assets: { id: string; value: number }[]): T | undefined {
  const active = goalList.filter((g) => !isGoalCompleted(g, assets));
  if (!active.length) return undefined;
  return [...active].sort(
    (a, b) => (goalPriorityRank[b.priority] ?? 0) - (goalPriorityRank[a.priority] ?? 0),
  )[0];
}
const categoriesByType: Record<string, string[]> = {
  Receita: ["Trabalho", "Freelance", "Investimentos", "Presente", "Outros"],
  Despesa: [
    "Moradia",
    "Alimentação",
    "Transporte",
    "Saúde",
    "Educação",
    "Lazer",
    "Assinaturas",
    "Outros",
  ],
  Aporte: ["Investimentos", "Reserva", "Objetivos", "Outros"],
};
const daysUntil = (deadline: string | null) => {
  if (!deadline) return "sem prazo";
  const diff = Math.max(
    0,
    Math.round((new Date(deadline).getTime() - Date.now()) / 86400000),
  );
  if (diff < 60) return `${diff} dias`;
  return `${Math.round(diff / 30)} meses`;
};

type Summary = {
  total: number;
  invested: number;
  cash: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
  savingsRate: number;
};
type ProfileData = { id: string; name: string; level: number; xp: number };
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};
const todayLabel = () =>
  new Date()
    .toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    })
    .toUpperCase();

type DialogRequest = {
  message: string;
  kind: "confirm" | "alert";
  resolve: (value: boolean) => void;
};
type DialogApi = {
  confirmDialog: (message: string) => Promise<boolean>;
  notify: (message: string) => Promise<void>;
};
const DialogContext = React.createContext<DialogApi | null>(null);
// Usa um modal próprio do Atlas em vez de window.confirm/window.alert.
// Diálogos nativos do sistema, dentro do Electron, às vezes deixam os
// campos de input travados por um tempo depois de fechar — trocar por
// um modal React evita esse problema de raiz.
function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog precisa estar dentro do App");
  return ctx;
}
function ConfirmDialog({
  request,
  onRespond,
}: {
  request: DialogRequest | null;
  onRespond: (value: boolean) => void;
}) {
  if (!request) return null;
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal confirm-dialog"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
      >
        <p>{request.message}</p>
        <div className="confirm-dialog-actions">
          {request.kind === "confirm" && (
            <button
              className="withdraw-button"
              onClick={() => onRespond(false)}
              autoFocus
            >
              Cancelar
            </button>
          )}
          <button className="save" onClick={() => onRespond(true)}>
            {request.kind === "confirm" ? "Confirmar" : "OK"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Notificações derivadas dos dados existentes (goals + summary)
// ---------------------------------------------------------------------------
type AppNotification = {
  id: string;
  kind: "goal_near" | "goal_done" | "deadline" | "negative_balance";
  message: string;
  detail: string;
};

function buildNotifications(
  goalList: GoalItem[],
  assetList: AssetItem[],
  summary: Summary | null,
): AppNotification[] {
  const notes: AppNotification[] = [];

  // Saldo mensal negativo
  if (summary && summary.monthlySavings < 0) {
    notes.push({
      id: "negative_balance",
      kind: "negative_balance",
      message: "Saldo mensal negativo",
      detail: `Suas despesas superaram suas receitas em ${money.format(Math.abs(summary.monthlySavings))} este mês.`,
    });
  }

  for (const g of goalList) {
    if (g.status !== "Ativa") continue;

    // Valor real do objetivo: ativo vinculado tem precedência sobre goal.current
    const linkedValue =
      g.assetId
        ? (assetList.find((a) => a.id === g.assetId)?.value ?? g.current)
        : g.current;
    const pct = g.target > 0 ? linkedValue / g.target : 0;

    // Objetivo concluído
    if (pct >= 1) {
      notes.push({
        id: `goal_done_${g.id}`,
        kind: "goal_done",
        message: `Objetivo concluído: ${g.name}`,
        detail: `Você atingiu ${money.format(linkedValue)} de ${money.format(g.target)}. Parabéns!`,
      });
      continue;
    }

    // Objetivo ≥ 80% da meta
    if (pct >= 0.8) {
      notes.push({
        id: `goal_near_${g.id}`,
        kind: "goal_near",
        message: `Quase lá: ${g.name}`,
        detail: `${Math.round(pct * 100)}% concluído — faltam apenas ${money.format(g.target - linkedValue)}.`,
      });
    }

    // Prazo em ≤ 30 dias
    if (g.deadline) {
      const days = Math.ceil(
        (new Date(g.deadline).getTime() - Date.now()) / 86_400_000,
      );
      if (days >= 0 && days <= 30) {
        notes.push({
          id: `deadline_${g.id}`,
          kind: "deadline",
          message: `Prazo próximo: ${g.name}`,
          detail:
            days === 0
              ? "O prazo deste objetivo é hoje!"
              : `Vence em ${days} dia${days > 1 ? "s" : ""}.`,
        });
      }
    }
  }

  return notes;
}

const kindIcon: Record<AppNotification["kind"], string> = {
  goal_near: "🎯",
  goal_done: "🏆",
  deadline: "⏰",
  negative_balance: "⚠️",
};

function NotificationsPanel({
  notifications,
  onClose,
}: {
  notifications: AppNotification[];
  onClose: () => void;
}) {
  return (
    <motion.div
      className="notif-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="notif-panel"
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notif-header">
          <span>Notificações</span>
          {notifications.length > 0 && (
            <em className="notif-count">{notifications.length}</em>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="notif-empty">
            <span>✓</span>
            <p>Tudo em ordem por aqui.</p>
          </div>
        ) : (
          <ul className="notif-list">
            {notifications.map((n) => (
              <li key={n.id} className={`notif-item notif-${n.kind}`}>
                <span className="notif-emoji">{kindIcon[n.kind]}</span>
                <div>
                  <b>{n.message}</b>
                  <p>{n.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}

function App() {
  const [page, setPage] = useState("Visão geral");
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(
    null,
  );
  const confirmDialog = (message: string): Promise<boolean> =>
    new Promise((resolve) => setDialogRequest({ message, kind: "confirm", resolve }));
  const notify = (message: string): Promise<void> =>
    new Promise((resolve) =>
      setDialogRequest({ message, kind: "alert", resolve: () => resolve() }),
    );
  const respondDialog = (value: boolean) => {
    dialogRequest?.resolve(value);
    setDialogRequest(null);
  };
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [profile, setProfile] = useState<ProfileData>({
    id: "local-profile",
    name: "Você",
    level: 1,
    xp: 0,
  });
  const [assetList, setAssetList] = useState<AssetItem[]>([]);
  const [goalList, setGoalList] = useState<GoalItem[]>([]);
  useEffect(() => {
    fetch("http://localhost:3333/api/transactions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((items) => {
        setRecords(
          items.map((item: any) => ({
            id: item.id,
            type: item.type,
            title: item.note || item.category,
            category: item.category,
            amount: item.amount,
            date: new Date(item.date).toLocaleDateString("pt-BR"),
            isoDate: item.date, // data ISO original para filtros de futuro/passado
            recurrent: item.recurrent,
            installment: item.installment,
            totalInstallments: item.totalInstallments,
          })),
        );
      })
      .catch(() => undefined);
  }, []);
  const refreshSummary = () =>
    fetch("http://localhost:3333/api/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSummary)
      .catch(() => undefined);
  useEffect(() => {
    refreshSummary();
  }, [records]);

  // Dispara as despesas recorrentes do mês atual ao iniciar o app.
  // O endpoint só cria uma cópia se ainda não existe um lançamento
  // com os mesmos dados neste mês — é idempotente, pode chamar toda
  // vez que o app abre sem risco de duplicar.
  const refreshTransactions = () =>
    fetch("http://localhost:3333/api/transactions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((items: any[]) =>
        setRecords(
          items.map((item) => ({
            id: item.id,
            type: item.type,
            title: item.note || item.category,
            category: item.category,
            amount: item.amount,
            date: new Date(item.date).toLocaleDateString("pt-BR"),
            isoDate: item.date,
            recurrent: item.recurrent,
            installment: item.installment,
            totalInstallments: item.totalInstallments,
          })),
        ),
      )
      .catch(() => undefined);

  useEffect(() => {
    fetch("http://localhost:3333/api/transactions/apply-recurrent", {
      method: "POST",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((result: { launched: number }) => {
        // Se alguma despesa recorrente foi lançada agora, recarrega a lista
        if (result.launched > 0) {
          void refreshTransactions();
        }
      })
      .catch(() => undefined); // silencioso — não quebra se o backend ainda estiver subindo
  }, []);
  const refreshProfile = () =>
    fetch("http://localhost:3333/api/profile")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProfile)
      .catch(() => undefined);
  useEffect(() => {
    refreshProfile();
  }, []);
  useEffect(() => {
    refreshAssets();
  }, [page]);
  useEffect(() => {
    refreshGoals();
  }, [page]);
  const deleteRecord = async (record: RecordItem) => {
    const id = record.id;

    // Se é recorrente, oferece escolha entre cancelar só este mês ou a recorrência toda
    if (record.recurrent && typeof id === "string") {
      const cancelAll = await confirmDialog(
        `"${record.title}" é uma despesa recorrente.\n\nConfirmar cancela a recorrência inteira (não será mais lançada nos próximos meses). Para apagar só este mês, pressione Cancelar e use o ícone de lixeira normalmente após desmarcar a opção.`,
      );
      if (cancelAll) {
        // Cancela a recorrência: PATCH recurrent = false no template
        try {
          await fetch(`http://localhost:3333/api/transactions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recurrent: false }),
          });
          // Atualiza localmente o badge sem remover o lançamento
          setRecords((current) =>
            current.map((r) =>
              r.id === id ? { ...r, recurrent: false } : r,
            ),
          );
        } catch {
          // silencioso
        }
        return;
      }
      // Se cancelou o confirmDialog, não faz nada
      return;
    }

    if (
      !(await confirmDialog(
        "Excluir este lançamento? Esta ação não pode ser desfeita.",
      ))
    )
      return;
    try {
      if (typeof id === "string") {
        const response = await fetch(
          `http://localhost:3333/api/transactions/${id}`,
          { method: "DELETE" },
        );
        if (!response.ok && response.status !== 404) return;
      }
    } catch {
      return;
    }
    setRecords((current) => current.filter((r) => r.id !== id));
  };
  const updateRecord = async (
    id: string | number,
    patch: { type: string; title: string; category: string; amount: number },
  ) => {
    try {
      const response = await fetch(
        `http://localhost:3333/api/transactions/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: patch.type,
            category: patch.category,
            amount: patch.amount,
            note: patch.title,
          }),
        },
      );
      if (response.ok) {
        setRecords((current) =>
          current.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        );
        void refreshSummary();
      }
    } catch {
      // falha silenciosa — dados locais mantidos
    }
  };
  const addTransaction = async (record: {
    type: string;
    title: string;
    category: string;
    amount: number;
    recurrent?: boolean;
    totalInstallments?: number;
  }) => {
    try {
      const response = await fetch("http://localhost:3333/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: record.type,
          category: record.category,
          amount: record.amount,
          note: record.title,
          recurrent: record.recurrent ?? false,
          totalInstallments: record.totalInstallments ?? 1,
        }),
      });
      if (response.ok) {
        const saved = await response.json();
        const newItem: RecordItem = {
          ...record,
          id: saved.id,
          date: "Agora",
          recurrent: saved.recurrent,
          installment: saved.installment,
          totalInstallments: saved.totalInstallments,
        };
        setRecords((current) => [newItem, ...current]);
        void refreshProfile();
        void refreshSummary();
        return;
      }
    } catch {}
    setRecords((current) => [
      { ...record, id: Date.now(), date: "Agora" },
      ...current,
    ]);
  };
  // Só transações com data <= hoje entram no saldo disponível.
  // Parcelas futuras (ex: 12x criadas de uma vez) ficam no banco como
  // "planejado" mas não afetam o saldo atual — só contam quando chegarem.
  const availableBalance = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return records
      .filter((r) => {
        if (!r.isoDate) return true; // registros locais otimistas (sem isoDate) sempre contam
        return new Date(r.isoDate) <= today;
      })
      .reduce(
        (sum, r) =>
          ["Receita", "Resgate"].includes(r.type)
            ? sum + r.amount
            : sum - r.amount,
        0,
      );
  }, [records]);
  const refreshGoals = () =>
    fetch("http://localhost:3333/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setGoalList)
      .catch(() => undefined);
  const refreshAssets = () =>
    fetch("http://localhost:3333/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setAssetList)
      .catch(() => undefined);
  const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
  const refreshBudgets = () =>
    fetch("http://localhost:3333/api/budgets")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setBudgetList)
      .catch(() => undefined);
  useEffect(() => { refreshBudgets(); }, []);
  const total = summary?.total ?? 34740;
  const invested = summary?.invested ?? 25540;
  const cash = summary?.cash ?? 9200;
  const savings = summary?.monthlySavings ?? 2310;
  const savingsRate = summary?.savingsRate ?? 38;
  const [chartData, setChartData] = useState<{ labels: string[]; data: number[] } | null>(null);
  useEffect(() => {
    fetch("http://localhost:3333/api/patrimony-history")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setChartData)
      .catch(() => undefined);
  }, [summary]);
  const chart = useMemo(
    () => ({
      labels: chartData?.labels ?? ["Maio", "Junho", "Julho", "Agosto", "Setembro"],
      datasets: [
        {
          data: chartData?.data ?? [0, 0, 0, 0, total || 0],
          borderColor: "#b79cff",
          backgroundColor: (ctx: any) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 260);
            g.addColorStop(0, "rgba(167,139,250,.33)");
            g.addColorStop(1, "rgba(167,139,250,0)");
            return g;
          },
          fill: true,
          tension: 0.42,
          pointRadius: 0,
          borderWidth: 2.3,
        },
      ],
    }),
    [chartData, total],
  );
  // Variação % do patrimônio em relação ao mês anterior.
  // Usa os dois últimos pontos não-zero do histórico real.
  const patrimonyChange = useMemo(() => {
    if (!chartData) return null;
    const pts = chartData.data;
    const current = pts[pts.length - 1];
    // Busca o último ponto anterior não-zero
    const prev = [...pts].slice(0, pts.length - 1).reverse().find((v) => v > 0);
    if (!prev || prev === 0) return null;
    return ((current - prev) / prev) * 100;
  }, [chartData]);

  // Notificações derivadas dos dados já carregados — sem nenhuma nova chamada à API
  const notifications = useMemo(
    () => buildNotifications(goalList, assetList, summary),
    [goalList, assetList, summary],
  );

  return (
    <DialogContext.Provider value={{ confirmDialog, notify }}>
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Gem size={18} />
          </div>
          <span>atlas</span>
          <button className="close" onClick={() => setMenu(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="profile-mini">
          <div className="avatar">{profile.name.charAt(0).toUpperCase()}</div>
          <div>
            <b>{profile.name}</b>
            <small>Nível {profile.level} · Explorador</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={String(label)}
              onClick={() => {
                setPage(String(label));
                setMenu(false);
              }}
              className={page === label ? "active" : ""}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setPage("Configurações")}>
            <Settings size={18} />
            <span>Configurações</span>
          </button>
          <div className="quote">
            “Todo grande patrimônio começa com uma decisão.”
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button className="mobile-menu" onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div>
            <p className="eyebrow">{todayLabel()}</p>
            <h1>
              {page === "Visão geral" ? (
                <>
                  {greeting()}, {profile.name} <span>✦</span>
                </>
              ) : (
                page
              )}
            </h1>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Notificações"
            >
              <Bell size={19} />
              {notifications.length > 0 && <i />}
            </button>
            <button className="add-button" onClick={() => setModal(true)}>
              <Plus size={17} /> Novo registro
            </button>
          </div>
        </header>
        {page === "Visão geral" ? (
          <Dashboard
            total={total}
            invested={invested}
            cash={cash}
            savings={savings}
            savingsRate={savingsRate}
            availableBalance={availableBalance}
            chart={chart}
            patrimonyChange={patrimonyChange}
            assetList={assetList}
            goalList={goalList}
            onGoals={() => setPage("Objetivos")}
          />
        ) : page === "Perfil Financeiro" ? (
          <Profile profile={profile} total={total} goalList={goalList} assetList={assetList} />
        ) : page === "Configurações" ? (
          <SettingsPage profile={profile} onSaved={setProfile} />
        ) : (
          <Workspace
            page={page}
            records={records}
            onAdd={() => setModal(true)}
            onDelete={deleteRecord}
            onEdit={updateRecord}
            goalList={goalList}
            refreshGoals={refreshGoals}
            assetList={assetList}
            refreshAssets={refreshAssets}
            availableBalance={availableBalance}
            addTransaction={addTransaction}
            refreshProfile={refreshProfile}
            total={total}
            budgetList={budgetList}
            refreshBudgets={refreshBudgets}
          />
        )}
      </main>
      <AnimatePresence>
        {notifOpen && (
          <NotificationsPanel
            notifications={notifications}
            onClose={() => setNotifOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal && (
          <RegisterModal
            close={() => setModal(false)}
            save={addTransaction}
            availableBalance={availableBalance}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dialogRequest && (
          <ConfirmDialog request={dialogRequest} onRespond={respondDialog} />
        )}
      </AnimatePresence>
    </div>
    </DialogContext.Provider>
  );
}

function Dashboard({
  total,
  invested,
  cash,
  savings,
  savingsRate,
  availableBalance,
  chart,
  patrimonyChange,
  assetList,
  goalList,
  onGoals,
}: {
  total: number;
  invested: number;
  cash: number;
  savings: number;
  savingsRate: number;
  availableBalance: number;
  chart: any;
  patrimonyChange: number | null;
  assetList: AssetItem[];
  goalList: GoalItem[];
  onGoals: () => void;
}) {
  const investedShare = total ? Math.round((invested / total) * 1000) / 10 : 0;
  const displayAssets = assetList.length
    ? assetList.slice(0, 3).map((a, i) => ({
        name: a.name,
        type: a.category,
        value: a.value,
        color: colorFor(i),
      }))
    : fallbackAssets;
  const assetTotal = displayAssets.reduce((s, a) => s + a.value, 0) || 1;
  const displayGoals = goalList.length
    ? goalList
        .filter((g) => !isGoalCompleted(g, assetList))
        .slice(0, 2)
        .map((g, i) => ({
          name: g.name,
          emoji: goalEmoji(g.category),
          now: goalCurrentValue(g, assetList),
          target: g.target,
          when: daysUntil(g.deadline),
          color: colorFor(i),
        }))
    : fallbackGoals.slice(0, 2);
  const primaryGoal = pickPrimaryGoal(goalList, assetList);
  const primaryGoalCurrent = primaryGoal
    ? goalCurrentValue(primaryGoal, assetList)
    : 0;
  const missionProgress = primaryGoal
    ? Math.min(100, Math.round((primaryGoalCurrent / primaryGoal.target) * 100))
    : 62;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="content"
    >
      <section className="hero-grid">
        <div className="wealth-card">
          <div className="card-top">
            <span>Patrimônio total</span>
            <button>
              <MoreHorizontal size={19} />
            </button>
          </div>
          <div className="wealth-value">
            {money.format(total)}
            {patrimonyChange !== null && (
              <em className={patrimonyChange >= 0 ? "" : "negative"}>
                {patrimonyChange >= 0
                  ? <ArrowUpRight size={14} />
                  : <ArrowDownRight size={14} />}
                {" "}{Math.abs(patrimonyChange).toFixed(1)}%
              </em>
            )}
          </div>
          <p>+ {money.format(savings)} no último mês</p>
          <div className="chart">
            <Line
              data={chart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { tooltip: { enabled: false } },
                scales: {
                  x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                      color: "#77738b",
                      font: { size: 11, family: "DM Sans" },
                    },
                  },
                  y: { display: false },
                },
              }}
            />
          </div>
          <div className="chart-label">
            <span>{chart.labels[0] ?? ""}</span>
            <span>Hoje</span>
          </div>
        </div>
        <div className="mission-card">
          <div className="mission-orb">
            <Target size={27} />
          </div>
          <div className="mission-label">MISSÃO ATUAL</div>
          <h2>{primaryGoal ? primaryGoal.name : "Construir Reserva"}</h2>
          <p>Sua base para crescer com tranquilidade.</p>
          <div className="progress-line">
            <span style={{ width: `${missionProgress}%` }} />
          </div>
          <div className="progress-info">
            <b>{missionProgress}%</b>
            <span>
              {primaryGoal
                ? `${money.format(primaryGoalCurrent)} de ${money.format(primaryGoal.target)}`
                : "R$ 6.200 de R$ 10.000"}
            </span>
          </div>
          <div className="mission-bottom">
            <span>
              <Sparkles size={14} />{" "}
              {primaryGoal ? daysUntil(primaryGoal.deadline) : "Faltam 9 meses"}
            </span>
            <button onClick={onGoals}>
              Ver missão <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
      <section className="metrics">
        <Metric
          label="Saldo disponível"
          value={money.format(availableBalance)}
          sub="pronto para aportar"
          icon={<Wallet />}
          tone={availableBalance < 0 ? "gold" : "green"}
        />
        <Metric
          label="Investido"
          value={money.format(invested)}
          sub={`${investedShare}% do patrimônio`}
          icon={<TrendingUp />}
          tone="purple"
        />
        <Metric
          label="Em conta"
          value={money.format(cash)}
          sub="saldo disponível"
          icon={<Wallet />}
          tone="blue"
        />
        <Metric
          label="Economia mensal"
          value={money.format(savings)}
          sub={`${Math.max(0, Math.round(savingsRate))}% da sua receita`}
          icon={<ArrowUpRight />}
          tone="green"
        />
      </section>
      <section className="two-columns">
        <div className="panel allocation">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ALOCAR COM INTENÇÃO</p>
              <h2>Seu patrimônio</h2>
            </div>
            <button onClick={onGoals}>
              Ver detalhes <ChevronRight size={15} />
            </button>
          </div>
          <div className="asset-list">
            {displayAssets.map((a, i) => (
              <div className="asset" key={a.name + i}>
                <div className="asset-dot" style={{ background: a.color }} />
                <div className="asset-name">
                  <b>{a.name}</b>
                  <span>{a.type}</span>
                </div>
                <div>
                  <b>{money.format(a.value)}</b>
                </div>
              </div>
            ))}
          </div>
          <div className="allocation-bar">
            {displayAssets.map((a, i) => (
              <i
                key={a.name + i}
                style={{
                  width: `${(a.value / assetTotal) * 100}%`,
                  background: a.color,
                }}
              />
            ))}
          </div>
        </div>
        <div className="panel goals">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SEUS PRÓXIMOS CAPÍTULOS</p>
              <h2>Objetivos</h2>
            </div>
            <button onClick={onGoals}>
              Todos <ChevronRight size={15} />
            </button>
          </div>
          {displayGoals.map((g) => (
            <div className="goal-row" key={g.name}>
              <span className="goal-emoji">{g.emoji}</span>
              <div className="goal-data">
                <div>
                  <b>{g.name}</b>
                  <small>{g.when}</small>
                </div>
                <div className="mini-progress">
                  <i
                    style={{
                      width: `${g.target ? Math.min(100, (g.now / g.target) * 100) : 0}%`,
                      background: g.color,
                    }}
                  />
                </div>
                <span>
                  {money.format(g.now)} <em>/ {money.format(g.target)}</em>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="insight">
        <div className="insight-icon">
          <ShieldCheck size={21} />
        </div>
        <div>
          <b>
            {savingsRate >= 20
              ? "Sua saúde financeira está excelente"
              : "Continue construindo sua reserva"}
          </b>
          <p>
            Você está economizando {Math.max(0, Math.round(savingsRate))}% da
            sua renda mensal.
          </p>
        </div>
        <button>
          Ver análise <ChevronRight size={16} />
        </button>
      </section>
    </motion.div>
  );
}
function Metric({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="metric">
      <div className={"metric-icon " + tone}>{icon}</div>
      <p>{label}</p>
      <h3>{value}</h3>
      <span>{sub}</span>
    </div>
  );
}
type RecordItem = {
  id: string | number;
  type: string;
  title: string;
  category: string;
  amount: number;
  date: string;       // formatada "dd/mm/yyyy" para exibição
  isoDate?: string;   // ISO original — usada para filtrar parcelas futuras
  recurrent?: boolean;
  installment?: number | null;
  totalInstallments?: number | null;
};
type BudgetItem = { id: string; category: string; limit: number };
function Workspace({
  page,
  records,
  onAdd,
  onDelete,
  onEdit,
  goalList,
  refreshGoals,
  assetList,
  refreshAssets,
  availableBalance,
  addTransaction,
  refreshProfile,
  total,
  budgetList,
  refreshBudgets,
}: {
  page: string;
  records: RecordItem[];
  onAdd: () => void;
  onDelete: (record: RecordItem) => void;
  onEdit: (id: string | number, patch: { type: string; title: string; category: string; amount: number }) => void;
  goalList: GoalItem[];
  refreshGoals: () => void;
  assetList: AssetItem[];
  refreshAssets: () => void;
  availableBalance: number;
  addTransaction: (r: {
    type: string;
    title: string;
    category: string;
    amount: number;
    recurrent?: boolean;
    totalInstallments?: number;
  }) => void;
  refreshProfile: () => void;
  total: number;
  budgetList: BudgetItem[];
  refreshBudgets: () => void;
}) {
  const relevant =
    page === "Receitas" ? "Receita" : page === "Despesas" ? "Despesa" : "";
  const [tab, setTab] = useState(relevant || "Todos");
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  useEffect(() => setTab(relevant || "Todos"), [relevant]);
  const monthLabel = new Date()
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .toUpperCase();
  if (relevant)
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="workspace"
      >
        <section className="summary-strip">
          <div>
            <p className="eyebrow">{monthLabel}</p>
            <h2>{relevant === "Receita" ? "Entradas" : "Saídas"} do mês</h2>
            <strong>
              {money.format(
                records
                  .filter((r) => {
                    if (r.type !== relevant) return false;
                    // Só conta transações do mês atual e não futuras
                    if (!r.isoDate) return true;
                    const d = new Date(r.isoDate);
                    const now = new Date();
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    return d >= monthStart && d <= now;
                  })
                  .reduce((s, r) => s + r.amount, 0),
              )}
            </strong>
          </div>
          <div className="summary-stat">
            <span>Saldo disponível</span>
            <b className={availableBalance < 0 ? "" : "up"}>
              {money.format(availableBalance)}
            </b>
            <small>receitas menos despesas e aportes</small>
          </div>
          <button className="add-button" onClick={onAdd}>
            <Plus size={16} /> Adicionar
          </button>
        </section>
        <section className="panel ledger">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SEU HISTÓRICO</p>
              <h2>Lançamentos</h2>
            </div>
            <div className="tabs">
              <button
                className={tab === "Todos" ? "selected" : ""}
                onClick={() => setTab("Todos")}
              >
                Todos
              </button>
              <button
                className={tab === relevant ? "selected" : ""}
                onClick={() => setTab(relevant)}
              >
                {page}
              </button>
            </div>
          </div>
          {records
            .filter((r) => tab === "Todos" || r.type === relevant)
            .map((r) => (
              <RecordRow
                key={r.id}
                record={r}
                onDelete={onDelete}
                onEdit={setEditingRecord}
              />
            ))}
        </section>
        <AnimatePresence>
          {editingRecord && (
            <EditTransactionModal
              record={editingRecord}
              close={() => setEditingRecord(null)}
              save={(patch) => {
                onEdit(editingRecord.id, patch);
                setEditingRecord(null);
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  if (page === "Patrimônio")
    return (
      <AssetPage
        page={page}
        items={assetList}
        refresh={refreshAssets}
        availableBalance={availableBalance}
        addTransaction={addTransaction}
        onXpGained={refreshProfile}
      />
    );
  if (page === "Objetivos")
    return (
      <GoalsPage items={goalList} refresh={refreshGoals} assetList={assetList} onXpGained={refreshProfile} />
    );
  if (page === "Simulações") return <Simulator initialPatrimony={total} />;
  if (page === "Cronograma") return <Timeline />;
  if (page === "Orçamento")
    return (
      <BudgetPage
        budgetList={budgetList}
        refresh={refreshBudgets}
        records={records}
      />
    );
  if (page === "Estatísticas") return <Stats records={records} />;
  return <Achievements />;
}
function RecordRow({
  record,
  onDelete,
  onEdit,
}: {
  record: RecordItem;
  onDelete: (record: RecordItem) => void;
  onEdit: (r: RecordItem) => void;
}) {
  const positive = record.type !== "Despesa";
  return (
    <div className="record-row">
      <div className={"record-icon " + (positive ? "green" : "gold")}>
        {positive ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
      </div>
      <div className="record-title">
        <b>{record.title}</b>
        <span>
          {record.category} · {record.date}
          {record.recurrent && <em className="badge-recurrent"> ↻ Recorrente</em>}
          {record.totalInstallments && record.totalInstallments > 1 && (
            <em className="badge-installment"> {record.installment}/{record.totalInstallments}x</em>
          )}
        </span>
      </div>
      <div className="record-amount">
        <b className={positive ? "up" : ""}>
          {positive ? "+ " : "− "}
          {money.format(record.amount)}
        </b>
        <span>{record.type}</span>
      </div>
      {typeof record.id === "string" && (
        <button
          className="edit-button"
          aria-label="Editar lançamento"
          onClick={() => onEdit(record)}
        >
          <Pencil size={15} />
        </button>
      )}
      <button
        className="delete-button"
        aria-label="Excluir lançamento"
        onClick={() => onDelete(record)}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
type AssetItem = {
  id: string;
  name: string;
  category: string;
  institution: string | null;
  value: number;
  investedValue: number;
  yieldRate: number | null;
  liquidity: string | null;
};
type GoalItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priority: string;
  target: number;
  current: number;
  deadline: string | null;
  status: string;
  assetId: string | null;
};
function AssetPage({
  page,
  items,
  refresh,
  availableBalance,
  addTransaction,
  onXpGained,
}: {
  page: string;
  items: AssetItem[];
  refresh: () => void;
  availableBalance: number;
  addTransaction: (r: {
    type: string;
    title: string;
    category: string;
    amount: number;
  }) => void;
  onXpGained?: () => void;
}) {
  const { confirmDialog } = useDialog();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Tesouro");
  const [value, setValue] = useState("");
  const [institution, setInstitution] = useState("");
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [newValue, setNewValue] = useState("");
  const save = async () => {
    const amount = Number(value.replace(",", "."));
    if (!name || !Number.isFinite(amount) || amount < 0) return;
    const response = await fetch("http://localhost:3333/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        value: amount,
        institution: institution || null,
      }),
    });
    if (response.ok) {
      refresh();
      onXpGained?.();
      setAdding(false);
      setName("");
      setValue("");
      setInstitution("");
    }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog("Excluir este ativo?"))) return;
    await fetch(`http://localhost:3333/api/assets/${id}`, { method: "DELETE" });
    refresh();
  };
  const contribute = async (item: AssetItem) => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) return;
    if (
      value > availableBalance &&
      !(await confirmDialog(
        `Seu saldo disponível é ${money.format(availableBalance)}. Mesmo assim quer aportar ${money.format(value)} em ${item.name}?`,
      ))
    )
      return;
    const response = await fetch(
      `http://localhost:3333/api/assets/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: item.value + value,
          investedValue: item.investedValue + value,
        }),
      },
    );
    if (response.ok) {
      addTransaction({
        type: "Aporte",
        title: `Aporte em ${item.name}`,
        category: item.category,
        amount: value,
      });
      refresh();
      setContributingId(null);
      setAmount("");
    }
  };
  const withdraw = async (item: AssetItem) => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0 || value > item.value) return;
    const response = await fetch(
      `http://localhost:3333/api/assets/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: item.value - value,
          investedValue: Math.max(0, item.investedValue - value),
        }),
      },
    );
    if (response.ok) {
      addTransaction({
        type: "Resgate",
        title: `Resgate de ${item.name}`,
        category: item.category,
        amount: value,
      });
      refresh();
      setWithdrawingId(null);
      setAmount("");
    }
  };
  const updateBalance = async (item: AssetItem) => {
    const value = Number(newValue.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return;
    // Apenas atualiza o valor atual — não mexe em investedValue, não cria
    // transação. Lucro/prejuízo e rentabilidade são recalculados na hora
    // a partir do value/investedValue já retornados pelo refresh().
    const response = await fetch(
      `http://localhost:3333/api/assets/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      },
    );
    if (response.ok) {
      refresh();
      setUpdatingId(null);
      setNewValue("");
    }
  };
  const gain = (item: AssetItem) => item.value - item.investedValue;
  const gainPct = (item: AssetItem) =>
    item.investedValue > 0 ? (gain(item) / item.investedValue) * 100 : 0;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="summary-strip">
        <div>
          <p className="eyebrow">POSIÇÃO ATUAL</p>
          <h2>{page}</h2>
          <strong>{money.format(total)}</strong>
        </div>
        <div className="summary-stat">
          <span>Saldo disponível</span>
          <b className={availableBalance < 0 ? "" : "up"}>
            {money.format(availableBalance)}
          </b>
          <small>para aportar em ativos</small>
        </div>
        <button className="add-button" onClick={() => setAdding(!adding)}>
          <Plus size={16} /> Novo ativo
        </button>
      </section>
      {adding && (
        <section className="panel quick-form">
          <h2>Novo ativo</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do investimento"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>Tesouro</option>
            <option>CDB</option>
            <option>ETF</option>
            <option>Ações</option>
            <option>FII</option>
            <option>Conta</option>
            <option>Dinheiro</option>
            <option>Outros</option>
          </select>
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Instituição"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Valor atual"
          />
          <p style={{ fontSize: 12, color: "#77738b", margin: "4px 0 0" }}>
            Use isto para registrar o que você já possui. Não afeta seu saldo
            disponível — para investir mais em algo que já existe, use "Aportar"
            no card do ativo.
          </p>
          <button className="save" onClick={save}>
            Salvar ativo
          </button>
        </section>
      )}
      <section className="panel ledger">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ALOCADO PARA O FUTURO</p>
            <h2>Seus ativos</h2>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="empty-state">
            Nenhum ativo registrado. Comece pelo seu primeiro investimento ou
            saldo em conta.
          </p>
        ) : (
          items.map((item) => (
            <div
              className="record-row"
              key={item.id}
              style={{ flexWrap: "wrap" }}
            >
              <div className="record-icon purple">
                <TrendingUp size={17} />
              </div>
              <div className="record-title">
                <b>{item.name}</b>
                <span>
                  {item.category}
                  {item.institution ? ` · ${item.institution}` : ""}
                </span>
              </div>
              <div className="record-amount">
                <b>{money.format(item.value)}</b>
                <span>
                  {item.yieldRate ? `${item.yieldRate}% a.a.` : "posição atual"}
                </span>
                {item.investedValue > 0 && (
                  <span className={gain(item) >= 0 ? "gain-positive" : "gain-negative"}>
                    {gain(item) >= 0 ? "+ " : "− "}
                    {money.format(Math.abs(gain(item)))} (
                    {gainPct(item) >= 0 ? "+" : ""}
                    {gainPct(item).toFixed(1)}%)
                  </span>
                )}
              </div>
              {contributingId === item.id ? (
                <div
                  className="quick-form"
                  style={{ width: "100%", marginTop: 10 }}
                >
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Valor a aportar"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="save" onClick={() => contribute(item)}>
                      Confirmar aporte
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => {
                        setContributingId(null);
                        setAmount("");
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : withdrawingId === item.id ? (
                <div
                  className="quick-form"
                  style={{ width: "100%", marginTop: 10 }}
                >
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Até ${money.format(item.value)}`}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="save resgate-button"
                      onClick={() => withdraw(item)}
                    >
                      Confirmar resgate
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => {
                        setWithdrawingId(null);
                        setAmount("");
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : updatingId === item.id ? (
                <div
                  className="quick-form"
                  style={{ width: "100%", marginTop: 10 }}
                >
                  <input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Valor atual do investimento (R$)"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="save update-button"
                      onClick={() => updateBalance(item)}
                    >
                      Atualizar saldo
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => {
                        setUpdatingId(null);
                        setNewValue("");
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="asset-actions">
                  <button
                    className="add-button"
                    onClick={() => {
                      setContributingId(item.id);
                      setAmount("");
                    }}
                  >
                    <Plus size={15} /> Aportar
                  </button>
                  <button
                    className="withdraw-button"
                    onClick={() => {
                      setWithdrawingId(item.id);
                      setAmount("");
                    }}
                  >
                    <ArrowDownRight size={15} /> Resgatar
                  </button>
                  <button
                    className="withdraw-button update-trigger"
                    onClick={() => {
                      setUpdatingId(item.id);
                      setNewValue(String(item.value));
                    }}
                  >
                    <RefreshCw size={15} /> Atualizar saldo
                  </button>
                </div>
              )}
              <button className="delete-button" onClick={() => remove(item.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </section>
    </motion.div>
  );
}
function GoalsPage({
  items,
  refresh,
  assetList,
  onXpGained,
}: {
  items: GoalItem[];
  refresh: () => void;
  assetList: AssetItem[];
  onXpGained?: () => void;
}) {
  const { confirmDialog, notify } = useDialog();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState(goalCategories[0]);
  const [priority, setPriority] = useState("Média");
  const [deadline, setDeadline] = useState("");
  const [linkedAssetId, setLinkedAssetId] = useState("");
  // Investimentos já vinculados a algum objetivo não podem ser
  // escolhidos de novo em outro objetivo (vínculo é 1 para 1).
  const linkedAssetIds = new Set(
    items.filter((g) => g.assetId).map((g) => g.assetId as string),
  );
  const save = async () => {
    const value = Number(target.replace(",", "."));
    if (!name || !value) return;
    const response = await fetch("http://localhost:3333/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        target: value,
        category,
        priority,
        assetId: linkedAssetId || null,
        deadline: deadline || null,
      }),
    });
    if (response.ok) {
      refresh();
      onXpGained?.();
      setAdding(false);
      setName("");
      setTarget("");
      setPriority("Média");
      setDeadline("");
      setLinkedAssetId("");
    } else {
      const body = await response.json().catch(() => null);
      await notify(body?.error || "Não foi possível criar o objetivo.");
    }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog("Excluir este objetivo?"))) return;
    await fetch(`http://localhost:3333/api/goals/${id}`, { method: "DELETE" });
    refresh();
  };
  const updatePriority = async (item: GoalItem, nextPriority: string) => {
    const response = await fetch(`http://localhost:3333/api/goals/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: nextPriority }),
    });
    if (response.ok) refresh();
  };
  const updateLinkedAsset = async (item: GoalItem, nextAssetId: string) => {
    const response = await fetch(`http://localhost:3333/api/goals/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: nextAssetId || null }),
    });
    if (response.ok) {
      refresh();
    } else {
      const body = await response.json().catch(() => null);
      await notify(body?.error || "Não foi possível vincular esse investimento.");
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="summary-strip">
        <div>
          <p className="eyebrow">CAMINHO EM ANDAMENTO</p>
          <h2>Objetivos ativos</h2>
          <strong>{items.length} metas</strong>
        </div>
        <button className="add-button" onClick={() => setAdding(!adding)}>
          <Plus size={16} /> Nova meta
        </button>
      </section>
      {adding && (
        <section className="panel quick-form">
          <h2>Nova meta</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Reserva de emergência"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {goalCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Valor alvo"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {goalPriorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            value={linkedAssetId}
            onChange={(e) => setLinkedAssetId(e.target.value)}
          >
            <option value="">Investimento vinculado (opcional)</option>
            {assetList
              .filter((a) => !linkedAssetIds.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <label className="goal-deadline-label">
            Prazo (opcional)
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <button className="save" onClick={save}>
            Salvar objetivo
          </button>
        </section>
      )}
      {(() => {
        const activeGoals = items.filter(
          (item) => !isGoalCompleted(item, assetList),
        );
        const completedGoals = items.filter((item) =>
          isGoalCompleted(item, assetList),
        );
        const renderGoal = (item: GoalItem) => {
          const completed = isGoalCompleted(item, assetList);
          const current = goalCurrentValue(item, assetList);
          // No próprio select do card, o investimento já vinculado a
          // este objetivo continua aparecendo (pra poder trocar/tirar),
          // além dos que ainda não estão vinculados a nenhum objetivo.
          const availableAssets = assetList.filter(
            (a) => a.id === item.assetId || !linkedAssetIds.has(a.id),
          );
          return (
            <article className="goal-card" key={item.id}>
              <div>
                <span className="goal-emoji">{goalEmoji(item.category)}</span>
                <button
                  className="delete-button"
                  onClick={() => remove(item.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h2>{item.name}</h2>
              <p className="goal-meta">
                {item.category} ·{" "}
                <select
                  className="priority-select"
                  value={item.priority}
                  onChange={(e) => updatePriority(item, e.target.value)}
                >
                  {goalPriorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </p>
              <label className="linked-asset">
                <span>Investimento vinculado</span>
                <select
                  value={item.assetId ?? ""}
                  onChange={(e) => updateLinkedAsset(item, e.target.value)}
                >
                  <option value="">— Nenhum —</option>
                  {availableAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mini-progress">
                <i
                  style={{
                    width: `${Math.min(100, (current / item.target) * 100)}%`,
                    background: completed ? "#6ed39e" : "#a78bfa",
                  }}
                />
              </div>
              <b>
                {money.format(current)} <em>de {money.format(item.target)}</em>
              </b>
            </article>
          );
        };
        return (
          <>
            <section className="goal-grid">
              {items.length === 0 ? (
                <p className="empty-state">
                  Crie uma meta e vincule um investimento pra acompanhar o
                  progresso automaticamente.
                </p>
              ) : activeGoals.length === 0 ? (
                <p className="empty-state">
                  Todos os seus objetivos foram concluídos. 🎉
                </p>
              ) : (
                activeGoals.map(renderGoal)
              )}
            </section>
            {completedGoals.length > 0 && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">MISSÃO CUMPRIDA</p>
                    <h2>Objetivos concluídos</h2>
                  </div>
                </div>
                <section className="goal-grid">
                  {completedGoals.map(renderGoal)}
                </section>
              </section>
            )}
          </>
        );
      })()}
    </motion.div>
  );
}
function Simulator({ initialPatrimony }: { initialPatrimony: number }) {
  // --- inputs ---
  const [initial, setInitial] = useState(initialPatrimony || 0);

  // Sincroniza o valor inicial quando o patrimônio real chegar da API
  // (na primeira renderização pode ser 0 ou o fallback; quando a API
  // responde o componente recebe o valor real e atualiza o slider)
  useEffect(() => {
    setInitial(initialPatrimony || 0);
  }, [initialPatrimony]);
  const [monthly, setMonthly] = useState(1500);
  const [rate, setRate] = useState(10);
  const [years, setYears] = useState(10);
  const [altMonthly, setAltMonthly] = useState(2000);

  // Juros compostos com aportes mensais (FV exata)
  // FV = PV*(1+r)^n + PMT * [((1+r)^n - 1) / r]
  // onde r = taxa mensal = (1 + rate/100)^(1/12) - 1
  const calcFV = (pv: number, pmt: number, annualRate: number, totalYears: number) => {
    const r = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
    const n = totalYears * 12;
    if (r === 0) return pv + pmt * n;
    return pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r);
  };

  // Série ano a ano para o gráfico
  const series = useMemo(() => {
    const pts: { year: number; value: number; alt: number }[] = [];
    for (let y = 0; y <= years; y++) {
      pts.push({
        year: new Date().getFullYear() + y,
        value: Math.round(calcFV(initial, monthly, rate, y)),
        alt: Math.round(calcFV(initial, altMonthly, rate, y)),
      });
    }
    return pts;
  }, [initial, monthly, rate, years, altMonthly]);

  const finalValue = series[series.length - 1]?.value ?? 0;
  const altFinalValue = series[series.length - 1]?.alt ?? 0;
  const totalContributed = initial + monthly * 12 * years;
  const totalGain = finalValue - totalContributed;
  const contributedPct = finalValue > 0 ? Math.round((totalContributed / finalValue) * 100) : 0;
  const gainPct = 100 - contributedPct;
  const diff = altFinalValue - finalValue;

  const chartData = useMemo(() => ({
    labels: series.map((p) => String(p.year)),
    datasets: [
      {
        label: "Cenário atual",
        data: series.map((p) => p.value),
        borderColor: "#b79cff",
        backgroundColor: (ctx: any) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 220);
          g.addColorStop(0, "rgba(167,139,250,.25)");
          g.addColorStop(1, "rgba(167,139,250,0)");
          return g;
        },
        fill: true,
        tension: 0.38,
        pointRadius: 3,
        pointBackgroundColor: "#b79cff",
        borderWidth: 2,
      },
      {
        label: "Cenário alternativo",
        data: series.map((p) => p.alt),
        borderColor: "#7dd3fc",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.38,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [5, 4],
      },
    ],
  }), [series]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace simulator"
    >
      {/* ── Painel de inputs ── */}
      <section className="panel sim-inputs">
        <p className="eyebrow">SIMULAÇÃO PATRIMONIAL</p>
        <h2>Projete seus próximos anos</h2>

        <label>
          Patrimônio inicial
          <output>{money.format(initial)}</output>
          <input
            type="range"
            min="0"
            max="500000"
            step="1000"
            value={initial}
            onChange={(e) => setInitial(+e.target.value)}
          />
        </label>
        <label>
          Aporte mensal
          <output>{money.format(monthly)}</output>
          <input
            type="range"
            min="0"
            max="20000"
            step="100"
            value={monthly}
            onChange={(e) => setMonthly(+e.target.value)}
          />
        </label>
        <label>
          Rentabilidade anual
          <output>{rate}% a.a.</output>
          <input
            type="range"
            min="1"
            max="25"
            step="0.5"
            value={rate}
            onChange={(e) => setRate(+e.target.value)}
          />
        </label>
        <label>
          Prazo
          <output>{years} anos</output>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={years}
            onChange={(e) => setYears(+e.target.value)}
          />
        </label>

        {/* Comparação de cenários */}
        <div className="sim-scenario-compare">
          <p className="eyebrow" style={{ marginBottom: 10 }}>COMPARAR CENÁRIOS</p>
          <div className="sim-scenario-row">
            <div className="sim-scenario-badge current">
              <span>Cenário atual</span>
              <b>{money.format(monthly)}/mês</b>
            </div>
            <div className="sim-scenario-badge alt">
              <span>Cenário alternativo</span>
              <b>{money.format(altMonthly)}/mês</b>
            </div>
          </div>
          <label style={{ marginTop: 12 }}>
            Aporte alternativo
            <output>{money.format(altMonthly)}</output>
            <input
              type="range"
              min="0"
              max="20000"
              step="100"
              value={altMonthly}
              onChange={(e) => setAltMonthly(+e.target.value)}
            />
          </label>
          <div className={`sim-diff ${diff >= 0 ? "positive" : "negative"}`}>
            {diff >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
            <span>
              {diff >= 0 ? "+" : "−"}{money.format(Math.abs(diff))} no patrimônio final
            </span>
          </div>
        </div>
      </section>

      {/* ── Painel de resultado ── */}
      <div className="sim-result-col">
        {/* Número final */}
        <section className="projection sim-projection">
          <p className="eyebrow">EM {years} {years === 1 ? "ANO" : "ANOS"}</p>
          <strong>{money.format(finalValue)}</strong>
          <span>patrimônio projetado</span>

          {/* Composição */}
          <div className="sim-composition">
            <div className="sim-comp-bar">
              <i className="contributed" style={{ width: `${contributedPct}%` }} />
              <i className="gain" style={{ width: `${gainPct}%` }} />
            </div>
            <div className="sim-comp-legend">
              <div className="sim-comp-item">
                <i className="dot contributed" />
                <div>
                  <span>Total aportado</span>
                  <b>{money.format(Math.max(0, totalContributed))}</b>
                </div>
              </div>
              <div className="sim-comp-item">
                <i className="dot gain" />
                <div>
                  <span>Rendimentos</span>
                  <b className="up">{money.format(Math.max(0, totalGain))}</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gráfico de evolução */}
        <section className="panel sim-chart-panel">
          <p className="eyebrow" style={{ marginBottom: 14 }}>EVOLUÇÃO ANO A ANO</p>
          <div style={{ height: 200 }}>
            <Line
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  tooltip: {
                    backgroundColor: "#1e1b2a",
                    borderColor: "#3d3650",
                    borderWidth: 1,
                    titleColor: "#c8bfdf",
                    bodyColor: "#a09ab0",
                    callbacks: {
                      label: (ctx) =>
                        ` ${ctx.dataset.label}: ${money.format(ctx.parsed.y ?? 0)}`,
                    },
                  },
                  legend: { display: false },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                      color: "#77738b",
                      font: { size: 10, family: "DM Sans" },
                      maxTicksLimit: 8,
                    },
                  },
                  y: {
                    grid: { color: "#1f1d28" },
                    border: { display: false },
                    ticks: {
                      color: "#77738b",
                      font: { size: 10, family: "DM Sans" },
                      callback: (v) => {
                        const n = Number(v);
                        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
                        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
                        return String(n);
                      },
                    },
                  },
                },
              }}
            />
          </div>
          {/* Legenda manual */}
          <div className="sim-legend">
            <div className="sim-legend-item">
              <i style={{ background: "#b79cff" }} />
              <span>Cenário atual ({money.format(monthly)}/mês)</span>
            </div>
            <div className="sim-legend-item">
              <i style={{ background: "#7dd3fc", opacity: 0.7 }} />
              <span>Alternativo ({money.format(altMonthly)}/mês)</span>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
function Timeline() {
  const [history, setHistory] = useState<{ labels: string[]; data: number[] } | null>(null);
  const [monthlySavings, setMonthlySavings] = useState(0);
  const [currentTotal, setCurrentTotal] = useState(0);

  useEffect(() => {
    fetch("http://localhost:3333/api/patrimony-history")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHistory)
      .catch(() => undefined);
    fetch("http://localhost:3333/api/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => {
        setMonthlySavings(s.monthlySavings ?? 0);
        setCurrentTotal(s.total ?? 0);
      })
      .catch(() => undefined);
  }, []);

  // Projeta 6 meses futuros com base na economia mensal real
  const now = new Date();
  const futureMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    return {
      label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      value: currentTotal + monthlySavings * (i + 1),
    };
  });

  const historyRows = history
    ? history.labels.map((label, i) => ({ label, value: history.data[i] }))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LINHA DO TEMPO</p>
            <h2>Evolução e projeção patrimonial</h2>
          </div>
          <CalendarDays color="#bca3ff" />
        </div>
        {historyRows.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>HISTÓRICO REAL</p>
            {historyRows.map((row, i) => (
              <div className="timeline-row" key={`hist-${i}`}>
                <i />
                <div>
                  <b>{row.label}</b>
                  <span>{i === historyRows.length - 1 ? "Hoje" : "Histórico"}</span>
                </div>
                <strong>{money.format(row.value)}</strong>
                <small className={i > 0 && row.value >= historyRows[i - 1].value ? "up" : ""}>
                  {i === historyRows.length - 1 ? "valor real" : "estimado"}
                </small>
              </div>
            ))}
          </>
        )}
        <p className="eyebrow" style={{ marginTop: 20, marginBottom: 8 }}>PROJEÇÃO</p>
        {futureMonths.map((row, i) => (
          <div className="timeline-row" key={`fut-${i}`}>
            <i />
            <div>
              <b>{row.label}</b>
              <span>Projeção</span>
            </div>
            <strong>{money.format(Math.max(0, row.value))}</strong>
            <small className="up">+ esperado</small>
          </div>
        ))}
        {monthlySavings <= 0 && (
          <p style={{ fontSize: 12, color: "#77738b", marginTop: 12 }}>
            Registre receitas e despesas do mês para que a projeção futura seja calculada com sua taxa de economia real.
          </p>
        )}
      </section>
    </motion.div>
  );
}
function Stats({ records }: { records: RecordItem[] }) {
  const received = records
    .filter((r) => r.type === "Receita")
    .reduce((s, r) => s + r.amount, 0);
  const invested = records
    .filter((r) => r.type === "Aporte")
    .reduce((s, r) => s + r.amount, 0);
  const topAporte = records
    .filter((r) => r.type === "Aporte")
    .sort((a, b) => b.amount - a.amount)[0];

  // Comparativo mês a mês: últimos 3 meses + mês atual
  const now = new Date();
  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      year: d.getFullYear(),
      month: d.getMonth(),
    };
  });

  // Gastos por mês e categoria
  const expenseCategories = categoriesByType["Despesa"] as string[];
  const dataByMonth: Record<string, Record<string, number>> = {};
  for (const m of months) dataByMonth[m.key] = {};

  for (const r of records) {
    if (r.type !== "Despesa") continue;
    // Usa isoDate quando disponível (mais preciso); cai para r.date formatado
    let d: Date;
    if (r.isoDate) {
      d = new Date(r.isoDate);
    } else if (r.date === "Agora") {
      d = now;
    } else if (r.date.includes("/")) {
      const [dd, mm, yyyy] = r.date.split("/");
      d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    } else {
      d = new Date(r.date);
    }
    // Ignora parcelas futuras — só conta o que já saiu
    if (d > now) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!dataByMonth[key]) continue;
    dataByMonth[key][r.category] = (dataByMonth[key][r.category] ?? 0) + r.amount;
  }

  const totalByMonth: Record<string, number> = {};
  for (const m of months) {
    totalByMonth[m.key] = Object.values(dataByMonth[m.key]).reduce((s, v) => s + v, 0);
  }

  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const prevMonthKey = months[months.length - 2]?.key;
  const currentTotal = totalByMonth[currentMonthKey] ?? 0;
  const prevTotal = totalByMonth[prevMonthKey] ?? 0;
  const diffPct = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="stat-grid">
        <Metric
          label="Total recebido"
          value={money.format(received)}
          sub="desde o início"
          icon={<ArrowUpRight />}
          tone="green"
        />
        <Metric
          label="Total aportado"
          value={money.format(invested)}
          sub="aportes registrados"
          icon={<TrendingUp />}
          tone="purple"
        />
        <Metric
          label="Maior aporte"
          value={topAporte ? money.format(topAporte.amount) : "—"}
          sub={topAporte ? topAporte.title : "Nenhum aporte"}
          icon={<Crown />}
          tone="gold"
        />
        <Metric
          label="Despesas este mês"
          value={money.format(currentTotal)}
          sub={
            diffPct !== null
              ? `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% vs. mês anterior`
              : "primeiro mês registrado"
          }
          icon={<Sparkles />}
          tone={diffPct !== null && diffPct > 10 ? "gold" : "blue"}
        />
      </section>

      {/* Comparativo mês a mês por categoria */}
      <section className="panel stats-comparison">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ANÁLISE TEMPORAL</p>
            <h2>Despesas por categoria</h2>
          </div>
        </div>
        <div className="stats-month-header">
          <span className="stats-cat-label" />
          {months.map((m) => (
            <span key={m.key} className={"stats-month-col" + (m.key === currentMonthKey ? " current" : "")}>
              {m.label}
            </span>
          ))}
        </div>
        {expenseCategories
          .filter((cat) => months.some((m) => (dataByMonth[m.key][cat] ?? 0) > 0))
          .map((cat) => {
            const maxVal = Math.max(...months.map((m) => dataByMonth[m.key][cat] ?? 0), 1);
            return (
              <div key={cat} className="stats-cat-row">
                <span className="stats-cat-label">{cat}</span>
                {months.map((m) => {
                  const val = dataByMonth[m.key][cat] ?? 0;
                  const barPct = (val / maxVal) * 100;
                  return (
                    <div key={m.key} className={"stats-month-col" + (m.key === currentMonthKey ? " current" : "")}>
                      <div className="stats-mini-bar-wrap">
                        <div className="stats-mini-bar" style={{ height: `${barPct}%` }} />
                      </div>
                      <span>{val > 0 ? money.format(val) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        {months.every((m) => totalByMonth[m.key] === 0) && (
          <p style={{ color: "#77738b", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            Registre despesas para ver o comparativo mensal aqui.
          </p>
        )}
      </section>
    </motion.div>
  );
}
// Definição das conquistas com critério de desbloqueio
const ACHIEVEMENTS_CONFIG: Array<{
  name: string;
  description: string;
  icon: React.ElementType;
  check: (total: number, txCount: number, assetCount: number, goalCount: number) => boolean;
}> = [
  {
    name: "Primeiros R$ 1.000",
    description: "Patrimônio total atingiu R$ 1.000",
    icon: Crown,
    check: (total) => total >= 1000,
  },
  {
    name: "Patrimônio de R$ 5.000",
    description: "Patrimônio total atingiu R$ 5.000",
    icon: Crown,
    check: (total) => total >= 5000,
  },
  {
    name: "Patrimônio de R$ 10.000",
    description: "Patrimônio total atingiu R$ 10.000",
    icon: Crown,
    check: (total) => total >= 10000,
  },
  {
    name: "Primeiro investimento",
    description: "Cadastrou um ativo no Atlas",
    icon: TrendingUp,
    check: (_t, _tx, assets) => assets >= 1,
  },
  {
    name: "Primeira meta",
    description: "Criou um objetivo financeiro",
    icon: Target,
    check: (_t, _tx, _a, goals) => goals >= 1,
  },
  {
    name: "Movimentador",
    description: "Registrou 10 ou mais lançamentos",
    icon: Sparkles,
    check: (_t, txCount) => txCount >= 10,
  },
  {
    name: "Patrimônio de R$ 50.000",
    description: "Patrimônio total atingiu R$ 50.000",
    icon: Crown,
    check: (total) => total >= 50000,
  },
  {
    name: "R$ 100.000",
    description: "Patrimônio total atingiu R$ 100.000",
    icon: Crown,
    check: (total) => total >= 100000,
  },
  {
    name: "R$ 1 milhão",
    description: "Patrimônio total atingiu R$ 1.000.000",
    icon: Crown,
    check: (total) => total >= 1000000,
  },
];

function Achievements() {
  const [total, setTotal] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [goalCount, setGoalCount] = useState(0);

  useEffect(() => {
    fetch("http://localhost:3333/api/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => setTotal(s.total ?? 0))
      .catch(() => undefined);
    fetch("http://localhost:3333/api/transactions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: unknown[]) => setTxCount(list.length))
      .catch(() => undefined);
    fetch("http://localhost:3333/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: unknown[]) => setAssetCount(list.length))
      .catch(() => undefined);
    fetch("http://localhost:3333/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: unknown[]) => setGoalCount(list.length))
      .catch(() => undefined);
  }, []);

  const unlocked = ACHIEVEMENTS_CONFIG.filter((a) =>
    a.check(total, txCount, assetCount, goalCount),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="achievement-hero">
        <Trophy />
        <div>
          <p className="eyebrow">SUA JORNADA</p>
          <h2>{unlocked.length} conquista{unlocked.length !== 1 ? "s" : ""} desbloqueada{unlocked.length !== 1 ? "s" : ""}</h2>
          <span>Cada marco prova a sua constância.</span>
        </div>
      </section>
      <section className="achievement-grid">
        {ACHIEVEMENTS_CONFIG.map((a) => {
          const done = a.check(total, txCount, assetCount, goalCount);
          const Icon = a.icon;
          return (
            <div className={"achievement " + (done ? "" : "locked")} key={a.name}>
              <Icon />
              <b>{a.name}</b>
              <span>{done ? "Desbloqueada" : a.description}</span>
            </div>
          );
        })}
      </section>
    </motion.div>
  );
}
function Profile({
  profile,
  total,
  goalList,
  assetList,
}: {
  profile: ProfileData;
  total: number;
  goalList: GoalItem[];
  assetList: AssetItem[];
}) {
  const xpTarget = profile.level * 1000;
  const xpPercent = Math.min(100, Math.round((profile.xp / xpTarget) * 100));
  const activeGoal = pickPrimaryGoal(goalList, assetList);
  const activeGoalCurrent = activeGoal
    ? goalCurrentValue(activeGoal, assetList)
    : 0;
  const missionPercent = activeGoal
    ? Math.min(100, Math.round((activeGoalCurrent / activeGoal.target) * 100))
    : 0;

  // Título baseado no nível real
  const titleByLevel = (level: number) => {
    if (level >= 20) return "o Lendário";
    if (level >= 15) return "o Mestre";
    if (level >= 10) return "o Estrategista";
    if (level >= 7)  return "o Investidor";
    if (level >= 4)  return "o Construtor";
    return "o Explorador";
  };

  // Conquistas desbloqueadas: mesma lógica do componente Achievements
  const [txCount, setTxCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [goalCount, setGoalCount] = useState(0);
  useEffect(() => {
    fetch("http://localhost:3333/api/transactions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: unknown[]) => setTxCount(list.length))
      .catch(() => undefined);
    fetch("http://localhost:3333/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: unknown[]) => setAssetCount(list.length))
      .catch(() => undefined);
    fetch("http://localhost:3333/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: unknown[]) => setGoalCount(list.length))
      .catch(() => undefined);
  }, []);
  const unlockedCount = ACHIEVEMENTS_CONFIG.filter((a) =>
    a.check(total, txCount, assetCount, goalCount),
  ).length;

  // Score financeiro baseado em dados reais:
  // - base 300
  // - até +300 pelo patrimônio (escala logarítmica, teto em R$1M)
  // - até +200 por ter ativos diversificados (≥3 ativos = máximo)
  // - até +100 por ter metas ativas
  // - até +100 por nível de XP
  const scorePatrimony = total > 0
    ? Math.round(Math.min(300, (Math.log10(Math.max(1, total)) / Math.log10(1_000_000)) * 300))
    : 0;
  const scoreDiversification = Math.min(200, assetCount * 67);
  const scoreGoals = Math.min(100, goalCount * 34);
  const scoreLevel = Math.min(100, (profile.level - 1) * 10);
  const score = Math.min(999, 300 + scorePatrimony + scoreDiversification + scoreGoals + scoreLevel);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="profile-hero">
        <div className="big-avatar">{profile.name.charAt(0).toUpperCase()}</div>
        <div>
          <p className="eyebrow">PERFIL FINANCEIRO</p>
          <h2>{profile.name}, {titleByLevel(profile.level)}</h2>
          <span>
            Nível {profile.level} · {profile.xp} XP de {xpTarget}
          </span>
          <div className="mini-progress">
            <i style={{ width: `${xpPercent}%`, background: "#b79cff" }} />
          </div>
        </div>
        <div className="profile-score">
          <b>{score}</b>
          <span>Score financeiro</span>
        </div>
      </section>
      <section className="stat-grid">
        <Metric
          label="Patrimônio"
          value={money.format(total)}
          sub="maior marca atual"
          icon={<Wallet />}
          tone="purple"
        />
        <Metric
          label="Missão"
          value={activeGoal ? `${missionPercent}%` : "—"}
          sub={activeGoal ? activeGoal.name : "Nenhuma meta ativa"}
          icon={<Target />}
          tone="blue"
        />
        <Metric
          label="Conquistas"
          value={String(unlockedCount)}
          sub={`de ${ACHIEVEMENTS_CONFIG.length} desbloqueadas`}
          icon={<Trophy />}
          tone="gold"
        />
        <Metric
          label="Nível"
          value={String(profile.level)}
          sub={titleByLevel(profile.level)}
          icon={<CalendarDays />}
          tone="green"
        />
      </section>
    </motion.div>
  );
}
function SettingsPage({
  profile,
  onSaved,
}: {
  profile: ProfileData;
  onSaved: (p: ProfileData) => void;
}) {
  const { confirmDialog, notify } = useDialog();
  const [name, setName] = useState(profile.name);
  const [saved, setSaved] = useState(false);
  useEffect(() => setName(profile.name), [profile.name]);
  const save = async () => {
    try {
      const response = await fetch("http://localhost:3333/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        onSaved(await response.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
  };
  const exportBackup = async () => {
    try {
      const response = await fetch("http://localhost:3333/api/backup");
      if (!response.ok) throw new Error();
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `atlas-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      await notify(
        "Não foi possível criar o backup. Verifique se a API local está em execução.",
      );
    }
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    if (
      !(await confirmDialog(
        "Restaurar este backup substituirá todos os dados atuais do Atlas. Deseja continuar?",
      ))
    )
      return;
    try {
      const payload = JSON.parse(await file.text());
      const response = await fetch("http://localhost:3333/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch {
      await notify(
        "Não foi possível restaurar este arquivo. Use um backup gerado pelo Atlas.",
      );
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="panel settings">
        <p className="eyebrow">PREFERÊNCIAS LOCAIS</p>
        <h2>Configurações</h2>
        <label>
          Seu nome
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="backup-section">
          <div>
            <p className="eyebrow">SEGURANÇA DOS DADOS</p>
            <b>Backup do Atlas</b>
            <span>
              Exporte toda a sua jornada em um único arquivo JSON e restaure-a
              quando precisar.
            </span>
          </div>
          <div className="backup-actions">
            <button className="withdraw-button" onClick={exportBackup}>
              Exportar backup
            </button>
            <label className="backup-import">
              Restaurar backup
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => importBackup(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <button className="save" onClick={save}>
          {saved ? "Salvo ✓" : "Salvar configurações"}
        </button>
      </section>
    </motion.div>
  );
}
function Placeholder({ page }: { page: string }) {
  const icon =
    page === "Conquistas" ? (
      <Trophy />
    ) : page === "Perfil Financeiro" ? (
      <Crown />
    ) : (
      <CircleDollarSign />
    );
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="placeholder"
    >
      <div className="placeholder-icon">{icon}</div>
      <p className="eyebrow">EM CONSTRUÇÃO CONTÍNUA</p>
      <h2>{page}</h2>
      <p>
        Esta área está pronta para receber sua história financeira. O painel
        inicial já estabelece a base visual e os dados poderão ser incluídos por
        registros locais.
      </p>
      <button className="add-button">
        <Plus size={17} /> Adicionar primeiro registro
      </button>
    </motion.section>
  );
}
function RegisterModal({
  close,
  save,
  availableBalance,
}: {
  close: () => void;
  save: (r: Omit<RecordItem, "id" | "date"> & { recurrent?: boolean; totalInstallments?: number }) => void;
  availableBalance: number;
}) {
  const { confirmDialog } = useDialog();
  const [type, setType] = useState("Receita");
  const [category, setCategory] = useState(categoriesByType.Receita[0]);
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [recurrent, setRecurrent] = useState(false);
  const [installments, setInstallments] = useState("1");
  const chooseType = (t: string) => {
    setType(t);
    setCategory(categoriesByType[t][0]);
    setRecurrent(false);
    setInstallments("1");
  };
  const submit = async () => {
    const amount = Number(value.replace(",", "."));
    if (!amount || !title) return;
    if (
      type !== "Receita" &&
      amount > availableBalance &&
      !(await confirmDialog(
        `Seu saldo disponível é ${money.format(availableBalance)}. Mesmo assim quer registrar ${money.format(amount)} como ${type.toLowerCase()}?`,
      ))
    )
      return;
    const totalInstallments = Math.max(1, parseInt(installments) || 1);
    save({ type, title, category, amount, recurrent, totalInstallments });
    close();
  };
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
      >
        <button className="modal-close" onClick={close}>
          <X />
        </button>
        <p className="eyebrow">NOVO CAPÍTULO</p>
        <h2>Registrar movimentação</h2>
        <div className="type-choice">
          <button
            className={type === "Receita" ? "chosen" : ""}
            onClick={() => chooseType("Receita")}
          >
            <ArrowUpRight /> Receita
          </button>
          <button
            className={type === "Aporte" ? "chosen" : ""}
            onClick={() => chooseType("Aporte")}
          >
            <TrendingUp /> Aporte
          </button>
          <button
            className={type === "Despesa" ? "chosen" : ""}
            onClick={() => chooseType("Despesa")}
          >
            <ArrowDownRight /> Despesa
          </button>
        </div>
        {type !== "Receita" && (
          <p style={{ fontSize: 12, color: "#77738b", margin: "-4px 0 4px" }}>
            Saldo disponível:{" "}
            <b style={{ color: availableBalance < 0 ? "#fb7185" : "#7dd3fc" }}>
              {money.format(availableBalance)}
            </b>
          </p>
        )}
        <label>
          {type === "Despesa" && !recurrent && parseInt(installments) > 1
            ? `Valor total (${parseInt(installments)}x de ${money.format(
                Math.round((Number(value.replace(",", ".")) / parseInt(installments)) * 100) / 100 || 0
              )})`
            : "Valor"}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex.: 1200"
            autoFocus
          />
        </label>
        <label>
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categoriesByType[type].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Descrição
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Aporte mensal"
          />
        </label>
        {/* Opções extras: recorrência e parcelamento (só para Despesa) */}
        {type === "Despesa" && (
          <div className="extra-options">
            <label className="toggle-row">
              <span>Despesa recorrente (lança todo mês)</span>
              <input
                type="checkbox"
                checked={recurrent}
                onChange={(e) => {
                  setRecurrent(e.target.checked);
                  if (e.target.checked) setInstallments("1");
                }}
              />
            </label>
            {!recurrent && (
              <label>
                Parcelado em
                <div className="installment-row">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    placeholder="1"
                  />
                  <span>parcela(s)</span>
                </div>
              </label>
            )}
          </div>
        )}
        <button className="save" onClick={submit}>
          {type === "Despesa" && !recurrent && parseInt(installments) > 1
            ? `Parcelar em ${parseInt(installments)}x`
            : "Salvar registro"}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Modal de edição de lançamento
// ---------------------------------------------------------------------------
function EditTransactionModal({
  record,
  close,
  save,
}: {
  record: RecordItem;
  close: () => void;
  save: (patch: { type: string; title: string; category: string; amount: number }) => void;
}) {
  const [type, setType] = useState(record.type);
  const [category, setCategory] = useState(record.category);
  const [value, setValue] = useState(String(record.amount));
  const [title, setTitle] = useState(record.title);
  const chooseType = (t: string) => {
    setType(t);
    setCategory(categoriesByType[t]?.[0] ?? category);
  };
  const submit = () => {
    const amount = Number(value.replace(",", "."));
    if (!amount || !title) return;
    save({ type, title, category, amount });
  };
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
      >
        <button className="modal-close" onClick={close}><X /></button>
        <p className="eyebrow">EDITAR</p>
        <h2>Editar lançamento</h2>
        <div className="type-choice">
          {["Receita", "Aporte", "Despesa"].map((t) => (
            <button
              key={t}
              className={type === t ? "chosen" : ""}
              onClick={() => chooseType(t)}
            >
              {t === "Receita" ? <ArrowUpRight /> : t === "Aporte" ? <TrendingUp /> : <ArrowDownRight />}
              {t}
            </button>
          ))}
        </div>
        <label>
          Valor
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: 1200" autoFocus />
        </label>
        <label>
          Categoria
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {(categoriesByType[type] ?? [category]).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Descrição
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Aluguel" />
        </label>
        <button className="save" onClick={submit}>Salvar alterações</button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Orçamento por categoria
// ---------------------------------------------------------------------------
function BudgetPage({
  budgetList,
  refresh,
  records,
}: {
  budgetList: BudgetItem[];
  refresh: () => void;
  records: RecordItem[];
}) {
  const { notify } = useDialog();
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState("");

  // Gastos do mês atual por categoria
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of records) {
      if (r.type !== "Despesa") continue;
      // Usa isoDate quando disponível; cai para parsing do formato brasileiro
      const d = r.isoDate
        ? new Date(r.isoDate)
        : new Date(r.date.includes("/")
          ? r.date.split("/").reverse().join("-")
          : r.date);
      // Só conta despesas do mês atual que já venceram (ignora parcelas futuras)
      if (isNaN(d.getTime()) || d < monthStart || d > now) continue;
      map[r.category] = (map[r.category] ?? 0) + r.amount;
    }
    return map;
  }, [records]);

  const allCategories = categoriesByType["Despesa"] as string[];
  const budgetMap = useMemo(
    () => Object.fromEntries(budgetList.map((b) => [b.category, b])),
    [budgetList],
  );

  const save = async (cat: string) => {
    const limit = Number(limitValue.replace(",", "."));
    if (!limit || limit <= 0) return;
    await fetch(`http://localhost:3333/api/budgets/${encodeURIComponent(cat)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    refresh();
    setEditingCat(null);
    setLimitValue("");
  };

  const remove = async (cat: string) => {
    await fetch(`http://localhost:3333/api/budgets/${encodeURIComponent(cat)}`, {
      method: "DELETE",
    });
    refresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="workspace"
    >
      <section className="panel budget-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONTROLE DE GASTOS</p>
            <h2>Orçamento mensal</h2>
          </div>
        </div>
        <p className="budget-hint">
          Defina um teto de gastos por categoria. A barra fica vermelha ao ultrapassar 80%.
        </p>
        <div className="budget-list">
          {allCategories.map((cat) => {
            const budget = budgetMap[cat];
            const spent = spentByCategory[cat] ?? 0;
            const pct = budget ? Math.min(100, (spent / budget.limit) * 100) : 0;
            const over = budget ? spent > budget.limit : false;
            const warn = budget ? pct >= 80 : false;
            return (
              <div key={cat} className="budget-row">
                <div className="budget-row-header">
                  <span className="budget-cat">{cat}</span>
                  <span className="budget-spent">
                    {money.format(spent)}
                    {budget && (
                      <em className={over ? "over" : warn ? "warn" : ""}>
                        {" "}/ {money.format(budget.limit)}
                      </em>
                    )}
                  </span>
                  <div className="budget-actions">
                    <button
                      className="edit-button"
                      onClick={() => {
                        setEditingCat(cat);
                        setLimitValue(budget ? String(budget.limit) : "");
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    {budget && (
                      <button className="delete-button" onClick={() => remove(cat)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {editingCat === cat ? (
                  <div className="budget-edit-row">
                    <input
                      type="number"
                      value={limitValue}
                      onChange={(e) => setLimitValue(e.target.value)}
                      placeholder="Limite em R$"
                      autoFocus
                    />
                    <button className="save" onClick={() => save(cat)}>OK</button>
                    <button className="delete-button" onClick={() => setEditingCat(null)}><X size={14} /></button>
                  </div>
                ) : budget ? (
                  <div className="budget-bar-wrap">
                    <div
                      className={"budget-bar" + (over ? " over" : warn ? " warn" : "")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : (
                  <p className="budget-no-limit">Sem limite definido</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
