import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  hashToken
} from "../index";
import { randomUUID } from "node:crypto";

const ACCESS_SECRET = "testaccesssecretvalue_should_be_long_enough_123456";
const REFRESH_SECRET = "testrefreshsecretvalue_should_be_long_enough_654321";

describe("@nova/auth", () => {
  describe("password hashing", () => {
    it("hashes and verifies a password", async () => {
      const stored = await hashPassword("CorrectHorseBatteryStaple!", 1000);
      const ok = await verifyPassword("CorrectHorseBatteryStaple!", stored);
      const bad = await verifyPassword("WrongPassword", stored);

      expect(ok).toBe(true);
      expect(bad).toBe(false);
    });

    it("produces different salts while remaining verifiable", async () => {
      const first = await hashPassword("TimingTest123", 500);
      const second = await hashPassword("TimingTest123", 500);

      expect(first.hash).not.toBe(second.hash);
      expect(first.salt).not.toBe(second.salt);
      expect(await verifyPassword("TimingTest123", first)).toBe(true);
      expect(await verifyPassword("TimingTest124", first)).toBe(false);
      expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
    });
  });

  describe("JWT helpers", () => {
    it("creates and verifies an access token", async () => {
      const token = await createAccessToken(
        {
          sub: "user-123",
          tenantId: "tenant-456",
          roles: ["owner"],
          permissions: ["inventory.items.read"]
        },
        ACCESS_SECRET,
        900
      );

      const payload = await verifyAccessToken(token, ACCESS_SECRET);
      expect(payload.sub).toBe("user-123");
      expect(payload.tenantId).toBe("tenant-456");
      expect(payload.roles).toEqual(["owner"]);
      expect(payload.permissions).toEqual(["inventory.items.read"]);
    });

    it("creates and verifies a refresh token", async () => {
      const tokenId = randomUUID();
      const token = await createRefreshToken(
        {
          sub: "user-789",
          tenantId: "tenant-xyz",
          tokenId
        },
        REFRESH_SECRET,
        60 * 60
      );

      const payload = await verifyRefreshToken(token, REFRESH_SECRET);
      expect(payload.sub).toBe("user-789");
      expect(payload.tokenId).toBe(tokenId);
      expect(payload.tenantId).toBe("tenant-xyz");
    });
  });
});
