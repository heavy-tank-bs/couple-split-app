(function () {
  "use strict";

  const STORAGE_KEY = "coupleSplitApp.data.v1";
  const CONFIG_KEY = "coupleSplitApp.github.v1";
  const DEFAULT_COLORS = ["#0f766e", "#b45309", "#2563eb", "#be123c", "#4d7c0f"];
  const hadStoredData = Boolean(localStorage.getItem(STORAGE_KEY));

  const defaultData = {
    meta: {
      appVersion: "1.0.0",
      updatedAt: new Date().toISOString(),
    },
    settings: {
      currency: "JPY",
      github: {
        owner: "",
        repo: "",
        branch: "main",
        path: "data/split-data.json",
      },
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
    githubSha: "",
  };

  const els = {
    syncStatus: document.querySelector("#syncStatus"),
    shareTotalNote: document.querySelector("#shareTotalNote"),
    memberForm: document.querySelector("#memberForm"),
    memberId: document.querySelector("#memberId"),
    memberName: document.querySelector("#memberName"),
    memberShare: document.querySelector("#memberShare"),
    memberColor: document.querySelector("#memberColor"),
    memberSubmit: document.querySelector("#memberSubmit"),
    memberCancel: document.querySelector("#memberCancel"),
    memberList: document.querySelector("#memberList"),
    expenseForm: document.querySelector("#expenseForm"),
    expenseDate: document.querySelector("#expenseDate"),
    expenseItem: document.querySelector("#expenseItem"),
    expenseCategory: document.querySelector("#expenseCategory"),
    expenseAmount: document.querySelector("#expenseAmount"),
    expensePayer: document.querySelector("#expensePayer"),
    customShares: document.querySelector("#customShares"),
    monthFilter: document.querySelector("#monthFilter"),
    monthTitle: document.querySelector("#monthTitle"),
    metricsGrid: document.querySelector("#metricsGrid"),
    settlementStatus: document.querySelector("#settlementStatus"),
    settlementList: document.querySelector("#settlementList"),
    ratioBars: document.querySelector("#ratioBars"),
    categoryBars: document.querySelector("#categoryBars"),
    expenseCount: document.querySelector("#expenseCount"),
    expenseTable: document.querySelector("#expenseTable"),
    githubForm: document.querySelector("#githubForm"),
    githubOwner: document.querySelector("#githubOwner"),
    githubRepo: document.querySelector("#githubRepo"),
    githubBranch: document.querySelector("#githubBranch"),
    githubPath: document.querySelector("#githubPath"),
    githubToken: document.querySelector("#githubToken"),
    githubSha: document.querySelector("#githubSha"),
    loadGithub: document.querySelector("#loadGithub"),
    saveGithub: document.querySelector("#saveGithub"),
    popupStack: document.querySelector("#popupStack"),
    emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
  };

  init();

  function init() {
    const savedConfig = safeJsonParse(localStorage.getItem(CONFIG_KEY));
    const github = savedConfig || state.data.settings.github || defaultData.settings.github;

    els.expenseDate.value = getToday();
    els.monthFilter.value = toMonthKey(getToday());
    els.githubOwner.value = github.owner || "";
    els.githubRepo.value = github.repo || "";
    els.githubBranch.value = github.branch || "main";
    els.githubPath.value = github.path || "data/split-data.json";
    els.githubToken.value = github.token || "";

    bindEvents();
    render();
    loadBundledDataIfNeeded();
  }

  function bindEvents() {
    els.memberForm.addEventListener("submit", handleMemberSubmit);
    els.memberCancel.addEventListener("click", resetMemberForm);
    els.memberList.addEventListener("click", handleMemberAction);
    els.expenseForm.addEventListener("submit", handleExpenseSubmit);
    els.expenseForm.addEventListener("change", handleSplitModeChange);
    if (els.expenseTable) {
      els.expenseTable.addEventListener("click", handleExpenseAction);
    }
    els.monthFilter.addEventListener("change", render);
    els.githubForm.addEventListener("input", saveGithubConfig);
    els.loadGithub.addEventListener("click", loadFromGithub);
    els.saveGithub.addEventListener("click", saveToGithub);
  }

  function handleMemberSubmit(event) {
    event.preventDefault();

    const name = els.memberName.value.trim();
    const share = clamp(Number(els.memberShare.value || 0), 0, 100);
    const color = els.memberColor.value || DEFAULT_COLORS[state.data.people.length % DEFAULT_COLORS.length];

    if (!name) {
      setStatus("名前を入力してください", "error");
      return;
    }

    const editingId = els.memberId.value;
    if (editingId) {
      state.data.people = state.data.people.map((person) =>
        person.id === editingId ? { ...person, name, share, color } : person,
      );
    } else {
      state.data.people.push({
        id: createId("person"),
        name,
        share,
        color,
      });
    }

    touchAndStore();
    resetMemberForm();
    render();
    setStatus("支払い担当を保存しました", "success");
  }

  function handleMemberAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;
    const person = getPerson(id);
    if (!person) return;

    if (action === "edit") {
      els.memberId.value = person.id;
      els.memberName.value = person.name;
      els.memberShare.value = String(person.share);
      els.memberColor.value = person.color;
      els.memberSubmit.textContent = "更新";
      els.memberCancel.classList.remove("hidden");
      els.memberName.focus();
      return;
    }

    if (action === "delete") {
      const isUsed = state.data.expenses.some((expense) => expense.payerId === id);
      if (isUsed) {
        setStatus("支出に使われている担当者は削除できません", "error");
        return;
      }

      state.data.people = state.data.people.filter((item) => item.id !== id);
      touchAndStore();
      render();
      setStatus("支払い担当を削除しました", "success");
    }
  }

  function resetMemberForm() {
    els.memberId.value = "";
    els.memberName.value = "";
    els.memberShare.value = "50";
    els.memberColor.value = DEFAULT_COLORS[state.data.people.length % DEFAULT_COLORS.length];
    els.memberSubmit.textContent = "登録";
    els.memberCancel.classList.add("hidden");
  }

  function handleExpenseSubmit(event) {
    event.preventDefault();

    if (state.data.people.length < 2) {
      setStatus("支払い担当を2人以上登録してください", "error");
      return;
    }

    const splitMode = getSplitMode();
    const shares = splitMode === "custom" ? readCustomShares() : {};
    const amount = Number(els.expenseAmount.value);
    const payerId = els.expensePayer.value;

    if (!payerId || !getPerson(payerId)) {
      setStatus("支払い担当を選択してください", "error");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("値段は1円以上で入力してください", "error");
      return;
    }

    if (splitMode === "custom") {
      const total = sum(Object.values(shares));
      if (Math.abs(total - 100) > 0.01) {
        setStatus("この支出の負担割合は合計100%にしてください", "error");
        return;
      }
    }

    state.data.expenses.push({
      id: createId("exp"),
      date: els.expenseDate.value,
      item: els.expenseItem.value.trim(),
      category: els.expenseCategory.value,
      amount: Math.round(amount),
      payerId,
      splitMode,
      shares,
    });

    touchAndStore();
    els.expenseItem.value = "";
    els.expenseAmount.value = "";
    els.expenseItem.focus();
    render();
    setStatus("支出を登録しました", "success");
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

  function handleSplitModeChange() {
    const isCustom = getSplitMode() === "custom";
    els.customShares.classList.toggle("hidden", !isCustom);
  }

  function render() {
    normalizeData();
    renderMembers();
    renderExpensePayerOptions();
    renderCustomShares();
    renderMonth();
    saveGithubConfig();
  }

  function renderMembers() {
    const shareTotal = sum(state.data.people.map((person) => person.share));
    els.shareTotalNote.textContent = `合計 ${formatPercent(shareTotal)}`;
    els.shareTotalNote.classList.toggle("is-error", Math.abs(shareTotal - 100) > 0.01);
    els.shareTotalNote.classList.toggle("is-success", Math.abs(shareTotal - 100) <= 0.01);

    if (!state.data.people.length) {
      els.memberList.innerHTML = "";
      els.memberList.appendChild(emptyState("支払い担当を登録してください"));
      return;
    }

    els.memberList.innerHTML = state.data.people
      .map(
        (person) => `
          <div class="member-row">
            <span class="member-swatch" style="background:${escapeHtml(person.color)}"></span>
            <div class="member-main">
              <strong>${escapeHtml(person.name)}</strong>
              <span>負担割合 ${formatPercent(person.share)}</span>
            </div>
            <button class="icon-btn" type="button" data-action="edit" data-id="${escapeHtml(person.id)}" aria-label="${escapeHtml(person.name)}を編集">編集</button>
            <button class="icon-btn danger-btn" type="button" data-action="delete" data-id="${escapeHtml(person.id)}" aria-label="${escapeHtml(person.name)}を削除">削除</button>
          </div>
        `,
      )
      .join("");
  }

  function renderExpensePayerOptions() {
    const current = els.expensePayer.value;
    els.expensePayer.innerHTML = state.data.people
      .map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`)
      .join("");

    if (current && state.data.people.some((person) => person.id === current)) {
      els.expensePayer.value = current;
    }
  }

  function renderCustomShares() {
    els.customShares.innerHTML = state.data.people
      .map(
        (person) => `
          <label>
            ${escapeHtml(person.name)}の負担割合
            <div class="input-with-unit">
              <input type="number" min="0" max="100" step="1" value="${Number(person.share)}" data-share-id="${escapeHtml(person.id)}" />
              <span>%</span>
            </div>
          </label>
        `,
      )
      .join("");

    els.customShares.classList.toggle("hidden", getSplitMode() !== "custom");
  }

  function renderMonth() {
    const month = els.monthFilter.value || toMonthKey(getToday());
    const monthlyExpenses = state.data.expenses
      .filter((expense) => toMonthKey(expense.date) === month)
      .sort((a, b) => b.date.localeCompare(a.date));
    const summary = calculateSummary(monthlyExpenses);

    els.monthTitle.textContent = `${formatMonthLabel(month)}の精算`;
    renderMetrics(summary, monthlyExpenses.length);
    renderSettlement(summary);
    renderRatios(summary);
    renderCategories(summary);
    renderExpenses(monthlyExpenses);
  }

  function renderMetrics(summary, count) {
    const largestPayer = summary.people.reduce((max, person) => (person.paid > max.paid ? person : max), {
      name: "-",
      paid: 0,
    });
    const customCount = summary.expenses.filter((expense) => expense.splitMode === "custom").length;

    els.metricsGrid.innerHTML = `
      <article class="metric">
        <span>月合計</span>
        <strong>${formatMoney(summary.total)}</strong>
        <em>${count}件の支出</em>
      </article>
      <article class="metric">
        <span>最も支払った人</span>
        <strong>${escapeHtml(largestPayer.name)}</strong>
        <em>${formatMoney(largestPayer.paid)}</em>
      </article>
      <article class="metric">
        <span>割合変更あり</span>
        <strong>${customCount}件</strong>
        <em>支出ごとの負担割合を反映</em>
      </article>
    `;
  }

  function renderSettlement(summary) {
    const settlements = calculateSettlements(summary.people);

    if (!summary.total) {
      els.settlementStatus.textContent = "支出なし";
      els.settlementList.innerHTML = "";
      els.settlementList.appendChild(emptyState("この月の支出を登録してください"));
      return;
    }

    if (!settlements.length) {
      els.settlementStatus.textContent = "精算不要";
      els.settlementList.innerHTML = `
        <div class="settlement-item">
          <div>
            <strong>この月は精算不要です</strong>
            <span>支払額と負担額がほぼ一致しています。</span>
          </div>
          <div class="settlement-amount">${formatMoney(0)}</div>
        </div>
      `;
      return;
    }

    els.settlementStatus.textContent = `${settlements.length}件`;
    els.settlementList.innerHTML = settlements
      .map(
        (item) => `
          <div class="settlement-item">
            <div>
              <strong>${escapeHtml(item.from.name)} から ${escapeHtml(item.to.name)} へ</strong>
              <span>負担額と支払額の差分をならします。</span>
            </div>
            <div class="settlement-amount">${formatMoney(item.amount)}</div>
          </div>
        `,
      )
      .join("");
  }

  function renderRatios(summary) {
    if (!summary.total) {
      els.ratioBars.innerHTML = "";
      els.ratioBars.appendChild(emptyState("負担割合と支払い実績は支出登録後に表示されます"));
      return;
    }

    els.ratioBars.innerHTML = summary.people
      .map((person) => {
        const paidRate = summary.total ? (person.paid / summary.total) * 100 : 0;
        const owedRate = summary.total ? (person.owed / summary.total) * 100 : 0;
        const balanceText =
          person.balance > 0
            ? `${formatMoney(person.balance)}受け取り`
            : person.balance < 0
              ? `${formatMoney(Math.abs(person.balance))}支払い`
              : "差額なし";

        return `
          <div class="person-summary">
            <div class="person-summary-head">
              <strong>${escapeHtml(person.name)}</strong>
              <span>${escapeHtml(balanceText)}</span>
            </div>
            <div class="stacked-bars">
              ${renderBar("負担予定", owedRate, person.color, formatMoney(person.owed))}
              ${renderBar("支払い実績", paidRate, "var(--accent)", formatMoney(person.paid), "secondary")}
            </div>
            <div class="person-numbers">
              <div><span>登録割合</span><strong>${formatPercent(person.share)}</strong></div>
              <div><span>負担予定</span><strong>${formatMoney(person.owed)}</strong></div>
              <div><span>支払い実績</span><strong>${formatMoney(person.paid)}</strong></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderBar(label, rate, color, value, extraClass = "") {
    const width = Math.max(0, Math.min(100, rate));
    return `
      <div class="bar-row">
        <div class="bar-row-head">
          <strong>${escapeHtml(label)}</strong>
          <span>${formatPercent(rate)} / ${escapeHtml(value)}</span>
        </div>
        <div class="bar-track" aria-hidden="true">
          <div class="bar-fill ${extraClass}" style="width:${width}%; background:${escapeHtml(color)}"></div>
        </div>
      </div>
    `;
  }

  function renderCategories(summary) {
    const entries = Object.entries(summary.categories).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      els.categoryBars.innerHTML = "";
      els.categoryBars.appendChild(emptyState("カテゴリ別集計は支出登録後に表示されます"));
      return;
    }

    els.categoryBars.innerHTML = entries
      .map(([category, amount]) => {
        const rate = summary.total ? (amount / summary.total) * 100 : 0;
        return `
          <div class="category-row">
            <div class="bar-row-head">
              <strong>${escapeHtml(category)}</strong>
              <span>${formatMoney(amount)}</span>
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
    if (!els.expenseCount || !els.expenseTable) {
      return;
    }

    els.expenseCount.textContent = `${expenses.length}件`;

    if (!expenses.length) {
      els.expenseTable.innerHTML = `
        <tr>
          <td colspan="6" class="empty-cell">${emptyStateHtml("この月の支出はまだありません")}</td>
        </tr>
      `;
      return;
    }

    els.expenseTable.innerHTML = expenses
      .map((expense) => {
        const payer = getPerson(expense.payerId);
        return `
          <tr>
            <td data-label="日付">${escapeHtml(expense.date)}</td>
            <td data-label="項目">${escapeHtml(expense.item)}</td>
            <td data-label="カテゴリ"><span class="tag">${escapeHtml(expense.category)}</span></td>
            <td data-label="支払">${escapeHtml(payer ? payer.name : "不明")}</td>
            <td class="num" data-label="金額">${formatMoney(expense.amount)}</td>
            <td class="num" data-label="操作">
              <button class="icon-btn danger-btn" type="button" data-expense-action="delete" data-id="${escapeHtml(expense.id)}">削除</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function calculateSummary(expenses) {
    const people = state.data.people.map((person) => ({
      ...person,
      paid: 0,
      owed: 0,
      balance: 0,
    }));
    const byId = new Map(people.map((person) => [person.id, person]));
    const categories = {};
    let total = 0;

    for (const expense of expenses) {
      const amount = Number(expense.amount) || 0;
      total += amount;

      if (byId.has(expense.payerId)) {
        byId.get(expense.payerId).paid += amount;
      }

      categories[expense.category] = (categories[expense.category] || 0) + amount;

      const shares = expense.splitMode === "custom" ? expense.shares : Object.fromEntries(people.map((p) => [p.id, p.share]));
      const shareTotal = sum(Object.values(shares));
      const effectiveShares = shareTotal > 0 ? shares : Object.fromEntries(people.map((p) => [p.id, 100 / people.length]));

      for (const person of people) {
        const share = Number(effectiveShares[person.id] || 0);
        const normalizedShareTotal = sum(Object.values(effectiveShares)) || 100;
        person.owed += Math.round((amount * share) / normalizedShareTotal);
      }
    }

    const roundingGap = total - sum(people.map((person) => person.owed));
    if (roundingGap && people.length) {
      people[0].owed += roundingGap;
    }

    for (const person of people) {
      person.balance = person.paid - person.owed;
    }

    return { total, people, categories, expenses };
  }

  function calculateSettlements(people) {
    const debtors = people
      .filter((person) => person.balance < -0.5)
      .map((person) => ({ ...person, amount: Math.abs(person.balance) }))
      .sort((a, b) => b.amount - a.amount);
    const creditors = people
      .filter((person) => person.balance > 0.5)
      .map((person) => ({ ...person, amount: person.balance }))
      .sort((a, b) => b.amount - a.amount);
    const settlements = [];

    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amount = Math.round(Math.min(debtor.amount, creditor.amount));

      if (amount > 0) {
        settlements.push({
          from: debtor,
          to: creditor,
          amount,
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount <= 0.5) debtorIndex += 1;
      if (creditor.amount <= 0.5) creditorIndex += 1;
    }

    return settlements;
  }

  async function loadFromGithub() {
    const config = getGithubConfig();
    if (!config.owner || !config.repo || !config.path) {
      setStatus("GitHubのOwner、Repository、JSON pathを入力してください", "error");
      showPopup("GitHubから取得できません", "Owner、Repository、JSON pathを入力してください。", "error");
      return;
    }

    try {
      setStatus("GitHubから取得中です...");
      const response = await fetch(githubContentsUrl(config), {
        headers: githubHeaders(config.token),
      });

      if (!response.ok) {
        throw new Error(await extractGithubError(response));
      }

      const payload = await response.json();
      const text = decodeBase64(payload.content || "");
      const incoming = validateData(JSON.parse(text));

      state.data = incoming;
      state.data.settings.github = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        path: config.path,
      };
      state.githubSha = payload.sha || "";
      storeData();
      render();
      setGithubSha();
      setStatus("GitHubの最新JSONを読み込みました", "success");
      showPopup("GitHubから取得しました", "最新のJSONデータをアプリに反映しました。", "success");
    } catch (error) {
      setStatus(`GitHub取得に失敗しました: ${error.message}`, "error");
      showPopup("GitHubから取得できませんでした", error.message, "error");
    }
  }

  async function saveToGithub() {
    const config = getGithubConfig();
    if (!config.owner || !config.repo || !config.path || !config.token) {
      setStatus("GitHub保存にはOwner、Repository、JSON path、tokenが必要です", "error");
      showPopup("GitHubへ保存できません", "Owner、Repository、JSON path、tokenを入力してください。", "error");
      return;
    }

    try {
      setStatus("GitHubへ保存中です...");
      let sha = state.githubSha;
      if (!sha) {
        const current = await fetch(githubContentsUrl(config), {
          headers: githubHeaders(config.token),
        });
        if (current.ok) {
          const payload = await current.json();
          sha = payload.sha || "";
        }
      }

      state.data.settings.github = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        path: config.path,
      };
      touch();
      const content = encodeBase64(JSON.stringify(state.data, null, 2));
      const body = {
        message: `Update household split data ${new Date().toISOString()}`,
        content,
        branch: config.branch,
      };
      if (sha) body.sha = sha;

      const response = await fetch(githubContentsUrl(config, false), {
        method: "PUT",
        headers: {
          ...githubHeaders(config.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await extractGithubError(response));
      }

      const payload = await response.json();
      state.githubSha = payload.content ? payload.content.sha : "";
      storeData();
      setGithubSha();
      setStatus("GitHubのJSONを更新しました", "success");
      showPopup("GitHubへ保存しました", "JSONデータをリポジトリへ保存しました。", "success");
    } catch (error) {
      setStatus(`GitHub保存に失敗しました: ${error.message}`, "error");
      showPopup("GitHubへ保存できませんでした", error.message, "error");
    }
  }

  function getGithubConfig() {
    return {
      owner: els.githubOwner.value.trim(),
      repo: els.githubRepo.value.trim(),
      branch: els.githubBranch.value.trim() || "main",
      path: els.githubPath.value.trim() || "data/split-data.json",
      token: els.githubToken.value.trim(),
    };
  }

  function saveGithubConfig() {
    const config = getGithubConfig();
    const storedConfig = {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      path: config.path,
      token: config.token,
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(storedConfig));
    state.data.settings.github = {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      path: config.path,
    };
    setGithubSha();
  }

  function setGithubSha() {
    els.githubSha.textContent = state.githubSha ? `sha ${state.githubSha.slice(0, 7)}` : "未接続";
  }

  function githubContentsUrl(config, includeRef = true) {
    const encodedPath = config.path
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const ref = includeRef ? `?ref=${encodeURIComponent(config.branch)}` : "";
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}${ref}`;
  }

  function githubHeaders(token) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async function extractGithubError(response) {
    try {
      const payload = await response.json();
      return payload.message || `${response.status} ${response.statusText}`;
    } catch (_) {
      return `${response.status} ${response.statusText}`;
    }
  }

  function normalizeData() {
    state.data = validateData(state.data);
  }

  async function loadBundledDataIfNeeded() {
    if (hadStoredData || window.location.protocol === "file:") {
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
    data.settings.github = data.settings.github || defaultData.settings.github;
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
    touch();
    storeData();
  }

  function touch() {
    state.data.meta = {
      ...(state.data.meta || {}),
      appVersion: "1.0.0",
      updatedAt: new Date().toISOString(),
    };
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

  function getSplitMode() {
    const checked = document.querySelector('input[name="splitMode"]:checked');
    return checked ? checked.value : "default";
  }

  function readCustomShares() {
    return Array.from(els.customShares.querySelectorAll("input[data-share-id]")).reduce((result, input) => {
      result[input.dataset.shareId] = clamp(Number(input.value || 0), 0, 100);
      return result;
    }, {});
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
    els.syncStatus.textContent = message;
    els.syncStatus.classList.toggle("is-error", type === "error");
    els.syncStatus.classList.toggle("is-success", type === "success");
  }

  function showPopup(title, message, type = "") {
    if (!els.popupStack) return;

    const popup = document.createElement("div");
    popup.className = `popup ${type === "error" ? "is-error" : "is-success"}`;
    popup.setAttribute("role", "alert");
    popup.innerHTML = `
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
      <button type="button" aria-label="閉じる">×</button>
    `;

    const close = () => {
      popup.remove();
    };
    popup.querySelector("button").addEventListener("click", close);
    els.popupStack.appendChild(popup);
    window.setTimeout(close, type === "error" ? 7000 : 4500);
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

  function encodeBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function decodeBase64(text) {
    return decodeURIComponent(escape(atob(text.replace(/\n/g, ""))));
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
