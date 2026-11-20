// Loads the official PSGC barangay list for Region VII (Bohol, Cebu, Negros
// Oriental, Siquijor) so the mobile address picker can offer real choices.
// Safe to re-run: existing barangay codes are skipped, and a barangay that
// already exists under another code (such as the seeded Punta Princesa) is kept.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

type Row = [psgcCode: string, barangayName: string, city: string, province: string];
const { rows } = JSON.parse(
  readFileSync(new URL("../prisma/data/region7-barangays.json", import.meta.url), "utf8"),
) as { rows: Row[] };

const placeKey = (name: string, city: string, province: string) =>
  `${name}|${city}|${province}`.toLocaleLowerCase();

try {
  const existing = await prisma.barangay.findMany({
    where: { isActive: true },
    select: { barangayCode: true, barangayName: true, city: true, province: true },
  });
  const otherCodes = new Set(
    existing
      .filter((item) => !item.barangayCode.startsWith("PSGC-"))
      .map((item) => placeKey(item.barangayName, item.city, item.province)),
  );

  const wanted = rows.filter(([, name, city, province]) => !otherCodes.has(placeKey(name, city, province)));
  // If src/seed.ts ran after this list was loaded, hide the PSGC copy so the picker shows one entry.
  const duplicates = rows
    .filter(([, name, city, province]) => otherCodes.has(placeKey(name, city, province)))
    .map(([psgcCode]) => `PSGC-${psgcCode}`);
  if (duplicates.length) {
    await prisma.barangay.updateMany({
      where: { barangayCode: { in: duplicates }, isActive: true },
      data: { isActive: false },
    });
  }
  // One bulk insert keeps this fast against a remote database; existing codes are left as they are.
  const { count } = await prisma.barangay.createMany({
    data: wanted.map(([psgcCode, barangayName, city, province]) => ({
      barangayCode: `PSGC-${psgcCode}`, barangayName, city, province,
    })),
    skipDuplicates: true,
  });
  console.log(
    `Barangays: ${count} added, ${wanted.length - count} already loaded, ${rows.length - wanted.length} present under another code.`,
  );
} finally {
  await prisma.$disconnect();
}
