import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateOdds,
  ensureWallet,
  fetchWallet,
  fetchDuels,
  fetchDuelById,
  createDuel,
  closeDuel,
  resolveDuel,
  placeBet,
  deleteBet,
  claimPayout,
  fetchBetsForDuel,
} from "@/features/arena/arenaService";
import { mockDb } from "./supabaseMock";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const gemini = (text: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe("generateOdds (Gemini)", () => {
  it("lê o JSON e devolve as odds", async () => {
    fetchMock.mockResolvedValue(
      gemini('{"odds_a":1.8,"odds_b":3.5,"odds_c":2.1,"justification":"porque sim"}'),
    );
    expect(await generateOdds("caso", "A", "B", "C", "")).toEqual({
      odds_a: 1.8,
      odds_b: 3.5,
      odds_c: 2.1,
      justification: "porque sim",
    });
  });
  it("aceita a resposta embrulhada em ```json", async () => {
    fetchMock.mockResolvedValue(
      gemini('```json\n{"odds_a":2,"odds_b":2,"odds_c":4,"justification":"x"}\n```'),
    );
    expect((await generateOdds("c", "A", "B", "C", "")).odds_c).toBe(4);
  });
  it("nunca devolve odd abaixo de 1.01 e troca valor inválido pelo padrão", async () => {
    fetchMock.mockResolvedValue(gemini('{"odds_a":0.5,"odds_b":"abc","odds_c":-3}'));
    const r = await generateOdds("c", "A", "B", "C", "");
    expect(r.odds_a).toBe(1.01);
    expect(r.odds_b).toBe(2.0);
    expect(r.odds_c).toBe(1.01);
  });
  it("cota esgotada (429) tenta o próximo modelo", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(gemini('{"odds_a":3,"odds_b":3,"odds_c":3,"justification":""}'));
    const r = await generateOdds("c", "A", "B", "C", "");
    expect(r.odds_a).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("gemini-2.0-flash:");
    expect(fetchMock.mock.calls[1][0]).toContain("gemini-2.0-flash-lite:");
  });
  it("todos os modelos sem cota => odds padrão (não quebra a criação do caso)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    expect(await generateOdds("c", "A", "B", "C", "")).toEqual({
      odds_a: 2.0,
      odds_b: 2.0,
      odds_c: 3.0,
      justification: "",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("erro da API ou JSON inválido => odds padrão", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "erro" });
    expect((await generateOdds("c", "A", "B", "C", "")).odds_a).toBe(2.0);
    fetchMock.mockResolvedValue(gemini("isso não é json"));
    expect((await generateOdds("c", "A", "B", "C", "")).odds_c).toBe(3.0);
  });
  it("envia o contexto do criador no prompt", async () => {
    fetchMock.mockResolvedValue(gemini("{}"));
    await generateOdds("Quem ganha?", "X", "Y", "Z", "só filmes em inglês");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt: string = body.contents[0].parts[0].text;
    expect(prompt).toContain("Quem ganha?");
    expect(prompt).toContain("só filmes em inglês");
  });
});

describe("carteira", () => {
  it("ensureWallet devolve a carteira do banco", async () => {
    mockDb.tables.arena_wallets = [{ user_id: "u1", balance: 750, updated_at: "x" }];
    expect((await ensureWallet("u1")).balance).toBe(750);
    expect(mockDb.writes[0].args[0]).toEqual({ user_id: "u1", balance: 1000 });
  });
  it("ensureWallet cai em 1000 pts se o banco não devolver nada", async () => {
    expect(await ensureWallet("u1")).toMatchObject({ user_id: "u1", balance: 1000 });
  });
  it("fetchWallet sem carteira = null", async () => {
    expect(await fetchWallet("u1")).toBeNull();
  });
});

