export class RelayInvalidInputError extends Error {
  constructor(...params: ConstructorParameters<typeof Error>) {
    super(...params);
    this.name = "RelayInvalidInputError";
  }
}

export class RelayResourceNotFoundError extends Error {
  constructor(...params: ConstructorParameters<typeof Error>) {
    super(...params);
    this.name = "RelayResourceNotFoundError";
  }
}
