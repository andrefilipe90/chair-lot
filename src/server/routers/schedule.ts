import { DeskScheduleStatus, UserRole } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { addHours, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";

import { prisma } from "../../server/prisma";
import { releaseExpiredDeskSchedules } from "../jobs/releaseExpiredDeskSchedules";
import { getUserFromSession } from "../queries/getUserFromSession";
import { validateCurrentOfficeSet } from "../queries/validateCurrentOfficeSet";
import { validateUserHasOrganization } from "../queries/validateUserHasOrganization";
import { getFreeDesksPerDay } from "../scheduling/getFreeDesksPerDay";
import { getHasConflictingReservation } from "../scheduling/getHasConflictingReservations";
import { publicProcedure, router } from "../trpc";

const calculateCheckInDeadline = (props: {
  isWholeDayBooking: boolean;
  dayStart: Date;
  bookingStart: Date;
  timezone: string;
  now: Date;
}) => {
  const { isWholeDayBooking, dayStart, bookingStart, timezone, now } = props;

  const reservationDay = formatInTimeZone(dayStart, timezone, "yyyy-MM-dd");
  const currentDay = formatInTimeZone(now, timezone, "yyyy-MM-dd");

  if (isWholeDayBooking) {
    const nineAm = addHours(dayStart, 9);
    if (reservationDay === currentDay && nineAm <= now) {
      return addMinutes(now, 15);
    }
    return nineAm;
  }

  const defaultDeadline = addMinutes(bookingStart, 15);
  if (reservationDay === currentDay && defaultDeadline <= now) {
    return addMinutes(now, 15);
  }
  return defaultDeadline;
};

const assertAdmin = (user: { userRole: UserRole }) => {
  if (user.userRole !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not allowed to access this resource",
    });
  }
};

