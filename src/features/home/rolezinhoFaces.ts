// GERADO por scripts/build_hero_layers.py — não editar à mão.
// Posição de cada rosto (em % do palco quadrado) e o centro da órbita.

export const ORBIT_CENTER = { x: 50.000, y: 50.000 };

export interface OrbitFace {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const ORBIT_FACES: OrbitFace[] = [
  { src: "/images/hero/face-01.png", left: 25.580, top: 9.935, width: 14.875, height: 20.538 },
  { src: "/images/hero/face-02.png", left: 43.624, top: 5.526, width: 16.397, height: 20.454 },
  { src: "/images/hero/face-03.png", left: 62.188, top: 11.821, width: 15.721, height: 20.707 },
  { src: "/images/hero/face-04.png", left: 73.162, top: 27.499, width: 17.496, height: 19.862 },
  { src: "/images/hero/face-05.png", left: 75.990, top: 46.281, width: 15.298, height: 20.792 },
  { src: "/images/hero/face-06.png", left: 66.111, top: 63.535, width: 17.157, height: 20.538 },
  { src: "/images/hero/face-07.png", left: 49.237, top: 73.062, width: 17.327, height: 20.623 },
  { src: "/images/hero/face-08.png", left: 29.855, top: 72.035, width: 17.496, height: 20.623 },
  { src: "/images/hero/face-09.png", left: 14.515, top: 60.612, width: 16.819, height: 20.876 },
  { src: "/images/hero/face-10.png", left: 8.869, top: 42.928, width: 13.946, height: 20.285 },
  { src: "/images/hero/face-11.png", left: 10.138, top: 24.100, width: 18.932, height: 20.031 },
];
