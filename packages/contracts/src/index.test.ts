import { describe, expect, it } from "vitest";
import { PACKAGE_ID } from "./index.ts";

describe("@oa/contracts", () => {
  it("expone su identificador de paquete", () => {
    expect(PACKAGE_ID).toBe("@oa/contracts");
  });
});
