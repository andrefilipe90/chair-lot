-- CreateEnum
CREATE TYPE "DeskScheduleStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'RELEASED');

-- AlterTable
ALTER TABLE "desk_schedule"
    ADD COLUMN "status" "DeskScheduleStatus" NOT NULL DEFAULT 'BOOKED',
    ADD COLUMN "check_in_deadline" TIMESTAMP(3),
    ADD COLUMN "checked_in_at" TIMESTAMP(3),
    ADD COLUMN "auto_released_at" TIMESTAMP(3);
