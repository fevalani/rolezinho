// Dados estáticos do jogo (gerados por scripts/generate_fronteiras_data.mjs).
// Importado só pelo FronteirasGame, que é carregado sob demanda (lazy).
import worldJson from "./fronteiras/world.json";
import pairsJson from "./fronteiras/pairs.json";
import type { FronteirasWorld } from "./fronteirasTypes";
import { buildGraph, type Graph } from "./fronteirasLogic";

export const WORLD = worldJson as FronteirasWorld;
export const PAIRS = pairsJson as [string, string][];
export const GRAPH: Graph = buildGraph(WORLD.countries);
