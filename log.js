// The log window: running totals plus a list of recent sweeps, read straight
// from storage (written by recordSweep in background.js).

function show(id, text) {
  document.getElementById(id).textContent = text;
}

function listItem(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

// e.g. "12 cookies from 5 sites, 30 history pages, form history wiped"
function describeSweep(entry) {
  const parts = [];
  const cookies = Object.values(entry.cookies).reduce((sum, n) => sum + n, 0);
  if (cookies) parts.push(`${cookies} cookies from ${Object.keys(entry.cookies).length} sites`);
  if (entry.pages) parts.push(`${entry.pages} history pages`);
  if (entry.formWiped) parts.push("form history wiped");
  return parts.join(", ");
}

// One sweep: a summary line that expands to show which sites lost cookies.
function sweepItem(entry) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = new Date(entry.time).toLocaleString() + " · " + describeSweep(entry);
  details.append(summary);

  const sites = document.createElement("ul");
  for (const [domain, count] of Object.entries(entry.cookies)) {
    sites.append(listItem(`${domain} (${count})`));
  }
  details.append(sites);

  const li = document.createElement("li");
  li.append(details);
  return li;
}

async function render() {
  const stored = await browser.storage.local.get(
    ["log", "domainTotals", "firstSeen", "totalForgotten", "totalPages", "totalFormWipes"]
  );
  const domainTotals = stored.domainTotals || {};

  show("totalForgotten", stored.totalForgotten || 0);
  show("sitesForgotten", Object.keys(domainTotals).length);
  show("totalPages", stored.totalPages || 0);
  show("totalFormWipes", stored.totalFormWipes || 0);
  show("tracked", Object.keys(stored.firstSeen || {}).length);

  const topSites = Object.entries(domainTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  document.getElementById("topSites").replaceChildren(
    ...topSites.map(([domain, count]) => listItem(`${domain}: ${count}`))
  );

  const log = stored.log || [];
  document.getElementById("sweeps").replaceChildren(
    ...(log.length ? log.map(sweepItem) : [listItem("Nothing forgotten yet.")])
  );
}

// Refresh after each sweep. (Not on every storage change: firstSeen is
// rewritten whenever any site sets a cookie.)
browser.storage.onChanged.addListener(changes => {
  if (changes.lastSweep) render();
});
render();
