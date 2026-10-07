import { describe, expect, it } from "vitest";
import seed from "../data/catalog.fallback.json";
import { appNumbers, demosByApp, detectPlatform, driveId, filterApps, seedToCatalog, stats, youtubeId } from "./catalog";
import type { Seed } from "./types";

const c = seedToCatalog(seed as Seed);

describe("catalog", () => {
  it("converts the seed into 6 groups / 22 apps / 22 guides / 26 demos", () => {
    expect(stats(c)).toMatchObject({ apps: 22, groups: 6, guides: 22, demos: 26, courses: 3 });
  });
  it("only lists *.ose.vn apps", () => {
    for (const g of c.groups) for (const a of g.apps) expect(a.host.endsWith(".ose.vn")).toBe(true);
  });
  it("numbers apps 1..22 in catalogue order", () => {
    const n = appNumbers(c);
    expect(n["poisson"]).toBe(1);
    expect(n["berthing-ai"]).toBe(17);
    expect(n["mcdm"]).toBe(22);
  });
  it("filters by group and text in both languages", () => {
    expect(filterApps(c, "port", "", "vi").flatMap((g) => g.apps)).toHaveLength(5);
    expect(filterApps(c, "all", "ukc", "vi").flatMap((g) => g.apps).map((a) => a.slug)).toEqual(["ukc"]);
    expect(filterApps(c, "all", "mooring load", "en").flatMap((g) => g.apps).map((a) => a.slug)).toContain("mooring-loads");
    expect(filterApps(c, "all", "zzzz", "vi")).toHaveLength(0);
  });
  it("detects demo platforms", () => {
    expect(detectPlatform("https://lnkd.in/p/gk3UUsWp")).toBe("linkedin");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://lnkd.in/p/x")).toBeNull();
    expect(detectPlatform("https://drive.google.com/file/d/1Vfj-hlrcZYoHwokuwr8TxeRJYJyFeegP/view?usp=sharing")).toBe("drive");
    expect(driveId("https://drive.google.com/file/d/1Vfj-hlrcZYoHwokuwr8TxeRJYJyFeegP/view?usp=sharing")).toBe("1Vfj-hlrcZYoHwokuwr8TxeRJYJyFeegP");
    expect(driveId("https://drive.google.com/drive/folders/1fFw25QlTID")).toBeNull();
  });
  it("links one demo clip to every app", () => {
    const m = demosByApp(c);
    expect(Object.keys(m)).toHaveLength(22);
    expect(m["berthing-ai"].platform).toBe("drive");
  });
});
