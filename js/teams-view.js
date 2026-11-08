// =====================================================================
//  teams-view.js - everything on the Teams page.
//  Sections: 1 Setup  2 Page switching  3 Team list  4 Team page
//            5 Schedule tab  6 Roster tab  7 Player pop-up
//            8 Buttons  9 Start
// =====================================================================

const TeamsView = (function () {

  // ---------- 1. SETUP ----------

  const view = {
    current: "scores",       // which page: "scores" or "teams"
    sport: "football",
    conf: "ALL",             // the All / SWAC / MEAC tab on the Teams page
    detailTab: "schedule",   // "schedule" or "roster"
    teams: [],
    team: null,              // the team that is open
    schedule: null,          // that team's schedule (null = not loaded yet)
    roster: null,            // that team's roster (null = not loaded yet)
    teamsRequest: 0,         // counters used to ignore outdated responses
    scheduleRequest: 0,
    rosterRequest: 0,
    playerRequest: 0
  };

  function $(id) {
    return document.getElementById(id);
  }

  // Stops odd characters in names from breaking the page
  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Highlights one button in a group and un-highlights the rest
  function setActiveIn(containerId, attribute, value) {
    document.querySelectorAll("#" + containerId + " .subtab").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute(attribute) === value);
    });
  }


  // ---------- 2. PAGE SWITCHING (Scores / Teams) ----------

  function showView(name) {
    view.current = name;
    const isTeams = name === "teams";

    document.querySelectorAll(".view-btn").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === name);
    });

    // Scores page pieces
    $("scores-controls").hidden = isTeams;
    $("scores-layout").hidden = isTeams;

    // Teams page
    $("teams-view").hidden = !isTeams;

    if (isTeams) openTeamList();
  }


  // ---------- 3. TEAM LIST ----------

  async function openTeamList() {
    view.team = null;
    $("team-panel").hidden = true;
    $("teams-list-panel").hidden = false;
    $("teams-grid").innerHTML = "";
    $("teams-status").textContent = "Loading teams\u2026";

    const request = ++view.teamsRequest;

    try {
      view.teams = await RosterService.loadTeams(view.sport);
    } catch (error) {
      console.error(error);
      view.teams = [];
    }

    if (request !== view.teamsRequest) return;
    renderTeams();
  }

  function renderTeams() {
    const teams = view.teams.filter(function (team) {
      return view.conf === "ALL" || team.conf === view.conf;
    });

    if (teams.length === 0) {
      $("teams-status").textContent =
        "No teams could be loaded right now. Check the Console (F12) for details.";
      $("teams-grid").innerHTML = "";
      return;
    }

    $("teams-status").textContent = teams.length + (teams.length === 1 ? " team" : " teams");

    $("teams-grid").innerHTML = teams.map(function (team) {
      const color = /^[0-9a-f]{6}$/i.test(team.color) ? "#" + team.color : "#121212";
      return `
        <button class="team-card" data-id="${esc(team.id)}" style="border-left-color: ${color}">
          <span class="team-card-name">${esc(team.name)}</span>
          <span class="team-card-conf">${esc(team.conf)}</span>
        </button>`;
    }).join("");
  }


  // ---------- 4. TEAM PAGE ----------

  function openTeam(team) {
    view.team = team;
    view.schedule = null;
    view.roster = null;

    $("teams-list-panel").hidden = true;
    $("team-panel").hidden = false;

    $("team-title").textContent = team.fullName;
    $("team-conf-tag").textContent = team.conf;

    // Reset the roster search and tables
    $("roster-search").value = "";
    $("team-schedule-body").innerHTML = "";
    $("roster-body").innerHTML = "";

    showDetailTab("schedule");
  }

  function showDetailTab(name) {
    view.detailTab = name;
    setActiveIn("detail-tabs", "data-ttab", name);

    $("schedule-pane").hidden = name !== "schedule";
    $("roster-pane").hidden = name !== "roster";

    if (name === "schedule") loadScheduleTab();
    else loadRosterTab();
  }


  // ---------- 5. SCHEDULE TAB ----------

  async function loadScheduleTab() {
    if (view.schedule) {
      renderSchedule();
      return;
    }

    const team = view.team;
    const request = ++view.scheduleRequest;
    $("team-schedule-body").innerHTML = "";
    $("team-schedule-status").textContent = "Loading schedule\u2026";

    try {
      const games = await RosterService.loadSchedule(view.sport, team.id);
      if (request !== view.scheduleRequest || view.team !== team) return;
      view.schedule = games;
    } catch (error) {
      console.error(error);
      if (request !== view.scheduleRequest || view.team !== team) return;
      $("team-schedule-status").textContent =
        "Could not load this schedule. Please try again later.";
      return;
    }

    renderSchedule();
  }

  function renderSchedule() {
    const games = view.schedule;

    if (games.length === 0) {
      $("team-schedule-status").textContent = "No schedule is available for this team yet.";
      $("team-schedule-body").innerHTML = "";
      return;
    }

    const wins = games.filter(function (g) { return g.result === "W"; }).length;
    const losses = games.filter(function (g) { return g.result === "L"; }).length;
    $("team-schedule-status").textContent =
      games.length + " games \u00B7 Results so far: " + wins + "-" + losses;

    // The first game that hasn't finished gets highlighted
    const nextGame = games.find(function (g) { return g.status !== "final"; });

    $("team-schedule-body").innerHTML = games.map(function (game) {
      const date = new Date(game.startMs);
      const dateText = date.toLocaleDateString([], {
        weekday: "short", month: "short", day: "numeric"
      });

      let where = game.homeAway === "away" ? "@" : "vs";
      if (game.neutral) where += " (N)";

      let resultCell;
      if (game.status === "final") {
        const cls = game.result === "W" ? "win" : "loss";
        resultCell = `<span class="result ${cls}">${esc(game.result || "-")}</span> ${esc(game.scoreLine)}`;
      } else if (game.status === "live") {
        resultCell = `<span class="result live">${esc(game.statusText || "LIVE")}</span> ${esc(game.scoreLine)}`;
      } else if (game.timeValid) {
        resultCell = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      } else {
        resultCell = "TBD";
      }

      return `
        <tr class="${game === nextGame ? "next-game" : ""}">
          <td>${esc(dateText)}</td>
          <td>${esc(where)} ${esc(game.opponent)}</td>
          <td>${resultCell}</td>
        </tr>`;
    }).join("");
  }


  // ---------- 6. ROSTER TAB ----------

  async function loadRosterTab() {
    if (view.roster) {
      renderRoster();
      return;
    }

    const team = view.team;
    const request = ++view.rosterRequest;
    $("roster-body").innerHTML = "";
    $("roster-status").textContent = "Loading roster\u2026";

    try {
      const players = await RosterService.loadRoster(view.sport, team.id);
      if (request !== view.rosterRequest || view.team !== team) return;
      view.roster = players;
    } catch (error) {
      console.error(error);
      if (request !== view.rosterRequest || view.team !== team) return;
      $("roster-status").textContent = "Could not load this roster. Please try again later.";
      return;
    }

    renderRoster();
  }

  function renderRoster() {
    if (!view.roster || view.roster.length === 0) {
      $("roster-status").textContent = "No roster is available for this team yet.";
      $("roster-body").innerHTML = "";
      return;
    }

    const search = $("roster-search").value.trim().toLowerCase();

    const players = view.roster.filter(function (player) {
      return player.name.toLowerCase().indexOf(search) !== -1;
    });

    $("roster-status").textContent =
      players.length + (players.length === 1 ? " player" : " players");

    $("roster-body").innerHTML = players.map(function (p) {
      return `
        <tr>
          <td>${esc(p.jersey)}</td>
          <td><button class="player-link" data-id="${esc(p.id)}">${esc(p.name)}</button></td>
          <td>${esc(p.position)}</td>
          <td>${esc(p.year)}</td>
          <td>${esc(p.height)}</td>
          <td>${esc(p.weight)}</td>
          <td>${esc(p.hometown)}</td>
        </tr>`;
    }).join("");
  }


  // ---------- 7. PLAYER POP-UP ----------

  function bioItem(label, value) {
    if (!value) return "";
    return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }

  function renderStatsTable(stats) {
    if (!stats) {
      return '<p class="muted">Detailed stats are not available for this player yet.</p>';
    }

    const head = stats.labels.map(function (label) {
      return "<th>" + esc(label) + "</th>";
    }).join("");

    const rows = stats.rows.map(function (row) {
      const cells = row.values.map(function (value) {
        return "<td>" + esc(value) + "</td>";
      }).join("");
      return `<tr><th scope="row">${esc(row.name)}</th>${cells}</tr>`;
    }).join("");

    return `
      <h4>${esc(stats.title)}</h4>
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th></th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function openPlayer(playerId) {
    const player = (view.roster || []).find(function (p) { return p.id === playerId; });
    if (!player) return;

    // Show the bio right away, then load the stats
    $("player-body").innerHTML = `
      <div class="player-head">
        <div class="player-number">${esc(player.jersey || "-")}</div>
        <div>
          <h3>${esc(player.name)}</h3>
          <p class="muted">${esc(view.team.fullName)}${player.positionName ? " \u00B7 " + esc(player.positionName) : ""}</p>
        </div>
      </div>
      <dl class="bio-grid">
        ${bioItem("Class", player.year)}
        ${bioItem("Height", player.height)}
        ${bioItem("Weight", player.weight)}
        ${bioItem("Hometown", player.hometown)}
      </dl>
      <div id="player-stats"><p class="muted">Loading stats\u2026</p></div>`;

    $("player-modal").hidden = false;

    const request = ++view.playerRequest;
    let html;

    try {
      const stats = await RosterService.loadPlayerStats(view.sport, playerId);
      html = renderStatsTable(stats);
    } catch (error) {
      console.error(error);
      html = '<p class="muted">Stats could not be loaded right now.</p>';
    }

    // Skip if the pop-up was closed or another player was opened
    if (request !== view.playerRequest || $("player-modal").hidden) return;
    $("player-stats").innerHTML = html;
  }

  function closePlayer() {
    $("player-modal").hidden = true;
  }


  // ---------- 8. BUTTONS ----------

  function bindEvents() {
    // Scores / Teams
    document.querySelectorAll(".view-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        showView(button.dataset.view);
      });
    });

    // Football / Basketball (app.js handles the Scores page itself)
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        view.sport = button.dataset.sport;
        if (view.current === "teams") openTeamList();
      });
    });

    // Teams page: All / SWAC / MEAC
    $("team-conf-tabs").addEventListener("click", function (event) {
      const button = event.target.closest(".subtab");
      if (!button) return;
      view.conf = button.dataset.tconf;
      setActiveIn("team-conf-tabs", "data-tconf", view.conf);
      renderTeams();
    });

    // Click a team card
    $("teams-grid").addEventListener("click", function (event) {
      const card = event.target.closest(".team-card");
      if (!card) return;
      const team = view.teams.find(function (t) { return t.id === card.dataset.id; });
      if (team) openTeam(team);
    });

    // Back to the team list
    $("team-back").addEventListener("click", openTeamList);

    // Schedule / Roster tabs
    $("detail-tabs").addEventListener("click", function (event) {
      const button = event.target.closest(".subtab");
      if (button) showDetailTab(button.dataset.ttab);
    });

    // Roster search box
    $("roster-search").addEventListener("input", renderRoster);

    // Click a player's name
    $("roster-body").addEventListener("click", function (event) {
      const link = event.target.closest(".player-link");
      if (link) openPlayer(link.dataset.id);
    });

    // Close the pop-up: X button, click outside the box, or Escape key
    $("modal-close").addEventListener("click", closePlayer);

    $("player-modal").addEventListener("click", function (event) {
      if (event.target === $("player-modal")) closePlayer();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closePlayer();
    });
  }


  // ---------- 9. START ----------

  bindEvents();

})();