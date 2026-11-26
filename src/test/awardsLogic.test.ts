import { describe, expect, it } from "vitest";
import {
  ballotCategories,
  approvedCategories,
  ballotProgress,
  canEditCategory,
  canManageNominees,
  canNominate,
  categoryQuota,
  clampStep,
  countOwned,
  groupNominees,
  isEditionVisible,
  nextUnvoted,
  nomineeName,
  nomineeQuota,
  rankCategory,
  remainingQuota,
  sortCategories,
  validateCategory,
  validateNominee,
  visibleCategories,
} from "@/features/awards/awardsLogic";
import type { AwardsCategory, AwardsNominee } from "@/features/awards/awardsTypes";

const cat = (id: string, by = "u1", position = 0, title = id, approved = true): AwardsCategory => ({
  id,
  editionSlug: "2026",
  title,
  description: null,
  imageUrl: null,
  position,
  createdBy: by,
  approved,
});
const nom = (id: string, categoryId: string, by = "u1", label: string | null = id): AwardsNominee => ({
  id,
  categoryId,
  label,
  imageUrl: null,
  createdBy: by,
});

describe("limites por pessoa", () => {
  it("remainingQuota desconta o usado e nunca fica negativo", () => {
    expect(remainingQuota(0, 5)).toBe(5);
    expect(remainingQuota(3, 5)).toBe(2);
    expect(remainingQuota(5, 5)).toBe(0);
    expect(remainingQuota(9, 5)).toBe(0);
  });
  it("admin não tem limite", () => {
    expect(remainingQuota(50, 5, true)).toBe(Infinity);
  });
  it("conta só o que o usuário criou", () => {
    const cats = [cat("a", "u1"), cat("b", "u1"), cat("c", "u2")];
    expect(countOwned(cats, "u1")).toBe(2);
    expect(countOwned(cats, null)).toBe(0);
    expect(categoryQuota(cats, "u1", false)).toBe(3);
    expect(categoryQuota(cats, "u2", false)).toBe(4);
  });
  it("10 indicados seus esgotam a categoria; os de outras pessoas não contam", () => {
    const mine = Array.from({ length: 10 }, (_, i) => nom(`n${i}`, "c1", "u1"));
    expect(nomineeQuota(mine, "u1", false)).toBe(0);
    expect(nomineeQuota([...mine.slice(1), nom("x", "c1", "u2")], "u1", false)).toBe(1);
  });
  it("5 categorias esgotam a cota; apagar uma libera a vaga", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => cat(id, "u1"));
    expect(categoryQuota(five, "u1", false)).toBe(0);
    expect(categoryQuota(five.slice(1), "u1", false)).toBe(1);
  });
  it("cota de indicados é por pessoa (o chamador passa os da categoria)", () => {
    const list = [nom("n1", "c1", "u1"), nom("n2", "c1", "u1"), nom("n3", "c1", "u2")];
    expect(nomineeQuota(list, "u1", false)).toBe(8); // limite de 10: o indicado de u2 não gasta vaga de u1
    expect(nomineeQuota(list, "u1", true)).toBe(Infinity);
  });
});

describe("permissões por fase", () => {
  it("só indica em nominations, exceto admin", () => {
    expect(canNominate("nominations", false)).toBe(true);
    expect(canNominate("voting", false)).toBe(false);
    expect(canNominate("hidden", false)).toBe(false);
    expect(canNominate("closed", true)).toBe(true);
  });
  it("categoria: dono renomeia/apaga na indicação enquanto não aprovada; admin sempre; outro nunca", () => {
    const open = cat("c", "u1", 0, "c", false);
    expect(canEditCategory(open, "u1", false, "nominations")).toBe(true);
    expect(canEditCategory(open, "u1", false, "voting")).toBe(false);
    expect(canEditCategory(open, "u2", false, "nominations")).toBe(false);
    expect(canEditCategory(open, null, false, "nominations")).toBe(false);
    expect(canEditCategory({ ...open, approved: true }, "u1", false, "nominations")).toBe(false);
    expect(canEditCategory({ ...open, approved: true }, "u2", true, "closed")).toBe(true);
  });
  it("indicados: o dono da categoria cuida deles na indicação, mesmo aprovada", () => {
    const approved = cat("c", "u1");
    expect(canManageNominees(approved, "u1", false, "nominations")).toBe(true);
    expect(canManageNominees(approved, "u1", false, "voting")).toBe(false);
    expect(canManageNominees(approved, "u2", false, "nominations")).toBe(false);
    expect(canManageNominees(approved, "u2", true, "closed")).toBe(true);
  });
  it("cada um vê só as próprias categorias; admin vê todas; aprovadas filtradas", () => {
    const list = [cat("a", "u1", 0, "a", false), cat("b", "u2", 1, "b", true)];
    expect(visibleCategories(list, "u1", false).map((c) => c.id)).toEqual(["a"]);
    expect(visibleCategories(list, null, false)).toEqual([]);
    expect(visibleCategories(list, "u3", true)).toHaveLength(2);
    expect(approvedCategories(list).map((c) => c.id)).toEqual(["b"]);
  });
  it("hidden não é visível ao grupo", () => {
    expect(isEditionVisible("hidden")).toBe(false);
    expect(isEditionVisible("nominations")).toBe(true);
    expect(isEditionVisible("closed")).toBe(true);
  });
});

