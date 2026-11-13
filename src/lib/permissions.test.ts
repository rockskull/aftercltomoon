import { describe, expect, it } from "vitest";
import { can, type Capability } from "./permissions";

const ALL: Capability[] = ["money", "members", "settings", "events", "proposals", "radio", "problems", "notice", "stamps"];

describe("crew permissions", () => {
  it("admins can do everything", () => {
    for (const cap of ALL) expect(can({ role: "admin", status: "active" }, cap)).toBe(true);
  });

  it("operators run the club's activities, never money, member records or other settings", () => {
    const op = { role: "operator", status: "active" };
    expect(ALL.filter((cap) => can(op, cap))).toEqual(["events", "proposals", "radio", "problems", "notice", "stamps"]);
    for (const cap of ["money", "members", "settings"] as const) expect(can(op, cap)).toBe(false);
  });

  it("members, inactive crew and nobody can do none of it", () => {
    for (const who of [{ role: "member", status: "active" }, { role: "admin", status: "inactive" }, { role: "operator", status: "applicant" }, null]) {
      for (const cap of ALL) expect(can(who, cap)).toBe(false);
    }
  });
});