export const scheduleRouter = router({
  getFloorsForCurrentOffice: publicProcedure
    .input(z.object({}))
    .query(async (resolverProps) => {
      const { ctx } = resolverProps;
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });
      await validateUserHasOrganization(user);
      await validateCurrentOfficeSet(user);

      const floors = await prisma.floor.findMany({
        where: {
          officeId: user.currentOfficeId,
          office: {
            organizationId: user.organizationId,
          },
        },
      });

      return floors;
    }),
  getDeskSchedulesForDay: publicProcedure
    .input(z.object({ day: z.string() }))
    .query(async (resolverProps) => {
      const { ctx } = resolverProps;
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      if (!user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an organization",
        });
      }

      await prisma.organization.findFirst({
        where: {
          id: user.organizationId,
        },
      });

      if (!user.currentOfficeId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an office. Select an office first.",
        });
      }

      const usersOffice = await prisma.office.findFirst({
        where: {
          id: user.currentOfficeId,
        },
      });

      const floors = await prisma.floor.findMany({
        where: {
          officeId: user.currentOfficeId,
        },
      });

      const desksInCurrentOffice = await prisma.desk.findMany({
        where: {
          floorId: {
            in: floors.map((floor) => floor.id),
          },
        },
        include: {
          floor: true,
        },
      });
      const timeZone = usersOffice?.timezone || "UTC";
      const dayStart = fromZonedTime(
        `${resolverProps.input.day}T00:00:00`,
        timeZone,
      );
      const dayEnd = addHours(dayStart, 24);

      await releaseExpiredDeskSchedules();

      const deskSchedules = await prisma.deskSchedule.findMany({
        where: {
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
          },
          status: {
            not: DeskScheduleStatus.RELEASED,
          },
        },
        include: {
          desk: {
            include: {
              floor: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      const deskSchdulesMapped = getFreeDesksPerDay({
        deskSchedules: deskSchedules,
        desksInCurrentOffice: desksInCurrentOffice,
        // Because of time zone differences we include start and end here
        startingTime: dayStart,
        endTime: dayEnd,
      });

      return {
        deskSchedules: deskSchedules,
        desksInCurrentOffice: desksInCurrentOffice,
        deskSchdulesMapped,
        dayStart: dayStart,
        dayEnd: dayEnd,
        timeZone: usersOffice?.timezone || "UTC",
      };
    }),
  bookDeskForDay: publicProcedure
    .input(
      z
        .object({
          day: z.string(),
          deskId: z.string(),
          wholeDay: z.boolean().optional(),
          startHour: z.number().int().min(0).max(23).optional(),
          endHour: z.number().int().min(1).max(24).optional(),
        })
        .superRefine((value, ctx) => {
          const isWholeDay = value.wholeDay ?? true;
          const hasStart = value.startHour !== undefined;
          const hasEnd = value.endHour !== undefined;

          if (isWholeDay) {
            if (hasStart || hasEnd) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "Start and end hours must be omitted when booking for the whole day.",
              });
            }
            return;
          }

          if (!hasStart || !hasEnd) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "Select both start and end hours when the booking is not for the whole day.",
            });
            return;
          }

          if (value.startHour! >= value.endHour!) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "End hour must be greater than start hour.",
            });
          }
        }),
    )
    .mutation(async (resolverProps) => {
      const { ctx } = resolverProps;
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      if (!user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an organization",
        });
      }

      await prisma.organization.findFirst({
        where: {
          id: user.organizationId,
        },
      });

      if (!user.currentOfficeId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an office. Select an office first.",
        });
      }

      const usersOffice = await prisma.office.findFirst({
        where: {
          id: user.currentOfficeId,
          organizationId: user.organizationId,
        },
      });

      const floors = await prisma.floor.findMany({
        where: {
          officeId: user.currentOfficeId,
        },
      });

      const desksInCurrentOffice = await prisma.desk.findMany({
        where: {
          floorId: {
            in: floors.map((floor) => floor.id),
          },
        },
        include: {
          floor: true,
        },
      });
      const timeZone = usersOffice?.timezone || "UTC";
      const now = new Date();
      const dayStart = fromZonedTime(
        `${resolverProps.input.day}T00:00:00`,
        timeZone,
      );
      const dayEnd = addHours(dayStart, 24);

      await releaseExpiredDeskSchedules();

      const deskSchedules = await prisma.deskSchedule.findMany({
        where: {
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
          },
          status: {
            not: DeskScheduleStatus.RELEASED,
          },
        },
        include: {
          desk: {
            include: {
              floor: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });
      const isWholeDayBooking = resolverProps.input.wholeDay ?? true;
      const deskExistsInOffice = desksInCurrentOffice.some((desk) => {
        return desk.id === resolverProps.input.deskId;
      });

      if (!deskExistsInOffice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Desk not found.",
        });
      }

      const bookingStart = isWholeDayBooking
        ? dayStart
        : addHours(dayStart, resolverProps.input.startHour!);
      const bookingEnd = isWholeDayBooking
        ? dayEnd
        : addHours(dayStart, resolverProps.input.endHour!);
      const checkInDeadline = calculateCheckInDeadline({
        isWholeDayBooking,
        dayStart,
        bookingStart,
        timezone: timeZone,
        now,
      });

      if (bookingEnd <= bookingStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid booking interval.",
        });
      }

      if (bookingEnd > dayEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bookings must end within the same day.",
        });
      }

      const userHasConflictingReservation = getHasConflictingReservation({
        userId: user.id,
        deskSchedules,
        startTime: bookingStart,
        endTime: bookingEnd,
      });

      if (userHasConflictingReservation) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a booking that overlaps this period.",
        });
      }

      const hasDeskConflict = deskSchedules.some((schedule) => {
        if (schedule.deskId !== resolverProps.input.deskId) {
          return false;
        }
        if (!schedule.startTime || !schedule.endTime) {
          return false;
        }
        return (
          schedule.startTime < bookingEnd && schedule.endTime > bookingStart
        );
      });

      if (hasDeskConflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Desk is not free for the selected period.",
        });
      }

      const deskSchedule = await prisma.deskSchedule.create({
        data: {
          deskId: resolverProps.input.deskId,
          userId: user.id,
          startTime: bookingStart,
          endTime: bookingEnd,
          date: dayStart,
          wholeDay: isWholeDayBooking,
          timezone: timeZone,
          status: DeskScheduleStatus.BOOKED,
          checkInDeadline,
        },
      });

      return deskSchedule;
    }),
  cancelDeskForDay: publicProcedure
    .input(z.object({ deskScheduleId: z.string(), day: z.string() }))
    .mutation(async (resolverProps) => {
      const { ctx } = resolverProps;
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      if (!user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an organization",
        });
      }

      await prisma.organization.findFirst({
        where: {
          id: user.organizationId,
        },
      });

      if (!user.currentOfficeId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an office. Select an office first.",
        });
      }

      const floors = await prisma.floor.findMany({
        where: {
          officeId: user.currentOfficeId,
        },
      });

      const desksInCurrentOffice = await prisma.desk.findMany({
        where: {
          floorId: {
            in: floors.map((floor) => floor.id),
          },
        },
      });

      const deskSchedule = await prisma.deskSchedule.findFirst({
        where: {
          id: resolverProps.input.deskScheduleId,
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!deskSchedule) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You do not have a booking for this period.",
        });
      }

      const isOwner = deskSchedule.userId === user.id;
      const isAdmin = user.userRole === "ADMIN";

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not allowed to cancel this booking.",
        });
      }

      await prisma.deskSchedule.delete({
        where: {
          id: resolverProps.input.deskScheduleId,
        },
      });
      return null;
    }),
  adminBookDeskForDay: publicProcedure
    .input(
      z
        .object({
          userId: z.string(),
          day: z.string(),
          deskId: z.string(),
          wholeDay: z.boolean().optional(),
          startHour: z.number().int().min(0).max(23).optional(),
          endHour: z.number().int().min(1).max(24).optional(),
        })
        .superRefine((value, ctx) => {
          const isWholeDay = value.wholeDay ?? true;
          const hasStart = value.startHour !== undefined;
          const hasEnd = value.endHour !== undefined;

          if (isWholeDay) {
            if (hasStart || hasEnd) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "Start and end hours must be omitted when booking for the whole day.",
              });
            }
            return;
          }

          if (!hasStart || !hasEnd) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "Select both start and end hours when the booking is not for the whole day.",
            });
            return;
          }

          if (value.startHour! >= value.endHour!) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "End hour must be greater than start hour.",
            });
          }
        }),
    )
    .mutation(async (resolverProps) => {
      const { ctx, input } = resolverProps;
      const actor = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      assertAdmin(actor);

      if (!actor.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an organization",
        });
      }

      if (!actor.currentOfficeId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an office. Select an office first.",
        });
      }

      const targetUser = await prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: actor.organizationId,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target user not found in organization.",
        });
      }

      const usersOffice = await prisma.office.findFirst({
        where: {
          id: actor.currentOfficeId,
          organizationId: actor.organizationId,
        },
      });

      const floors = await prisma.floor.findMany({
        where: {
          officeId: actor.currentOfficeId,
        },
      });

      const desksInCurrentOffice = await prisma.desk.findMany({
        where: {
          floorId: {
            in: floors.map((floor) => floor.id),
          },
        },
        include: {
          floor: true,
        },
      });

      const deskExistsInOffice = desksInCurrentOffice.some(
        (desk) => desk.id === input.deskId,
      );

      if (!deskExistsInOffice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Desk not found.",
        });
      }

      const timeZone = usersOffice?.timezone || "UTC";
      const now = new Date();
      const dayStart = fromZonedTime(`${input.day}T00:00:00`, timeZone);
      const dayEnd = addHours(dayStart, 24);

      await releaseExpiredDeskSchedules();

      const deskSchedules = await prisma.deskSchedule.findMany({
        where: {
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
          },
          status: {
            not: DeskScheduleStatus.RELEASED,
          },
        },
        include: {
          desk: {
            include: {
              floor: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      const isWholeDayBooking = input.wholeDay ?? true;

      const bookingStart = isWholeDayBooking
        ? dayStart
        : addHours(dayStart, input.startHour!);
      const bookingEnd = isWholeDayBooking
        ? dayEnd
        : addHours(dayStart, input.endHour!);
      const checkInDeadline = calculateCheckInDeadline({
        isWholeDayBooking,
        dayStart,
        bookingStart,
        timezone: timeZone,
        now,
      });

      if (bookingEnd <= bookingStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid booking interval.",
        });
      }

      if (bookingEnd > dayEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bookings must end within the same day.",
        });
      }

      const userHasConflictingReservation = getHasConflictingReservation({
        userId: targetUser.id,
        deskSchedules,
        startTime: bookingStart,
        endTime: bookingEnd,
      });

      if (userHasConflictingReservation) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The selected user already has a booking in this period.",
        });
      }

      const hasDeskConflict = deskSchedules.some((schedule) => {
        if (schedule.deskId !== input.deskId) {
          return false;
        }
        if (!schedule.startTime || !schedule.endTime) {
          return false;
        }
        return (
          schedule.startTime < bookingEnd && schedule.endTime > bookingStart
        );
      });

      if (hasDeskConflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Desk is not free for the selected period.",
        });
      }

      const deskSchedule = await prisma.deskSchedule.create({
        data: {
          deskId: input.deskId,
          userId: targetUser.id,
          startTime: bookingStart,
          endTime: bookingEnd,
          date: dayStart,
          wholeDay: isWholeDayBooking,
          timezone: timeZone,
          status: DeskScheduleStatus.BOOKED,
          checkInDeadline,
        },
      });

      return deskSchedule;
    }),
  adminUpdateDeskSchedule: publicProcedure
    .input(
      z
        .object({
          deskScheduleId: z.string(),
          userId: z.string().optional(),
          day: z.string().optional(),
          deskId: z.string().optional(),
          wholeDay: z.boolean().optional(),
          startHour: z.number().int().min(0).max(23).optional(),
          endHour: z.number().int().min(1).max(24).optional(),
        })
        .superRefine((value, ctx) => {
          const nextWholeDay = value.wholeDay;
          const hasStart = value.startHour !== undefined;
          const hasEnd = value.endHour !== undefined;

          if (nextWholeDay === true) {
            if (hasStart || hasEnd) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "Start and end hours must be omitted when booking for the whole day.",
              });
            }
            return;
          }

          if (nextWholeDay === false) {
            if (!hasStart || !hasEnd) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "Select both start and end hours when the booking is not for the whole day.",
              });
              return;
            }
            if (value.startHour! >= value.endHour!) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "End hour must be greater than start hour.",
              });
            }
          }
        }),
    )
    .mutation(async (resolverProps) => {
      const { ctx, input } = resolverProps;
      const actor = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      assertAdmin(actor);

      if (!actor.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an organization",
        });
      }

      if (!actor.currentOfficeId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an office. Select an office first.",
        });
      }

      const existingSchedule = await prisma.deskSchedule.findFirst({
        where: {
          id: input.deskScheduleId,
        },
        include: {
          desk: {
            include: {
              floor: true,
            },
          },
          user: true,
        },
      });

      if (!existingSchedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reservation not found.",
        });
      }

      const usersOffice = await prisma.office.findFirst({
        where: {
          id: actor.currentOfficeId,
          organizationId: actor.organizationId,
        },
      });

      const floors = await prisma.floor.findMany({
        where: {
          officeId: actor.currentOfficeId,
        },
      });

      const desksInCurrentOffice = await prisma.desk.findMany({
        where: {
          floorId: {
            in: floors.map((floor) => floor.id),
          },
        },
        include: {
          floor: true,
        },
      });

      const targetDeskId = input.deskId ?? existingSchedule.deskId;
      const deskExistsInOffice = desksInCurrentOffice.some(
        (desk) => desk.id === targetDeskId,
      );

      if (!deskExistsInOffice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Desk not found.",
        });
      }

      let targetUserId = existingSchedule.userId;
      if (input.userId && input.userId !== existingSchedule.userId) {
        const targetUser = await prisma.user.findFirst({
          where: {
            id: input.userId,
            organizationId: actor.organizationId,
          },
        });

        if (!targetUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target user not found in organization.",
          });
        }
        targetUserId = targetUser.id;
      }

      if (!targetUserId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reservation is not associated with a user.",
        });
      }

      const timeZone =
        usersOffice?.timezone || existingSchedule.timezone || "UTC";
      const now = new Date();

      const dayString =
        input.day ??
        formatInTimeZone(
          existingSchedule.startTime ?? existingSchedule.date ?? now,
          timeZone,
          "yyyy-MM-dd",
        );
      const dayStart = fromZonedTime(`${dayString}T00:00:00`, timeZone);
      const dayEnd = addHours(dayStart, 24);

      const nextWholeDay = input.wholeDay ?? existingSchedule.wholeDay;

      let startHour = input.startHour;
      let endHour = input.endHour;

      if (!nextWholeDay) {
        if (startHour === undefined) {
          startHour = Number(
            formatInTimeZone(
              existingSchedule.startTime ?? dayStart,
              timeZone,
              "H",
            ),
          );
        }
        if (endHour === undefined) {
          endHour = Number(
            formatInTimeZone(
              existingSchedule.endTime ??
                addHours(dayStart, (startHour ?? 0) + 1),
              timeZone,
              "H",
            ),
          );
        }
      }

      const bookingStart = nextWholeDay
        ? dayStart
        : addHours(dayStart, startHour!);
      const bookingEnd = nextWholeDay ? dayEnd : addHours(dayStart, endHour!);

      if (bookingEnd <= bookingStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid booking interval.",
        });
      }

      if (bookingEnd > dayEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bookings must end within the same day.",
        });
      }

      await releaseExpiredDeskSchedules();

      const deskSchedules = await prisma.deskSchedule.findMany({
        where: {
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
          },
          status: {
            not: DeskScheduleStatus.RELEASED,
          },
        },
        include: {
          desk: true,
        },
      });

      const deskSchedulesWithoutCurrent = deskSchedules.filter(
        (schedule) => schedule.id !== existingSchedule.id,
      );

      const userHasConflictingReservation = getHasConflictingReservation({
        userId: targetUserId ?? undefined,
        deskSchedules: deskSchedulesWithoutCurrent,
        startTime: bookingStart,
        endTime: bookingEnd,
      });

      if (userHasConflictingReservation) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The selected user already has a booking in this period.",
        });
      }

      const hasDeskConflict = deskSchedulesWithoutCurrent.some((schedule) => {
        if (schedule.deskId !== targetDeskId) {
          return false;
        }
        if (!schedule.startTime || !schedule.endTime) {
          return false;
        }
        return (
          schedule.startTime < bookingEnd && schedule.endTime > bookingStart
        );
      });

      if (hasDeskConflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Desk is not free for the selected period.",
        });
      }

      const checkInDeadline = calculateCheckInDeadline({
        isWholeDayBooking: nextWholeDay,
        dayStart,
        bookingStart,
        timezone: timeZone,
        now,
      });

      const updatedDeskSchedule = await prisma.deskSchedule.update({
        where: {
          id: existingSchedule.id,
        },
        data: {
          deskId: targetDeskId,
          userId: targetUserId ?? existingSchedule.userId,
          startTime: bookingStart,
          endTime: bookingEnd,
          date: dayStart,
          wholeDay: nextWholeDay,
          timezone: timeZone,
          status: DeskScheduleStatus.BOOKED,
          checkInDeadline,
          checkedInAt: null,
          autoReleasedAt: null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          desk: {
            include: {
              floor: true,
            },
          },
        },
      });

      return updatedDeskSchedule;
    }),
  checkInDeskSchedule: publicProcedure
    .input(
      z.object({
        deskScheduleId: z.string(),
      }),
    )
    .mutation(async (resolverProps) => {
      const { ctx } = resolverProps;

      await releaseExpiredDeskSchedules();

      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      if (!user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not part of an organization",
        });
      }

      const deskSchedule = await prisma.deskSchedule.findFirst({
        where: {
          id: resolverProps.input.deskScheduleId,
          userId: user.id,
        },
      });

      if (!deskSchedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reservation not found.",
        });
      }

      if (deskSchedule.status === DeskScheduleStatus.RELEASED) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Reservation already released.",
        });
      }

      if (deskSchedule.status === DeskScheduleStatus.CHECKED_IN) {
        return deskSchedule;
      }

      if (!deskSchedule.checkInDeadline) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reservation cannot be checked in.",
        });
      }

      const now = new Date();
      if (deskSchedule.checkInDeadline < now) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Check-in deadline has already passed.",
        });
      }

      const timezone = deskSchedule.timezone || "UTC";

      const reservationReference =
        deskSchedule.date ?? deskSchedule.startTime ?? deskSchedule.endTime;

      if (!reservationReference) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reservation date is invalid.",
        });
      }

      const reservationDay = formatInTimeZone(
        reservationReference,
        timezone,
        "yyyy-MM-dd",
      );
      const currentDay = formatInTimeZone(now, timezone, "yyyy-MM-dd");

      if (reservationDay !== currentDay) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Check-in is only available on the reservation day.",
        });
      }

      const updatedDeskSchedule = await prisma.deskSchedule.update({
        where: {
          id: deskSchedule.id,
        },
        data: {
          status: DeskScheduleStatus.CHECKED_IN,
          checkedInAt: now,
        },
      });

      return updatedDeskSchedule;
    }),
});
