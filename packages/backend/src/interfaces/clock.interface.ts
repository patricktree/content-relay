import { Token } from "dioma";
export const clockToken = new Token<IClock>("Clock");

export type IClock = {
  now(): string;
  addSeconds(timestamp: string, seconds: number): string;
};
