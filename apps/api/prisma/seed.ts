import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // SYSTEM user
  const systemEmail = "system@local";
  await prisma.user.upsert({
    where: { email: systemEmail },
    update: {},
    create: { name: "SYSTEM", email: systemEmail, role: Role.ADMIN },
  });

  // Locations
  const count = await prisma.location.count();
  if (count === 0) {
    await prisma.location.createMany({
      data: [
        { name: "研究室(共通棚)", note: "初期デフォルト" },
        { name: "個人保管", note: "個人机・ロッカーなど" },
      ],
    });
    console.log("Seeded locations.");
  } else {
    console.log("Locations already exist. Skip seeding.");
  }

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
