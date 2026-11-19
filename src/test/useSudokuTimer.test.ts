import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSudokuTimer } from "@/features/letreco/useSudokuTimer";

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("useSudokuTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("não conta enquanto inativo (partida não carregada ou terminada)", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: false }));
    tick(5000);
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it("conta segundos quando ativo", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: true }));
    tick(12_000);
    expect(result.current.elapsedSeconds).toBe(12);
    expect(result.current.getElapsedSeconds()).toBe(12);
  });

  it("togglePause congela o tempo e voltar a chamar retoma", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: true }));
    tick(10_000);
    act(() => result.current.togglePause());
    expect(result.current.manualPaused).toBe(true);
    expect(result.current.isPaused).toBe(true);
    tick(60_000);
    expect(result.current.elapsedSeconds).toBe(10);
    act(() => result.current.togglePause());
    expect(result.current.isPaused).toBe(false);
    tick(5000);
    expect(result.current.elapsedSeconds).toBe(15);
  });

  it("aba oculta pausa, avisa onAutoPause com o tempo e não conta o tempo fora", () => {
    const onAutoPause = vi.fn();
    const { result } = renderHook(() => useSudokuTimer({ active: true, onAutoPause }));
    tick(20_000);
    act(() => setHidden(true));
    expect(onAutoPause).toHaveBeenCalledWith(20);
    expect(result.current.isPaused).toBe(true);
    tick(90_000);
    act(() => setHidden(false));
    expect(result.current.isPaused).toBe(false);
    tick(3000);
    expect(result.current.elapsedSeconds).toBe(23);
  });

  it("voltar à aba não retoma se a pausa manual estava ligada", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: true }));
    tick(10_000);
    act(() => result.current.togglePause());
    act(() => setHidden(true));
    act(() => setHidden(false));
    tick(30_000);
    expect(result.current.manualPaused).toBe(true);
    expect(result.current.elapsedSeconds).toBe(10);
  });

  it("pagehide também pausa e avisa", () => {
    const onAutoPause = vi.fn();
    renderHook(() => useSudokuTimer({ active: true, onAutoPause }));
    tick(7000);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(onAutoPause).toHaveBeenCalledWith(7);
  });

  it("restore define o tempo acumulado; reset zera e tira a pausa manual", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: true }));
    act(() => result.current.restore(150_000, true));
    expect(result.current.elapsedSeconds).toBe(150);
    tick(10_000);
    expect(result.current.elapsedSeconds).toBe(160);
    expect(result.current.getAccumulatedMs()).toBe(150_000);

    act(() => result.current.togglePause());
    act(() => result.current.reset());
    expect(result.current.manualPaused).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
    tick(4000);
    expect(result.current.elapsedSeconds).toBe(4);
  });

  it("restore com running=false deixa parado até retomar", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: false }));
    act(() => result.current.restore(90_000, false));
    tick(30_000);
    expect(result.current.elapsedSeconds).toBe(90);
  });

  it("pause devolve os segundos e fixa o valor", () => {
    const { result } = renderHook(() => useSudokuTimer({ active: true }));
    tick(42_500);
    let secs = 0;
    act(() => { secs = result.current.pause(); });
    expect(secs).toBe(42);
    expect(result.current.elapsedSeconds).toBe(42);
  });
});
