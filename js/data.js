// =====================================================================
//  data.js - gets game data and cleans it into one simple format.
//
//  Every game in the rest of the site looks like this:
//  {
//    id, sport, dayKey ("2026-11-07"), startMs,
//    status ("scheduled" | "live" | "final"),
//    statusText ("7:00 PM", "Final", ...),
//    isConference (true/false),
//    home: { name, conf, record, score },
//    away: { name, conf, record, score }
//  }
// =====================================================================

const DataService = (function () {

  const cache = {};        // remembers weeks we've already loaded
  let samplePromise = null;

  // ---------- Small helpers ----------

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  // Date -> "2026-11-07" (used to group games by day)
  function dayKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  // Date -> "20261107" (the format the data source wants)
  function apiDate(date) {
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
  }

  // The 7 days of a week, starting at weekStart
  function weekDays(weekStart) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
    }
    return days;
  }

  // "Arkansas-Pine Bluff" -> "arkansas pine bluff" so names compare reliably
  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9&]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const swacNames = CONFIG.swacTeams.map(normalize);
  const meacNames = CONFIG.meacTeams.map(normalize);

  // Decides if a team is SWAC, MEAC, or neither (null)
  function detectConf(team) {
    if (CONFIG.swacId && String(team.conferenceId) === CONFIG.swacId) return "SWAC";
    if (CONFIG.meacId && String(team.conferenceId) === CONFIG.meacId) return "MEAC";

    const names = [team.location, team.shortDisplayName, team.displayName].map(normalize);
    for (let i = 0; i < names.length; i++) {
      if (swacNames.indexOf(names[i]) !== -1) return "SWAC";
      if (meacNames.indexOf(names[i]) !== -1) return "MEAC";
    }
    return null;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }
    return response.json();
  }

  // ---------- Live data ----------

  // Converts one raw game. Returns null if no SWAC/MEAC team is involved.
  function convertEvent(event, sport, key) {
    const comp = event.competitions && event.competitions[0];
    if (!comp || !comp.competitors) return null;

    const home = comp.competitors.find(function (c) { return c.homeAway === "home"; });
    const away = comp.competitors.find(function (c) { return c.homeAway === "away"; });
    if (!home || !away) return null;

    const homeConf = detectConf(home.team);
    const awayConf = detectConf(away.team);
    if (!homeConf && !awayConf) return null;

    const type = event.status.type;
    let status = "scheduled";
    if (type.state === "post") status = "final";
    if (type.state === "in") status = "live";

    const start = new Date(event.date);
    let statusText = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const typeName = (type.name || "") + " " + (type.shortDetail || "");
    if (status !== "scheduled" || /postponed|canceled|cancelled|delayed/i.test(typeName)) {
      statusText = type.shortDetail || statusText;
    }

    function side(c, conf) {
      return {
        name: c.team.location || c.team.displayName,
        conf: conf,
        record: (c.records && c.records[0] && c.records[0].summary) || "",
        score: status === "scheduled" ? null : Number(c.score)
      };
    }

    return {
      id: "live-" + event.id,
      sport: sport,
      dayKey: key,
      startMs: start.getTime(),
      status: status,
      statusText: statusText,
      isConference: Boolean(homeConf) && homeConf === awayConf,
      home: side(home, homeConf),
      away: side(away, awayConf)
    };
  }

  // Loads all 7 days of a week (one request per day)
  async function loadLiveWeek(sport, weekStart) {
    const path = sport === "football" ? CONFIG.footballPath : CONFIG.basketballPath;
    const group = sport === "football" ? CONFIG.footballGroup : CONFIG.basketballGroup;
    const days = weekDays(weekStart);

    const results = await Promise.allSettled(days.map(function (day) {
      const url = CONFIG.apiBase + path + "?groups=" + group + "&limit=500&dates=" + apiDate(day);
      return fetchJson(url);
    }));

    const games = [];
    const seen = {};
    let okCount = 0;

    results.forEach(function (result, index) {
      if (result.status !== "fulfilled") {
        console.warn("A day failed to load:", result.reason);
        return;
      }
      okCount++;
      const key = dayKey(days[index]);
      (result.value.events || []).forEach(function (event) {
        if (seen[event.id]) return;
        seen[event.id] = true;
        const game = convertEvent(event, sport, key);
        if (game) games.push(game);
      });
    });

    return { games: games, okCount: okCount };
  }

  // ---------- Sample (backup) data ----------

  // Converts data/games.json into the same format as live games
  function convertSample(raw) {
    return raw.games.map(function (g, index) {
      const home = raw.teams[g.home];
      const away = raw.teams[g.away];
      const final = g.status === "final";

      return {
        id: "sample-" + g.id,
        sport: g.sport,
        dayKey: g.date,
        startMs: new Date(g.date + "T12:00:00").getTime() + index,
        status: final ? "final" : "scheduled",
        statusText: final ? "Final" : (g.time || "TBD"),
        isConference: home.conf === away.conf,
        home: { name: home.name, conf: home.conf, record: "", score: final ? g.homeScore : null },
        away: { name: away.name, conf: away.conf, record: "", score: final ? g.awayScore : null }
      };
    });
  }

  function loadSampleGames() {
    if (!samplePromise) {
      samplePromise = fetchJson(CONFIG.sampleDataFile)
        .then(convertSample)
        .catch(function (error) {
          console.error("Could not load sample data:", error);
          return [];
        });
    }
    return samplePromise;
  }

  // ---------- The one function the app calls ----------

  // Returns { games, source ("live" or "sample"), loadedAt }
  async function loadWeek(sport, weekStart, forceRefresh) {
    const cacheKey = sport + "|" + dayKey(weekStart);

    if (!forceRefresh && cache[cacheKey]) {
      return cache[cacheKey];
    }

    const live = await loadLiveWeek(sport, weekStart);

    if (live.okCount > 0) {
      const result = { games: live.games, source: "live", loadedAt: new Date() };
      cache[cacheKey] = result;
      return result;
    }

    // Live data failed completely: fall back to the sample games
    const sample = await loadSampleGames();
    const keys = weekDays(weekStart).map(dayKey);
    return {
      games: sample.filter(function (g) {
        return g.sport === sport && keys.indexOf(g.dayKey) !== -1;
      }),
      source: "sample",
      loadedAt: new Date()
    };
  }

  // What other files are allowed to use
  return {
    loadWeek: loadWeek,
    dayKey: dayKey,
    weekDays: weekDays,
    detectConf: detectConf,
    fetchJson: fetchJson
  };

})();