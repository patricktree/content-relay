export class RelayInvalidInputError extends Error {
  constructor(...params: ConstructorParameters<typeof Error>) {
    super(...params);
    this.name = "RelayInvalidInputError";
  }
}

export class RelayAuthenticationFailedError extends Error {
  constructor(...params: ConstructorParameters<typeof Error>) {
    super(...params);
    this.name = "RelayAuthenticationFailedError";
  }
}

export class RelayResourceNotFoundError extends Error {
  constructor(...params: ConstructorParameters<typeof Error>) {
    super(...params);
    this.name = "RelayResourceNotFoundError";
  }
}
