// forgetme: a rolling memory for the browser.
//
// A periodic sweep forgets anything older than `intervalHours`:
// - Cookies: Firefox doesn't record when a cookie was created, so we track it
//   ourselves. `firstSeen` maps each cookie to the time we first saw it.
// - History: visits have timestamps, so old ones are deleted directly.
// - Form history: can't be aged, so it's wiped whole once per window.

const DEFAULT_INTERVAL_HOURS = 48;
const SWEEP_EVERY_MINUTES = 15;

let firstSeen = {};
const ready = loadFirstSeen();

async function loadFirstSeen() {
  const stored = await browser.storage.local.get("firstSeen");
  firstSeen = stored.firstSeen || {};
}

function saveFirstSeen() {
  return browser.storage.local.set({ firstSeen });
}

// A cookie is identified by its name and where it lives. Firefox keeps a
// separate copy per top-level site (partitionKey), so those count separately.
function cookieKey(cookie) {
  const partition = cookie.partitionKey ? cookie.partitionKey.topLevelSite : "";
  return [cookie.storeId, partition, cookie.domain, cookie.path, cookie.name].join("|");
}

function cookieUrl(cookie) {
  const host = cookie.domain.replace(/^\./, "");
  return (cookie.secure ? "https://" : "http://") + host + cookie.path;
}

// All cookies, across every cookie store (normal, private, containers),
// including partitioned ones.
async function getAllCookies() {
  const stores = await browser.cookies.getAllCookieStores();
  const lists = await Promise.all(stores.map(store =>
    browser.cookies.getAll({ storeId: store.id, partitionKey: {}, firstPartyDomain: null })
  ));
  return lists.flat();
}

async function removeCookie(cookie) {
  try {
    await browser.cookies.remove({
      url: cookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId,
      firstPartyDomain: cookie.firstPartyDomain,
      partitionKey: cookie.partitionKey,
    });
  } catch (error) {
    console.warn("forgetme: could not remove", cookieKey(cookie), error);
  }
}

async function onCookieChanged({ removed, cookie, cause }) {
  await ready;
  const key = cookieKey(cookie);
  if (!removed) {
    if (!(key in firstSeen)) firstSeen[key] = Date.now();
  } else if (cause !== "overwrite") {
    // "overwrite" fires when a site updates an existing cookie. We keep its
    // original age so a tracker can't stay alive by refreshing itself.
    delete firstSeen[key];
  }
  await saveFirstSeen();
}

async function sweep() {
  await ready;
  const { intervalHours = DEFAULT_INTERVAL_HOURS } = await browser.storage.local.get("intervalHours");
  const now = Date.now();
  const cutoff = now - intervalHours * 60 * 60 * 1000;

  const cookieDomains = await sweepCookies(now, cutoff);
  const pages = await sweepHistory(cutoff);
  const formWiped = await sweepFormData(now, cutoff);

  await recordSweep(now, cookieDomains, pages, formWiped);
  return cookieDomains.length;
}

const LOG_LIMIT = 200; // most recent sweeps kept in the log

// Adds a sweep to the log (if it forgot anything) and updates the running totals.
async function recordSweep(time, cookieDomains, pages, formWiped) {
  const stored = await browser.storage.local.get(
    ["log", "domainTotals", "totalForgotten", "totalPages", "totalFormWipes"]
  );
  const log = stored.log || [];
  const domainTotals = stored.domainTotals || {};

  const perDomain = {};
  for (const domain of cookieDomains) {
    perDomain[domain] = (perDomain[domain] || 0) + 1;
    domainTotals[domain] = (domainTotals[domain] || 0) + 1;
  }

  if (cookieDomains.length || pages || formWiped) {
    log.unshift({ time, cookies: perDomain, pages, formWiped });
    log.splice(LOG_LIMIT);
  }

  await browser.storage.local.set({
    log,
    domainTotals,
    lastSweep: time,
    totalForgotten: (stored.totalForgotten || 0) + cookieDomains.length,
    totalPages: (stored.totalPages || 0) + pages,
    totalFormWipes: (stored.totalFormWipes || 0) + (formWiped ? 1 : 0),
  });
}

// Hostnames of every open tab, e.g. "www.youtube.com".
async function getOpenTabHosts() {
  const hosts = [];
  for (const tab of await browser.tabs.query({})) {
    if (tab.url && tab.url.startsWith("http")) hosts.push(new URL(tab.url).hostname);
  }
  return hosts;
}

