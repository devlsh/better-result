import { describe, expect, it } from "bun:test";
import { Result, Ok, Err } from "./result";
import { UnhandledException } from "./error";

describe("Result", () => {
  describe("ok", () => {
    it("creates Ok with value", () => {
      const result = Result.ok(42);
      expect(result).toBeInstanceOf(Ok);
      expect(result.status).toBe("ok");
      expect(result.value).toBe(42);
    });

    it("creates Ok with null", () => {
      const result = Result.ok(null);
      expect(result.value).toBe(null);
    });

    it("creates Ok with undefined", () => {
      const result = Result.ok(undefined);
      expect(result.value).toBe(undefined);
    });
  });

  describe("err", () => {
    it("creates Err with error", () => {
      const result = Result.err("failed");
      expect(result).toBeInstanceOf(Err);
      expect(result.status).toBe("error");
      expect(result.error).toBe("failed");
    });

    it("creates Err with Error object", () => {
      const error = new Error("oops");
      const result = Result.err(error);
      expect(result.error).toBe(error);
    });
  });

  describe("isOk", () => {
    it("returns true for Ok", () => {
      expect(Result.isOk(Result.ok(1))).toBe(true);
    });

    it("returns false for Err", () => {
      expect(Result.isOk(Result.err("x"))).toBe(false);
    });
  });

  describe("isError", () => {
    it("returns true for Err", () => {
      expect(Result.isError(Result.err("x"))).toBe(true);
    });

    it("returns false for Ok", () => {
      expect(Result.isError(Result.ok(1))).toBe(false);
    });
  });

  describe("try", () => {
    it("returns Ok when function succeeds", () => {
      const result = Result.try(() => 42);
      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it("returns Err with UnhandledException when function throws", () => {
      const result = Result.try(() => {
        throw new Error("boom");
      });
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBeInstanceOf(UnhandledException);
      }
    });

    it("supports custom catch handler", () => {
      class CustomError extends Error {}
      const result = Result.try({
        try: () => {
          throw new Error("original");
        },
        catch: (_e) => new CustomError("wrapped"),
      });
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBeInstanceOf(CustomError);
      }
    });

    it("retries on failure", () => {
      let attempts = 0;
      const result = Result.try(
        () => {
          attempts++;
          if (attempts < 3) throw new Error("fail");
          return "success";
        },
        { retry: { times: 3 } },
      );
      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe("success");
      expect(attempts).toBe(3);
    });
  });

  describe("tryPromise", () => {
    it("returns Ok when promise resolves", async () => {
      const result = await Result.tryPromise(() => Promise.resolve(42));
      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it("returns Err when promise rejects", async () => {
      const result = await Result.tryPromise(() => Promise.reject(new Error("boom")));
      expect(Result.isError(result)).toBe(true);
    });

    it("supports retry with exponential backoff", async () => {
      let attempts = 0;
      const start = Date.now();
      const result = await Result.tryPromise(
        () => {
          attempts++;
          if (attempts < 3) return Promise.reject(new Error("fail"));
          return Promise.resolve("success");
        },
        { retry: { times: 3, delayMs: 10, backoff: "exponential" } },
      );
      const elapsed = Date.now() - start;
      expect(Result.isOk(result)).toBe(true);
      expect(attempts).toBe(3);
      // exponential: 10ms + 20ms = 30ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });
  });

  describe("map", () => {
    it("transforms Ok value", () => {
      const result = Result.ok(2).map((x) => x * 3);
      expect(result.unwrap()).toBe(6);
    });

    it("passes through Err", () => {
      const result = Result.err<number, string>("fail").map((x) => x * 3);
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBe("fail");
      }
    });

    it("works as standalone function (data-first)", () => {
      const result = Result.map(Result.ok(2), (x) => x * 3);
      expect(result.unwrap()).toBe(6);
    });

    it("works as standalone function (data-last)", () => {
      const double = Result.map((x: number) => x * 2);
      const result = double(Result.ok(5));
      expect(result.unwrap()).toBe(10);
    });
  });

  describe("mapError", () => {
    it("transforms Err value", () => {
      const result = Result.err("fail").mapError((e) => e.toUpperCase());
      if (Result.isError(result)) {
        expect(result.error).toBe("FAIL");
      }
    });

    it("passes through Ok", () => {
      const result = Result.ok(42).mapError((e: string) => e.toUpperCase());
      expect(result.unwrap()).toBe(42);
    });
  });

  describe("andThen", () => {
    it("chains Ok to Ok", () => {
      const result = Result.ok(2).andThen((x) => Result.ok(x * 3));
      expect(result.unwrap()).toBe(6);
    });

    it("chains Ok to Err", () => {
      const result = Result.ok(2).andThen((x) => Result.err(`got ${x}`));
      expect(Result.isError(result)).toBe(true);
    });

    it("short-circuits on Err", () => {
      let called = false;
      const result = Result.err<number, string>("fail").andThen((x) => {
        called = true;
        return Result.ok(x * 2);
      });
      expect(called).toBe(false);
      expect(Result.isError(result)).toBe(true);
    });
  });

  describe("andThenAsync", () => {
    it("chains async operations", async () => {
      const result = await Result.ok(2).andThenAsync(async (x) => Result.ok(x * 3));
      expect(result.unwrap()).toBe(6);
    });

    it("short-circuits on Err", async () => {
      let called = false;
      const result = await Result.err<number, string>("fail").andThenAsync(async (x) => {
        called = true;
        return Result.ok(x * 2);
      });
      expect(called).toBe(false);
      expect(Result.isError(result)).toBe(true);
    });
  });

  describe("match", () => {
    it("calls ok handler for Ok", () => {
      const result = Result.ok(2).match({
        ok: (x) => `value: ${x}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe("value: 2");
    });

    it("calls err handler for Err", () => {
      const result = Result.err("oops").match({
        ok: (x) => `value: ${x}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe("error: oops");
    });
  });

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      expect(Result.ok(42).unwrap()).toBe(42);
    });

    it("throws for Err", () => {
      expect(() => Result.err("fail").unwrap()).toThrow();
    });

    it("throws with custom message", () => {
      expect(() => Result.err("fail").unwrap("custom")).toThrow("custom");
    });
  });

  describe("unwrapOr", () => {
    it("returns value for Ok", () => {
      expect(Result.ok(42).unwrapOr(0)).toBe(42);
    });

    it("returns fallback for Err", () => {
      expect(Result.err("fail").unwrapOr(0)).toBe(0);
    });
  });

  describe("tap", () => {
    it("runs side effect on Ok", () => {
      let captured = 0;
      const result = Result.ok(42).tap((x) => {
        captured = x;
      });
      expect(captured).toBe(42);
      expect(result.unwrap()).toBe(42);
    });

    it("skips side effect on Err", () => {
      let called = false;
      const result = Result.err("fail").tap(() => {
        called = true;
      });
      expect(called).toBe(false);
      expect(Result.isError(result)).toBe(true);
    });
  });

  describe("tapAsync", () => {
    it("runs async side effect on Ok", async () => {
      let captured = 0;
      const result = await Result.ok(42).tapAsync(async (x) => {
        captured = x;
      });
      expect(captured).toBe(42);
      expect(result.unwrap()).toBe(42);
    });
  });

  describe("gen (sync)", () => {
    it("composes multiple Results", () => {
      const getA = () => Result.ok(1);
      const getB = (a: number) => Result.ok(a + 1);
      const getC = (b: number) => Result.ok(b + 1);

      const result = Result.gen(function* () {
        const a = yield* getA();
        const b = yield* getB(a);
        const c = yield* getC(b);
        return Result.ok(c);
      });

      expect(result.unwrap()).toBe(3);
    });

    it("short-circuits on first Err", () => {
      let bCalled = false;

      const getA = () => Result.err<number, string>("a failed");
      const getB = () => {
        bCalled = true;
        return Result.ok(2);
      };

      const result = Result.gen(function* () {
        const a = yield* getA();
        const b = yield* getB();
        return Result.ok(a + b);
      });

      expect(Result.isError(result)).toBe(true);
      expect(bCalled).toBe(false);
      if (Result.isError(result)) {
        expect(result.error).toBe("a failed");
      }
    });

    it("collects error types from yields", () => {
      class ErrorA extends Error {
        readonly _tag = "ErrorA" as const;
      }
      class ErrorB extends Error {
        readonly _tag = "ErrorB" as const;
      }

      const getA = (): Result<number, ErrorA> => Result.ok(1);
      const getB = (): Result<number, ErrorB> => Result.err(new ErrorB());

      const result = Result.gen(function* () {
        const a = yield* getA();
        const b = yield* getB();
        return Result.ok(a + b);
      });

      // Type: Result<number, ErrorA | ErrorB>
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBeInstanceOf(ErrorB);
      }
    });

    it("supports this binding", () => {
      const ctx = { multiplier: 10 };

      const result = Result.gen(function* (this: typeof ctx) {
        const a = yield* Result.ok(5);
        return Result.ok(a * this.multiplier);
      }, ctx);

      expect(result.unwrap()).toBe(50);
    });
  });

  describe("gen (async)", () => {
    it("composes async Results", async () => {
      const fetchA = () => Promise.resolve(Result.ok(1));
      const fetchB = (a: number) => Promise.resolve(Result.ok(a + 1));

      const result = await Result.gen(async function* () {
        const a = yield* Result.await(fetchA());
        const b = yield* Result.await(fetchB(a));
        return Result.ok(b);
      });

      expect(result.unwrap()).toBe(2);
    });

    it("short-circuits on async Err", async () => {
      let bCalled = false;

      const fetchA = () => Promise.resolve(Result.err<number, string>("a failed"));
      const fetchB = () => {
        bCalled = true;
        return Promise.resolve(Result.ok(2));
      };

      const result = await Result.gen(async function* () {
        const a = yield* Result.await(fetchA());
        const b = yield* Result.await(fetchB());
        return Result.ok(a + b);
      });

      expect(Result.isError(result)).toBe(true);
      expect(bCalled).toBe(false);
    });
  });

  describe("hydrate", () => {
    it("hydrates serialized Ok", () => {
      const serialized = { status: "ok" as const, value: 42 };
      const result = Result.hydrate<number, string>(serialized);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(Ok);
      expect(result?.unwrap()).toBe(42);
    });

    it("hydrates serialized Err", () => {
      const serialized = { status: "error" as const, error: "fail" };
      const result = Result.hydrate<number, string>(serialized);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(Err);
      if (result && Result.isError(result)) {
        expect(result.error).toBe("fail");
      }
    });

    it("returns null for non-Result objects", () => {
      expect(Result.hydrate({ foo: "bar" })).toBe(null);
      expect(Result.hydrate(null)).toBe(null);
      expect(Result.hydrate(42)).toBe(null);
    });
  });
});

