import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { SEASONAL_THEMES } from "@/lib/seasonal/themes";
import { occasionToTheme } from "@/lib/seasonal/occasions";

// O banner lê o tema em `themes` (temas prontos + ocasiões do admin), por isso o mock do
// contexto passou a expor a lista.
const ctx = {
  themes: SEASONAL_THEMES,
  previewId: null as string | null,
  approvals: {} as Record<string, boolean>,
  stopPreview: vi.fn(),
  approve: vi.fn(),
};

vi.mock("@/lib/seasonal/SeasonalThemeContext", () => ({
  useSeasonalTheme: () => ctx,
}));

import { SeasonalPreviewBanner } from "@/components/SeasonalPreviewBanner";

const renderBanner = () =>
  render(
    <MemoryRouter>
      <SeasonalPreviewBanner />
    </MemoryRouter>,
  );

describe("SeasonalPreviewBanner", () => {
  beforeEach(() => {
    ctx.previewId = null;
    ctx.approvals = {};
    ctx.stopPreview.mockClear();
    ctx.approve.mockClear();
  });

  it("não renderiza nada sem pré-visualização", () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o tema em pré-visualização e permite aprovar", () => {
    ctx.previewId = "natal";
    renderBanner();
    expect(screen.getByText(/Pré-visualizando/)).toBeInTheDocument();
    const approveBtn = screen.getAllByRole("button")[0];
    fireEvent.click(approveBtn);
    expect(ctx.approve).toHaveBeenCalledWith("natal", true);
  });

  it("ocasião do admin: mostra o título e não oferece aprovar (ela vale ao ativar)", () => {
    const oc = occasionToTheme({ id: "o1", title: "Aniversário do grupo", emoji: "🎂", extras: [], dayMd: "10-03", daysBefore: 0, jumble: false, enabled: true });
    ctx.themes = [...SEASONAL_THEMES, oc];
    ctx.previewId = oc.id;
    renderBanner();
    expect(screen.getByText("Aniversário do grupo")).toBeInTheDocument();
    expect(screen.queryByText("Aprovar")).not.toBeInTheDocument();
    ctx.themes = SEASONAL_THEMES;
  });

  it("não oferece aprovar quando o tema já está aprovado", () => {
    ctx.previewId = "natal";
    ctx.approvals = { natal: true };
    renderBanner();
    expect(ctx.approve).not.toHaveBeenCalled();
    // continua existindo um botão para sair da pré-visualização
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(ctx.stopPreview).toHaveBeenCalled();
  });
});
