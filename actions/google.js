// Scripted action: turn off Google ad personalization and Web & App Activity.
//
// Google's markup is generated and changes often, so elements are found by
// label and visible text rather than class names. English UI only for now.
// Uses helpers from common.js.

(() => {
  function findAdsToggle() {
    // aria-label reads "Personalized ads are on. Turn off." (or "are off").
    return document.querySelector('button[aria-label^="Personalized ads are"]');
  }

  function adsAreOff() {
    const toggle = findAdsToggle();
    return toggle && toggle.getAttribute("aria-label").includes("are off");
  }

  async function turnOffPersonalizedAds() {
    const toggle = await waitFor(findAdsToggle);
    if (!toggle) return "Couldn't find the Personalized ads control. Are you signed in?";
    if (adsAreOff()) return "Personalized ads were already off.";

    toggle.click();
    await clickSequence(["Turn off personalized ads"], [toggle]);
    return adsAreOff()
      ? "Personalized ads turned off."
      : "Tried, but Personalized ads still look on. Please check this page.";
  }

  async function turnOffWebAndAppActivity() {
    // The "Saving activity" card; its text reads "Your Web & App Activity is on/off".
    const card = await waitFor(() =>
      document.querySelector('[aria-label="Button to enable or disable activity controls setting"]')
    );
    if (!card) return "Couldn't find the Web & App Activity control. Are you signed in?";
    if (!card.textContent.includes("Web & App Activity is on")) return "Web & App Activity was already off.";

    card.click();
    // "Turn off" button opens a dropdown whose first item is also "Turn off".
    // Already-clicked elements are skipped, so the second step hits the menu item.
    const stuck = await clickSequence(["Turn off", "Turn off", "Got it"], [card]);
    return stuck
      ? `Stopped at "${stuck}". Please finish on this page.`
      : "Web & App Activity turned off.";
  }

  async function run() {
    const action = location.hostname === "myadcenter.google.com"
      ? turnOffPersonalizedAds
      : turnOffWebAndAppActivity;
    showBanner("working…");
    showBanner(await action());
  }

  run();
})();