describe("Monad Laws", () => {
  // For a proper monad, we need:
  // 1. Left identity: return a >>= f  ≡  f a
  // 2. Right identity: m >>= return  ≡  m
  // 3. Associativity: (m >>= f) >>= g  ≡  m >>= (λx. f x >>= g)
  //
  // In Result terms:
  // - return = Result.ok
  // - >>= = andThen

  const f = (x: number): Result<number, string> => Result.ok(x * 2);
  const g = (x: number): Result<number, string> => Result.ok(x + 10);

  describe("Left Identity", () => {
    // Result.ok(a).andThen(f) ≡ f(a)
    it("holds for Ok", () => {
      const a = 5;
      const left = Result.ok(a).andThen(f);
      const right = f(a);

      expect(left.unwrap()).toBe(right.unwrap());
    });
  });

  describe("Right Identity", () => {
    // m.andThen(Result.ok) ≡ m
    it("holds for Ok", () => {
      const m = Result.ok(42);
      const result = m.andThen(Result.ok);

      expect(result.unwrap()).toBe(m.unwrap());
    });

    it("holds for Err", () => {
      const m = Result.err<number, string>("error");
      const result = m.andThen(Result.ok);

      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBe("error");
      }
    });
  });

  describe("Associativity", () => {
    // (m.andThen(f)).andThen(g) ≡ m.andThen(x => f(x).andThen(g))
    it("holds for Ok", () => {
      const m = Result.ok(5);

      const left = m.andThen(f).andThen(g);
      const right = m.andThen((x) => f(x).andThen(g));

      expect(left.unwrap()).toBe(right.unwrap());
      expect(left.unwrap()).toBe(20); // (5 * 2) + 10
    });

    it("holds for Err (short-circuits consistently)", () => {
      const m = Result.err<number, string>("error");

      const left = m.andThen(f).andThen(g);
      const right = m.andThen((x) => f(x).andThen(g));

      expect(Result.isError(left)).toBe(true);
      expect(Result.isError(right)).toBe(true);
      if (Result.isError(left) && Result.isError(right)) {
        expect(left.error).toBe(right.error);
      }
    });

    it("holds when f returns Err", () => {
      const fErr = (x: number): Result<number, string> => Result.err(`failed at ${x}`);
      const m = Result.ok(5);

      const left = m.andThen(fErr).andThen(g);
      const right = m.andThen((x) => fErr(x).andThen(g));

      expect(Result.isError(left)).toBe(true);
      expect(Result.isError(right)).toBe(true);
      if (Result.isError(left) && Result.isError(right)) {
        expect(left.error).toBe(right.error);
      }
    });
  });
});

