import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Word500Game } from "@/features/letreco/Word500Game";
import { LetrosoGame } from "@/features/letreco/LetrosoGame";
import { getWord500WordOfDay, getWord500GameDate, word500PointsFor, WORD_LIST, WORD500_MAX_ATTEMPTS } from "@/features/letreco/word500Logic";
import { getLetrosoWordOfDay, getLetrosoGameDate, letrosoPointsFor, LETROSO_WORDS } from "@/features/letreco/letrosoLogic";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const type = (word: string) => {
  for (const ch of word) fireEvent.keyDown(window, { key: ch });
};
const enter = () => fireEvent.keyDown(window, { key: "Enter" });
const savedRows = (table: string) => mockDb.writes.filter((w) => w.table === table).map((w) => w.args[0] as Record<string, unknown>);

describe("Word500Game", () => {
  const ready = async () => {
    loginAs();
    renderWithProviders(<Word500Game />);
    await screen.findAllByText("↵");
  };

  it("Enter com palavra incompleta avisa e não grava", async () => {
    await ready();
    type("AB");
    enter();
    expect(await screen.findByText("Faltam letras")).toBeInTheDocument();
    expect(savedRows("word500_games")).toHaveLength(0);
  });

  it("palavra fora da lista é recusada", async () => {
    await ready();
    type("ZZZZZ");
    enter();
    expect(await screen.findByText("Palavra não está na lista")).toBeInTheDocument();
    expect(savedRows("word500_games")).toHaveLength(0);
  });

  it("palpite válido errado grava a tentativa", async () => {
    await ready();
    const answer = getWord500WordOfDay();
    type(WORD_LIST.find((w) => w !== answer)!);
    enter();
    await waitFor(() => expect(savedRows("word500_games")).toHaveLength(1));
    expect(savedRows("word500_games")[0]).toMatchObject({
      user_id: "user-1",
      game_date: getWord500GameDate(),
      status: "playing",
      attempts: 1,
      score: 0,
    });
  });

  it("acertar a palavra grava vitória com os pontos da tentativa", async () => {
    await ready();
    type(getWord500WordOfDay());
    enter();
    await waitFor(() => expect(savedRows("word500_games")).toHaveLength(1));
    expect(savedRows("word500_games")[0]).toMatchObject({ status: "won", attempts: 1, score: word500PointsFor(1) });
  });

  it("errar todas as tentativas encerra a partida como derrota", async () => {
    await ready();
    const answer = getWord500WordOfDay();
    const wrongs = WORD_LIST.filter((w) => w !== answer).slice(0, WORD500_MAX_ATTEMPTS);
    for (const w of wrongs) {
      type(w);
      enter();
      await waitFor(() => expect(savedRows("word500_games").length).toBeGreaterThan(wrongs.indexOf(w)));
    }
    const rows = savedRows("word500_games");
    expect(rows).toHaveLength(WORD500_MAX_ATTEMPTS);
    expect(rows[rows.length - 1]).toMatchObject({ status: "lost", attempts: WORD500_MAX_ATTEMPTS, score: 0 });
    expect(rows.slice(0, -1).every((r) => r.status === "playing")).toBe(true);
  });

  it("retoma a partida salva e não aceita palpites depois de vencida", async () => {
    loginAs();
    mockDb.tables.word500_games = [
      { id: "g1", user_id: "user-1", game_date: getWord500GameDate(), guesses: [getWord500WordOfDay()], status: "won", attempts: 1, score: word500PointsFor(1), finished_at: "x", created_at: "x" },
    ];
    renderWithProviders(<Word500Game />);
    await waitFor(() => expect(document.querySelector(".spinner")).not.toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    type(WORD_LIST.find((w) => w !== getWord500WordOfDay())!);
    enter();
    await new Promise((r) => setTimeout(r, 50));
    expect(savedRows("word500_games")).toHaveLength(0);
  });
});

describe("LetrosoGame", () => {
  const ready = async () => {
    loginAs();
    mockDb.rpcResults.validate_letroso_word = true;
    renderWithProviders(<LetrosoGame />);
    await screen.findAllByText("↵");
  };

  it("palavra com menos de 3 letras avisa e não consulta o banco", async () => {
    await ready();
    type("AB");
    enter();
    expect(await screen.findByText("Mínimo 3 letras")).toBeInTheDocument();
    expect(savedRows("letroso_games")).toHaveLength(0);
  });

  it("palavra que o banco não reconhece é recusada", async () => {
    await ready();
    mockDb.rpcResults.validate_letroso_word = false;
    type("ZZZZZZ");
    enter();
    expect(await screen.findByText("Palavra não encontrada")).toBeInTheDocument();
    expect(savedRows("letroso_games")).toHaveLength(0);
  });

  it("palpite válido errado grava a tentativa em andamento", async () => {
    await ready();
    const answer = getLetrosoWordOfDay();
    const wrong = LETROSO_WORDS.find((w) => w !== answer)!;
    type(wrong);
    enter();
    await waitFor(() => expect(savedRows("letroso_games")).toHaveLength(1));
    expect(savedRows("letroso_games")[0]).toMatchObject({
      user_id: "user-1",
      game_date: getLetrosoGameDate(),
      status: "playing",
      attempts: 1,
      score: 0,
    });
  });

  it("acertar de primeira grava vitória com a pontuação máxima", async () => {
    await ready();
    type(getLetrosoWordOfDay());
    enter();
    await waitFor(() => expect(savedRows("letroso_games")).toHaveLength(1));
    expect(savedRows("letroso_games")[0]).toMatchObject({ status: "won", attempts: 1, score: letrosoPointsFor(1) });
  });

  it("sem limite de tentativas: continua jogando depois de várias erradas", async () => {
    await ready();
    const answer = getLetrosoWordOfDay();
    const wrongs = LETROSO_WORDS.filter((w) => w !== answer).slice(0, 8);
    for (let i = 0; i < wrongs.length; i++) {
      type(wrongs[i]);
      enter();
      await waitFor(() => expect(savedRows("letroso_games")).toHaveLength(i + 1));
    }
    expect(savedRows("letroso_games").every((r) => r.status === "playing")).toBe(true);
    expect(savedRows("letroso_games")[7]).toMatchObject({ attempts: 8 });
  });
});
