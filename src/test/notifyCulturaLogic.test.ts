import { describe, it, expect } from "vitest";
import {
  chunk,
  isAuthorized,
  isDeadToken,
  safeEqual,
} from "../../supabase/functions/notify-cultura-post/logic";

describe("notify-cultura-post — autorização do webhook", () => {
  it("aceita o segredo correto, com ou sem 'Bearer'", () => {
    expect(isAuthorized("Bearer s3gredo", "s3gredo")).toBe(true);
    expect(isAuthorized("bearer s3gredo", "s3gredo")).toBe(true);
    expect(isAuthorized("s3gredo", "s3gredo")).toBe(true);
  });
  it("recusa segredo errado, vazio ou ausente", () => {
    expect(isAuthorized("Bearer outro", "s3gredo")).toBe(false);
    expect(isAuthorized("Bearer ", "s3gredo")).toBe(false);
    expect(isAuthorized(null, "s3gredo")).toBe(false);
  });
  it("sem WEBHOOK_SECRET configurado, nega tudo (falha fechada)", () => {
    expect(isAuthorized("Bearer qualquer", undefined)).toBe(false);
    expect(isAuthorized("Bearer ", "")).toBe(false);
  });
  it("safeEqual compara tamanho e conteúdo", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("notify-cultura-post — envio", () => {
  it("chunk divide em lotes e mantém a ordem", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 20)).toEqual([]);
  });
  it("reconhece token morto do FCM (404 / UNREGISTERED)", () => {
    expect(isDeadToken(404, "")).toBe(true);
    expect(isDeadToken(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(true);
    expect(isDeadToken(500, "erro interno")).toBe(false);
    expect(isDeadToken(401, "token expirado")).toBe(false);
  });
});
