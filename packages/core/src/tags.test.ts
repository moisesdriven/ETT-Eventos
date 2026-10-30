import { describe, expect, it } from "vitest";
import { defaultEventWindow, parseEventTag } from "./tags";

describe("parseEventTag", () => {
  it.each([
    ["AEC03-EV01-WSI-07.01.26", "2026-01-07", ["aec03", "ev01", "wsi"]],
    ["men03-lci-08.10.26", "2026-10-08", ["men03", "lci"]],
    ["iatt-ev03-wci-21.02.26", "2026-02-21", ["iatt", "ev03", "wci"]],
    ["min04-ev01-wp-07.02.26", "2026-02-07", ["min04", "ev01", "wp"]],
    ["pci01-wci-31.08.26", "2026-08-31", ["pci01", "wci"]],
  ])("lee %s", (tag, startDay, codeParts) => {
    expect(parseEventTag(tag)).toEqual({ startDay, codeParts });
  });

  it.each(["ett", "quiero", "wa: +51918891333", "evento-31.02.26", "x-1.2.26"])("ignora %s", (tag) => {
    expect(parseEventTag(tag)).toBeNull();
  });
});

describe("defaultEventWindow", () => {
  it("dura 14 días desde la fecha de la etiqueta", () => {
    expect(defaultEventWindow("2026-10-08")).toEqual({ startDay: "2026-10-08", endDayExclusive: "2026-10-22" });
  });
});
