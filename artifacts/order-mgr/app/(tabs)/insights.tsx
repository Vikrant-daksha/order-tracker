import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Path,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import { AddExpenseModal } from "@/components/AddExpenseModal";
import { Expense, Order } from "@/types";
import { ChatBubble } from "@/components/ChatBubble";

// --- Theme Tokens for Insights ---
const THEME = {
  bg: "#ffffff",
  cardBg: "#FFFFFF",
  cardBorder: "#F8CCD7",
  cardBorderSubtle: "#FCE4EC",
  textPrimary: "#1C1C1E",
  textSecondary: "#8B5E6D",
  textMuted: "#A38590",
  darkRose: "#C23363",
  deepBerry: "#8B2446",
  accentPink: "#F8BCCD",
  accentPinkLight: "#FFE4EE",
  trackBg: "#F5D0DB",
  positiveText: "#1A7A45",
  positiveBg: "#E8F8F0",
  positiveBorder: "#B8F0D0",
};

// --- Helper Functions ---
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractDateOnly(dateStr?: string): string {
  if (!dateStr) return "";
  // If pure YYYY-MM-DD format (exactly 10 chars, e.g. "2026-09-25")
  if (
    dateStr.length === 10 &&
    dateStr.charAt(4) === "-" &&
    dateStr.charAt(7) === "-"
  ) {
    return dateStr;
  }
  // If it's a full ISO or timestamp string, parse as Date and convert to LOCAL calendar date
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return toLocalDateStr(d);
    }
  } catch {
    // fallback
  }
  if (
    dateStr.length >= 10 &&
    dateStr.charAt(4) === "-" &&
    dateStr.charAt(7) === "-"
  ) {
    return dateStr.slice(0, 10);
  }
  return "";
}

