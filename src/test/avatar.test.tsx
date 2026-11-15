import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "@/components/Avatar";

describe("Avatar", () => {
  it("mostra a imagem quando a URL é http(s)", () => {
    const { container } = render(
      <Avatar url="https://cdn.test/a.png" name="Maria Souza" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.test/a.png");
  });

  it("aceita blob: como imagem", () => {
    const { container } = render(<Avatar url="blob:abc" name="Maria" />);
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("mostra o emoji quando a URL é um emoji", () => {
    render(<Avatar url="🦊" name="Maria" />);
    expect(screen.getByText("🦊")).toBeInTheDocument();
  });

  it("cai nas iniciais quando não há url", () => {
    render(<Avatar url={null} name="Maria Souza" />);
    expect(screen.getByText("MS")).toBeInTheDocument();
  });

  it("cai nas iniciais para texto que não é emoji nem URL", () => {
    render(<Avatar url="arquivo.png" name="João" />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("aplica o tamanho e a className", () => {
    const { container } = render(
      <Avatar url={null} name="A" size="xl" className="minha-classe" />,
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain("w-[72px]");
    expect(box.className).toContain("minha-classe");
  });
});
