import {
  Alert,
  Box,
  Button,
  Center,
  Container,
  HStack,
  Heading,
  Portal,
  Separator,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { GetServerSideProps } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import { FormFloorAdd } from "../../../../../../components/FormFloorAdd";
import { toaster } from "../../../../../../components/ui/toaster";
import { getMessages } from "../../../../../../messages/getMessages";
import { appAuthRedirect } from "../../../../../../server/nextMiddleware/appAuthRedirect";
import { useOfficeFloorFormStore } from "../../../../../../stores/officeFloorFormStore";
import { DeskFormState } from "../../../../../../stores/types";
import { RouterInput, trpc } from "../../../../../../utils/trpc";

const mapDeskToFormState = (desk: {
  id: string;
  name: string | null;
  description: string | null;
  publicDeskId: string;
  x: number;
  y: number;
}): DeskFormState => ({
  id: desk.id,
  name: desk.name ?? undefined,
  description: desk.description ?? undefined,
  publicDeskId: desk.publicDeskId,
  x: desk.x,
  y: desk.y,
});

type UpdateFloorInput = RouterInput["floor"]["updateFloor"];
type PendingRemovalConfirmationState = {
  deskCounts: Record<string, number>;
  totalReservations: number;
} | null;

const FloorEditPage = () => {
  const t = useTranslations("OfficePages");
  const router = useRouter();
  const officeId =
    typeof router.query.officeId === "string" ? router.query.officeId : null;
  const floorIdParam =
    typeof router.query.floorId === "string" ? router.query.floorId : null;

  const { name, description, desks, imageUrl } = useOfficeFloorFormStore();
  const hydrateForm = useOfficeFloorFormStore((state) => state.hydrate);
  const resetForm = useOfficeFloorFormStore((state) => state.reset);
  const storeFloorId = useOfficeFloorFormStore((state) => state.floorId);

  const [pendingRemovalConfirmation, setPendingRemovalConfirmation] =
    useState<PendingRemovalConfirmationState>(null);
  const lastPayloadRef = useRef<UpdateFloorInput | null>(null);
  const lastRemovedDeskIdsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      resetForm();
    };
  }, [resetForm]);

  const hasHydratedRef = useRef(false);

  const utils = trpc.useUtils();

  const previewRemovalMutation = trpc.floor.previewDeskRemoval.useMutation();

  const getFloorQuery = trpc.floor.getById.useQuery(
    { floorId: floorIdParam ?? "" },
    {
      enabled: Boolean(floorIdParam),
      refetchOnWindowFocus: false,
    },
  );

  const deskLabelById = useMemo(() => {
    const map = new Map<string, string>();
    (getFloorQuery.data?.desks ?? []).forEach((desk) => {
      const label =
        desk.name && desk.name.trim().length > 0
          ? desk.name
          : `Desk ${desk.publicDeskId}`;
      map.set(desk.id, label);
    });
    return map;
  }, [getFloorQuery.data?.desks]);

  const updateFloorMutation = trpc.floor.updateFloor.useMutation({
    onSuccess: async (result) => {
      const updatedFloor = result?.floor;
      const cancelledReservationCount = result?.cancelledReservationCount ?? 0;
      setPendingRemovalConfirmation(null);
      lastPayloadRef.current = null;
      lastRemovedDeskIdsRef.current = [];

      hydrateForm({
        floorId: updatedFloor?.id,
        name: updatedFloor?.name ?? "",
        description: updatedFloor?.description ?? "",
        imageUrl: updatedFloor?.floorPlan ?? undefined,
        desks:
          updatedFloor?.desks.map((desk) => mapDeskToFormState(desk)) ?? [],
      });

      if (updatedFloor?.id) {
        await utils.floor.getById.invalidate({ floorId: updatedFloor.id });
        await utils.office.invalidate();
      }

      const toastDescription =
        cancelledReservationCount > 0
          ? t("toastDescriptionFloorUpdatedWithCancellations", {
              reservationCount: cancelledReservationCount,
            })
          : t("toastDescriptionFloorUpdated");

      toaster.create({
        title: t("toastTitleFloorUpdated"),
        description: toastDescription,
        type: "success",
        duration: 6000,
        closable: true,
      });

      if (officeId && updatedFloor?.id) {
        router.push(`/app/offices/${officeId}/floors/${updatedFloor.id}`);
      }
    },
    onError: (error) => {
      const deskCounts = (
        error.data?.cause as { deskReservationCounts?: Record<string, number> }
      )?.deskReservationCounts;

      if (
        error.data?.code === "PRECONDITION_FAILED" &&
        deskCounts &&
        Object.keys(deskCounts).length > 0
      ) {
        const totalReservations = Object.values(deskCounts).reduce(
          (total, count) => total + count,
          0,
        );
        lastRemovedDeskIdsRef.current = Object.keys(deskCounts);
        setPendingRemovalConfirmation({
          deskCounts,
          totalReservations,
        });
        return;
      }

      toaster.create({
        title: t("toastTitleFloorUpdateFailed"),
        description: error.message,
        type: "error",
        duration: 6000,
        closable: true,
      });
    },
  });

  useEffect(() => {
    if (!getFloorQuery.data || hasHydratedRef.current) return;
    hydrateForm({
      floorId: getFloorQuery.data.id,
      name: getFloorQuery.data.name,
      description: getFloorQuery.data.description,
      imageUrl: getFloorQuery.data.floorPlan,
      desks: getFloorQuery.data.desks.map((desk) => mapDeskToFormState(desk)),
    });
    hasHydratedRef.current = true;
  }, [getFloorQuery.data, hydrateForm]);

  const isLoading = getFloorQuery.isLoading || !hasHydratedRef.current;

  const disableSave =
    updateFloorMutation.isLoading ||
    previewRemovalMutation.isLoading ||
    !storeFloorId ||
    name.trim().length === 0;

  const handleCancelDeskRemoval = () => {
    setPendingRemovalConfirmation(null);
  };

  const handleConfirmDeskRemoval = () => {
    if (!lastPayloadRef.current) {
      setPendingRemovalConfirmation(null);
      return;
    }

    const payloadWithForce: UpdateFloorInput = {
      ...lastPayloadRef.current,
      forceDeleteDeskReservationDeskIds: lastRemovedDeskIdsRef.current ?? [],
    };

    lastPayloadRef.current = payloadWithForce;
    setPendingRemovalConfirmation(null);
    updateFloorMutation.mutate(payloadWithForce);
  };

  const onSaveClick = async () => {
    if (!storeFloorId) {
      toaster.create({
        title: t("toastTitleFloorUpdateFailed"),
        description: t("toastDescriptionFloorMissing"),
        type: "error",
        duration: 6000,
        closable: true,
      });
      return;
    }

    const payload: UpdateFloorInput = {
      floorId: storeFloorId,
      name,
      description,
      imageUrl: imageUrl ?? null,
      desks: desks.map((desk) => ({
        id: desk.id,
        name: desk.name,
        description: desk.description,
        publicDeskId: desk.publicDeskId,
        x: desk.x,
        y: desk.y,
      })),
    };

    const originalDeskIds =
      getFloorQuery.data?.desks.map((desk) => desk.id) ?? [];
    const currentDeskIds = desks
      .map((desk) => desk.id)
      .filter((id): id is string => typeof id === "string");
    const removedDeskIds = originalDeskIds.filter((id) => {
      return !currentDeskIds.includes(id);
    });

    lastPayloadRef.current = payload;
    lastRemovedDeskIdsRef.current = removedDeskIds;
    setPendingRemovalConfirmation(null);

    if (removedDeskIds.length > 0) {
      try {
        const preview = await previewRemovalMutation.mutateAsync({
          floorId: storeFloorId,
          deskIds: removedDeskIds,
        });

        const deskCounts = preview?.deskReservationCounts ?? {};
        const blockingDeskIds = Object.keys(deskCounts);

        if (blockingDeskIds.length > 0) {
          setPendingRemovalConfirmation({
            deskCounts,
            totalReservations: preview.totalReservations ?? 0,
          });
          return;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("toastTitleFloorUpdateFailed");
        toaster.create({
          title: t("toastTitleFloorUpdateFailed"),
          description: message,
          type: "error",
          duration: 6000,
          closable: true,
        });
        return;
      }
    }

    updateFloorMutation.mutate(payload);
  };

  if (getFloorQuery.error) {
    return (
      <Center py={10}>
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{t("labelFloorLoadFailed")}</Alert.Title>
          <Alert.Description>{getFloorQuery.error.message}</Alert.Description>
        </Alert.Root>
      </Center>
    );
  }

  const pendingDeskCounts = pendingRemovalConfirmation?.deskCounts ?? {};
  const pendingDeskIds = Object.keys(pendingDeskCounts);
  const totalReservationsToCancel =
    pendingRemovalConfirmation?.totalReservations ??
    pendingDeskIds.reduce((total, deskId) => {
      return total + (pendingDeskCounts[deskId] ?? 0);
    }, 0);

  return (
    <VStack alignItems={"flex-start"} gap={4} width="100%">
      {pendingRemovalConfirmation ? (
        <Portal>
          <Box
            position="fixed"
            inset={0}
            bg="blackAlpha.600"
            zIndex="modal"
            display="flex"
            alignItems="center"
            justifyContent="center"
            px={4}
            onClick={handleCancelDeskRemoval}
          >
            <Box
              bg="white"
              borderRadius="lg"
              boxShadow="lg"
              maxW="md"
              width="100%"
              p={6}
              onClick={(event) => event.stopPropagation()}
            >
              <Heading as="h2" size="md">
                {t("confirmRemoveBookedDesksTitle")}
              </Heading>
              <Text mt={3} color="gray.700">
                {t("confirmRemoveBookedDesksDescription", {
                  reservationCount: totalReservationsToCancel,
                })}
              </Text>
              <VStack alignItems="flex-start" gap={1} mt={4}>
                <Text fontWeight="medium">
                  {t("confirmRemoveBookedDesksListLabel")}
                </Text>
                {pendingDeskIds.map((deskId) => {
                  const deskLabel =
                    deskLabelById.get(deskId) ?? `Desk ${deskId}`;
                  return (
                    <Text key={deskId} color="gray.700">
                      {t("confirmRemoveBookedDesksListItem", {
                        deskLabel,
                        reservationCount: pendingDeskCounts[deskId] ?? 0,
                      })}
                    </Text>
                  );
                })}
              </VStack>
              <HStack justifyContent="flex-end" gap={3} mt={6}>
                <Button variant="outline" onClick={handleCancelDeskRemoval}>
                  {t("confirmRemoveBookedDesksCancel")}
                </Button>
                <Button
                  colorPalette="red"
                  onClick={handleConfirmDeskRemoval}
                  loading={updateFloorMutation.isLoading}
                >
                  {t("confirmRemoveBookedDesksConfirm")}
                </Button>
              </HStack>
            </Box>
          </Box>
        </Portal>
      ) : null}

      <Box width={"100%"}>
        <HStack justifyContent={"space-between"}>
          <Button
            variant={"ghost"}
            colorPalette="orange"
            onClick={() => {
              if (officeId && floorIdParam) {
                router.push(`/app/offices/${officeId}/floors/${floorIdParam}`);
              } else {
                router.push("/app/offices");
              }
            }}
          >
            {t("buttonBackToFloor")}
          </Button>

          <Button
            colorPalette="orange"
            onClick={() => {
              void onSaveClick();
            }}
            disabled={disableSave}
            loading={
              updateFloorMutation.isLoading || previewRemovalMutation.isLoading
            }
          >
            {t("buttonUpdateFloor")}
          </Button>
        </HStack>
      </Box>

      <Separator />

      {isLoading ? (
        <Center py={10} width="100%">
          <Spinner size="lg" />
        </Center>
      ) : (
        <Container maxW={"container.xl"} paddingTop={4}>
          <VStack width={"100%"} alignItems={"flex-start"} gap={4}>
            <Heading as={"h1"} fontSize={"lg"} color={"gray.700"}>
              {t("headingEditFloor", { floorName: name })}
            </Heading>
            {imageUrl ? null : (
              <Alert.Root status="info">
                <Alert.Indicator />
                <Alert.Title>{t("alertFloorPlanMissing")}</Alert.Title>
              </Alert.Root>
            )}
            <FormFloorAdd />
          </VStack>
        </Container>
      )}
    </VStack>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { redirect, session } = await appAuthRedirect({
    context,
  });
  if (redirect) return { redirect };

  const messages = await getMessages(context);

  return {
    props: {
      session,
      messages,
    },
  };
};

export default FloorEditPage;
