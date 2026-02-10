-- Init schema (base tables)
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'BUSINESS');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "PaymentProvider" AS ENUM ('PAYME', 'CLICK', 'TEST');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectUser" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectToken" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'YANDEX_SELLER',
    "name" TEXT,
    "apiKeysEnc" TEXT NOT NULL,
    "campaignIds" TEXT NOT NULL,
    "baseUrl" TEXT,
    "authMode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerDaily" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "ordersCreated" INTEGER NOT NULL DEFAULT 0,
    "ordersWarehouse" INTEGER NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER NOT NULL DEFAULT 0,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acquiring" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logistics" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returns" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerItemDaily" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acquiring" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logistics" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returns" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerItemDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertSetting" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "plan" "PlanTier" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "externalId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Otp" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE INDEX "ProjectUser_userId_idx" ON "ProjectUser"("userId");
CREATE UNIQUE INDEX "ProjectUser_projectId_userId_key" ON "ProjectUser"("projectId", "userId");
CREATE INDEX "ProjectToken_projectId_idx" ON "ProjectToken"("projectId");
CREATE UNIQUE INDEX "Product_projectId_sku_key" ON "Product"("projectId", "sku");
CREATE UNIQUE INDEX "ExpenseCategory_code_key" ON "ExpenseCategory"("code");
CREATE INDEX "Expense_projectId_date_idx" ON "Expense"("projectId", "date");
CREATE UNIQUE INDEX "SellerDaily_projectId_date_key" ON "SellerDaily"("projectId", "date");
CREATE INDEX "SellerItemDaily_projectId_date_idx" ON "SellerItemDaily"("projectId", "date");
CREATE INDEX "SellerItemDaily_projectId_sku_idx" ON "SellerItemDaily"("projectId", "sku");
CREATE UNIQUE INDEX "SellerItemDaily_projectId_date_sku_key" ON "SellerItemDaily"("projectId", "date", "sku");
CREATE UNIQUE INDEX "AlertSetting_projectId_chatId_key" ON "AlertSetting"("projectId", "chatId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Payment_userId_provider_idx" ON "Payment"("userId", "provider");
CREATE INDEX "Otp_phone_idx" ON "Otp"("phone");

ALTER TABLE "ProjectUser" ADD CONSTRAINT "ProjectUser_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectUser" ADD CONSTRAINT "ProjectUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectToken" ADD CONSTRAINT "ProjectToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerDaily" ADD CONSTRAINT "SellerDaily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerItemDaily" ADD CONSTRAINT "SellerItemDaily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlertSetting" ADD CONSTRAINT "AlertSetting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Otp" ADD CONSTRAINT "Otp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;