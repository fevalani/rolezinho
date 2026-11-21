/**
 * Camadas do hero da home (de trás para a frente):
 *  1. fundo  — imagem em HERO_BG_SRC
 *  2. rostos — anel girando (RolezinhoOrbit + rolezinhoFaces.ts)
 *  3. brinde — imagem no centro do anel (HERO_TOAST_SRC, PNG com transparência)
 * As três saem de scripts/build_hero_layers.py (--bg, --faces, --toast).
 */
export const HERO_BG_SRC = "/images/hero/bg.jpg";
export const HERO_TOAST_SRC = "/images/hero/toast.png";
