// =====================================================================
//  config.js - every setting you might want to change lives here.
// =====================================================================

const CONFIG = {

  // ---------- Live data source ----------
  // Unofficial address. It can change or stop working without notice.
  apiBase: "https://site.api.espn.com/apis/site/v2/sports/",
  basketballPath: "basketball/mens-college-basketball/scoreboard",
  footballPath: "football/college-football/scoreboard",

  // Used by the Teams pages (rosters and player stats)
  basketballLeague: "basketball/mens-college-basketball",
  footballLeague: "football/college-football",
  athleteApi: "https://site.web.api.espn.com/apis/common/v3/sports/",

  // "Group" numbers tell the data source which set of teams to return.
  // 50 = all Division I basketball. 81 = FCS football.
  basketballGroup: "50",
  footballGroup: "81",

  // Backup data used if live data can't be loaded
  sampleDataFile: "data/games.json",

  // Optional: real conference ID numbers, if you find them.
  // Leave as "" to rely on the team lists below.
  swacId: "",
  meacId: "",

  // ---------- Team lists ----------
  // Names are matched loosely (capitals and punctuation are ignored).
  // CHECK swac.org and meacsports.com: memberships change over time.
  swacTeams: [
    "Alabama A&M",
    "Alabama State",
    "Alcorn State",
    "Arkansas-Pine Bluff",
    "Bethune-Cookman",
    "Florida A&M",
    "Grambling",
    "Grambling State",
    "Jackson State",
    "Mississippi Valley State",
    "Prairie View A&M",
    "Southern",
    "Texas Southern"
  ],

  meacTeams: [
    "Coppin State",
    "Delaware State",
    "Howard",
    "Maryland Eastern Shore",
    "UMES",
    "Morgan State",
    "Norfolk State",
    "North Carolina Central",
    "NC Central",
    "South Carolina State",
    "SC State"
  ]
};