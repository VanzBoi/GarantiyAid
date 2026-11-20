// Creates or updates a staff account for the /staff scanner page.
// Usage: STAFF_PASSWORD='a-long-password-123' npm run staff:create -- <username> "<Display name>"
// The password is read from the environment so it does not end up in shell history as an argument.
import { prisma } from "./db.ts";
import { hashPassword } from "./security.ts";

const [usernameArg, ...nameParts] = process.argv.slice(2);
const username = (usernameArg ?? "").trim().toLowerCase();
const displayName = nameParts.join(" ").trim();
const password = process.env.STAFF_PASSWORD ?? "";

if (!/^[a-z0-9._-]{3,40}$/.test(username) || displayName.length < 2 || displayName.length > 100) {
  console.error('Usage: STAFF_PASSWORD=... npm run staff:create -- <username> "<Display name>"');
  console.error("Username: 3 to 40 lowercase letters, numbers, dots, dashes or underscores.");
  process.exit(1);
}
if (password.length < 10 || !/\p{L}/u.test(password) || !/\d/.test(password)) {
  console.error("Set STAFF_PASSWORD to at least 10 characters with a letter and a number.");
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const staff = await prisma.staff.upsert({
  where: { username },
  update: { displayName, passwordHash, isActive: true },
  create: { username, displayName, passwordHash },
});
// A new password ends every existing session for this staff member.
await prisma.staffSession.updateMany({ where: { staffId: staff.staffId, revokedAt: null }, data: { revokedAt: new Date() } });
console.info(`Staff account ready: ${staff.username} (${staff.displayName}). Log in at /staff.`);
await prisma.$disconnect();
