import { TRPCError } from "@trpc/server";
import { addHours } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";

import { prisma } from "../../server/prisma";
import { getUserFromSession } from "../queries/getUserFromSession";
import { validateCurrentOfficeSet } from "../queries/validateCurrentOfficeSet";
import { validateUserHasOrganization } from "../queries/validateUserHasOrganization";
import { getFreeDesksPerDay } from "../scheduling/getFreeDesksPerDay";
import { getHasConflictingReservation } from "../scheduling/getHasConflictingReservations";
import { publicProcedure, router } from "../trpc";

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

      const deskSchedules = await prisma.deskSchedule.findMany({
        where: {
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
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
      const dayStart = fromZonedTime(
        `${resolverProps.input.day}T00:00:00`,
        timeZone,
      );
      const dayEnd = addHours(dayStart, 24);

      const deskSchedules = await prisma.deskSchedule.findMany({
        where: {
          deskId: {
            in: desksInCurrentOffice.map((desk) => desk.id),
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
          userId: user.id,
        },
      });

      if (!deskSchedule) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You do not have a booking for this period.",
        });
      }

      await prisma.deskSchedule.delete({
        where: {
          id: resolverProps.input.deskScheduleId,
        },
      });
      return null;
    }),
});
