import { Token } from "dioma";

export const authTokenManagerToken = new Token<IAuthTokenManager>("AuthTokenManager");

export type IAuthTokenManager = {
  hash(token: string): Promise<string>;
  verify(token: string, hash: string): Promise<boolean>;
  generateToken(): string;
};