// True for a site's own cookie while that site is open in a tab, so nobody is
// logged out mid-use. Third-party cookies (partitioned under another site) are
// never protected.
function isInUse(cookie, openHosts) {
  if (cookie.partitionKey) return false;
  const domain = cookie.domain.replace(/^\./, "");
  return openHosts.some(host => host === domain || host.endsWith("." + domain));
}

// Removes cookies older than the window. Also stamps any cookie we haven't
// seen yet (e.g. on first install) and drops records for cookies that are gone.
// Old cookies of open sites keep their age and are removed in a later sweep,
// once the tab is closed. Returns the domain of each removed cookie.
async function sweepCookies(now, cutoff) {
  const openHosts = await getOpenTabHosts();
  const kept = {};
  const removedDomains = [];
  for (const cookie of await getAllCookies()) {
    const key = cookieKey(cookie);
    const seen = firstSeen[key] || now;
    if (seen < cutoff && !isInUse(cookie, openHosts)) {
      await removeCookie(cookie);
      removedDomains.push(cookie.domain.replace(/^\./, ""));
    } else {
      kept[key] = seen;
    }
  }

  firstSeen = kept;
  await saveFirstSeen();
  return removedDomains;
}

// History has real timestamps, so it can roll: delete every visit before the
// cutoff. Returns how many pages were forgotten completely (pages also visited
// recently lose their old visits but stay in history, so aren't counted).
async function sweepHistory(cutoff) {
  const oldPages = await browser.history.search({
    text: "", startTime: 0, endTime: cutoff, maxResults: 1000000,
  });
  await browser.history.deleteRange({ startTime: 0, endTime: cutoff });
  return oldPages.length;
}

// Form history can't be filtered by age, so it's wiped whole once per window.
// Returns true if it wiped.
async function sweepFormData(now, cutoff) {
  const { lastFormWipe } = await browser.storage.local.get("lastFormWipe");
  if (!lastFormWipe) {
    // First run: start the clock instead of wiping straight away.
    await browser.storage.local.set({ lastFormWipe: now });
  } else if (lastFormWipe < cutoff) {
    await browser.browsingData.removeFormData({});
    await browser.storage.local.set({ lastFormWipe: now });
    return true;
  }
  return false;
}

async function getStatus() {
  await ready;
  const { intervalHours = DEFAULT_INTERVAL_HOURS, lastSweep, totalForgotten = 0 } =
    await browser.storage.local.get(["intervalHours", "lastSweep", "totalForgotten"]);
  const times = Object.values(firstSeen);
  const oldest = times.reduce((min, t) => Math.min(min, t), Infinity);
  return {
    intervalHours,
    lastSweep,
    totalForgotten,
    tracked: times.length,
    oldest: times.length ? oldest : null,
  };
}

// --- Scripted actions ---

// Each action opens its pages in new tabs and runs its script in each one.
const ACTIONS = {
  google: {
    script: "actions/google.js",
    pages: [
      "https://myadcenter.google.com/controls",
      "https://myactivity.google.com/activitycontrols/webandapp",
    ],
  },
  x: {
    script: "actions/x.js",
    pages: [
      "https://x.com/settings/ads_preferences",
      "https://x.com/settings/off_twitter_activity",
      "https://x.com/settings/data_sharing_with_business_partners",
      "https://x.com/settings/location_information",
      "https://x.com/settings/grok_settings",
    ],
  },
};

// Resolves once `tabId` has finished loading a web page.
function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function onUpdated(updatedId, info, tab) {
      if (updatedId !== tabId || info.status !== "complete" || !tab.url.startsWith("http")) return;
      browser.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    browser.tabs.onUpdated.addListener(onUpdated);
  });
}

// Opens `url` in a new tab, then injects the shared helpers and `script`.
async function openAndRun(url, script) {
  const tab = await browser.tabs.create({ url });
  await waitForTabLoad(tab.id);
  await browser.tabs.executeScript(tab.id, { file: "actions/common.js" });
  await browser.tabs.executeScript(tab.id, { file: script });
}

function runAction(name) {
  const { script, pages } = ACTIONS[name];
  return Promise.all(pages.map(url => openAndRun(url, script)));
}

function onMessage(message) {
  if (message === "sweep") return sweep();
  if (message === "status") return getStatus();
  if (message in ACTIONS) return runAction(message);
}

browser.cookies.onChanged.addListener(onCookieChanged);
browser.runtime.onMessage.addListener(onMessage);
browser.alarms.create("sweep", { periodInMinutes: SWEEP_EVERY_MINUTES });
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "sweep") sweep();
});

// Runs whenever the browser starts or the extension is installed.
sweep();
