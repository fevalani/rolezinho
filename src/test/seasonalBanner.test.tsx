import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { SEASONAL_THEMES } from "@/lib/seasonal/themes";

// O banner lê o tema em `themes` (já com o título/emoji que o admin salvou), por isso o mock
// do contexto passou a expor a lista.
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

  it("mostra o título (ocasião) que o admin definiu, não o nome do visual", () => {
    ctx.previewId = "confete";
    ctx.themes = SEASONAL_THEMES.map((t) =>
      t.id === "confete" ? { ...t, occasion: "Aniversário do grupo", emoji: "🎂" } : t,
    );
    renderBanner();
    expect(screen.getByText("Aniversário do grupo")).toBeInTheDocument();
    expect(screen.queryByText("Confete")).not.toBeInTheDocument();
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
