import { DeskSchedule } from "@prisma/client";

type GetHasConflictingReservationInput = {
  userId: string;
  deskSchedules: DeskSchedule[];
  startTime: Date;
  endTime: Date;
};

/**
 * Returns true when the provided interval overlaps with an existing reservation
 * for the same user. This works for whole-day reservations as well as partial
 * bookings, as the `startTime`/`endTime` fields are populated for both cases.
 */
export const getHasConflictingReservation = (
  props: GetHasConflictingReservationInput,
): boolean => {
  const { userId, deskSchedules, startTime, endTime } = props;

  return deskSchedules.some((schedule) => {
    if (schedule.userId !== userId) {
      return false;
    }

    const scheduleStart = schedule.startTime ?? schedule.date ?? null;
    const scheduleEnd = schedule.endTime ?? null;

    if (!scheduleStart || !scheduleEnd) {
      return false;
    }

    return scheduleStart < endTime && scheduleEnd > startTime;
  });
};
