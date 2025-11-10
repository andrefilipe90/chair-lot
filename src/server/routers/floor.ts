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

        await tx.desk.deleteMany({
          where: {
            floorId: input.floorId,
            id: {
              notIn: deskIdsToKeep,
            },
          },
        });

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

        return tx.floor.findUnique({
          where: { id: input.floorId },
          include: {
            desks: {
              orderBy: {
                publicDeskId: "asc",
              },
            },
          },
        });
      });
    }),
});
