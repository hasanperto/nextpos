import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.saasAdmin.findMany({
    select: { username: true, role: true, isActive: true }
  });
  console.log('SaaS Admins:', admins);
}

main().catch(console.error).finally(() => prisma.$disconnect());
