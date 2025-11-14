import { DeskScheduleStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { prisma } from "../prisma";
import { getUserFromSession } from "../queries/getUserFromSession";
import { publicProcedure, router } from "../trpc";

const deskInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  publicDeskId: z.string(),
  x: z.number(),
  y: z.number(),
});

type DeskScheduleClient = Prisma.TransactionClient | typeof prisma;

const getActiveDeskReservationCounts = async ({
  client,
  deskIds,
  now = new Date(),
}: {
  client: DeskScheduleClient;
  deskIds: string[];
  now?: Date;
}) => {
  if (deskIds.length === 0) {
    return {
      deskReservationCounts: {} as Record<string, number>,
      totalReservations: 0,
    };
  }

  const uniqueDeskIds = Array.from(new Set(deskIds));
  const todayStart = new Date(now.toDateString());

  const activeSchedules = await client.deskSchedule.findMany({
    where: {
      deskId: {
        in: uniqueDeskIds,
      },
      status: {
        not: DeskScheduleStatus.RELEASED,
      },
      OR: [
        {
          endTime: {
            gte: now,
          },
        },
        {
          AND: [
            {
              endTime: null,
            },
            {
              date: {
                gte: todayStart,
              },
            },
          ],
        },
      ],
    },
    select: {
      deskId: true,
    },
  });

  const deskReservationCounts = activeSchedules.reduce(
    (acc, schedule) => {
      acc[schedule.deskId] = (acc[schedule.deskId] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    deskReservationCounts,
    totalReservations: activeSchedules.length,
  };
};

export const floorRouter = router({
  createFloor: publicProcedure
    .input(
      z.object({
        officeId: z.string(),
        name: z.string(),
        description: z.string(),
        desks: z.array(deskInputSchema),
        imageUrl: z.string().optional(),
      }),
    )
    .mutation(async (resolverProps) => {
      const { ctx } = resolverProps;
      const { officeId, name, description, desks, imageUrl } =
        resolverProps.input;

      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });
      if (user.userRole !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }
      if (!user.organization) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong, the administrator has been notified.",
        });
      }

      const floor = await prisma.floor.create({
        data: {
          name: name,
          description: description,
          floorPlan: imageUrl,
          office: {
            connect: {
              id: officeId,
            },
          },
        },
      });
      const mappedDesks = desks.map((desk) => {
        return {
          name: desk.name,
          publicDeskId: desk.publicDeskId,
          description: desk.description,
          x: desk.x,
          y: desk.y,
          floorId: floor.id,
        };
      });
      await prisma.desk.createMany({
        data: mappedDesks,
      });
      const createdFloor = await prisma.floor.findFirst({
        where: {
          id: floor.id,
        },
        include: {
          desks: true,
        },
      });
      return createdFloor;
    }),
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async (resolverProps) => {
      const { ctx } = resolverProps;
      const { id } = resolverProps.input;

      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });
      if (!user.organization) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong, the administrator has been notified.",
        });
      }
      const desksToBeRemoved = await prisma.desk.findMany({
        where: {
          floorId: id,
        },
      });
      // Remove schedules first.
      await prisma.deskSchedule.deleteMany({
        where: {
          deskId: {
            in: desksToBeRemoved.map((desk) => desk.id),
          },
        },
      });

      // Remove desks first.
      await prisma.desk.deleteMany({
        where: {
          floorId: id,
        },
      });

      const floor = await prisma.floor.delete({
        where: {
          id: id,
        },
      });
      return floor;
    }),
  getById: publicProcedure
    .input(
      z.object({
        floorId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });
      if (user.userRole !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }
      if (!user.organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }
      const floor = await prisma.floor.findFirst({
        where: {
          id: input.floorId,
          office: {
            organizationId: user.organizationId,
          },
        },
        include: {
          desks: {
            orderBy: {
              publicDeskId: "asc",
            },
          },
          office: {
            select: {
              id: true,
              name: true,
              organizationId: true,
            },
          },
        },
      });
      if (!floor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Floor not found.",
        });
      }
      return floor;
    }),
  updateFloor: publicProcedure
    .input(
      z.object({
        floorId: z.string(),
        name: z.string(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        desks: z.array(deskInputSchema),
        forceDeleteDeskReservationDeskIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });
      if (user.userRole !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }
      if (!user.organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }

      return prisma.$transaction(async (tx) => {
        const floor = await tx.floor.findFirst({
          where: {
            id: input.floorId,
            office: {
              organizationId: user.organizationId,
            },
          },
          select: {
            id: true,
          },
        });

        if (!floor) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Floor not found.",
          });
        }

        await tx.floor.update({
          where: { id: input.floorId },
          data: {
            name: input.name,
            description: input.description ?? "",
            floorPlan: input.imageUrl ?? null,
          },
        });

        const deskIdsToKeep = input.desks
          .map((desk) => desk.id)
          .filter((id): id is string => typeof id === "string");

        const existingDeskIds = await tx.desk
          .findMany({
            where: {
              floorId: input.floorId,
            },
            select: {
              id: true,
            },
          })
          .then((desks) => desks.map((desk) => desk.id));

        const deskIdsToRemove = existingDeskIds.filter((id) => {
          return !deskIdsToKeep.includes(id);
        });

        let removedDeskIds: string[] = [];
        let cancelledReservationCount = 0;

        if (deskIdsToRemove.length > 0) {
          removedDeskIds = deskIdsToRemove;
          const confirmationSet = new Set(
            input.forceDeleteDeskReservationDeskIds ?? [],
          );

          const { deskReservationCounts, totalReservations } =
            await getActiveDeskReservationCounts({
              client: tx,
              deskIds: deskIdsToRemove,
            });

          const blockingDeskIds = Object.keys(deskReservationCounts);

          if (
            blockingDeskIds.length > 0 &&
            blockingDeskIds.some((deskId) => !confirmationSet.has(deskId))
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Removing these desks will cancel existing reservations.",
              cause: {
                deskReservationCounts,
              },
            });
          }

          cancelledReservationCount = totalReservations;

          await tx.deskSchedule.deleteMany({
            where: {
              deskId: {
                in: deskIdsToRemove,
              },
            },
          });

          await tx.desk.deleteMany({
            where: {
              id: {
                in: deskIdsToRemove,
              },
            },
          });
        }

        await Promise.all(
          input.desks.map((desk) => {
            const data = {
              name: desk.name ?? null,
              description: desk.description ?? null,
              publicDeskId: desk.publicDeskId,
              x: desk.x,
              y: desk.y,
            };

            if (desk.id) {
              return tx.desk.update({
                where: {
                  id: desk.id,
                  floorId: input.floorId,
                },
                data,
              });
            }

            return tx.desk.create({
              data: {
                ...data,
                floorId: input.floorId,
              },
            });
          }),
        );

        const updatedFloor = await tx.floor.findUnique({
          where: { id: input.floorId },
          include: {
            desks: {
              orderBy: {
                publicDeskId: "asc",
              },
            },
          },
        });

        if (!updatedFloor) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Floor not found.",
          });
        }

        return {
          floor: updatedFloor,
          removedDeskIds,
          cancelledReservationCount,
        };
      });
    }),
  previewDeskRemoval: publicProcedure
    .input(
      z.object({
        floorId: z.string(),
        deskIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUserFromSession(ctx.session, {
        includeOrganization: true,
      });

      if (user.userRole !== "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }

      if (!user.organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You are not authorized to perform this action.",
        });
      }

      const floor = await prisma.floor.findFirst({
        where: {
          id: input.floorId,
          office: {
            organizationId: user.organizationId,
          },
        },
        select: {
          id: true,
        },
      });

      if (!floor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Floor not found.",
        });
      }

      const desksInFloor = await prisma.desk.findMany({
        where: {
          id: {
            in: input.deskIds,
          },
          floorId: input.floorId,
        },
        select: {
          id: true,
        },
      });

      const deskIds = desksInFloor.map((desk) => desk.id);

      if (deskIds.length === 0) {
        return {
          deskReservationCounts: {} as Record<string, number>,
          totalReservations: 0,
        };
      }

      const { deskReservationCounts, totalReservations } =
        await getActiveDeskReservationCounts({
          client: prisma,
          deskIds,
        });

      return {
        deskReservationCounts,
        totalReservations,
      };
    }),
});
