function show(id, text) {
  document.getElementById(id).textContent = text;
}

function formatHours(hours) {
  return hours < 1 ? Math.round(hours * 60) + " min" : hours.toFixed(1) + " h";
}

function timeSince(timestamp) {
  if (!timestamp) return "never";
  return formatHours((Date.now() - timestamp) / 3600000) + " ago";
}

async function render() {
  const status = await browser.runtime.sendMessage("status");
  document.getElementById("interval").value = status.intervalHours;
  show("tracked", status.tracked);
  show("oldest", status.oldest ? timeSince(status.oldest) : "none");
  show("lastSweep", timeSince(status.lastSweep));
  show("totalForgotten", status.totalForgotten);
}

document.getElementById("sweep").addEventListener("click", async () => {
  const removed = await browser.runtime.sendMessage("sweep");
  show("result", "Forgot " + removed + " cookie(s).");
  render();
});

document.getElementById("saveInterval").addEventListener("click", async () => {
  const hours = parseFloat(document.getElementById("interval").value);
  if (!(hours > 0)) return show("result", "Enter a number of hours above 0.");
  await browser.storage.local.set({ intervalHours: hours });
  show("result", "Saved. Forgetting after " + formatHours(hours) + ".");
});

document.getElementById("openLog").addEventListener("click", () => {
  browser.windows.create({ url: "log.html", type: "popup", width: 520, height: 640 });
});

// Scripted action buttons: data-action names an entry in ACTIONS (background.js).
for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => browser.runtime.sendMessage(button.dataset.action));
}

render();
