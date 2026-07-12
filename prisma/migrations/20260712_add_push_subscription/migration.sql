-- AlterTable: add pushSubscription column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushSubscription" JSONB;
