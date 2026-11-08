// =====================================================================
//  app.js - tracks what the visitor picked and draws the page.
//  Sections: 1 State  2 Week helpers  3 Loading  4 Filtering
//            5 Drawing  6 Buttons  7 Start
// =====================================================================


// ---------- 1. STATE ----------
// Everything the page needs to remember lives in this one object.
const state = {
  sport: "football",
  conf: "ALL",
  weekStart: startOfWeek(new Date()),
  games: [],
  source: "",          // "live", "sample", or "error"
  loadedAt: null,
  loading: false
};

let requestCounter = 0;   // used to ignore outdated responses


// ---------- 2. WEEK HELPERS ----------

// Weeks run Monday through Sunday
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();                       // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// "Nov 2 - Nov 8, 2026"
function weekRangeLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const short = { month: "short", day: "numeric" };
  return weekStart.toLocaleDateString([], short) + " \u2013 " +
         end.toLocaleDateString([], short) + ", " + end.getFullYear();
}

// "2026-11-07" -> "Saturday, November 7"
function dayHeading(key) {
  const parts = key.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}


// ---------- 3. LOADING ----------

async function loadAndRender(forceRefresh) {
  const thisRequest = ++requestCounter;
  state.loading = true;
  render();

  let result;
  try {
    result = await DataService.loadWeek(state.sport, state.weekStart, forceRefresh);
  } catch (error) {
    console.error(error);
    result = { games: [], source: "error", loadedAt: new Date() };
  }

  // If the visitor clicked something else meanwhile, drop this result
  if (thisRequest !== requestCounter) return;

  state.games = result.games;
  state.source = result.source;
  state.loadedAt = result.loadedAt;
  state.loading = false;
  render();
}


// ---------- 4. FILTERING ----------

// Games for the chosen conference, earliest first
function visibleGames() {
  return state.games
    .filter(function (game) {
      if (state.conf === "ALL") return true;
      return game.home.conf === state.conf || game.away.conf === state.conf;
    })
    .sort(function (a, b) { return a.startMs - b.startMs; });
}


// ---------- 5. DRAWING ----------

function el(id) {
  return document.getElementById(id);
}

// Stops odd characters in names from breaking the page
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderWeekLabel() {
  el("week-label").textContent = weekRangeLabel(state.weekStart);
}

function renderStatus() {
  let text = "";
  if (state.loading) {
    text = "Loading games\u2026";
  } else if (state.source === "live") {
    text = "Live scores \u00B7 updated " +
      state.loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } else if (state.source === "sample") {
    text = "Showing sample games. Live scores are unavailable right now.";
  } else if (state.source === "error") {
    text = "Could not load games. Please try again.";
  }
  el("status-text").textContent = text;
}

function renderTeamRow(team, isWinner, showScore) {
  const confTag = team.conf ? `<span class="team-conf">${team.conf}</span>` : "";
  const record = team.record ? `<span class="team-record">${esc(team.record)}</span>` : "";

  return `
    <div class="team-row ${isWinner ? "winner" : ""}">
      <div class="team-info">
        <span>${esc(team.name)}</span>
        ${confTag}${record}
      </div>
      <span class="score">${showScore ? team.score : "&ndash;"}</span>
    </div>`;
}

function renderCard(game) {
  const showScore = game.status !== "scheduled";
  const isFinal = game.status === "final";
  const awayWon = isFinal && game.away.score > game.home.score;
  const homeWon = isFinal && game.home.score > game.away.score;

  return `
    <article class="game">
      <div class="game-meta">
        <span class="badge ${game.status}">${esc(game.statusText)}</span>
        ${game.isConference ? '<span class="tag">Conference game</span>' : ""}
      </div>
      ${renderTeamRow(game.away, awayWon, showScore)}
      ${renderTeamRow(game.home, homeWon, showScore)}
    </article>`;
}

// One section per day of the week, skipping days with no games
function renderSchedule() {
  const container = el("schedule");

  if (state.loading) {
    container.innerHTML = '<p class="empty">Loading games\u2026</p>';
    return;
  }

  const games = visibleGames();

  if (games.length === 0) {
    container.innerHTML = '<p class="empty">No games found for this week.</p>';
    return;
  }

  const todayKey = DataService.dayKey(new Date());
  let html = "";

  DataService.weekDays(state.weekStart).forEach(function (day) {
    const key = DataService.dayKey(day);
    const dayGames = games.filter(function (g) { return g.dayKey === key; });
    if (dayGames.length === 0) return;

    const isToday = key === todayKey;
    html += `
      <section class="day">
        <h3 class="day-title ${isToday ? "today" : ""}">
          ${dayHeading(key)}
          ${isToday ? '<span class="today-tag">TODAY</span>' : ""}
          <span class="day-count">${dayGames.length} ${dayGames.length === 1 ? "game" : "games"}</span>
        </h3>
        <div class="cards">${dayGames.map(renderCard).join("")}</div>
      </section>`;
  });

  container.innerHTML = html;
}

function renderSummary() {
  const games = state.loading ? [] : visibleGames();

  function count(test) {
    return games.filter(test).length;
  }

  const rows = [
    ["Total games", games.length],
    ["Completed", count(function (g) { return g.status === "final"; })],
    ["In progress", count(function (g) { return g.status === "live"; })],
    ["Upcoming", count(function (g) { return g.status === "scheduled"; })],
    ["Conference games", count(function (g) { return g.isConference; })]
  ];

  el("summary").innerHTML = rows.map(function (row) {
    return `<div class="summary-row"><span>${row[0]}</span><strong>${row[1]}</strong></div>`;
  }).join("");
}

function render() {
  renderWeekLabel();
  renderStatus();
  renderSchedule();
  renderSummary();
}


// ---------- 6. BUTTONS ----------

function setActive(selector, activeButton) {
  document.querySelectorAll(selector).forEach(function (b) {
    b.classList.remove("active");
  });
  activeButton.classList.add("active");
}

function bindEvents() {
  // Football / Basketball
  document.querySelectorAll(".tab").forEach(function (button) {
    button.addEventListener("click", function () {
      state.sport = button.dataset.sport;
      setActive(".tab", button);
      loadAndRender(false);
    });
  });

  // All / SWAC / MEAC (no reload needed, just redraw)
  document.querySelectorAll(".chip").forEach(function (button) {
    button.addEventListener("click", function () {
      state.conf = button.dataset.conf;
      setActive(".chip", button);
      render();
    });
  });

  // Week navigation
  el("prev-week").addEventListener("click", function () {
    state.weekStart = addDays(state.weekStart, -7);
    loadAndRender(false);
  });

  el("next-week").addEventListener("click", function () {
    state.weekStart = addDays(state.weekStart, 7);
    loadAndRender(false);
  });

  el("this-week").addEventListener("click", function () {
    state.weekStart = startOfWeek(new Date());
    loadAndRender(false);
  });

  // Refresh: reload this week from scratch
  el("refresh").addEventListener("click", function () {
    loadAndRender(true);
  });
}


// ---------- 7. START ----------

bindEvents();
loadAndRender(false);