const stageImage = document.querySelector("#stage-image");
const stageLabel = document.querySelector("#stage-label");
const thumbs = [...document.querySelectorAll(".thumb")];

for (const thumb of thumbs) {
  thumb.addEventListener("click", () => {
    for (const candidate of thumbs) candidate.classList.remove("active");
    thumb.classList.add("active");
    stageImage.src = thumb.dataset.src;
    stageImage.alt = thumb.querySelector("img").alt;
    stageLabel.textContent = thumb.dataset.label;
  });
}
