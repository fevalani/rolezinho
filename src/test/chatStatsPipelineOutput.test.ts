import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseChatStats, buildRankings } from "@/features/chatstats/chatStatsLogic";

// A saída REAL do pipeline Python (dados sintéticos) precisa passar na validação do app.
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../scripts/chat-insights/tests/fixtures/expected_no_ai.json"), "utf-8"),
);

describe("saída do pipeline chat-insights x frontend", () => {
  it("é aceita sem erros nem avisos e mantém os totais", () => {
    const { stats, errors, warnings } = parseChatStats(fixture);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(stats!.totalMessages).toBe(fixture.totalMessages);
    expect(stats!.people).toHaveLength(fixture.people.length);
    expect(stats!.byHour.reduce((a, b) => a + b, 0)).toBe(fixture.totalMessages);
  });
  it("gera rankings a partir dela", () => {
    const stats = parseChatStats(fixture).stats!;
    expect(buildRankings(stats).map((r) => r.key)).toEqual(expect.arrayContaining(["talkers", "starters", "fast"]));
  });
  it("nenhum campo de pessoa ficou de fora do tipo do app", () => {
    const keys = Object.keys(fixture.people[0]).sort();
    const parsed = Object.keys(parseChatStats(fixture).stats!.people[0]).sort();
    expect(parsed).toEqual(keys);
  });
});
