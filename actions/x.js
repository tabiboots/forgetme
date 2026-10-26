// Scripted action: turn off X (Twitter) personalization and data sharing.
//
// Each settings page background.js opens has one or two checkboxes, and on
// all of them "checked" means "allow more tracking", so we untick all.

(() => {
  function findCheckboxes() {
    const boxes = document.querySelectorAll('input[type="checkbox"]');
    return boxes.length ? [...boxes] : null;
  }

  async function run() {
    showBanner("working…");
    if (!(await waitFor(findCheckboxes))) {
      return showBanner("Couldn't find any settings on this page. Are you logged in?");
    }
    await sleep(1000); // let the rest of the page finish rendering

    const ticked = findCheckboxes().filter(box => box.checked);
    for (const box of ticked) {
      box.click();
      await sleep(500);
    }

    const stillOn = findCheckboxes().filter(box => box.checked).length;
    if (stillOn) showBanner(`${stillOn} setting(s) still on. Please check this page.`);
    else if (ticked.length) showBanner(`Turned off ${ticked.length} setting(s).`);
    else showBanner("Already off.");
  }

  run();
})();