describe("validação", () => {
  it("categoria exige nome", () => {
    expect(validateCategory("  ").ok).toBe(false);
    expect(validateCategory("Melhor rolê").ok).toBe(true);
    expect(validateCategory("x".repeat(81)).ok).toBe(false);
  });
  it("indicado aceita texto, imagem ou os dois, mas não vazio", () => {
    expect(validateNominee("", false).ok).toBe(false);
    expect(validateNominee("  ", false).ok).toBe(false);
    expect(validateNominee("Fulano", false).ok).toBe(true);
    expect(validateNominee("", true).ok).toBe(true);
    expect(validateNominee("x".repeat(81), true).ok).toBe(false);
  });
  it("nomineeName tem fallback para indicado só com imagem", () => {
    expect(nomineeName({ label: " Ana " })).toBe("Ana");
    expect(nomineeName({ label: null })).toBe("Sem nome");
  });
});

describe("organização", () => {
  it("ordena por position e depois por título", () => {
    const sorted = sortCategories([cat("b", "u", 1, "B"), cat("a2", "u", 0, "Z"), cat("a1", "u", 0, "A")]);
    expect(sorted.map((c) => c.id)).toEqual(["a1", "a2", "b"]);
  });
  it("agrupa indicados por categoria", () => {
    const g = groupNominees([nom("n1", "c1"), nom("n2", "c2"), nom("n3", "c1")]);
    expect(g.c1.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(g.c2).toHaveLength(1);
  });
});

describe("cédula", () => {
  it("só categorias com 2+ indicados entram", () => {
    const cats = [cat("c1"), cat("c2", "u", 1), cat("c3", "u", 2)];
    const g = groupNominees([nom("a", "c1"), nom("b", "c1"), nom("c", "c2")]);
    expect(ballotCategories(cats, g).map((c) => c.id)).toEqual(["c1"]);
  });
  it("categoria não aprovada fica fora da cédula", () => {
    const cats = [cat("c1", "u", 0, "c1", false), cat("c2", "u", 1)];
    const g = groupNominees([nom("a", "c1"), nom("b", "c1"), nom("c", "c2"), nom("d", "c2")]);
    expect(ballotCategories(cats, g).map((c) => c.id)).toEqual(["c2"]);
  });
  it("progresso, faltantes e conclusão", () => {
    expect(ballotProgress(["c1", "c2", "c3"], { c1: "a" })).toEqual({
      voted: 1,
      total: 3,
      complete: false,
      missing: ["c2", "c3"],
    });
    expect(ballotProgress(["c1"], { c1: "a" }).complete).toBe(true);
    expect(ballotProgress([], {}).complete).toBe(false);
  });
  it("nextUnvoted pula categorias já votadas", () => {
    const ids = ["c1", "c2", "c3", "c4"];
    expect(nextUnvoted(ids, { c2: "x" }, 0)).toBe(2);
    expect(nextUnvoted(ids, { c2: "x", c3: "y", c4: "z" }, 0)).toBe(-1);
    expect(nextUnvoted(ids, {}, 3)).toBe(-1);
  });
  it("clampStep permite o passo extra da revisão", () => {
    expect(clampStep(-1, 3)).toBe(0);
    expect(clampStep(9, 3)).toBe(3);
    expect(clampStep(2, 3)).toBe(2);
  });
});

describe("resultado", () => {
  const nominees = [nom("a", "c1", "u", "Ana"), nom("b", "c1", "u", "Beto"), nom("c", "c1", "u", "Caio")];
  it("ordena por votos e marca o vencedor", () => {
    const r = rankCategory(nominees, { c1: [{ nomineeId: "b", votes: 3 }, { nomineeId: "a", votes: 1 }] }, "c1");
    expect(r.map((x) => x.nominee.id)).toEqual(["b", "a", "c"]);
    expect(r[0]).toMatchObject({ votes: 3, pct: 75, isWinner: true });
    expect(r[1].isWinner).toBe(false);
    expect(r[2].votes).toBe(0);
  });
  it("empate no topo gera vários vencedores", () => {
    const r = rankCategory(nominees, { c1: [{ nomineeId: "a", votes: 2 }, { nomineeId: "b", votes: 2 }] }, "c1");
    expect(r.filter((x) => x.isWinner).map((x) => x.nominee.id)).toEqual(["a", "b"]);
  });
  it("sem votos ninguém vence", () => {
    const r = rankCategory(nominees, {}, "c1");
    expect(r.every((x) => !x.isWinner && x.pct === 0)).toBe(true);
  });
});
