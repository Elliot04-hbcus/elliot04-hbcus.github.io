// server.js - serves your site and fetches data on its behalf.
// Needs Node.js 18 or newer.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;

// Pages of your site ask for /api/..., and this server forwards the request
const SOURCES = {
  "/api/site/": "https://site.api.espn.com/apis/site/v2/sports/",
  "/api/athlete/": "https://site.web.api.espn.com/apis/common/v3/sports/"
};

// Remember answers for 60 seconds to keep requests low
const cache = {};

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

const server = http.createServer(async function (req, res) {
  try {
    // Data requests
    for (const prefix in SOURCES) {
      if (req.url.startsWith(prefix)) {
        const target = SOURCES[prefix] + req.url.slice(prefix.length);
        const hit = cache[target];

        if (hit && Date.now() - hit.time < 60000) {
          send(res, 200, "application/json", hit.body);
          return;
        }

        const upstream = await fetch(target);
        const body = await upstream.text();
        if (upstream.ok) cache[target] = { time: Date.now(), body: body };
        send(res, upstream.status, "application/json", body);
        return;
      }
    }

    // The website itself
    if (req.url === "/" || req.url.startsWith("/index.html")) {
      const html = fs.readFileSync(path.join(__dirname, "index.html"));
      send(res, 200, "text/html; charset=utf-8", html);
      return;
    }

    send(res, 404, "text/plain", "Not found");
  } catch (error) {
    send(res, 502, "text/plain", "Could not reach the data source: " + error.message);
  }
});

server.listen(PORT, function () {
  console.log("Site running at http://localhost:" + PORT);
});