import { PrismaClient } from "../../generated/prisma/client.js"
import { PrismaPg } from "@prisma/adapter-pg"
import { DATABASE_URL } from './env.js';

const adapter = new PrismaPg({ url: DATABASE_URL })
const prisma = new PrismaClient({ adapter })


export default prisma