describe("Functor Laws", () => {
  // 1. Identity: fmap id ≡ id
  // 2. Composition: fmap (f . g) ≡ fmap f . fmap g
  //
  // In Result terms:
  // - fmap = map

  describe("Identity", () => {
    // m.map(x => x) ≡ m
    it("holds for Ok", () => {
      const m = Result.ok(42);
      const result = m.map((x) => x);

      expect(result.unwrap()).toBe(m.unwrap());
    });

    it("holds for Err", () => {
      const m = Result.err<number, string>("error");
      const result = m.map((x) => x);

      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBe("error");
      }
    });
  });

  describe("Composition", () => {
    // m.map(x => g(f(x))) ≡ m.map(f).map(g)
    const f = (x: number) => x * 2;
    const g = (x: number) => x + 10;

    it("holds for Ok", () => {
      const m = Result.ok(5);

      const left = m.map((x) => g(f(x)));
      const right = m.map(f).map(g);

      expect(left.unwrap()).toBe(right.unwrap());
      expect(left.unwrap()).toBe(20); // (5 * 2) + 10
    });

    it("holds for Err", () => {
      const m = Result.err<number, string>("error");

      const left = m.map((x) => g(f(x)));
      const right = m.map(f).map(g);

      expect(Result.isError(left)).toBe(true);
      expect(Result.isError(right)).toBe(true);
    });
  });
});
