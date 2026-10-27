import { describe, expect, it } from "vitest";
import { RANK, can, canAssign, canChangeRole, canManage, canManagePerson, canPlatform, highestRole, type AnyRole } from "./permissions";

const ROLES: AnyRole[] = ["FOUNDER", "SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"];

describe("shop permissions", () => {
  it("cashiers sell and take debt payments but see no costs and manage nothing", () => {
    expect(can("CASHIER", "sale.create")).toBe(true);
    expect(can("CASHIER", "debt.record")).toBe(true);
    for (const p of ["cost.view", "product.manage", "sale.void", "report.view", "staff.manage", "logs.view.business"] as const) {
      expect(can("CASHIER", p)).toBe(false);
    }
  });

  it("managers do every cashier duty too", () => {
    for (const p of ["sale.create", "debt.record", "customer.manage", "product.view"] as const) expect(can("MANAGER", p)).toBe(true);
  });

  it("managers run their branches, manage staff and read shop logs, but not the shop itself", () => {
    for (const p of ["purchase.manage", "sale.void", "staff.manage", "settings.manage", "logs.view.business"] as const) {
      expect(can("MANAGER", p)).toBe(true);
    }
    expect(can("MANAGER", "business.manage")).toBe(false);
    expect(can("MANAGER", "ownership.transfer")).toBe(false);
  });

  it("owners can do everything in their shop", () => {
    expect(can("OWNER", "business.manage")).toBe(true);
    expect(can("OWNER", "ownership.transfer")).toBe(true);
  });

  it("no role means no access", () => {
    expect(can(null, "product.view")).toBe(false);
  });
});

describe("platform permissions", () => {
  it("founder and super admins manage accounts and shops; only the founder manages super admins", () => {
    for (const p of ["platform.view", "logs.view.all", "business.admin", "accounts.manage"] as const) {
      expect(canPlatform("FOUNDER", p)).toBe(true);
      expect(canPlatform("SUPER_ADMIN", p)).toBe(true);
    }
    expect(canPlatform("FOUNDER", "superadmin.manage")).toBe(true);
    expect(canPlatform("SUPER_ADMIN", "superadmin.manage")).toBe(false);
    expect(canPlatform(null, "platform.view")).toBe(false);
  });
});

describe("who can manage whom (strictly by rank)", () => {
  // Row = actor, value = roles whose accounts they may manage.
  const manages: Record<AnyRole, AnyRole[]> = {
    FOUNDER: ["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"],
    SUPER_ADMIN: ["OWNER", "MANAGER", "CASHIER"],
    OWNER: ["MANAGER", "CASHIER"],
    MANAGER: ["CASHIER"],
    CASHIER: [],
  };
  // Row = actor, value = roles they may hand out (never OWNER: that only moves by transfer).
  const assigns: Record<AnyRole, AnyRole[]> = {
    FOUNDER: ["SUPER_ADMIN", "MANAGER", "CASHIER"],
    SUPER_ADMIN: ["MANAGER", "CASHIER"],
    OWNER: ["MANAGER", "CASHIER"],
    MANAGER: ["CASHIER"],
    CASHIER: [],
  };

  for (const actor of ROLES) {
    for (const target of ROLES) {
      const m = manages[actor].includes(target);
      const a = assigns[actor].includes(target);
      it(`${actor} ${m ? "can" : "cannot"} manage and ${a ? "can" : "cannot"} assign ${target}`, () => {
        expect(canManage(actor, target)).toBe(m);
        expect(canAssign(actor, target)).toBe(a);
      });
    }
  }

  it("never allows managing an equal or higher rank", () => {
    for (const actor of ROLES) for (const target of ROLES) if (RANK[target] >= RANK[actor]) expect(canManage(actor, target)).toBe(false);
  });

  it("nobody manages themselves, whatever their role", () => {
    expect(canManagePerson({ userId: "u1", role: "FOUNDER" }, { userId: "u1", role: "CASHIER" })).toBe(false);
    expect(canManagePerson({ userId: "u1", role: "OWNER" }, { userId: "u2", role: "MANAGER" })).toBe(true);
  });

  it("a manager cannot promote a cashier to manager; an owner can", () => {
    expect(canChangeRole("MANAGER", "CASHIER", "MANAGER")).toBe(false);
    expect(canChangeRole("OWNER", "CASHIER", "MANAGER")).toBe(true);
    expect(canChangeRole("OWNER", "MANAGER", "CASHIER")).toBe(true);
  });

  it("highestRole picks the most senior role", () => {
    expect(highestRole("CASHIER", "SUPER_ADMIN", null)).toBe("SUPER_ADMIN");
    expect(highestRole(null, undefined)).toBe(null);
  });
});
