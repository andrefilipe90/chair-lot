import { DeskSchedule } from "@prisma/client";

type DeskScheduleWithDesk = DeskSchedule & {
  desk?: {
    floorId: string | null;
  };
};

type GetHasConflictingReservationInput = {
  userId: string;
  deskSchedules: DeskScheduleWithDesk[];
  startTime: Date;
  endTime: Date;
  floorId?: string | null;
};

/**
 * Returns true when the provided interval overlaps with an existing reservation
 * for the same user. This works for whole-day reservations as well as partial
 * bookings, as the `startTime`/`endTime` fields are populated for both cases.
 */
export const getHasConflictingReservation = (
  props: GetHasConflictingReservationInput,
): boolean => {
  const { userId, deskSchedules, startTime, endTime, floorId } = props;

  return deskSchedules.some((schedule) => {
    if (schedule.userId !== userId) {
      return false;
    }

    const scheduleStart = schedule.startTime ?? schedule.date ?? null;
    const scheduleEnd = schedule.endTime ?? null;

    if (!scheduleStart || !scheduleEnd) {
      return false;
    }

    if (floorId) {
      const scheduleFloorId = schedule.desk?.floorId ?? null;
      if (scheduleFloorId && scheduleFloorId !== floorId) {
        return false;
      }
    }

    return scheduleStart < endTime && scheduleEnd > startTime;
  });
};
