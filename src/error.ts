/**
 * Base class for tagged errors.
 * Uses _tag discriminator for exhaustive pattern matching.
 *
 * @example
 * class NotFoundError extends TaggedError {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor(readonly id: string) {
 *     super(`Not found: ${id}`);
 *   }
 * }
 */
export abstract class TaggedError extends Error {
  abstract readonly _tag: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);

    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;

    if (options?.cause !== undefined && options.cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }

  static override isError(value: unknown): value is Error {
    return value instanceof Error;
  }

  static isTaggedError(value: unknown): value is TaggedError {
    return value instanceof Error && "_tag" in value && typeof value._tag === "string";
  }

  /**
   * Exhaustive pattern match on tagged error union.
   *
   * @example
   * TaggedError.match(error, {
   *   NotFoundError: (e) => `Missing: ${e.id}`,
   *   ValidationError: (e) => `Invalid: ${e.field}`,
   * });
   */
  static match<E extends TaggedError, T>(
    error: E,
    handlers: { [K in E["_tag"]]: (e: Extract<E, { _tag: K }>) => T },
  ): T {
    const tag = error._tag as E["_tag"];
    const handler = handlers[tag];
    if (!handler) {
      throw new Error(`No handler for error tag: ${error._tag}`);
    }
    return handler(error as Extract<E, { _tag: typeof tag }>);
  }

  /**
   * Partial pattern match with fallback.
   *
   * @example
   * TaggedError.matchPartial(error, {
   *   NotFoundError: (e) => `Missing: ${e.id}`,
   * }, (e) => `Unknown error: ${e.message}`);
   */
  static matchPartial<E extends TaggedError, T>(
    error: E,
    handlers: { [K in E["_tag"]]?: (e: Extract<E, { _tag: K }>) => T },
    otherwise: (e: E) => T,
  ): T {
    const tag = error._tag as E["_tag"];
    const handler = handlers[tag];
    if (handler) {
      return handler(error as Extract<E, { _tag: typeof tag }>);
    }
    return otherwise(error);
  }
}

/**
 * Wraps uncaught exceptions from Result.try/tryPromise.
 */
export class UnhandledException extends TaggedError {
  readonly _tag = "UnhandledException" as const;

  constructor(options: { cause: unknown }) {
    const message = options.cause instanceof Error ? options.cause.message : String(options.cause);
    super(`Unhandled exception: ${message}`, { cause: options.cause });
  }
}
