import { randomUUID } from "node:crypto";
import { pool } from "../../db.js";
import { env } from "../../config.js";
import { createAccessToken, createRefreshToken, hashToken, type AccessTokenClaims } from "@nova/auth";

type IssueTokenParams = AccessTokenClaims & { metadata?: Record<string, unknown> };

const insertRefreshTokenSql = `
  INSERT INTO user_refresh_tokens (tenant_id, user_id, token_hash, expires_at, metadata)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  expiresAt: {
    accessToken: number;
    refreshToken: number;
  };
};

export const issueTokens = async ({ metadata = {}, ...claims }: IssueTokenParams): Promise<IssuedTokens> => {
  const refreshTokenId = randomUUID();
  const accessToken = await createAccessToken(claims, env.JWT_SECRET, env.ACCESS_TOKEN_TTL);
  const refreshToken = await createRefreshToken(
    { sub: claims.sub, tenantId: claims.tenantId, tokenId: refreshTokenId },
    env.REFRESH_TOKEN_SECRET,
    env.REFRESH_TOKEN_TTL
  );

  const accessExpires = Math.floor(Date.now() / 1000) + env.ACCESS_TOKEN_TTL;
  const refreshExpires = Math.floor(Date.now() / 1000) + env.REFRESH_TOKEN_TTL;

  const client = await pool.connect();
  try {
    await client.query(insertRefreshTokenSql, [
      claims.tenantId,
      claims.sub,
      hashToken(refreshToken),
      new Date(refreshExpires * 1000),
      metadata
    ]);
  } finally {
    client.release();
  }

  return {
    accessToken,
    refreshToken,
    refreshTokenId,
    expiresAt: {
      accessToken: accessExpires,
      refreshToken: refreshExpires
    }
  };
};
