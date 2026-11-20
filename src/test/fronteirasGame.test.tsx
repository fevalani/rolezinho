import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FronteirasGame } from "@/features/letreco/FronteirasGame";
import { WORLD, PAIRS, GRAPH } from "@/features/letreco/fronteirasData";
import {
  bfsDistances,
  getFronteirasGameDate,
  intermediatesCount,
  maxGuessesFor,
  pairOfDay,
  shortestPathNodes,
} from "@/features/letreco/fronteirasLogic";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const [FROM, TO] = pairOfDay(PAIRS);
const ON_PATH = shortestPathNodes(GRAPH, FROM, TO) as Set<string>;
const OPTIMAL = intermediatesCount(GRAPH, FROM, TO) as number;
const MAX = maxGuessesFor(OPTIMAL);
import { displayName } from "../features/letreco/fronteirasLogic";
const nameOf = (iso: string) => WORLD.countries.find((c) => c.iso === iso)!.name;

/** Um caminho mínimo completo (só os intermediários), na ordem. */
function onePath(): string[] {
  const dt = bfsDistances(GRAPH, TO);
  const out: string[] = [];
  let cur = FROM;
  while (dt.get(cur)! > 1) {
    cur = GRAPH.get(cur)!.find((n) => ON_PATH.has(n) && dt.get(n) === dt.get(cur)! - 1)!;
    out.push(cur);
  }
  return out;
}

/** Países fora do caminho mínimo e que não são origem/destino. */
const WRONG = WORLD.countries.map((c) => c.iso).filter((i) => !ON_PATH.has(i));

const allSavedRows = () =>
  mockDb.writes.filter((w) => w.table === "fronteiras_games").map((w) => w.args[0] as Record<string, unknown>);
const lastSaved = () => savedRows()[savedRows().length - 1];
/** Só as gravações de palpite (a do início, ao escolher o nível, tem 0 palpites). */
const savedRows = () => allSavedRows().filter((r) => (r.guesses as string[]).length > 0);

/** Abre o jogo; sem partida salva hoje, escolhe o nível no seletor (padrão: fácil). */
const ready = async (difficulty: "Fácil" | "Difícil" = "Fácil") => {
  loginAs();
  renderWithProviders(<FronteirasGame />);
  const first = await screen.findByText(/Escolha a dificuldade|Palpites:/);
  if (/Escolha/.test(first.textContent ?? "")) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(difficulty) }));
  }
  await screen.findByLabelText("Palpite de país");
};
const guessByClick = async (iso: string) => {
  fireEvent.change(screen.getByLabelText("Palpite de país"), { target: { value: nameOf(iso) } });
  fireEvent.click(await screen.findByRole("button", { name: displayName(iso, nameOf(iso)) }));
};
const guessBySubmit = (text: string) => {
  const input = screen.getByLabelText("Palpite de país");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
};

