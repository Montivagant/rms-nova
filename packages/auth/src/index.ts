import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type HashedPassword = {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: "sha512";
};

const DEFAULT_ITERATIONS = 120000;
const encoder = new TextEncoder();

export const hashPassword = async (password: string, iterations = DEFAULT_ITERATIONS): Promise<HashedPassword> => {
  const salt = randomBytes(16).toString("hex");
  const hashBuffer = await new Promise<Buffer>((resolve, reject) => {
    import("node:crypto").then(({ pbkdf2 }) => {
      pbkdf2(password, salt, iterations, 64, "sha512", (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  });

  return {
    hash: hashBuffer.toString("hex"),
    salt,
    iterations,
    algorithm: "sha512",
  };
};

export const verifyPassword = async (password: string, stored: HashedPassword): Promise<boolean> => {
  const { hash: storedHash, salt, iterations, algorithm } = stored;
  const hashBuffer = await new Promise<Buffer>((resolve, reject) => {
    import("node:crypto").then(({ pbkdf2 }) => {
      pbkdf2(password, salt, iterations, 64, algorithm, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  });
  const candidateHash = hashBuffer.toString("hex");
  return timingSafeEqual(candidateHash, storedHash);
};

const timingSafeEqual = (a: string, b: string) => {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return hashA.equals(hashB);
};

export type AccessTokenClaims = {
  sub: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
};

export type RefreshTokenClaims = {
  sub: string;
  tenantId: string;
  tokenId: string;
};

export const createAccessToken = async (
  claims: AccessTokenClaims,
  secret: string,
  expiresInSeconds: number
): Promise<string> => {
  return await new SignJWT({
    roles: claims.roles,
    permissions: claims.permissions,
    tenantId: claims.tenantId
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setAudience(claims.tenantId)
    .sign(encoder.encode(secret));
};

export const createRefreshToken = async (
  claims: RefreshTokenClaims,
  secret: string,
  expiresInSeconds: number
): Promise<string> => {
  return await new SignJWT({ tenantId: claims.tenantId, tokenId: claims.tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setAudience(claims.tenantId)
    .sign(encoder.encode(secret));
};

export const verifyAccessToken = async (token: string, secret: string): Promise<JWTPayload> => {
  const { payload } = await jwtVerify(token, encoder.encode(secret));
  return payload;
};

export const verifyRefreshToken = async (token: string, secret: string): Promise<JWTPayload> => {
  const { payload } = await jwtVerify(token, encoder.encode(secret));
  return payload;
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
