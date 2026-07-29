import { describe, expect, it } from "vitest";
import { PACKAGE_ID } from "./index.ts";

describe("@oa/ical", () => {
  it("expone su identificador de paquete", () => {
    expect(PACKAGE_ID).toBe("@oa/ical");
  });
});