describe("casos (duelos)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    created_by: "u2",
    scenario: "Quem ganha?",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    category: "Cinema",
    creator_context: null,
    odds_a: "1.8",
    odds_b: "3.5",
    odds_c: "2.1",
    odds_justification: null,
    status: "open",
    result: null,
    verdict: null,
    created_at: "",
    updated_at: "",
    profiles: { display_name: "Criador", avatar_url: null },
    arena_bets: [{ id: "b1" }, { id: "b2" }],
    ...over,
  });

  it("fetchDuels converte odds em número, conta apostas e acha a minha", async () => {
    mockDb.tables.arena_duels = [row()];
    mockDb.tables.arena_bets = [{ id: "b1", duel_id: "d1", user_id: "u1", side: "A", amount: 100 }];
    const [d] = await fetchDuels("u1");
    expect(d.odds_a).toBe(1.8);
    expect(d.bet_count).toBe(2);
    expect(d.my_bet?.id).toBe("b1");
    expect(d.creator_profile?.display_name).toBe("Criador");
  });
  it("fetchDuels sem casos = vazio", async () => {
    expect(await fetchDuels("u1")).toEqual([]);
  });
  it("fetchDuelById inexistente = null", async () => {
    expect(await fetchDuelById("zzz", "u1")).toBeNull();
  });
  it("fetchDuelById existente traz a minha aposta", async () => {
    mockDb.tables.arena_duels = [row()];
    mockDb.tables.arena_bets = [{ id: "b9", user_id: "u1", side: "B" }];
    const d = await fetchDuelById("d1", "u1");
    expect(d?.scenario).toBe("Quem ganha?");
    expect(d?.my_bet?.id).toBe("b9");
  });
  it("createDuel grava como 'open' com as odds", async () => {
    mockDb.tables.arena_duels = [{ id: "novo" }];
    const r = await createDuel("u1", "cenário", "A", "B", "C", "Cat", "", {
      odds_a: 2,
      odds_b: 3,
      odds_c: 4,
      justification: "",
    });
    expect(r).toEqual({ data: "novo", error: null });
    expect(mockDb.writes[0].args[0]).toMatchObject({
      created_by: "u1",
      status: "open",
      creator_context: null,
      odds_justification: null,
      odds_b: 3,
    });
  });
  it("createDuel devolve o erro", async () => {
    mockDb.errors.arena_duels = { message: "rls" };
    expect(await createDuel("u1", "c", "A", "B", "C", "x", "", { odds_a: 2, odds_b: 2, odds_c: 3, justification: "" })).toEqual({
      data: null,
      error: "rls",
    });
  });
  it("closeDuel marca como fechado", async () => {
    expect(await closeDuel("d1")).toEqual({ error: null });
    expect(mockDb.writes[0].args[0]).toMatchObject({ status: "closed" });
  });
});

describe("resolveDuel — prêmios", () => {
  const odds = { odds_a: 1.8, odds_b: 3.5, odds_c: 2.1 };
  it("sem apostas só resolve o caso", async () => {
    expect(await resolveDuel("d1", "A", "veredito", odds)).toEqual({ error: null });
    expect(mockDb.writes).toHaveLength(1);
    expect(mockDb.writes[0].args[0]).toMatchObject({ status: "resolved", result: "A", verdict: "veredito" });
  });
  it("quem acertou recebe aposta × odd (arredondado para baixo); quem errou 0", async () => {
    mockDb.tables.arena_bets = [
      { id: "b1", side: "A", amount: 155 }, // 155 × 1.8 = 279
      { id: "b2", side: "B", amount: 100 },
    ];
    await resolveDuel("d1", "A", "v", odds);
    const payouts = mockDb.writes
      .filter((w) => w.table === "arena_bets")
      .map((w) => (w.args[0] as { actual_payout: number }).actual_payout);
    // as duas apostas recebem update (o mock devolve as mesmas linhas)
    expect(payouts).toEqual([279, 0]);
  });
  it("erro ao fechar o caso não paga ninguém", async () => {
    mockDb.errors.arena_duels = { message: "rls" };
    expect(await resolveDuel("d1", "A", "v", odds)).toEqual({ error: "rls" });
    expect(mockDb.writes.filter((w) => w.table === "arena_bets")).toHaveLength(0);
  });
});

