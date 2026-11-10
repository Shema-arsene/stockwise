import "dotenv/config";

const errors = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) errors.push(`${name} is missing`);
  return value;
}

function validateUrl(name, value, protocols) {
  if (!value) return;

  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(`${name} must use ${protocols.join(" or ")}`);
    }
  } catch {
    errors.push(`${name} is not a valid URL`);
  }
}

const databaseUrl = process.env.DATABASE_URL_POOLED?.trim() || required("DATABASE_URL");
const directUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL_UNPOOLED?.trim() || required("DIRECT_URL (or DATABASE_URL_UNPOOLED)");
const authSecret = required("BETTER_AUTH_SECRET");
const authUrl = required("BETTER_AUTH_URL");

validateUrl("DATABASE_URL", databaseUrl, ["postgresql:", "postgres:"]);
validateUrl("DIRECT_URL", directUrl, ["postgresql:", "postgres:"]);
validateUrl("BETTER_AUTH_URL", authUrl, ["http:", "https:"]);

if (authSecret && authSecret.length < 32) {
  errors.push("BETTER_AUTH_SECRET must be at least 32 characters");
}

for (const [name, value] of [
  ["DATABASE_URL", databaseUrl],
  ["DIRECT_URL", directUrl],
  ["BETTER_AUTH_URL", authUrl],
]) {
  if (value && /USER|PASSWORD|ep-xxxx|your-domain/i.test(value)) {
    errors.push(`${name} still contains an example placeholder`);
  }
}

if (errors.length > 0) {
  console.error("Environment is not ready:");
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\nCopy .env.example to .env, replace every placeholder, and run npm run env:check again.");
  process.exitCode = 1;
} else {
  console.log("Environment is ready.");
}
