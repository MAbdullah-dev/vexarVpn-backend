-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('enabled', 'disabled');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('android');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('registered', 'revoked');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('planned', 'disabled');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('recorded', 'closed');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('inactive', 'canceled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'enabled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "display_name" TEXT,
    "wireguard_public_key" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'registered',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_regions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_servers" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "wireguard_public_key" TEXT NOT NULL,
    "listen_port" INTEGER NOT NULL DEFAULT 51820,
    "status" "ServerStatus" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vpn_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_sessions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'recorded',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'inactive',
    "plan_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_wireguard_public_key_key" ON "devices"("wireguard_public_key");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "server_regions_code_key" ON "server_regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_servers_hostname_key" ON "vpn_servers"("hostname");

-- CreateIndex
CREATE INDEX "vpn_servers_region_id_idx" ON "vpn_servers"("region_id");

-- CreateIndex
CREATE INDEX "vpn_servers_status_idx" ON "vpn_servers"("status");

-- CreateIndex
CREATE INDEX "connection_sessions_device_id_idx" ON "connection_sessions"("device_id");

-- CreateIndex
CREATE INDEX "connection_sessions_server_id_idx" ON "connection_sessions"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_servers" ADD CONSTRAINT "vpn_servers_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "server_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_sessions" ADD CONSTRAINT "connection_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_sessions" ADD CONSTRAINT "connection_sessions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "vpn_servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