describe("apostas e saldo", () => {
  it("placeBet grava a aposta e desconta do saldo", async () => {
    mockDb.tables.arena_wallets = [{ balance: 500 }];
    expect(await placeBet("u1", "d1", "B", 120, 420)).toEqual({ error: null });
    const bet = mockDb.writes.find((w) => w.table === "arena_bets")!;
    expect(bet.args[0]).toEqual({ duel_id: "d1", user_id: "u1", side: "B", amount: 120, potential_payout: 420 });
    const wallet = mockDb.writes.find((w) => w.table === "arena_wallets")!;
    expect((wallet.args[0] as { balance: number }).balance).toBe(380);
  });
  it("aposta repetida (23505) não mexe no saldo", async () => {
    mockDb.errors.arena_bets = { message: "dup", code: "23505" };
    expect(await placeBet("u1", "d1", "B", 100, 200)).toEqual({ error: "Você já apostou neste caso" });
    expect(mockDb.writes.some((w) => w.table === "arena_wallets")).toBe(false);
  });
  it("deleteBet devolve o valor ao saldo", async () => {
    mockDb.tables.arena_wallets = [{ balance: 400 }];
    expect(await deleteBet("u1", "b1", 100)).toEqual({ error: null });
    expect((mockDb.writes.find((w) => w.table === "arena_wallets")!.args[0] as { balance: number }).balance).toBe(500);
  });
  it("deleteBet com erro não mexe no saldo", async () => {
    mockDb.errors.arena_bets = { message: "rls" };
    expect(await deleteBet("u1", "b1", 100)).toEqual({ error: "rls" });
    expect(mockDb.writes.some((w) => w.table === "arena_wallets")).toBe(false);
  });
  it("claimPayout marca como resgatado e credita o prêmio", async () => {
    mockDb.tables.arena_wallets = [{ balance: 100 }];
    mockDb.tables.arena_bets = [{ id: "b1" }]; // a linha foi de fato atualizada
    expect(await claimPayout("u1", "b1", 279)).toEqual({ error: null });
    expect(mockDb.writes.find((w) => w.table === "arena_bets")!.args[0]).toEqual({ payout_claimed: true });
    expect((mockDb.writes.find((w) => w.table === "arena_wallets")!.args[0] as { balance: number }).balance).toBe(379);
  });
  it("claimPayout de aposta já resgatada NÃO credita de novo", async () => {
    mockDb.tables.arena_wallets = [{ balance: 100 }];
    mockDb.tables.arena_bets = []; // nenhuma linha com payout_claimed=false
    expect(await claimPayout("u1", "b1", 279)).toEqual({ error: "Prêmio já resgatado" });
    expect(mockDb.writes.some((w) => w.table === "arena_wallets")).toBe(false);
  });
  it("claimPayout com erro do banco não credita", async () => {
    mockDb.errors.arena_bets = { message: "rls" };
    expect(await claimPayout("u1", "b1", 279)).toEqual({ error: "rls" });
    expect(mockDb.writes.some((w) => w.table === "arena_wallets")).toBe(false);
  });
  it("fetchBetsForDuel mapeia as linhas", async () => {
    mockDb.tables.arena_bets = [
      { id: "b1", duel_id: "d1", user_id: "u1", side: "A", amount: 10, potential_payout: 18, actual_payout: null, payout_claimed: false, created_at: "", profiles: { display_name: "Fulano", avatar_url: null } },
    ];
    const [b] = await fetchBetsForDuel("d1");
    expect(b).toMatchObject({ id: "b1", side: "A", profile: { display_name: "Fulano" } });
  });
});