function formatCompact(val: number): string {
  if (val <= 0) return "0";
  if (val >= 100000) return `${(val / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (val >= 1000) return `${(val / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return Math.round(val).toString();
}

function formatMonthDisplay(ymStr: string): string {
  if (!ymStr || ymStr.length < 7) return ymStr;
  try {
    const [y, m] = ymStr.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return ymStr;
  }
}

function getInitials(name: string): string {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function generateSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1)
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

function getOrderRevenue(order: Order): number {
  if (typeof order.price === "number" && order.price > 0) {
    return order.price;
  }
  if (typeof order.amountPaid === "number" && order.amountPaid > 0) {
    return order.amountPaid;
  }
  return 0;
}

// --- Circular Mini Progress Ring ---
interface CircularProgressProps {
  percentage: number;
  color: string;
  trackColor?: string;
  label: string;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  color,
  trackColor = THEME.trackBg,
  label,
}) => {
  const radius = 16;
  const strokeWidth = 2;
  const normalizedRadius = radius - strokeWidth * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    circumference -
    (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <View style={styles.circularContainer}>
      <Svg
        height={radius * 2}
        width={radius * 2}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          stroke={trackColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <Circle
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.circularLabelWrap}>
          <Text style={[styles.circularLabelText, { color }]}>{label}</Text>
        </View>
      </View>
    </View>
  );
};

// --- Main Screen Component ---
export const BusinessInsightsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders, expenses, goals, customers, getMonthlyGoal, addExpense } =
    useDatabase();

  // --- Period Selector State ---
  const [periodType, setPeriodType] = useState<
    "This Week" | "For the Month" | "For the Year" | "All Time"
  >("This Week");
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    toLocalDateStr(new Date()).slice(0, 7),
  );
  const [selectedYear, setSelectedYear] = useState<number>(() =>
    new Date().getFullYear(),
  );
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  // Chart Series Visibility Toggles (Revenue, Profit, Expenses)
  const [chartSeries, setChartSeries] = useState<{
    revenue: boolean;
    profit: boolean;
    expenses: boolean;
  }>({
    revenue: true,
    profit: true,
    expenses: true,
  });
  const [showChartSeriesModal, setShowChartSeriesModal] = useState(false);

  const toggleSeries = (key: "revenue" | "profit" | "expenses") => {
    setChartSeries((prev) => {
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (prev[key] && activeCount === 1) {
        return prev; // keep at least one series visible
      }
      return { ...prev, [key]: !prev[key] };
    });
  };

  // Oldest date from the oldest order (and oldest expense).
  // Because orders and expenses are sorted descending (newest first) by the database,
  // the last item is the oldest — giving O(1) constant time without scanning all rows.
  const oldestDate = React.useMemo(() => {
    let oldest = "";
    if (orders.length > 0) {
      const o = orders[orders.length - 1];
      const d = extractDateOnly(o.orderDate || o.createdAt);
      if (d) oldest = d;
    }
    if (expenses.length > 0) {
      const e = expenses[expenses.length - 1];
      const d = extractDateOnly(e.date || e.createdAt);
      if (d && (!oldest || d < oldest)) oldest = d;
    }
    return oldest;
  }, [orders, expenses]);

  // Available Months for the Month Picker (descending)
  // Generates continuous months from the current month back to the oldest order (minimum past 12 months)
  const availableMonths = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 to 11

    // Baseline: default to at least the past 12 months
    let minYear = currentYear - 1;
    let minMonth = currentMonth;

    if (oldestDate && oldestDate.length >= 7) {
      const oYear = parseInt(oldestDate.slice(0, 4), 10);
      const oMonth = parseInt(oldestDate.slice(5, 7), 10) - 1;
      if (!isNaN(oYear) && !isNaN(oMonth)) {
        if (oYear < minYear || (oYear === minYear && oMonth < minMonth)) {
          minYear = oYear;
          minMonth = oMonth;
        }
      }
    }

    const totalMonths =
      (currentYear - minYear) * 12 + (currentMonth - minMonth) + 1;
    const months: string[] = [];
    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(currentYear, currentMonth - i, 1);
      months.push(toLocalDateStr(d).slice(0, 7));
    }
    return months;
  }, [oldestDate]);

  // Available Years for the Year Picker (descending)
  // Generates continuous years from current year down to the oldest order's year
  const availableYears = React.useMemo(() => {
    const currentY = new Date().getFullYear();
    let minYear = currentY - 1;

    if (oldestDate && oldestDate.length >= 4) {
      const oYear = parseInt(oldestDate.slice(0, 4), 10);
      if (!isNaN(oYear) && oYear < minYear) {
        minYear = oYear;
      }
    }

    const years: number[] = [];
    for (let y = currentY; y >= minYear; y--) {
      years.push(y);
    }
    return years;
  }, [oldestDate]);

  const handleSaveExpense = async (data: Omit<Expense, "id" | "createdAt">) => {
    try {
      await addExpense(data);
    } finally {
      setShowAddExpense(false);
    }
  };

  // --- Goal Calculation (Target Month Alignment) ---
  const activeMonthKey =
    periodType === "For the Month"
      ? selectedMonth
      : toLocalDateStr(new Date()).slice(0, 7);
  const currentMonthGoals = goals.filter((g) => g.month === activeMonthKey);
  const currentGoal =
    currentMonthGoals.find((g) => g.status === "in_progress") ||
    currentMonthGoals[0] ||
    getMonthlyGoal(activeMonthKey);

  const [aYear, aMonthNum] = activeMonthKey.split("-").map(Number);
  const lastDay = new Date(aYear, aMonthNum, 0).getDate();
  const defaultStartDate = `${activeMonthKey}-01`;
  const defaultEndDate = `${activeMonthKey}-${String(lastDay).padStart(2, "0")}`;

  const goalStartDate = currentGoal?.startDate || defaultStartDate;
  const goalEndDate = currentGoal?.endDate || defaultEndDate;
  const monthlyGoalTarget = currentGoal?.targetAmount || 0;

  // Real-time Earned Revenue for the Monthly Goal range
  const monthlyRevenue = React.useMemo(() => {
    return orders
      .filter((o) => {
        const d = extractDateOnly(o.orderDate || o.createdAt);
        return d >= goalStartDate && d <= goalEndDate;
      })
      .reduce((sum, o) => sum + getOrderRevenue(o), 0);
  }, [orders, goalStartDate, goalEndDate]);

  const remainingGoal = Math.max(0, monthlyGoalTarget - monthlyRevenue);
  const goalProgressPercent =
    monthlyGoalTarget > 0
      ? Math.min(100, Math.round((monthlyRevenue / monthlyGoalTarget) * 100))
      : 0;

  // Formatted date range for Goal display
  const formattedDateRange = React.useMemo(() => {
    try {
      const [sY, sM, sD] = goalStartDate.split("-").map(Number);
      const [eY, eM, eD] = goalEndDate.split("-").map(Number);
      const sObj = new Date(sY, sM - 1, sD);
      const eObj = new Date(eY, eM - 1, eD);
      const sMonth = sObj.toLocaleString("en-US", { month: "short" });
      const eMonth = eObj.toLocaleString("en-US", { month: "short" });
      return `${sD} ${sMonth} – ${eD} ${eMonth}`;
    } catch {
      return `${goalStartDate} – ${goalEndDate}`;
    }
  }, [goalStartDate, goalEndDate]);

  // --- Dynamic Period & Buckets Definition based on periodType, selectedMonth, selectedYear ---
  const periodInfo = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    let startDate = "";
    let endDate = "";
    let prevStartDate = "";
    let prevEndDate = "";
    let periodLabel = "";
    let periodShortLabel = "";
    let chartSubtitle = "";

    interface Bucket {
      key: string;
      label: string;
      displayLabel?: string;
      isCurrent?: boolean;
      matches: (dateStr: string) => boolean;
    }

    const buckets: Bucket[] = [];

    if (periodType === "This Week") {
      // Fixed 7-day calendar week starting on Sunday (day 0) through Saturday (day 6)
      const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const currentSunday = new Date(
        currentYear,
        now.getMonth(),
        currentDay - dayOfWeek,
      );
      const currentSaturday = new Date(
        currentYear,
        now.getMonth(),
        currentDay - dayOfWeek + 6,
      );

      startDate = toLocalDateStr(currentSunday);
      endDate = toLocalDateStr(currentSaturday);

      // Preceding week (previous Sunday to previous Saturday)
      const prevSunday = new Date(
        currentYear,
        now.getMonth(),
        currentDay - dayOfWeek - 7,
      );
      const prevSaturday = new Date(
        currentYear,
        now.getMonth(),
        currentDay - dayOfWeek - 1,
      );
      prevStartDate = toLocalDateStr(prevSunday);
      prevEndDate = toLocalDateStr(prevSaturday);

      periodLabel = "this week";
      periodShortLabel = "week";
      chartSubtitle = "Weekly performance (Sun – Sat)";

      const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      for (let i = 0; i < 7; i++) {
        const d = new Date(
          currentSunday.getFullYear(),
          currentSunday.getMonth(),
          currentSunday.getDate() + i,
        );
        const key = toLocalDateStr(d);
        const dayName = DAY_LABELS[i];

        buckets.push({
          key,
          label: dayName,
          displayLabel: dayName,
          isCurrent: i === dayOfWeek,
          matches: (dateStr) => dateStr === key,
        });
      }
    } else if (periodType === "For the Month") {
      const [mYear, mMonth] = selectedMonth.split("-").map(Number);
      const lastDayOfSelectedMonth = new Date(mYear, mMonth, 0).getDate();
      const monthStr = String(mMonth).padStart(2, "0");

      startDate = `${mYear}-${monthStr}-01`;
      endDate = `${mYear}-${monthStr}-${String(lastDayOfSelectedMonth).padStart(2, "0")}`;

      const prevMonthDate = new Date(mYear, mMonth - 2, 1);
      const pYear = prevMonthDate.getFullYear();
      const pMonth = prevMonthDate.getMonth() + 1;
      const pLastDay = new Date(pYear, pMonth, 0).getDate();
      prevStartDate = `${pYear}-${String(pMonth).padStart(2, "0")}-01`;
      prevEndDate = `${pYear}-${String(pMonth).padStart(2, "0")}-${String(pLastDay).padStart(2, "0")}`;

      const monthName = formatMonthDisplay(selectedMonth);
      periodLabel = `in ${monthName}`;
      periodShortLabel = "month";
      chartSubtitle = `Monthly performance for ${monthName}`;

      const isCurrentMonthView =
        mYear === currentYear && mMonth === currentMonth;

      // Individual days for the entire month: 1, 2, 3 ... lastDay
      for (let day = 1; day <= lastDayOfSelectedMonth; day++) {
        const dayStr = String(day).padStart(2, "0");
        const fullDateKey = `${mYear}-${monthStr}-${dayStr}`;
        buckets.push({
          key: fullDateKey,
          label: String(day),
          displayLabel: String(day),
          isCurrent: isCurrentMonthView && currentDay === day,
          matches: (dateStr) => dateStr === fullDateKey,
        });
      }
    } else if (periodType === "For the Year") {
      startDate = `${selectedYear}-01-01`;
      endDate = `${selectedYear}-12-31`;
      prevStartDate = `${selectedYear - 1}-01-01`;
      prevEndDate = `${selectedYear - 1}-12-31`;

      periodLabel = `in ${selectedYear}`;
      periodShortLabel = "year";
      chartSubtitle = `Annual performance for ${selectedYear}`;

      for (let m = 1; m <= 12; m++) {
        const mKey = `${selectedYear}-${String(m).padStart(2, "0")}`;
        const d = new Date(selectedYear, m - 1, 1);
        const monthName = d.toLocaleDateString("en-US", { month: "short" });
        buckets.push({
          key: mKey,
          label: monthName,
          // Show alternating months on the axis for breathing room
          displayLabel: m % 2 === 1 ? monthName : undefined,
          isCurrent: selectedYear === currentYear && currentMonth === m,
          matches: (dateStr) => dateStr.slice(0, 7) === mKey,
        });
      }
    } else {
      // All Time
      startDate = oldestDate || "1970-01-01";
      endDate = "2099-12-31";
      prevStartDate = "1970-01-01";
      prevEndDate = "1970-01-01";

      periodLabel = "all time";
      periodShortLabel = "all time";
      chartSubtitle = "All-time performance by year";

      // Group by years from the oldest order up to current year, or at least past 3 years
      const startYear =
        oldestDate && oldestDate.length >= 4
          ? Math.min(
              parseInt(oldestDate.slice(0, 4), 10) || currentYear,
              currentYear - 2,
            )
          : currentYear - 2;

      const yearsToDisplay: number[] = [];
      for (let y = startYear; y <= currentYear; y++) {
        yearsToDisplay.push(y);
      }

      yearsToDisplay.forEach((y) => {
        buckets.push({
          key: String(y),
          label: String(y),
          displayLabel: String(y),
          isCurrent: y === currentYear,
          matches: (dateStr) => !!dateStr && dateStr.startsWith(String(y)),
        });
      });
    }

    return {
      startDate,
      endDate,
      prevStartDate,
      prevEndDate,
      periodLabel,
      periodShortLabel,
      chartSubtitle,
      buckets,
    };
  }, [periodType, selectedMonth, selectedYear, oldestDate]);

  // --- Filtered Orders & Expenses for Selected Period ---
  const periodOrders = React.useMemo(() => {
    return orders.filter((o) => {
      const d = extractDateOnly(o.orderDate || o.createdAt);
      return d >= periodInfo.startDate && d <= periodInfo.endDate;
    });
  }, [orders, periodInfo.startDate, periodInfo.endDate]);

  const prevPeriodOrders = React.useMemo(() => {
    return orders.filter((o) => {
      const d = extractDateOnly(o.orderDate || o.createdAt);
      return d >= periodInfo.prevStartDate && d <= periodInfo.prevEndDate;
    });
  }, [orders, periodInfo.prevStartDate, periodInfo.prevEndDate]);

  const periodExpensesList = React.useMemo(() => {
    return expenses.filter((e) => {
      const d = extractDateOnly(e.date || e.createdAt);
      return d >= periodInfo.startDate && d <= periodInfo.endDate;
    });
  }, [expenses, periodInfo.startDate, periodInfo.endDate]);

  // --- Aggregate Financial Metrics for the Selected Period ---
  const grossRevenue = React.useMemo(() => {
    return periodOrders.reduce((sum, o) => sum + getOrderRevenue(o), 0);
  }, [periodOrders]);

  const prevGrossRevenue = React.useMemo(() => {
    return prevPeriodOrders.reduce((sum, o) => sum + getOrderRevenue(o), 0);
  }, [prevPeriodOrders]);

  const totalExpenses = React.useMemo(() => {
    return periodExpensesList.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [periodExpensesList]);

  const netProfit = Math.max(0, grossRevenue - totalExpenses);

  // Margin and Expense % of Revenue
  const profitMarginPercent =
    grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 100) : 0;

  const expensePercentOfRevenue =
    grossRevenue > 0
      ? Math.round((totalExpenses / grossRevenue) * 100)
      : totalExpenses > 0
        ? 100
        : 0;

  // Real-time Growth Calculation
  const revenueGrowthInfo = React.useMemo(() => {
    if (periodType === "All Time") {
      return { text: "All time", isPositive: true };
    }
    if (prevGrossRevenue > 0) {
      const diff = ((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 100;
      const isPositive = diff >= 0;
      return {
        text: `${isPositive ? "+" : ""}${diff.toFixed(1)}%`,
        isPositive,
      };
    }
    if (grossRevenue > 0) {
      return { text: "+100%", isPositive: true };
    }
    return { text: "0.0%", isPositive: true };
  }, [periodType, grossRevenue, prevGrossRevenue]);

  // Sub-metrics below Gross Revenue: 1st Previous period sale in grey, 2nd Average sale across this period
  const revenueSubMetrics = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    let prevLabel = "Prev period";
    let avgSale = 0;
    let avgUnit = "/day";

    if (periodType === "This Week") {
      prevLabel = "Prev week";
      const elapsedDaysInWeek = Math.max(1, now.getDay() + 1);
      avgSale = grossRevenue / elapsedDaysInWeek;
      avgUnit = "/day";
    } else if (periodType === "For the Month") {
      const [mY, mM] = selectedMonth.split("-").map(Number);
      const prevMonthDate = new Date(mY, mM - 2, 1);
      const prevMonthName = prevMonthDate.toLocaleDateString("en-US", {
        month: "short",
      });
      prevLabel = `${prevMonthName} sales`;

      const lastDayOfSelectedMonth = new Date(mY, mM, 0).getDate();
      const isCurrentMonth = mY === currentYear && mM === currentMonth;
      const daysElapsed = isCurrentMonth
        ? Math.max(1, currentDay)
        : lastDayOfSelectedMonth;

      avgSale = grossRevenue / daysElapsed;
      avgUnit = "/day";
    } else if (periodType === "For the Year") {
      prevLabel = `Year ${selectedYear - 1}`;
      const isCurrentYear = selectedYear === currentYear;
      const monthsElapsed = isCurrentYear ? Math.max(1, currentMonth) : 12;

      avgSale = grossRevenue / monthsElapsed;
      avgUnit = "/mo";
    } else {
      // All Time
      prevLabel = "Total orders";
      avgSale =
        periodOrders.length > 0 ? grossRevenue / periodOrders.length : 0;
      avgUnit = "/order";
    }

    return {
      prevLabel,
      prevSale:
        periodType === "All Time" ? periodOrders.length : prevGrossRevenue,
      avgSale: Math.round(avgSale),
      avgUnit,
      isOrderCount: periodType === "All Time",
    };
  }, [
    periodType,
    selectedMonth,
    selectedYear,
    grossRevenue,
    prevGrossRevenue,
    periodOrders.length,
  ]);

  // --- Performance Flow Graph Data Generation ---
  const graphData = React.useMemo(() => {
    const calculatedBuckets = periodInfo.buckets.map((b) => {
      const bRevenue = periodOrders
        .filter((o) => b.matches(extractDateOnly(o.orderDate || o.createdAt)))
        .reduce((sum, o) => sum + getOrderRevenue(o), 0);

      const bExpense = periodExpensesList
        .filter((e) => b.matches(extractDateOnly(e.date || e.createdAt)))
        .reduce((sum, e) => sum + (e.amount || 0), 0);

      const bProfit = Math.max(0, bRevenue - bExpense);

      return {
        ...b,
        revenue: bRevenue,
        expense: bExpense,
        profit: bProfit,
      };
    });

    const maxVal = Math.max(
      ...calculatedBuckets.map((b) => {
        let m = 0;
        if (chartSeries.revenue) m = Math.max(m, b.revenue);
        if (chartSeries.profit) m = Math.max(m, b.profit);
        if (chartSeries.expenses) m = Math.max(m, b.expense);
        return m;
      }),
      1000,
    );

    const startX = 24;
    const endX = 296;
    const topY = 24;
    const baselineY = 110;
    const chartHeight = baselineY - topY;

    const N = calculatedBuckets.length;
    const stepX = N > 1 ? (endX - startX) / (N - 1) : 0;

    const revPoints = calculatedBuckets.map((b, i) => {
      const x = startX + i * stepX;
      const y =
        b.revenue > 0
          ? baselineY - (b.revenue / maxVal) * chartHeight
          : baselineY;
      return {
        x,
        y,
        val: b.revenue,
        isPeak: b.revenue === maxVal && b.revenue > 0,
        isCurrent: b.isCurrent,
      };
    });

    const expPoints = calculatedBuckets.map((b, i) => {
      const x = startX + i * stepX;
      const y =
        b.expense > 0
          ? baselineY - (b.expense / maxVal) * chartHeight
          : baselineY;
      return { x, y, val: b.expense };
    });

    const profitPoints = calculatedBuckets.map((b, i) => {
      const x = startX + i * stepX;
      const y =
        b.profit > 0
          ? baselineY - (b.profit / maxVal) * chartHeight
          : baselineY;
      return { x, y, val: b.profit };
    });

    const revPath = generateSmoothPath(revPoints);
    const areaPath =
      revPoints.length > 0
        ? `${revPath} L ${revPoints[revPoints.length - 1].x.toFixed(1)} ${baselineY} L ${revPoints[0].x.toFixed(1)} ${baselineY} Z`
        : "";

    const expPath = generateSmoothPath(expPoints);
    const profitPath = generateSmoothPath(profitPoints);

    const targetPerBucket =
      N > 0 && monthlyGoalTarget > 0 ? monthlyGoalTarget / N : 0;
    const goalY =
      targetPerBucket > 0
        ? Math.max(
            topY,
            Math.min(
              baselineY - 10,
              baselineY - (targetPerBucket / maxVal) * chartHeight,
            ),
          )
        : null;

    return {
      buckets: calculatedBuckets,
      revPoints,
      expPoints,
      profitPoints,
      revPath,
      areaPath,
      expPath,
      profitPath,
      goalY,
      startX,
      endX,
      baselineY,
    };
  }, [
    periodInfo,
    periodOrders,
    periodExpensesList,
    monthlyGoalTarget,
    chartSeries,
  ]);

  // --- Dynamic Expense Categories for Expense Breakdown ---
  const CATEGORY_COLORS = [
    THEME.darkRose,
    "#8B2446", // Deep Berry
    "#2DD4BF", // Teal
    "#818CF8", // Indigo
    "#F59E0B", // Amber
    "#EC4899", // Pink
    "#10B981", // Emerald
    "#6366F1", // Violet
  ];

  const expenseBreakdown = React.useMemo(() => {
    if (periodExpensesList.length === 0 || totalExpenses === 0) return [];

    const catMap: Record<string, number> = {};
    for (const exp of periodExpensesList) {
      const cat = exp.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + (exp.amount || 0);
    }

    return Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, amount], index) => {
        const pct = (amount / totalExpenses) * 100;
        return {
          id: name,
          name,
          amount,
          amountFormatted: `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
          percentage: Number(pct.toFixed(1)),
          color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        };
      });
  }, [periodExpensesList, totalExpenses]);

  // --- Top 5 Customers for the Selected Period ---
  const top5Customers = React.useMemo(() => {
    const map = new Map<
      string,
      {
        id?: string;
        name: string;
        contact: string;
        totalSpent: number;
        orderCount: number;
      }
    >();

    for (const order of periodOrders) {
      const rev = getOrderRevenue(order);

      const matchedCust = customers.find(
        (c) =>
          (order.customerId && c.id === order.customerId) ||
          (order.customerName &&
            c.name.trim().toLowerCase() ===
              order.customerName.trim().toLowerCase()) ||
          (order.contactInfo &&
            (c.phone === order.contactInfo ||
              c.email === order.contactInfo ||
              c.igHandle === order.contactInfo)),
      );

      const custKey =
        matchedCust?.id ||
        order.customerId ||
        order.customerName.trim().toLowerCase() ||
        "guest";
      const name = matchedCust?.name || order.customerName || "Customer";
      const contact =
        matchedCust?.email ||
        matchedCust?.igHandle ||
        matchedCust?.phone ||
        order.contactInfo ||
        "";

      const existing = map.get(custKey);
      if (existing) {
        existing.totalSpent += rev;
        existing.orderCount += 1;
        if (!existing.contact && contact) existing.contact = contact;
      } else {
        map.set(custKey, {
          id: matchedCust?.id,
          name,
          contact,
          totalSpent: rev,
          orderCount: 1,
        });
      }
    }

    return Array.from(map.values())
      .filter((c) => c.totalSpent > 0 || c.orderCount > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
  }, [periodOrders, customers]);

  return (
    <View style={[styles.container, { backgroundColor: THEME.bg }]}>
      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 10,
            paddingBottom: insets.bottom + 90,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Business Insights</Text>
          </View>

          {/* Goals Management Button */}
          {/* <Pressable
            onPress={() => router.push("/goals" as any)}
            style={({ pressed }) => [
              styles.addBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Feather name="target" size={15} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Goals</Text>
          </Pressable> */}
        </View>

        {/* Seamless Sentence-style Sales Selector Bar */}
        <View style={styles.salesSelectorCard}>
          <Text style={styles.salesSelectorPrefix}>Sales {"  "}</Text>

          {/* Primary Period Type Selector Pill */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setShowTypeModal(true)}
            style={
              periodType === "For the Year" || periodType === "For the Month"
                ? styles.salesSelectorPill
                : styles.salesLastSelectorPill
            }
          >
            <Text style={styles.salesSelectorPillText}>{periodType}</Text>
            <Feather name="chevron-down" size={13} color={THEME.darkRose} />
          </TouchableOpacity>

          {/* Month Selector: 'of [Aug 2026 ▼]' */}
          {periodType === "For the Month" && (
            <>
              <Text style={styles.salesSelectorOfText}>of</Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setShowMonthModal(true)}
                style={styles.salesLastSelectorPill}
              >
                <Text style={styles.salesSelectorPillText}>
                  {formatMonthDisplay(selectedMonth)}
                </Text>
                <Feather name="chevron-down" size={13} color={THEME.darkRose} />
              </TouchableOpacity>
            </>
          )}

          {/* Year Selector: 'of [2026 ▼]' */}
          {periodType === "For the Year" && (
            <>
              <Text style={styles.salesSelectorOfText}>of</Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setShowYearModal(true)}
                style={styles.salesLastSelectorPill}
              >
                <Text style={styles.salesSelectorPillText}>{selectedYear}</Text>
                <Feather name="chevron-down" size={13} color={THEME.darkRose} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Hero Card: Total Gross Revenue */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleGroup}>
              <View style={styles.dollarIconBadge}>
                <Text style={{ fontSize: 16, color: THEME.darkRose }}>₹</Text>
              </View>
              <Text style={styles.heroLabel}>TOTAL GROSS REVENUE</Text>
            </View>
            <View style={styles.growthBadge}>
              <Feather
                name={
                  revenueGrowthInfo.isPositive ? "trending-up" : "trending-down"
                }
                size={18}
                color={
                  revenueGrowthInfo.isPositive ? THEME.positiveText : "#E53935"
                }
              />
              <Text
                style={[
                  styles.growthText,
                  !revenueGrowthInfo.isPositive && { color: "#E53935" },
                ]}
              >
                {revenueGrowthInfo.text}
              </Text>
            </View>
          </View>

          <Text style={styles.heroRevenueValue}>
            ₹
            {grossRevenue.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          {/* Sub-metrics: 1st Previous period sale in grey, 2nd Average sale across this period */}
          <View style={styles.heroSubRow}>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>
                {revenueSubMetrics.prevLabel}:
              </Text>
              <Text style={styles.heroSubValueGrey}>
                {revenueSubMetrics.isOrderCount
                  ? `${revenueSubMetrics.prevSale} orders`
                  : `₹${revenueSubMetrics.prevSale.toLocaleString("en-IN", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}`}
              </Text>
            </View>

            <View style={styles.heroSubDot} />

            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>Avg sale:</Text>
              <Text style={styles.heroSubValue}>
                ₹{revenueSubMetrics.avgSale.toLocaleString("en-IN")}
                <Text style={styles.heroSubUnit}>
                  {revenueSubMetrics.avgUnit}
                </Text>
              </Text>
            </View>
          </View>

          {/* Goal & Progress Bar */}
          <View style={styles.goalSection}>
            {!currentGoal || !currentGoal.targetAmount ? (
              <View style={styles.goalEmptyBox}>
                <View style={styles.goalEmptyLeft}>
                  <View style={styles.goalEmptyIconWrap}>
                    <Feather name="target" size={16} color={THEME.darkRose} />
                  </View>
                  <View style={styles.goalEmptyTextGroup}>
                    <Text style={styles.goalEmptyTitle}>
                      {periodType === "For the Month"
                        ? `No goal set for ${formatMonthDisplay(selectedMonth)}`
                        : "No goal set this month"}
                    </Text>
                    <Text style={styles.goalEmptyDesc}>
                      Set a revenue target to track milestone progress
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.goalHeaderRow}>
                  <View style={styles.goalTitleRow}>
                    <Feather name="flag" size={14} color={THEME.darkRose} />
                    <Text style={styles.goalTargetText} numberOfLines={1}>
                      {currentGoal?.title
                        ? `${currentGoal.title}: `
                        : "Monthly Goal: "}
                      <Text style={styles.boldDarkText}>
                        ₹{monthlyGoalTarget.toLocaleString("en-IN")}
                      </Text>
                    </Text>
                  </View>
                  <Text style={styles.dateRangeText}>{formattedDateRange}</Text>
                </View>

                {/* Dark Progress Track */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${goalProgressPercent}%`,
                        backgroundColor:
                          currentGoal?.status === "achieved" ||
                          remainingGoal === 0
                            ? THEME.positiveText
                            : THEME.darkRose,
                      },
                    ]}
                  />
                </View>

                <View style={styles.goalFooterRow}>
                  <Text style={styles.goalSubText}>
                    Current: ₹{monthlyRevenue.toLocaleString("en-IN")} (
                    {goalProgressPercent}%)
                  </Text>
                  <Text
                    style={[
                      styles.goalRemainingText,
                      (currentGoal?.status === "achieved" ||
                        remainingGoal === 0) && {
                        color: THEME.positiveText,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {currentGoal?.status === "achieved" || remainingGoal === 0
                      ? "Goal Achieved! 🎉"
                      : `₹${remainingGoal.toLocaleString("en-IN")} to go`}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* 2-Column KPI Tiles: Net Profit & Total Expenses */}
        <View style={styles.kpiGrid}>
          {/* Net Profit Card */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiCardHeader}>
              <View style={styles.kpiIconWrapProfit}>
                <Feather name="trending-up" size={16} color={THEME.darkRose} />
              </View>
              <CircularProgress
                percentage={profitMarginPercent}
                color={THEME.darkRose}
                trackColor={THEME.trackBg}
                label={`${profitMarginPercent}%`}
              />
            </View>
            <View style={styles.kpiCardBody}>
              <Text style={styles.kpiLabel}>Net Profit</Text>
              <Text style={styles.kpiValue}>
                ₹
                {netProfit.toLocaleString("en-IN", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.kpiFootnote}>
                {grossRevenue > 0
                  ? `${profitMarginPercent}% margin`
                  : "0% margin"}
              </Text>
            </View>
          </View>

          {/* Total Expenses Card */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiCardHeader}>
              <View
                style={
                  totalExpenses > 0
                    ? styles.kpiIconWrapProfit
                    : styles.kpiIconWrapNeutral
                }
              >
                <Feather
                  name="file-text"
                  size={16}
                  color={totalExpenses > 0 ? THEME.darkRose : THEME.textMuted}
                />
              </View>
              <CircularProgress
                percentage={Math.min(100, expensePercentOfRevenue)}
                color={totalExpenses > 0 ? THEME.darkRose : THEME.textMuted}
                trackColor={totalExpenses > 0 ? THEME.trackBg : "#E5E5EA"}
                label={`${expensePercentOfRevenue}%`}
              />
            </View>
            <View style={styles.kpiCardBody}>
              <Text style={styles.kpiLabel}>Total Expenses</Text>
              <Text style={styles.kpiValue}>
                ₹
                {totalExpenses.toLocaleString("en-IN", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.kpiFootnote}>
                {totalExpenses > 0
                  ? `${expensePercentOfRevenue}% of revenue`
                  : "0% of revenue"}
              </Text>
            </View>
          </View>
        </View>

        {/* Performance Flow Chart Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Performance Flow</Text>
              <Text style={styles.cardSubtitle}>
                {periodInfo.chartSubtitle}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowChartSeriesModal(true)}
              style={styles.chartSeriesBtn}
            >
              <Feather name="layers" size={13} color={THEME.darkRose} />
              <Text style={styles.chartSeriesBtnText}>Series</Text>
              <Feather name="chevron-down" size={12} color={THEME.darkRose} />
            </TouchableOpacity>
          </View>

          {/* Curved Spline Chart */}
          <View style={styles.chartWrapper}>
            <Svg viewBox="0 0 320 140" width="100%" height={150}>
              <Defs>
                <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0%"
                    stopColor={THEME.darkRose}
                    stopOpacity="0.28"
                  />
                  <Stop
                    offset="100%"
                    stopColor={THEME.darkRose}
                    stopOpacity="0.0"
                  />
                </LinearGradient>
              </Defs>

              {/* Grid Lines */}
              <Line
                x1="16"
                y1="24"
                x2="304"
                y2="24"
                stroke="rgba(194, 51, 99, 0.08)"
                strokeDasharray="3 3"
              />
              <Line
                x1="16"
                y1="67"
                x2="304"
                y2="67"
                stroke="rgba(194, 51, 99, 0.08)"
                strokeDasharray="3 3"
              />
              <Line
                x1="16"
                y1={graphData.baselineY}
                x2="304"
                y2={graphData.baselineY}
                stroke="rgba(194, 51, 99, 0.15)"
                strokeWidth="1"
              />

              {/* Goal Target Line (Dashed) */}
              {graphData.goalY !== null ? (
                <Line
                  x1="16"
                  y1={graphData.goalY}
                  x2="304"
                  y2={graphData.goalY}
                  stroke={THEME.darkRose}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
              ) : null}

              {/* Area Fill for Revenue */}
              {chartSeries.revenue && graphData.areaPath ? (
                <Path d={graphData.areaPath} fill="url(#areaGradient)" />
              ) : null}

              {/* Curved Spline for Revenue */}
              {chartSeries.revenue && graphData.revPath ? (
                <Path
                  d={graphData.revPath}
                  fill="none"
                  stroke={THEME.darkRose}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
              ) : null}

              {/* Curved Spline for Profit */}
              {chartSeries.profit && graphData.profitPath ? (
                <Path
                  d={graphData.profitPath}
                  fill="none"
                  stroke={THEME.deepBerry}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              ) : null}

              {/* Expenses Line: Flat Baseline if 0, or Spline Curve if > 0 */}
              {chartSeries.expenses &&
                (totalExpenses === 0 ? (
                  <Line
                    x1="16"
                    y1={graphData.baselineY}
                    x2="304"
                    y2={graphData.baselineY}
                    stroke={THEME.trackBg}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                ) : (
                  <Path
                    d={graphData.expPath}
                    fill="none"
                    stroke={THEME.textMuted}
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />
                ))}

              {/* Highlight Data Points on Revenue Curve */}
              {chartSeries.revenue &&
                graphData.revPoints.map((p, i) => {
                  const isDense = graphData.buckets.length > 15;
                  const isHighlight = p.val > 0 || p.isCurrent;
                  const radius = p.isPeak
                    ? isDense
                      ? 4
                      : 5
                    : isDense
                      ? p.val > 0
                        ? 2.5
                        : 1.8
                      : isHighlight
                        ? 4
                        : 2;
                  const strokeW = p.isPeak
                    ? 2
                    : isDense
                      ? 1.2
                      : isHighlight
                        ? 2.2
                        : 1;

                  return (
                    <Circle
                      key={`rev-pt-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={radius}
                      fill={
                        p.isPeak
                          ? THEME.darkRose
                          : isHighlight
                            ? "#FFFFFF"
                            : THEME.trackBg
                      }
                      stroke={isHighlight ? THEME.darkRose : THEME.trackBg}
                      strokeWidth={strokeW}
                    />
                  );
                })}

              {/* Profit Markers (Only where profit > 0 to keep baseline clean) */}
              {chartSeries.profit &&
                graphData.profitPoints.map((p, i) => {
                  if (p.val <= 0) return null;
                  const isDense = graphData.buckets.length > 15;
                  return (
                    <Circle
                      key={`prof-pt-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={isDense ? 2.5 : 3.5}
                      fill="#FFFFFF"
                      stroke={THEME.deepBerry}
                      strokeWidth={isDense ? 1.5 : 2}
                    />
                  );
                })}

              {/* Expense Markers (Only where expense > 0 to avoid overlapping 0-revenue baseline with grey dots!) */}
              {chartSeries.expenses &&
                graphData.expPoints.map((p, i) => {
                  if (p.val <= 0) return null; // FIX: eliminates grey dot inside lowest revenue circle!
                  const isDense = graphData.buckets.length > 15;
                  return (
                    <Circle
                      key={`exp-pt-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={isDense ? 2 : 2.5}
                      fill={THEME.textMuted}
                    />
                  );
                })}
            </Svg>

            {/* Dynamic X-Axis Labels: Days for 7D, Slanted Dates 1..31 for Month, Months for Year */}
            <View
              style={[
                styles.chartAxisRow,
                periodType === "For the Month" && styles.chartAxisRowMonth,
              ]}
            >
              {graphData.buckets.map((b) => (
                <View
                  key={b.key}
                  style={
                    periodType === "For the Month"
                      ? styles.axisLabelSlotMonth
                      : styles.axisLabelSlot
                  }
                >
                  <Text
                    style={[
                      styles.axisLabel,
                      periodType === "For the Month" && styles.axisLabelSlanted,
                      b.isCurrent && styles.axisLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {b.displayLabel !== undefined ? b.displayLabel : b.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Table-like Legend Summary at Bottom with Minimum Gap */}
            <View style={styles.chartTableSection}>
              {/* Revenue Row */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleSeries("revenue")}
                style={[
                  styles.chartTableRow,
                  !chartSeries.revenue && styles.legendItemInactive,
                ]}
              >
                <View style={styles.chartTableLeft}>
                  <View
                    style={[
                      styles.chartTableDot,
                      {
                        backgroundColor: chartSeries.revenue
                          ? THEME.darkRose
                          : "#D1D5DB",
                      },
                    ]}
                  />
                  <Text style={styles.chartTableLabel}>Revenue</Text>
                </View>
                <Text
                  style={[
                    styles.chartTableAmount,
                    {
                      color: chartSeries.revenue
                        ? THEME.darkRose
                        : THEME.textMuted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  ₹
                  {grossRevenue >= 100000
                    ? formatCompact(grossRevenue)
                    : grossRevenue.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                </Text>
              </TouchableOpacity>

              <View style={styles.chartTableDivider} />

              {/* Profit Row */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleSeries("profit")}
                style={[
                  styles.chartTableRow,
                  !chartSeries.profit && styles.legendItemInactive,
                ]}
              >
                <View style={styles.chartTableLeft}>
                  <View
                    style={[
                      styles.chartTableDot,
                      {
                        backgroundColor: chartSeries.profit
                          ? THEME.deepBerry
                          : "#D1D5DB",
                      },
                    ]}
                  />
                  <Text style={styles.chartTableLabel}>Profit</Text>
                </View>
                <Text
                  style={[
                    styles.chartTableAmount,
                    {
                      color: chartSeries.profit
                        ? THEME.deepBerry
                        : THEME.textMuted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  ₹
                  {netProfit >= 100000
                    ? formatCompact(netProfit)
                    : netProfit.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                </Text>
              </TouchableOpacity>

              <View style={styles.chartTableDivider} />

              {/* Expenses Row */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleSeries("expenses")}
                style={[
                  styles.chartTableRow,
                  !chartSeries.expenses && styles.legendItemInactive,
                ]}
              >
                <View style={styles.chartTableLeft}>
                  <View
                    style={[
                      styles.chartTableDot,
                      {
                        backgroundColor: chartSeries.expenses
                          ? THEME.textMuted
                          : "#D1D5DB",
                      },
                    ]}
                  />
                  <Text style={styles.chartTableLabel}>Expenses</Text>
                </View>
                <Text
                  style={[
                    styles.chartTableAmount,
                    {
                      color: chartSeries.expenses ? THEME.textMuted : "#C0B2B8",
                    },
                  ]}
                  numberOfLines={1}
                >
                  ₹
                  {totalExpenses >= 100000
                    ? formatCompact(totalExpenses)
                    : totalExpenses.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                </Text>
              </TouchableOpacity>

              {monthlyGoalTarget > 0 ? (
                <>
                  <View style={styles.chartTableDivider} />
                  {/* Goal Row */}
                  <View style={styles.chartTableRow}>
                    <View style={styles.chartTableLeft}>
                      <View style={styles.dashedIndicatorSmall} />
                      <Text style={styles.chartTableLabel}>Goal</Text>
                    </View>
                    <Text
                      style={[
                        styles.chartTableAmount,
                        { color: THEME.darkRose },
                      ]}
                      numberOfLines={1}
                    >
                      ₹
                      {monthlyGoalTarget >= 100000
                        ? formatCompact(monthlyGoalTarget)
                        : monthlyGoalTarget.toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* Expense Breakdown */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Expense Breakdown</Text>
              <Text style={styles.cardSubtitle}>
                Total ₹
                {totalExpenses.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {periodInfo.periodLabel}
              </Text>
            </View>

            {/* Header Actions */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <TouchableOpacity
                onPress={() => router.push("/expenses" as any)}
                activeOpacity={0.8}
                style={[styles.addExpenseBtn, { backgroundColor: "#FFFFFF" }]}
              >
                <Feather name="list" size={13} color={THEME.darkRose} />
                <Text style={styles.addExpenseBtnText}>Manage</Text>
              </TouchableOpacity>

              {/* Add Expense Button */}
              <TouchableOpacity
                onPress={() => setShowAddExpense(true)}
                activeOpacity={0.8}
                style={styles.addExpenseBtn}
              >
                <Feather name="plus" size={14} color={THEME.darkRose} />
                <Text style={styles.addExpenseBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Conditional 2 States: Empty vs Non-Empty */}
          {expenseBreakdown.length === 0 ? (
            /* State 1: Zero Expenses Empty State */
            <View style={styles.zeroExpenseBox}>
              <View style={styles.zeroReceiptIconWrap}>
                <Feather name="file-text" size={20} color={THEME.darkRose} />
              </View>
              <Text style={styles.zeroTitle}>
                No expenses recorded {periodInfo.periodLabel}
              </Text>
              <Text style={styles.zeroDescription}>
                Log raw materials, packaging, delivery or operational bills to
                track net profit in real time.
              </Text>
            </View>
          ) : (
            /* State 2: Expenses > 0 Breakdown */
            <View>
              {/* Segmented Bar Track */}
              <View style={styles.segmentedBarTrack}>
                {expenseBreakdown.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.segment,
                      {
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                        borderTopLeftRadius: index === 0 ? 6 : 0,
                        borderBottomLeftRadius: index === 0 ? 6 : 0,
                        borderTopRightRadius:
                          index === expenseBreakdown.length - 1 ? 6 : 0,
                        borderBottomRightRadius:
                          index === expenseBreakdown.length - 1 ? 6 : 0,
                        marginRight:
                          index < expenseBreakdown.length - 1 ? 2 : 0,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Categories Legend Grid */}
              <View style={styles.legendGrid}>
                {expenseBreakdown.map((item) => (
                  <View key={item.id} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={styles.legendLabel}>
                      {item.name}{" "}
                      <Text
                        style={[styles.legendAmount, { color: item.color }]}
                      >
                        {item.amountFormatted} ({item.percentage}%)
                      </Text>
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Top 5 Customers Section */}
        <View style={styles.customerSection}>
          <View style={styles.customerHeaderRow}>
            <Text style={styles.cardTitle}>Top 5 Customers</Text>
            <TouchableOpacity
              onPress={() => router.push("/customers" as any)}
              activeOpacity={0.8}
              style={styles.analyticsLinkBtn}
            >
              <Text style={styles.analyticsLinkText}>Customers</Text>
              <Feather name="arrow-up-right" size={14} color={THEME.darkRose} />
            </TouchableOpacity>
          </View>
          <Text style={styles.customerSubheader}>
            Leading revenue drivers {periodInfo.periodLabel}
          </Text>

          {top5Customers.length === 0 ? (
            <View style={styles.zeroExpenseBox}>
              <View style={styles.zeroReceiptIconWrap}>
                <Feather name="users" size={20} color={THEME.darkRose} />
              </View>
              <Text style={styles.zeroTitle}>
                No customer orders {periodInfo.periodLabel}
              </Text>
              <Text style={styles.zeroDescription}>
                Orders recorded during this period will automatically rank your
                highest value customers here.
              </Text>
            </View>
          ) : (
            <View style={styles.customerList}>
              {top5Customers.map((cust, idx) => (
                <TouchableOpacity
                  key={cust.id || `${cust.name}-${idx}`}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (cust.id) {
                      router.push(`/customers/${cust.id}` as any);
                    } else {
                      router.push("/customers" as any);
                    }
                  }}
                  style={styles.customerCard}
                >
                  <View style={styles.customerInfoLeft}>
                    {/* Rank Badge */}
                    <View
                      style={
                        idx === 0 ? styles.rankBadgeFirst : styles.rankBadge
                      }
                    >
                      <Text
                        style={
                          idx === 0 ? styles.rankTextFirst : styles.rankText
                        }
                      >
                        #{idx + 1}
                      </Text>
                    </View>

                    {/* Customer Avatar */}
                    <View style={styles.customerAvatar}>
                      <Text style={styles.customerAvatarText}>
                        {getInitials(cust.name)}
                      </Text>
                    </View>

                    <View style={styles.customerMetaWrap}>
                      <View style={styles.customerNameRow}>
                        <Text style={styles.customerName} numberOfLines={1}>
                          {cust.name}
                        </Text>
                      </View>
                      <Text style={styles.customerEmail} numberOfLines={1}>
                        {cust.orderCount}{" "}
                        {cust.orderCount === 1 ? "order" : "orders"}
                        {cust.contact ? ` • ${cust.contact}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.customerAmountWrap}>
                    <Text style={styles.customerAmount}>
                      ₹
                      {cust.totalSpent.toLocaleString("en-IN", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal 1: Period Type Picker */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTypeModal(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Timeframe</Text>
              <TouchableOpacity
                onPress={() => setShowTypeModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalOptionsList}>
              {(
                [
                  { key: "This Week", desc: "Past 7 days up to today" },
                  {
                    key: "For the Month",
                    desc: "Select and view any specific month",
                  },
                  {
                    key: "For the Year",
                    desc: "Select and view any annual run",
                  },
                  {
                    key: "All Time",
                    desc: "All historical sales & expenses",
                  },
                ] as const
              ).map((opt) => {
                const isSelected = periodType === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.7}
                    onPress={() => {
                      setPeriodType(opt.key);
                      setShowTypeModal(false);
                    }}
                    style={[
                      styles.modalOptionItem,
                      isSelected && styles.modalOptionItemActive,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modalOptionText,
                          isSelected && styles.modalOptionTextActive,
                        ]}
                      >
                        {opt.key}
                      </Text>
                      <Text style={styles.modalOptionDesc}>{opt.desc}</Text>
                    </View>
                    {isSelected && (
                      <Feather name="check" size={18} color={THEME.darkRose} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 2: Month Picker */}
      <Modal
        visible={showMonthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMonthModal(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month</Text>
              <TouchableOpacity
                onPress={() => setShowMonthModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalOptionsList}>
                {availableMonths.map((ym) => {
                  const isSelected = selectedMonth === ym;
                  return (
                    <TouchableOpacity
                      key={ym}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedMonth(ym);
                        setShowMonthModal(false);
                      }}
                      style={[
                        styles.modalOptionItem,
                        isSelected && styles.modalOptionItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          isSelected && styles.modalOptionTextActive,
                        ]}
                      >
                        {formatMonthDisplay(ym)}
                      </Text>
                      {isSelected && (
                        <Feather
                          name="check"
                          size={18}
                          color={THEME.darkRose}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 3: Year Picker */}
      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowYearModal(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Year</Text>
              <TouchableOpacity
                onPress={() => setShowYearModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 280 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalOptionsList}>
                {availableYears.map((yr) => {
                  const isSelected = selectedYear === yr;
                  return (
                    <TouchableOpacity
                      key={yr}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedYear(yr);
                        setShowYearModal(false);
                      }}
                      style={[
                        styles.modalOptionItem,
                        isSelected && styles.modalOptionItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          isSelected && styles.modalOptionTextActive,
                        ]}
                      >
                        {yr}
                      </Text>
                      {isSelected && (
                        <Feather
                          name="check"
                          size={18}
                          color={THEME.darkRose}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 4: Chart Series Filter */}
      <Modal
        visible={showChartSeriesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChartSeriesModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowChartSeriesModal(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Chart Series</Text>
                <Text style={styles.modalSubtitle}>
                  Select metrics to display on the graph
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowChartSeriesModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalOptionsList}>
              {[
                {
                  key: "revenue" as const,
                  label: "Revenue",
                  color: THEME.darkRose,
                  desc: "Incoming gross sales across the period",
                },
                {
                  key: "profit" as const,
                  label: "Profit",
                  color: THEME.deepBerry,
                  desc: "Net margin (Revenue minus Expenses)",
                },
                {
                  key: "expenses" as const,
                  label: "Expenses",
                  color: THEME.textMuted,
                  desc: "Operating costs and material expenses",
                },
              ].map((item) => {
                const isActive = chartSeries[item.key];
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.7}
                    onPress={() => toggleSeries(item.key)}
                    style={[
                      styles.modalOptionItem,
                      isActive && styles.modalOptionItemActive,
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: item.color,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.modalOptionText,
                            isActive && styles.modalOptionTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text style={styles.modalOptionDesc}>{item.desc}</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.seriesCheckbox,
                        isActive && styles.seriesCheckboxActive,
                      ]}
                    >
                      {isActive && (
                        <Feather name="check" size={13} color="#FFFFFF" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Expense Modal */}
      <AddExpenseModal
        visible={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        onSave={handleSaveExpense}
      />
      <ChatBubble />
    </View>
  );
};

// --- Stylesheet ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.darkRose,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginTop: 2,
    letterSpacing: -0.4,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  /* Seamless Sales Selector Bar */
  salesSelectorCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    // backgroundColor: "#FFFFFF",
    // borderRadius: 8,
    // borderWidth: 1,
    // borderColor: THEME.cardBorder,
    // paddingHorizontal: 18,
    // gap: 6,
    // elevation: 1,
  },
  salesSelectorPrefix: {
    borderWidth: 1,
    borderColor: "#F5BDCC",
    borderBottomRightRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 6,
    borderTopLeftRadius: 6,
    borderRightWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 15,
    fontWeight: "500",
    color: THEME.textSecondary,
    letterSpacing: 0.1,
  },
  salesSelectorPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF0F4",
    borderWidth: 1,
    borderColor: "#F5BDCC",
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    gap: 8,
  },
  salesLastSelectorPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF0F4",
    borderWidth: 1,
    borderColor: "#F5BDCC",
    borderBottomRightRadius: 5,
    borderTopRightRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    gap: 8,
  },
  salesSelectorPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: THEME.darkRose,
  },
  salesSelectorOfText: {
    borderWidth: 1,
    borderColor: "#F5BDCC",
    borderRightWidth: 0,
    borderLeftWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 14,
    fontWeight: "500",
    color: THEME.textSecondary,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: THEME.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#FCE4EC",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  modalOptionsList: {
    gap: 8,
  },
  modalOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FAF7F8",
    borderWidth: 1,
    borderColor: "#F5D0DB",
  },
  modalOptionItemActive: {
    backgroundColor: "#FFEAF0",
    borderColor: THEME.darkRose,
    borderWidth: 1.5,
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  modalOptionTextActive: {
    fontWeight: "800",
    color: THEME.darkRose,
  },
  modalOptionDesc: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 2,
  },
  modalSubtitle: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 2,
  },
  chartSeriesBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF0F4",
    borderWidth: 1,
    borderColor: "#F5BDCC",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    gap: 5,
  },
  chartSeriesBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.darkRose,
  },
  legendItemInactive: {
    opacity: 0.35,
  },
  seriesCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  seriesCheckboxActive: {
    backgroundColor: THEME.darkRose,
    borderColor: THEME.darkRose,
  },

  /* Legacy Tab Bar Fallbacks if needed */
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FBE6ED",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F5D0DB",
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: THEME.darkRose,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  heroCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dollarIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: THEME.accentPinkLight,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.textSecondary,
    letterSpacing: 0.6,
  },
  growthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  growthText: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.positiveText,
  },
  heroRevenueValue: {
    fontSize: 30,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginTop: 12,
    letterSpacing: -0.5,
  },
  heroSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
    flexWrap: "wrap",
  },
  heroSubItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textMuted,
  },
  heroSubValueGrey: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8E8E93",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  heroSubDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: THEME.cardBorder,
  },
  heroSubValue: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  heroSubUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: THEME.textSecondary,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  goalSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorderSubtle,
  },
  goalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  goalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  goalTargetText: {
    fontSize: 12,
    color: THEME.textSecondary,
  },
  boldDarkText: {
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  dateRangeText: {
    fontSize: 11,
    color: THEME.darkRose,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.trackBg,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: THEME.darkRose,
  },
  goalFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  goalSubText: {
    fontSize: 11,
    color: THEME.textSecondary,
    fontWeight: "500",
  },
  goalRemainingText: {
    fontSize: 11,
    color: THEME.darkRose,
    fontWeight: "700",
  },
  goalEmptyBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.accentPinkLight,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  goalEmptyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  goalEmptyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.accentPinkLight,
    justifyContent: "center",
    alignItems: "center",
  },
  goalEmptyTextGroup: {
    flex: 1,
  },
  goalEmptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textMuted,
  },
  goalEmptyDesc: {
    fontSize: 11,
    color: THEME.textMuted,
    marginTop: 3,
  },
  setGoalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  setGoalBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    justifyContent: "space-between",
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  kpiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kpiIconWrapProfit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.accentPinkLight,
    justifyContent: "center",
    alignItems: "center",
  },
  kpiIconWrapNeutral: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  circularContainer: {
    width: 32,
    height: 32,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  circularLabelWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  circularLabelText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  kpiCardBody: {
    marginTop: 14,
  },
  kpiLabel: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: "600",
  },
  kpiValue: {
    fontSize: 19,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginTop: 2,
  },
  kpiFootnote: {
    fontSize: 11,
    color: THEME.textMuted,
    marginTop: 2,
    fontWeight: "500",
  },
  card: {
    backgroundColor: THEME.cardBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.textPrimary,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 2,
  },
  chartTableSection: {
    flexDirection: "column",
    paddingTop: 8,
    paddingBottom: 2,
    paddingHorizontal: 4,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorderSubtle,
  },
  chartTableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  chartTableCol: {
    flex: 1,
  },
  chartTableLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chartTableLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chartTableDot: {
    width: 18,
    height: 10,
    borderRadius: 5,
  },
  chartTableLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  chartTableAmount: {
    fontSize: 16,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  chartTableDivider: {
    height: 1,
    backgroundColor: "#FCE4EC",
    width: "100%",
  },
  dashedIndicatorSmall: {
    width: 18,
    height: 2,
    borderTopWidth: 2,
    borderTopColor: THEME.darkRose,
    borderStyle: "dashed",
  },
  chartWrapper: {
    marginTop: 4,
  },
  chartAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginTop: 4,
  },
  chartAxisRowMonth: {
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  axisLabelSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  axisLabelSlotMonth: {
    width: 8.5,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  axisLabel: {
    fontSize: 11,
    color: THEME.textMuted,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  axisLabelSlanted: {
    fontSize: 7.5,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    transform: [{ rotate: "-45deg" }],
    width: 14,
    textAlign: "center",
    marginTop: 2,
  },
  axisLabelActive: {
    color: THEME.darkRose,
    fontWeight: "800",
  },
  addExpenseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: THEME.accentPinkLight,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addExpenseBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.darkRose,
  },
  zeroExpenseBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.bg,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  zeroReceiptIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.accentPinkLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  zeroTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  zeroDescription: {
    fontSize: 11,
    color: THEME.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
    maxWidth: 260,
  },
  customerSection: {
    gap: 4,
  },
  customerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  analyticsLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  analyticsLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.darkRose,
  },
  customerSubheader: {
    fontSize: 12,
    color: THEME.textSecondary,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  customerList: {
    gap: 10,
    marginTop: 4,
  },
  customerCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  customerInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  rankBadgeFirst: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.darkRose,
    justifyContent: "center",
    alignItems: "center",
  },
  rankTextFirst: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.accentPinkLight,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    color: THEME.darkRose,
    fontSize: 11,
    fontWeight: "700",
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.accentPinkLight,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  customerAvatarText: {
    color: THEME.darkRose,
    fontSize: 12,
    fontWeight: "700",
  },
  customerMetaWrap: {
    flexShrink: 1,
  },
  customerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  customerName: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  customerEmail: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 1,
  },
  customerAmountWrap: {
    alignItems: "flex-end",
  },
  customerAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  customerFrequency: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: THEME.darkRose,
    marginTop: 1,
    fontWeight: "600",
  },
  segmentedBarTrack: {
    flexDirection: "row",
    height: 10,
    width: "100%",
    backgroundColor: THEME.trackBg,
    borderRadius: 6,
    marginTop: 14,
    overflow: "hidden",
  },
  segment: {
    height: "100%",
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    gap: 12,
    rowGap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    color: THEME.textPrimary,
    fontWeight: "500",
  },
  legendAmount: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});

export default BusinessInsightsScreen;
