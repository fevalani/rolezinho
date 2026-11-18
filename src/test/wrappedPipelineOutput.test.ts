import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSlides, computeStats, parseEdition } from "@/features/wrapped/wrappedLogic";

// Os JSONs são gerados pelo pipeline Python (scripts/wrapped-pipeline) em cima de um chat
// 100% sintético e conferidos lá (unittest). Aqui garantimos que o frontend os aceita inteiros.
const load = (n: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../scripts/wrapped-pipeline/tests/fixtures/${n}`), "utf-8"));

describe.each(["expected_dry_run.json", "expected_full.json", "expected_takeout.json", "expected_moment.json"])("saída do pipeline: %s", (file) => {
  const raw = load(file);
  const { edition, errors, warnings } = parseEdition(raw);

  it("passa na validação do frontend, sem erros nem slides descartados", () => {
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(edition!.slides).toHaveLength(raw.slides.length);
    expect(edition!.isActive).toBe(false);
  });

  it("não perde título, descrição, ranking nem imagens locais", () => {
    edition!.slides.forEach((s, i) => {
      expect(s.type).toBe(raw.slides[i].type);
      expect(s.title).toBe(raw.slides[i].title);
      if (raw.slides[i].description) expect(s.description).toBe(raw.slides[i].description);
      if (raw.slides[i].items) {
        expect(s.items).toHaveLength(raw.slides[i].items.length);
        // foto do vencedor (caminho local) tem que sobreviver à validação
        raw.slides[i].items.forEach((it: { imageUrl?: string }, k: number) => {
          if (it.imageUrl) expect(s.items![k].imageUrl).toBe(it.imageUrl);
        });
      }
      if (raw.slides[i].imageUrl) expect(s.imageUrl).toBe(raw.slides[i].imageUrl);
    });
  });

  it("vira stories (com abertura própria e fechamento)", () => {
    const slides = buildSlides(edition!, computeStats({ musics: [], culturaPosts: [], culturaItems: [], dice: [], games: [], predictions: [], rsvps: [] }, 2026), { mode: "group" });
    expect(slides[0].kind).toBe("intro");
    expect(slides[slides.length - 1].kind).toBe("outro");
    // slides automáticos (dados do app) somem quando não há dados; os demais ficam, mais o encerramento
    const custom = raw.slides.filter((x: { type: string }) => x.type !== "auto_user_stats").length;
    expect(slides.length).toBe(custom + 1);
    expect(raw.slides.some((x: { type: string }) => x.type === "auto_user_stats")).toBe(true);
  });
});
