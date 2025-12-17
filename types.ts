
export interface Point {
  x: number;
  y: number;
}

export enum GameState {
  LOADING = 'LOADING',
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export type FishVariant = 'prey' | 'hunter' | 'dasher' | 'titan' | 'viper' | 'player';

export interface FishEntity {
  id: string;
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  color: [number, number, number]; // RGB
  speed: number;
  noiseOffset: number;
  variant: FishVariant;
}

export interface Particle {
  x: number;
  y: number;
  size: number;
  vy: number;
  alpha: number;
  color?: [number, number, number];
}
