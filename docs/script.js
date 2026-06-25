const root = document.documentElement;
const hero = document.querySelector(".hero");
const range = document.querySelector("#overlay-range");
const output = document.querySelector("#overlay-output");

function setSplit(value) {
  const boundedValue = Math.min(94, Math.max(12, Number(value)));
  root.style.setProperty("--split", `${boundedValue}%`);
  if (range) {
    range.value = String(Math.round(boundedValue));
  }
  if (output) {
    output.value = `${Math.round(boundedValue)}%`;
    output.textContent = `${Math.round(boundedValue)}%`;
  }
}

if (range) {
  range.addEventListener("input", (event) => {
    setSplit(event.target.value);
  });
  setSplit(range.value);
}

if (hero) {
  let dragging = false;

  const setFromPointer = (event) => {
    const bounds = hero.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(position);
  };

  hero.addEventListener("pointerdown", (event) => {
    const interactive = event.target.closest("a, button, input, label, form");
    if (interactive) {
      return;
    }
    dragging = true;
    hero.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });

  hero.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    setFromPointer(event);
  });

  hero.addEventListener("pointerup", (event) => {
    dragging = false;
    if (hero.hasPointerCapture(event.pointerId)) {
      hero.releasePointerCapture(event.pointerId);
    }
  });

  hero.addEventListener("pointercancel", () => {
    dragging = false;
  });
}
