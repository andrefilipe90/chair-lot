import { DeskScheduleStatus } from "@prisma/client";

import { prisma } from "../prisma";

export const releaseExpiredDeskSchedules = async () => {
  const now = new Date();

  const result = await prisma.deskSchedule.updateMany({
    where: {
      status: DeskScheduleStatus.BOOKED,
      checkInDeadline: {
        not: null,
        lt: now,
      },
    },
    data: {
      status: DeskScheduleStatus.RELEASED,
      autoReleasedAt: now,
    },
  });

  return result.count;
};
