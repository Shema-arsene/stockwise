import "dotenv/config";
import { probeNeonServices } from "../src/lib/neon/probes";

async function main() {
  const services = await probeNeonServices();
  console.log(JSON.stringify(services));
  if (!Object.values(services).every(Boolean)) process.exitCode = 1;
}

void main();
