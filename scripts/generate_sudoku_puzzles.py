#!/usr/bin/env python3
"""
Gera o pool local de puzzles de Sudoku usado por src/features/letreco/sudokuLogic.ts.

Roda uma vez, offline, por dificuldade. Cada puzzle é verificado com solução
única antes de entrar no arquivo. Não tem dependência com o app em runtime.

Uso:
  python3 scripts/generate_sudoku_puzzles.py <target_clues> <seed> [pool_size] > arquivo.txt

  python3 scripts/generate_sudoku_puzzles.py 44 20260704 > src/features/letreco/sudoku_puzzles_facil.txt
  python3 scripts/generate_sudoku_puzzles.py 34 20260703 > src/features/letreco/sudoku_puzzles_medio.txt
  python3 scripts/generate_sudoku_puzzles.py 28 20260705 > src/features/letreco/sudoku_puzzles_dificil.txt
"""

import random
import sys

N = 9
BOX = 3
DEFAULT_TARGET_CLUES = 34  # dificuldade média
DEFAULT_POOL_SIZE = 50
DEFAULT_SEED = 20260703  # fixo — pool reproduzível


def find_empty(grid):
    for r in range(N):
        for c in range(N):
            if grid[r][c] == 0:
                return r, c
    return None


def candidates(grid, r, c):
    used = set(grid[r])
    used |= {grid[i][c] for i in range(N)}
    br, bc = (r // BOX) * BOX, (c // BOX) * BOX
    for i in range(br, br + BOX):
        for j in range(bc, bc + BOX):
            used.add(grid[i][j])
    return [v for v in range(1, 10) if v not in used]


def fill_random(grid, rng):
    pos = find_empty(grid)
    if pos is None:
        return True
    r, c = pos
    opts = candidates(grid, r, c)
    rng.shuffle(opts)
    for v in opts:
        grid[r][c] = v
        if fill_random(grid, rng):
            return True
        grid[r][c] = 0
    return False


def count_solutions(grid, limit=2):
    """Conta soluções até `limit` (early-exit) — usado só pra checar unicidade."""
    pos = find_empty(grid)
    if pos is None:
        return 1
    r, c = pos
    total = 0
    for v in candidates(grid, r, c):
        grid[r][c] = v
        total += count_solutions(grid, limit - total)
        grid[r][c] = 0
        if total >= limit:
            break
    return total


def generate_full_grid(rng):
    grid = [[0] * N for _ in range(N)]
    fill_random(grid, rng)
    return grid


def dig_holes(solution, rng, target_clues):
    puzzle = [row[:] for row in solution]
    cells = [(r, c) for r in range(N) for c in range(N)]
    rng.shuffle(cells)
    clues = N * N

    for r, c in cells:
        if clues <= target_clues:
            break
        backup = puzzle[r][c]
        puzzle[r][c] = 0
        if count_solutions([row[:] for row in puzzle], limit=2) != 1:
            puzzle[r][c] = backup  # remoção quebrou unicidade, desfaz
        else:
            clues -= 1

    return puzzle


def to_str(grid):
    return "".join(str(v) for row in grid for v in row)


def main():
    target_clues = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET_CLUES
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_SEED
    pool_size = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_POOL_SIZE

    rng = random.Random(seed)
    lines = []
    for i in range(pool_size):
        solution = generate_full_grid(rng)
        puzzle = dig_holes(solution, rng, target_clues)
        lines.append(f"{to_str(puzzle)}:{to_str(solution)}")
        print(f"puzzle {i + 1}/{pool_size} gerado ({target_clues} pistas)", file=sys.stderr)

    print("\n".join(lines))


if __name__ == "__main__":
    main()
