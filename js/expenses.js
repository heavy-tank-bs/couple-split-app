(function () {
  "use strict";

  const STORAGE_KEY = "coupleSplitApp.data.v1";
  const DEFAULT_COLORS = ["#0f766e", "#b45309", "#2563eb", "#be123c", "#4d7c0f"];

  const defaultData = {
    meta: {
      appVersion: "1.0.0",
      updatedAt: new Date().toISOString(),
    },
    settings: {
      currency: "JPY",
    },
    people: [
      { id: "person-a", name: "Aさん", share: 50, color: "#0f766e" },
      { id: "person-b", name: "Bさん", share: 50, color: "#b45309" },
    ],
    expenses: [
      {
        id: "exp-sample-1",
        date: getToday(),
        item: "スーパー",
        category: "食費",
        amount: 4200,
        payerId: "person-a",
        splitMode: "default",
        shares: {},
      },
      {
        id: "exp-sample-2",
        date: getToday(),
        item: "日用品",
        category: "日用品",
        amount: 1800,
        payerId: "person-b",
        splitMode: "custom",
        shares: {
          "person-a": 70,
          "person-b": 30,
        },
      },
    ],
  };

  const state = {
    data: loadStoredData(),
  };

  const els = {
    status: document.querySelector("#ledgerStatus"),
    monthFilter: document.querySelector("#ledgerMonthFilter"),
    monthTitle: document.querySelector("#ledgerMonthTitle"),
    monthChips: document.querySelector("#monthChips"),
    metrics: document.querySelector("#ledgerMetrics"),
    trendBars: document.querySelector("#trendBars"),
    payerBars: document.querySelector("#payerBars"),
    categoryBars: document.querySelector("#ledgerCategoryBars"),
    splitModeBars: document.querySelector("#splitModeBars"),
    expenseCount: document.querySelector("#ledgerExpenseCount"),
    expenseTable: document.querySelector("#ledgerExpenseTable"),
    emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
  };

  init();

  function init() {
    const months = getAvailableMonths();
    els.monthFilter.value = months[0] || toMonthKey(getToday());
    els.monthFilter.addEventListener("change", render);
    els.monthChips.addEventListener("click", handleMonthChipClick);
    els.expenseTable.addEventListener("click", handleExpenseAction);
    window.addEventListener("storage", handleStorageEvent);
    render();
    loadBundledDataIfNeeded();
  }

  function handleMonthChipClick(event) {
    const button = event.target.closest("button[data-month]");
    if (!button) return;

    els.monthFilter.value = button.dataset.month;
    render();
  }

  function handleExpenseAction(event) {
    const button = event.target.closest("button[data-expense-action]");
    if (!button) return;

    if (button.dataset.expenseAction === "delete") {
      state.data.expenses = state.data.expenses.filter((expense) => expense.id !== button.dataset.id);
      touchAndStore();
      render();
      setStatus("支出を削除しました", "success");
    }
  }

  function handleStorageEvent(event) {
    if (event.key !== STORAGE_KEY) return;

    state.data = loadStoredData();
    render();
    setStatus("ローカルデータを更新しました", "success");
  }

  function render() {
    normalizeData();

    const months = getAvailableMonths();
    const selectedMonth = els.monthFilter.value || months[0] || toMonthKey(getToday());
    els.monthFilter.value = selectedMonth;

    const monthlyExpenses = state.data.expenses
      .filter((expense) => toMonthKey(expense.date) === selectedMonth)
      .sort((a, b) => b.date.localeCompare(a.date));
    const summary = calculateMonthlySummary(monthlyExpenses);

    els.monthTitle.textContent = `${formatMonthLabel(selectedMonth)}の支出`;
    renderMonthChips(months, selectedMonth);
    renderMetrics(summary);
    renderTrend(months);
    renderBars(els.payerBars, summary.byPayer, summary.total, "この月の支払者別データはまだありません");
    renderBars(els.categoryBars, summary.byCategory, summary.total, "この月のカテゴリ別データはまだありません");
    renderBars(els.splitModeBars, summary.bySplitMode, summary.total, "この月の負担方法別データはまだありません");
    renderExpenses(monthlyExpenses);
  }

  function renderMonthChips(months, selectedMonth) {
    if (!months.length) {
      els.monthChips.innerHTML = "";
      return;
    }

    els.monthChips.innerHTML = months
      .map(
        (month) => `
          <button type="button" class="month-chip ${month === selectedMonth ? "is-active" : ""}" data-month="${escapeHtml(month)}">
            ${escapeHtml(formatMonthLabel(month))}
          </button>
        `,
      )
      .join("");
  }

  function renderMetrics(summary) {
    const largestCategory = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1])[0];
    const largestPayer = Object.entries(summary.byPayer).sort((a, b) => b[1] - a[1])[0];
    const average = summary.count ? Math.round(summary.total / summary.count) : 0;

    els.metrics.innerHTML = `
      <article class="metric">
        <span>月合計</span>
        <strong>${formatMoney(summary.total)}</strong>
        <em>${summary.count}件の支出</em>
      </article>
      <article class="metric">
        <span>平均単価</span>
        <strong>${formatMoney(average)}</strong>
        <em>1件あたり</em>
      </article>
      <article class="metric">
        <span>最多カテゴリ</span>
        <strong>${escapeHtml(largestCategory ? largestCategory[0] : "-")}</strong>
        <em>${largestCategory ? formatMoney(largestCategory[1]) : formatMoney(0)}</em>
      </article>
      <article class="metric">
        <span>最も支払った人</span>
        <strong>${escapeHtml(largestPayer ? largestPayer[0] : "-")}</strong>
        <em>${largestPayer ? formatMoney(largestPayer[1]) : formatMoney(0)}</em>
      </article>
    `;
  }

  function renderTrend(months) {
    if (!months.length) {
      els.trendBars.innerHTML = "";
      els.trendBars.appendChild(emptyState("支出を登録すると月別推移が表示されます"));
      return;
    }

    const totals = months.map((month) => ({
      month,
      total: sum(state.data.expenses.filter((expense) => toMonthKey(expense.date) === month).map((expense) => expense.amount)),
    }));
    const maxTotal = Math.max(...totals.map((item) => item.total), 1);

    els.trendBars.innerHTML = totals
      .map((item) => {
        const width = Math.max(3, (item.total / maxTotal) * 100);
        return `
          <button type="button" class="trend-row" data-month="${escapeHtml(item.month)}">
            <span>${escapeHtml(formatMonthLabel(item.month))}</span>
            <strong>${formatMoney(item.total)}</strong>
            <i aria-hidden="true"><b style="width:${width}%"></b></i>
          </button>
        `;
      })
      .join("");

    els.trendBars.querySelectorAll("button[data-month]").forEach((button) => {
      button.addEventListener("click", () => {
        els.monthFilter.value = button.dataset.month;
        render();
      });
    });
  }

  function renderBars(container, entriesObject, total, emptyMessage) {
    const entries = Object.entries(entriesObject).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      container.innerHTML = "";
      container.appendChild(emptyState(emptyMessage));
      return;
    }

    container.innerHTML = entries
      .map(([label, amount]) => {
        const rate = total ? (amount / total) * 100 : 0;
        return `
          <div class="category-row">
            <div class="bar-row-head">
              <strong>${escapeHtml(label)}</strong>
              <span>${formatPercent(rate)} / ${formatMoney(amount)}</span>
            </div>
            <div class="bar-track" aria-hidden="true">
              <div class="bar-fill" style="width:${Math.max(3, rate)}%"></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderExpenses(expenses) {
    els.expenseCount.textContent = `${expenses.length}件`;

    if (!expenses.length) {
      els.expenseTable.innerHTML = `
        <tr>
          <td colspan="7" class="empty-cell">${emptyStateHtml("この月の支出はまだありません")}</td>
        </tr>
      `;
      return;
    }

    els.expenseTable.innerHTML = expenses
      .map((expense) => {
        const payer = getPerson(expense.payerId);
        const splitMode = expense.splitMode === "custom" ? "個別割合" : "登録割合";
        return `
          <tr>
            <td data-label="日付">${escapeHtml(expense.date)}</td>
            <td data-label="項目">${escapeHtml(expense.item)}</td>
            <td data-label="カテゴリ"><span class="tag">${escapeHtml(expense.category)}</span></td>
            <td data-label="支払">${escapeHtml(payer ? payer.name : "不明")}</td>
            <td data-label="負担方法">${escapeHtml(splitMode)}</td>
            <td class="num" data-label="金額">${formatMoney(expense.amount)}</td>
            <td class="num" data-label="操作">
              <button class="icon-btn danger-btn" type="button" data-expense-action="delete" data-id="${escapeHtml(expense.id)}">削除</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function calculateMonthlySummary(expenses) {
    const byCategory = {};
    const byPayer = {};
    const bySplitMode = {};
    let total = 0;

    for (const expense of expenses) {
      const amount = Number(expense.amount) || 0;
      const payer = getPerson(expense.payerId);
      const splitMode = expense.splitMode === "custom" ? "個別割合" : "登録割合";
      total += amount;
      byCategory[expense.category] = (byCategory[expense.category] || 0) + amount;
      byPayer[payer ? payer.name : "不明"] = (byPayer[payer ? payer.name : "不明"] || 0) + amount;
      bySplitMode[splitMode] = (bySplitMode[splitMode] || 0) + amount;
    }

    return {
      total,
      count: expenses.length,
      byCategory,
      byPayer,
      bySplitMode,
    };
  }

  function getAvailableMonths() {
    const months = Array.from(new Set(state.data.expenses.map((expense) => toMonthKey(expense.date))));
    return months.sort((a, b) => b.localeCompare(a));
  }

  function normalizeData() {
    state.data = validateData(state.data);
  }

  async function loadBundledDataIfNeeded() {
    if (localStorage.getItem(STORAGE_KEY) || window.location.protocol === "file:") {
      return;
    }

    try {
      const response = await fetch("data/split-data.json", { cache: "no-store" });
      if (!response.ok) return;

      state.data = validateData(await response.json());
      storeData();
      render();
      setStatus("同梱JSONを読み込みました", "success");
    } catch (_) {
      // 静的配信環境によってはローカルJSON取得ができないため、初期データのまま続行します。
    }
  }

  function validateData(input) {
    const data = structuredClone(input || {});
    data.meta = data.meta || {};
    data.settings = data.settings || {};
    data.people = Array.isArray(data.people) ? data.people : [];
    data.expenses = Array.isArray(data.expenses) ? data.expenses : [];

    data.people = data.people.map((person, index) => ({
      id: String(person.id || createId("person")),
      name: String(person.name || `担当者${index + 1}`),
      share: clamp(Number(person.share || 0), 0, 100),
      color: /^#[0-9a-fA-F]{6}$/.test(person.color || "") ? person.color : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    }));

    const validIds = new Set(data.people.map((person) => person.id));
    data.expenses = data.expenses
      .map((expense) => ({
        id: String(expense.id || createId("exp")),
        date: /^\d{4}-\d{2}-\d{2}$/.test(expense.date || "") ? expense.date : getToday(),
        item: String(expense.item || "未入力"),
        category: String(expense.category || "その他"),
        amount: Math.max(0, Math.round(Number(expense.amount || 0))),
        payerId: String(expense.payerId || ""),
        splitMode: expense.splitMode === "custom" ? "custom" : "default",
        shares: typeof expense.shares === "object" && expense.shares ? expense.shares : {},
      }))
      .filter((expense) => validIds.has(expense.payerId) && expense.amount > 0);

    return data;
  }

  function touchAndStore() {
    state.data.meta = {
      ...(state.data.meta || {}),
      appVersion: "1.0.0",
      updatedAt: new Date().toISOString(),
    };
    storeData();
  }

  function storeData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  function loadStoredData() {
    const stored = safeJsonParse(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      return validateData(stored);
    }
    return validateData(defaultData);
  }

  function getPerson(id) {
    return state.data.people.find((person) => person.id === id);
  }

  function emptyState(message) {
    const fragment = els.emptyStateTemplate.content.cloneNode(true);
    fragment.querySelector("span").textContent = message;
    return fragment;
  }

  function emptyStateHtml(message) {
    return `
      <div class="empty-state">
        <strong>まだデータがありません</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function setStatus(message, type = "") {
    els.status.textContent = message;
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
  }

  function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function toMonthKey(dateString) {
    return String(dateString || getToday()).slice(0, 7);
  }

  function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-");
    return `${year}年${Number(month)}月`;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(Math.round(Number(value) || 0));
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(0)}%`;
  }

  function sum(values) {
    return values.reduce((total, value) => total + Number(value || 0), 0);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safeJsonParse(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
