import {
  Alert,
  Box,
  Button,
  Center,
  Container,
  HStack,
  Heading,
  Separator,
  Spinner,
  VStack,
} from "@chakra-ui/react";
import { GetServerSideProps } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

import { FormFloorAdd } from "../../../../../../components/FormFloorAdd";
import { toaster } from "../../../../../../components/ui/toaster";
import { getMessages } from "../../../../../../messages/getMessages";
import { appAuthRedirect } from "../../../../../../server/nextMiddleware/appAuthRedirect";
import { useOfficeFloorFormStore } from "../../../../../../stores/officeFloorFormStore";
import { DeskFormState } from "../../../../../../stores/types";
import { trpc } from "../../../../../../utils/trpc";

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

  useEffect(() => {
    return () => {
      resetForm();
    };
  }, [resetForm]);

  const hasHydratedRef = useRef(false);

  const utils = trpc.useUtils();

  const getFloorQuery = trpc.floor.getById.useQuery(
    { floorId: floorIdParam ?? "" },
    {
      enabled: Boolean(floorIdParam),
      refetchOnWindowFocus: false,
    },
  );

  const updateFloorMutation = trpc.floor.updateFloor.useMutation({
    onSuccess: async (updatedFloor) => {
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

      toaster.create({
        title: t("toastTitleFloorUpdated"),
        description: t("toastDescriptionFloorUpdated"),
        type: "success",
        duration: 6000,
        closable: true,
      });

      if (officeId && updatedFloor?.id) {
        router.push(`/app/offices/${officeId}/floors/${updatedFloor.id}`);
      }
    },
    onError: (error) => {
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
    updateFloorMutation.isLoading || !storeFloorId || name.trim().length === 0;

  const onSaveClick = () => {
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

    updateFloorMutation.mutate({
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
    });
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

  return (
    <VStack alignItems={"flex-start"} gap={4} width="100%">
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
            onClick={onSaveClick}
            disabled={disableSave}
            loading={updateFloorMutation.isLoading}
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
