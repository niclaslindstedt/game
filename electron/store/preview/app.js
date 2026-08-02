const stageImage = document.querySelector("#stage-image");
const stageLabel = document.querySelector("#stage-label");
const thumbs = [...document.querySelectorAll(".thumb")];
const previous = document.querySelector("#gallery-prev");
const next = document.querySelector("#gallery-next");

function selectScreenshot(index) {
  const selected = thumbs[(index + thumbs.length) % thumbs.length];
  for (const candidate of thumbs) candidate.classList.remove("active");
  selected.classList.add("active");
  stageImage.src = selected.dataset.src;
  stageImage.alt = selected.querySelector("img").alt;
  stageLabel.textContent = selected.dataset.label;
}

for (const [index, thumb] of thumbs.entries()) {
  thumb.addEventListener("click", () => selectScreenshot(index));
}

previous.addEventListener("click", () => {
  selectScreenshot(
    thumbs.findIndex((thumb) => thumb.classList.contains("active")) - 1,
  );
});

next.addEventListener("click", () => {
  selectScreenshot(
    thumbs.findIndex((thumb) => thumb.classList.contains("active")) + 1,
  );
});

const osTabs = [...document.querySelectorAll(".os-tab")];
const osPanels = [...document.querySelectorAll("[data-os-panel]")];

for (const tab of osTabs) {
  tab.addEventListener("click", () => {
    for (const candidate of osTabs) candidate.classList.remove("active");
    for (const panel of osPanels) {
      panel.hidden = panel.dataset.osPanel !== tab.dataset.os;
    }
    tab.classList.add("active");
  });
}
