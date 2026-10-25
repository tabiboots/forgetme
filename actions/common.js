// Helpers shared by the scripted actions. background.js injects this file
// first, then the site-specific script, into each page it opens.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calls find() until it returns something, or gives up after timeoutMs.
async function waitFor(find, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = find();
    if (found) return found;
    await sleep(250);
  }
  return null;
}

function isVisible(el) {
  return el.getClientRects().length > 0;
}

// The clickable element (button, menu item…) labelled exactly `text`,
// skipping any we've already clicked. Sites often put the label in a <span>
// inside the button, so we match the label and click its clickable ancestor.
// Exact match means "Turn off and delete activity" is never picked for "Turn off".
function findByText(text, skip = []) {
  const clickable = 'button, [role="button"], [role="menuitem"], [role="option"]';
  for (const label of document.querySelectorAll(`span, ${clickable}`)) {
    if (!isVisible(label) || label.textContent.trim() !== text) continue;
    const target = label.closest(clickable) || label;
    if (!skip.includes(target)) return target;
  }
  return null;
}

// Clicks each label in order, waiting for it to appear (menus and dialogs
// open with a delay). Returns the label it got stuck on, or null when done.
async function clickSequence(labels, clicked = []) {
  for (const label of labels) {
    const next = await waitFor(() => findByText(label, clicked));
    if (!next) return label;
    next.click();
    clicked.push(next);
    await sleep(1000);
  }
  return null;
}

// A bar across the top of the page saying what forgetme is doing.
function showBanner(message) {
  let banner = document.getElementById("forgetme-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "forgetme-banner";
    Object.assign(banner.style, {
      position: "fixed", top: "0", left: "0", right: "0", zIndex: "2147483647",
      padding: "10px", background: "#222", color: "#fff",
      font: "14px sans-serif", textAlign: "center",
    });
    document.body.appendChild(banner);
  }
  banner.textContent = "forgetme: " + message;
}