describe("FronteirasGame — nível de dificuldade", () => {
  const map = () => screen.getByRole("img", { name: "Mapa-múndi" });
  const hiddenCount = () => map().querySelectorAll("path[data-hidden]").length;

  it("antes de escolher o nível não aparece mapa nem o par do dia", async () => {
    loginAs();
    renderWithProviders(<FronteirasGame />);
    expect(await screen.findByText("Escolha a dificuldade")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Mapa-múndi" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Palpite de país")).not.toBeInTheDocument();
    expect(screen.queryByText(nameOf(FROM), { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByText("×1")).toBeInTheDocument();
    expect(screen.getByText("×1.5")).toBeInTheDocument();
  });

  it("escolher o nível grava a partida do dia com ele", async () => {
    await ready("Difícil");
    expect(allSavedRows()).toHaveLength(1);
    expect(allSavedRows()[0]).toMatchObject({ difficulty: "hard", guesses: [], status: "playing" });
  });

  it("fácil: todos os países têm contorno", async () => {
    await ready("Fácil");
    expect(hiddenCount()).toBe(0);
  });

  it("difícil esconde os países não chutados, menos origem e destino", async () => {
    await ready("Difícil");
    expect(hiddenCount()).toBe(WORLD.countries.length - 2);
    expect(map().querySelector(`path[data-iso="${FROM}"]`)).not.toHaveAttribute("data-hidden");
    expect(map().querySelector(`path[data-iso="${TO}"]`)).not.toHaveAttribute("data-hidden");
  });

  it("no difícil, o país chutado passa a aparecer e o palpite grava o nível", async () => {
    await ready("Difícil");
    await guessByClick(WRONG[0]);
    expect(map().querySelector(`path[data-iso="${WRONG[0]}"]`)).not.toHaveAttribute("data-hidden");
    expect(hiddenCount()).toBe(WORLD.countries.length - 3);
    expect(lastSaved()).toMatchObject({ difficulty: "hard" });
  });

  it("retoma a partida no nível já escolhido, sem mostrar o seletor", async () => {
    mockDb.tables.fronteiras_games = [
      { id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(), difficulty: "hard", guesses: [WRONG[0]], status: "playing", attempts: 1, score: 0, finished_at: null, created_at: "t" },
    ];
    await ready();
    expect(screen.queryByText("Escolha a dificuldade")).not.toBeInTheDocument();
    expect(hiddenCount()).toBe(WORLD.countries.length - 3);
  });

  it("vencer no difícil rende 1,5× os pontos", async () => {
    await ready("Difícil");
    for (const iso of onePath()) await guessByClick(iso);
    await waitFor(() => expect(lastSaved()).toMatchObject({ status: "won", score: 150 }));
  });

  it("depois de terminar, o mapa volta completo", async () => {
    mockDb.tables.fronteiras_games = [
      { id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(), difficulty: "hard", guesses: onePath(), status: "won", attempts: OPTIMAL, score: 150, finished_at: "t", created_at: "t" },
    ];
    loginAs();
    renderWithProviders(<FronteirasGame />);
    await screen.findByText(/Conectou!/);
    expect(hiddenCount()).toBe(0);
  });
});

describe("FronteirasGame", () => {
  it("mostra o par do dia e o contador de palpites", async () => {
    await ready();
    // o nome também existe no <title> do mapa; o cabeçalho usa <span>
    expect(screen.getByText(nameOf(FROM), { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(nameOf(TO), { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(`Palpites: 0/${MAX}`)).toBeInTheDocument();
  });

  it("desenha o mapa com todos os países", async () => {
    await ready();
    const map = screen.getByRole("img", { name: "Mapa-múndi" });
    expect(map.querySelectorAll("path[data-iso]")).toHaveLength(WORLD.countries.length);
  });

  it("autocomplete sugere países sem acento", async () => {
    await ready();
    fireEvent.change(screen.getByLabelText("Palpite de país"), { target: { value: "brasi" } });
    expect(await screen.findByRole("button", { name: "Brasil" })).toBeInTheDocument();
  });

  it("palpite fora do caminho entra na lista, gasta tentativa e grava", async () => {
    await ready();
    const wrong = WRONG[0];
    await guessByClick(wrong);
    const list = await screen.findByRole("list", { name: "Palpites" });
    expect(within(list).getByText(nameOf(wrong))).toBeInTheDocument();
    expect(screen.getByText(`Palpites: 1/${MAX}`)).toBeInTheDocument();
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({
      user_id: "user-1",
      game_date: getFronteirasGameDate(),
      guesses: [wrong],
      status: "playing",
      attempts: 1,
      score: 0,
    });
  });

  it("uma ilha (sem fronteira por terra) pode ser chutada e fica longe do caminho", async () => {
    await ready();
    await guessByClick("JP");
    const list = await screen.findByRole("list", { name: "Palpites" });
    expect(within(list).getByText("Longe do caminho")).toBeInTheDocument();
  });

  it("palpite no caminho aparece como 'No caminho'", async () => {
    await ready();
    const right = onePath()[0];
    await guessByClick(right);
    const list = await screen.findByRole("list", { name: "Palpites" });
    expect(within(list).getByText("No caminho")).toBeInTheDocument();
  });

  it("país desconhecido, repetido e origem/destino não gastam tentativa", async () => {
    await ready();
    guessBySubmit("zzzzzz");
    expect(await screen.findByText("País não encontrado")).toBeInTheDocument();

    guessBySubmit(nameOf(FROM));
    expect(await screen.findByText("Origem e destino já estão no mapa")).toBeInTheDocument();

    await guessByClick(WRONG[0]);
    await screen.findByRole("list", { name: "Palpites" });
    guessBySubmit(nameOf(WRONG[0]));
    expect(await screen.findByText("Você já chutou esse país")).toBeInTheDocument();
    expect(screen.getByText(`Palpites: 1/${MAX}`)).toBeInTheDocument();
    expect(savedRows()).toHaveLength(1);
  });

  it("completar um caminho mínimo vence com 100 pontos e mostra o placar", async () => {
    mockDb.tables.fronteiras_games = [];
    await ready();
    for (const iso of onePath()) await guessByClick(iso);
    expect(await screen.findByText(/Conectou! \+100 pts/)).toBeInTheDocument();
    // venceu pelo mínimo: o caminho mais curto ainda ganha o contorno dourado, sem o texto
    expect(document.querySelectorAll("path[stroke='#c9a55a']")).toHaveLength(OPTIMAL);
    expect(screen.queryByText(/Exemplo de caminho mais curto/)).not.toBeInTheDocument();
    expect(screen.getByText("Placar de hoje")).toBeInTheDocument();
    expect(screen.queryByLabelText("Palpite de país")).not.toBeInTheDocument();
    const last = savedRows()[savedRows().length - 1];
    expect(last).toMatchObject({ status: "won", attempts: OPTIMAL, score: 100 });
  });

  it("Israel aparece com (suposto país) em itálico nas sugestões", async () => {
    await ready();
    fireEvent.change(screen.getByLabelText("Palpite de país"), { target: { value: "Israel" } });
    const btn = await screen.findByRole("button", { name: "Israel (suposto país)" });
    expect(btn.querySelector("i")?.textContent).toBe("(suposto país)");
  });

  it("palpites errados antes de acertar custam pontos", async () => {
    await ready();
    await guessByClick(WRONG[0]);
    for (const iso of onePath()) await guessByClick(iso);
    expect(await screen.findByText(/Conectou! \+85 pts/)).toBeInTheDocument();
  });

  it("o painel 'Como funciona' explica rota livre, limite e pontuação", async () => {
    await ready();
    expect(screen.getByText("Como funciona")).toBeInTheDocument();
    expect(screen.getByText(/Qualquer rota vale/)).toBeInTheDocument();
    expect(screen.getByText(/mar, ilhas e pontes não ligam países/)).toBeInTheDocument();
    expect(screen.getByText(/tira/)).toHaveTextContent("15 pontos");
  });

  it("estourar o limite de palpites perde, sem pontos, e revela o caminho", async () => {
    await ready();
    for (const iso of WRONG.slice(0, MAX)) await guessByClick(iso);
    expect(await screen.findByText(/Acabaram os palpites/)).toBeInTheDocument();
    expect(screen.getByText(/Exemplo de caminho mais curto:/)).toBeInTheDocument();
    expect(savedRows()[savedRows().length - 1]).toMatchObject({ status: "lost", attempts: MAX, score: 0 });
  });

  it("restaura a partida salva do dia", async () => {
    mockDb.tables.fronteiras_games = [
      {
        id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(),
        guesses: [WRONG[0]], status: "playing", attempts: 1, score: 0, finished_at: null, created_at: "t",
      },
    ];
    await ready();
    expect(screen.getByText(`Palpites: 1/${MAX}`)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Palpites" })).getByText(displayName(WRONG[0], nameOf(WRONG[0])))).toBeInTheDocument();
  });

  it("partida já terminada abre travada, com o resultado", async () => {
    mockDb.tables.fronteiras_games = [
      {
        id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(),
        guesses: onePath(), status: "won", attempts: OPTIMAL, score: 100, finished_at: "t", created_at: "t",
      },
    ];
    loginAs();
    renderWithProviders(<FronteirasGame />);
    expect(await screen.findByText(/Conectou! \+100 pts/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Palpite de país")).not.toBeInTheDocument();
  });

  it("mostra o placar do dia com quem já terminou", async () => {
    mockDb.tables.fronteiras_games = [
      { user_id: "outro", game_date: getFronteirasGameDate(), status: "won", attempts: 5, score: 85, finished_at: "t", guesses: [], profiles: { display_name: "Beto Silva", avatar_url: null } },
      { id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(), guesses: onePath(), status: "won", attempts: OPTIMAL, score: 100, finished_at: "t", created_at: "t" },
    ];
    loginAs();
    renderWithProviders(<FronteirasGame />);
    expect(await screen.findByText("Beto")).toBeInTheDocument();
    expect(screen.getByText("85 pts")).toBeInTheDocument();
  });

  it("o placar marca quem jogou no difícil", async () => {
    mockDb.tables.fronteiras_games = [
      { user_id: "outro", game_date: getFronteirasGameDate(), difficulty: "hard", status: "won", attempts: 5, score: 128, finished_at: "t", guesses: [], profiles: { display_name: "Beto Silva", avatar_url: null } },
      { id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(), guesses: onePath(), status: "won", attempts: OPTIMAL, score: 100, finished_at: "t", created_at: "t" },
    ];
    loginAs();
    renderWithProviders(<FronteirasGame />);
    expect(await screen.findByText(/Fechou em 5 palpites · Difícil/)).toBeInTheDocument();
  });

  it("falha ao salvar avisa o jogador", async () => {
    await ready();
    mockDb.errors.fronteiras_games = { message: "x" };
    await guessByClick(WRONG[0]);
    expect(await screen.findByText("Não foi possível salvar o palpite")).toBeInTheDocument();
  });

  it("compartilhar copia o resultado em emojis, sem nomes de países", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    mockDb.tables.fronteiras_games = [
      { id: "g1", user_id: "user-1", game_date: getFronteirasGameDate(), guesses: onePath(), status: "won", attempts: OPTIMAL, score: 100, finished_at: "t", created_at: "t" },
    ];
    loginAs();
    renderWithProviders(<FronteirasGame />);
    fireEvent.click(await screen.findByText(/Compartilhar resultado/));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain(`Fronteiras ${getFronteirasGameDate()} ${OPTIMAL}/${MAX}`);
    expect(text).toContain("🟩");
    expect(text).not.toContain(nameOf(FROM));
    expect(await screen.findByText(/Copiado!/)).toBeInTheDocument();
  });
});
