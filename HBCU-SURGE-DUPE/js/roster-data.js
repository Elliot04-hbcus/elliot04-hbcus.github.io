// =====================================================================
//  roster-data.js - gets teams, schedules, rosters and player stats.
//  Everything is remembered (cached), so repeat clicks are instant.
//  Sections: 1 Setup  2 Teams  3 Schedule  4 Roster  5 Player stats
// =====================================================================

const RosterService = (function () {

  // ---------- 1. SETUP ----------

  const teamsCache = {};
  const scheduleCache = {};
  const rosterCache = {};
  const statsCache = {};

  function leagueOf(sport) {
    return sport === "football" ? CONFIG.footballLeague : CONFIG.basketballLeague;
  }


  // ---------- 2. TEAMS ----------

  // Downloads a list of teams. Returns [] if anything goes wrong.
  async function fetchTeamList(url) {
    try {
      const json = await DataService.fetchJson(url);
      const raw = json.sports[0].leagues[0].teams;
      return raw.map(function (item) { return item.team; });
    } catch (error) {
      console.warn("Team list request failed:", error);
      return [];
    }
  }

  // Keeps only SWAC and MEAC teams
  function pickConferenceTeams(rawTeams) {
    const seen = {};
    const teams = [];

    rawTeams.forEach(function (team) {
      const conf = DataService.detectConf(team);
      if (!conf || seen[team.id]) return;
      seen[team.id] = true;

      teams.push({
        id: String(team.id),
        name: team.location || team.displayName,
        fullName: team.displayName,
        conf: conf,
        color: team.color || ""
      });
    });

    return teams;
  }

  async function loadTeams(sport) {
    if (teamsCache[sport]) return teamsCache[sport];

    const base = CONFIG.apiBase + leagueOf(sport) + "/teams";
    const group = sport === "football" ? CONFIG.footballGroup : CONFIG.basketballGroup;

    let teams = pickConferenceTeams(await fetchTeamList(base + "?groups=" + group + "&limit=500"));

    // If that found nothing, try again without the group filter
    if (teams.length === 0) {
      teams = pickConferenceTeams(await fetchTeamList(base + "?limit=1000"));
    }

    teams.sort(function (a, b) { return a.name.localeCompare(b.name); });

    if (teams.length > 0) teamsCache[sport] = teams;
    return teams;
  }


  // ---------- 3. SCHEDULE ----------

  // A score might arrive as a number, text, or an object. Make it text.
  function scoreText(score) {
    if (score === undefined || score === null) return "";
    if (typeof score === "object") {
      if (score.displayValue !== undefined) return String(score.displayValue);
      if (score.value !== undefined) return String(score.value);
      return "";
    }
    return String(score);
  }

  // Converts one raw game into a simple object from this team's viewpoint
  function toScheduleGame(event, teamId) {
    const comp = event.competitions && event.competitions[0];
    if (!comp || !comp.competitors) return null;

    const me = comp.competitors.find(function (c) { return String(c.team.id) === String(teamId); });
    const opp = comp.competitors.find(function (c) { return String(c.team.id) !== String(teamId); });
    if (!me || !opp) return null;

    const statusObj = comp.status || event.status || {};
    const type = statusObj.type || {};
    const state = type.state || (type.completed ? "post" : "pre");

    let status = "scheduled";
    if (state === "post") status = "final";
    if (state === "in") status = "live";

    const myScore = scoreText(me.score);
    const oppScore = scoreText(opp.score);

    let result = "";
    if (status === "final") {
      if (me.winner === true) result = "W";
      else if (me.winner === false) result = "L";
      else if (myScore !== "" && oppScore !== "") {
        result = Number(myScore) > Number(oppScore) ? "W" : "L";
      }
    }

    return {
      startMs: new Date(comp.date || event.date).getTime(),
      timeValid: comp.timeValid !== false,
      opponent: opp.team.location || opp.team.displayName || opp.team.shortDisplayName || "TBD",
      homeAway: me.homeAway,                 // "home" or "away"
      neutral: Boolean(comp.neutralSite),
      status: status,
      statusText: type.shortDetail || "",
      result: result,
      scoreLine: (myScore !== "" && oppScore !== "") ? myScore + "-" + oppScore : ""
    };
  }

  async function loadSchedule(sport, teamId) {
    const key = sport + "|" + teamId;
    if (scheduleCache[key]) return scheduleCache[key];

    const url = CONFIG.apiBase + leagueOf(sport) + "/teams/" + teamId + "/schedule";
    const json = await DataService.fetchJson(url);

    const games = (json.events || [])
      .map(function (event) { return toScheduleGame(event, teamId); })
      .filter(Boolean)
      .sort(function (a, b) { return a.startMs - b.startMs; });

    scheduleCache[key] = games;
    return games;
  }


  // ---------- 4. ROSTER ----------

  // Converts one raw player into a simple object
  function toPlayer(a) {
    const birth = a.birthPlace || {};
    return {
      id: String(a.id || ""),
      name: a.fullName || a.displayName || "Unknown",
      jersey: a.jersey || "",
      position: (a.position && a.position.abbreviation) || "",
      positionName: (a.position && a.position.displayName) || "",
      height: a.displayHeight || "",
      weight: a.displayWeight || "",
      year: (a.experience && a.experience.displayValue) || "",
      hometown: [birth.city, birth.state].filter(Boolean).join(", ")
    };
  }

  async function loadRoster(sport, teamId) {
    const key = sport + "|" + teamId;
    if (rosterCache[key]) return rosterCache[key];

    const url = CONFIG.apiBase + leagueOf(sport) + "/teams/" + teamId + "/roster";
    const json = await DataService.fetchJson(url);

    // Football rosters come grouped (offense, defense...). Flatten them.
    let list = [];
    (json.athletes || []).forEach(function (item) {
      if (item.items) list = list.concat(item.items);
      else list.push(item);
    });

    const players = list.map(toPlayer).filter(function (p) { return p.id; });

    // Sort by jersey number, then name
    players.sort(function (a, b) {
      const na = parseInt(a.jersey, 10);
      const nb = parseInt(b.jersey, 10);
      const aHas = !isNaN(na);
      const bHas = !isNaN(nb);
      if (aHas && bHas && na !== nb) return na - nb;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    rosterCache[key] = players;
    return players;
  }


  // ---------- 5. PLAYER STATS ----------

  // Returns { title, labels, rows } or null if no stats are available.
  // Throws an error if the request itself fails.
  async function loadPlayerStats(sport, playerId) {
    const key = sport + "|" + playerId;
    if (key in statsCache) return statsCache[key];

    const url = CONFIG.athleteApi + leagueOf(sport) + "/athletes/" + playerId + "/overview";
    const json = await DataService.fetchJson(url);
    const stats = json.statistics;

    let result = null;
    if (stats && stats.labels && stats.splits && stats.splits.length > 0) {
      result = {
        title: stats.displayName || "Statistics",
        labels: stats.labels,
        rows: stats.splits.map(function (split) {
          return { name: split.displayName || "", values: split.stats || [] };
        })
      };
    }

    statsCache[key] = result;
    return result;
  }


  return {
    loadTeams: loadTeams,
    loadSchedule: loadSchedule,
    loadRoster: loadRoster,
    loadPlayerStats: loadPlayerStats
  };

})();