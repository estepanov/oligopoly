import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = path.dirname(fileURLToPath(import.meta.url));

function readStyle(relativePath: string): string {
  return readFileSync(path.join(stylesDir, relativePath), "utf8");
}

describe("responsive layout CSS contracts", () => {
  it("loads focused page styles after the shared page sheet", () => {
    const globalCss = readStyle("global.css");

    expect(globalCss.indexOf("./pages/app-pages.css")).toBeGreaterThan(-1);
    expect(globalCss.indexOf("./pages/onboarding.css")).toBeGreaterThan(
      globalCss.indexOf("./pages/app-pages.css"),
    );
    expect(globalCss.indexOf("./pages/game-flow.css")).toBeGreaterThan(
      globalCss.indexOf("./pages/app-pages.css"),
    );
  });

  it("keeps the home hero visually composed on desktop and mobile", () => {
    const onboardingCss = readStyle("pages/onboarding.css");

    expect(onboardingCss).toMatch(/\.homeHero\s*{[\s\S]*min-width:\s*0/);
    expect(onboardingCss).toMatch(/\.homeHeroVisual\s*{[\s\S]*display:\s*grid/);
    expect(onboardingCss).toMatch(
      /\.homeBoardPreview\s*{[\s\S]*aspect-ratio:\s*1/,
    );
    expect(onboardingCss).toMatch(
      /\.firstGameStep > strong,[\s\S]*\.firstGameStep > span[\s\S]*grid-column:\s*2/,
    );
    expect(onboardingCss).toMatch(
      /@media \(min-width:\s*1040px\)[\s\S]*\.homeHero\s*{[\s\S]*grid-template-columns:/,
    );
    expect(onboardingCss).toMatch(
      /@media \(max-width:\s*680px\)[\s\S]*\.homeHero \.buttonRow\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it("keeps Play as the first desktop game-flow column", () => {
    const appPagesCss = readStyle("pages/app-pages.css");
    const gameFlowCss = readStyle("pages/game-flow.css");

    expect(gameFlowCss).toMatch(
      /\.gamePage \.gamePlayCard\s*{[\s\S]*grid-area:\s*play/,
    );
    expect(gameFlowCss).toMatch(
      /@media \(min-width:\s*1040px\)[\s\S]*\.gamePage \.gameWorkspace\s*{[\s\S]*grid-template-areas:\s*"play board"\s*"secondary board"/,
    );
    expect(appPagesCss).not.toMatch(/\.gameSideRail\s*{[\s\S]*order:\s*-1/);
  });

  it("uses a readable mobile board overview instead of shrinking the full board", () => {
    const gameFlowCss = readStyle("pages/game-flow.css");

    expect(gameFlowCss).toMatch(
      /\.mobileBoardOverview\s*{[\s\S]*display:\s*none/,
    );
    expect(gameFlowCss).toMatch(
      /@media \(max-width:\s*680px\)[\s\S]*\.mobileBoardOverview\s*{[\s\S]*display:\s*grid/,
    );
    expect(gameFlowCss).toMatch(
      /@media \(max-width:\s*680px\)[\s\S]*\.mobileBoardTileMain strong\s*{[\s\S]*font-size:\s*1rem/,
    );
    expect(gameFlowCss).toMatch(
      /@media \(max-width:\s*680px\)[\s\S]*\.boardGrid\s*{[\s\S]*display:\s*none/,
    );
  });
});
