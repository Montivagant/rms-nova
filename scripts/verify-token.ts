import "dotenv/config";
import { verifyAccessToken } from "@nova/auth";

const token = process.argv[2];

if (!token) {
  console.error("Usage: pnpm tsx scripts/verify-token.ts <jwt>");
  process.exit(1);
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("JWT_SECRET is not defined. Load the root .env before running this script.");
}

void verifyAccessToken(token, secret)
  .then((payload) => {
    console.log(JSON.stringify(payload, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
