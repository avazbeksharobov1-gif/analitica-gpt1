DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'BUSINESS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentProvider" AS ENUM ('PAYME', 'CLICK', 'TEST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "phone" TEXT UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLogin" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "ProjectUser" (
  "id" SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" "ProjectRole" NOT NULL DEFAULT 'OWNER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectUser_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectUser_projectId_userId_key" ON "ProjectUser"("projectId","userId");
CREATE INDEX IF NOT EXISTS "ProjectUser_userId_idx" ON "ProjectUser"("userId");

CREATE TABLE IF NOT EXISTS "ProjectToken" (
  "id" SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'YANDEX_SELLER',
  "name" TEXT,
  "apiKeysEnc" TEXT NOT NULL,
  "campaignIds" TEXT NOT NULL,
  "baseUrl" TEXT,
  "authMode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProjectToken_projectId_idx" ON "ProjectToken"("projectId");

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "plan" "PlanTier" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "price" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UZS',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UZS',
  "externalId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Payment_userId_provider_idx" ON "Payment"("userId","provider");

CREATE TABLE IF NOT EXISTS "Otp" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Otp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Otp_phone_idx" ON "Otp"("phone");
