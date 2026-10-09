import { expect, it } from "vitest";
import postcss from "postcss";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");

it.each([false, true])("suppresses the live app in print media with preview-open=%s", previewOpen => {
  document.body.classList.toggle("print-preview-open", previewOpen);
  const shell = document.createElement("div");
  shell.className = "app-shell";
  document.body.appendChild(shell);
  try {
    let hidden = false;
    const css = postcss.parse(styles);
    css.walkAtRules("media", media => {
      if (media.params !== "print") return;
      media.walkRules(rule => {
        if (!rule.selectors.some(selector => shell.matches(selector))) return;
        rule.walkDecls("display", declaration => {
          if (declaration.value === "none" && declaration.important) hidden = true;
        });
      });
    });
    expect(hidden).toBe(true);
  } finally {
    shell.remove();
    document.body.classList.remove("print-preview-open");
  }
});
