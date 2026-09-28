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

// The page's words come from tauri/store/steam.md — gitignored, so never from
// this repository (words.js says why). The screenshotter hands the file's text
// in before the page loads, since a page opened from disk cannot fetch its
// neighbours; served over http, the page fetches the file itself. Either way a
// section the file does not have keeps its placeholder.
const WORDS_FILE = "tauri/store/steam.md";
const wordsSource = document.querySelector("#words-source");

async function readWords() {
  if (typeof globalThis.steamPageWordsText === "string") {
    return globalThis.steamPageWordsText;
  }
  if (!globalThis.location.protocol.startsWith("http")) return null;
  try {
    const response = await fetch("../steam.md", { cache: "no-store" });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

function appendRuns(element, paragraph) {
  for (const run of globalThis.steamPageWords.inline(paragraph)) {
    if (run.strong) {
      const strong = document.createElement("strong");
      strong.textContent = run.text;
      element.append(strong);
    } else {
      element.append(run.text);
    }
  }
}

function paragraphElement(paragraph, className) {
  const heading = /^###\s+(.+)$/.exec(paragraph);
  const element = document.createElement(heading ? "h3" : "p");
  if (className && !heading) element.className = className;
  appendRuns(element, heading ? heading[1] : paragraph);
  return element;
}

function fillSlot(slot, paragraphs, classFor) {
  // Images placed among the placeholders keep their place: after the Nth
  // paragraph of the real words, or at the end when there are fewer.
  const images = [...slot.querySelectorAll("img[data-after-paragraph]")];
  const elements = paragraphs.map((paragraph, index) =>
    paragraphElement(paragraph, classFor(index)),
  );
  slot.replaceChildren(...elements);
  for (const image of images) {
    const after = elements[Number(image.dataset.afterParagraph) - 1];
    if (after) after.after(image);
    else slot.append(image);
  }
}

async function showWords() {
  const text = await readWords();
  const sections = text ? globalThis.steamPageWords.parse(text) : {};
  const filled = [];
  for (const slot of document.querySelectorAll("[data-words]")) {
    const paragraphs = sections[slot.dataset.words];
    if (!paragraphs?.length) continue;
    filled.push(slot.dataset.words);
    if (slot.dataset.words === "brief") {
      slot.replaceChildren();
      appendRuns(slot, paragraphs.join(" "));
    } else if (slot.dataset.words === "about") {
      fillSlot(slot, paragraphs, (index) => (index === 0 ? "lead" : ""));
    } else {
      fillSlot(slot, paragraphs, () => "mature-description");
    }
  }
  const source = globalThis.steamPageWordsSource ?? WORDS_FILE;
  const missing = Object.keys(globalThis.steamPageWords.SECTIONS).filter(
    (key) => !filled.includes(key),
  );
  wordsSource.textContent = !text
    ? `WORDS: PLACEHOLDERS — ${WORDS_FILE} IS MISSING`
    : missing.length
      ? `WORDS: ${source} · PLACEHOLDERS FOR ${missing.join(", ").toUpperCase()}`
      : `WORDS: ${source}`;
  document.documentElement.dataset.wordsState = text ? "file" : "placeholders";
}

showWords();
