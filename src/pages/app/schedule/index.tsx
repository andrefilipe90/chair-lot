import {
  Badge,
  Box,
  Button,
  Container,
  HStack,
  Heading,
  Spinner,
  Stack,
  Tabs,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { DeskScheduleStatus } from "@prisma/client";
import { formatISO } from "date-fns";
import { GetServerSideProps } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { de } from "react-day-picker/locale";

import { AdminScheduleManager } from "../../../components/AdminScheduleManager";
import { FloorDeskBooker } from "../../../components/FloorDeskBooker";
import { ScheduleNoOfficeSelected } from "../../../components/ScheduleNoOfficeSelected";
import { toaster } from "../../../components/ui/toaster";
import { Tooltip } from "../../../components/ui/tooltip";
import { useGetDisabledDays } from "../../../hooks/useGetDisabledDays";
import { getMessages } from "../../../messages/getMessages";
import { appAuthRedirect } from "../../../server/nextMiddleware/appAuthRedirect";
import { trpc } from "../../../utils/trpc";

const css = `
  .rdp {
    margin: 0 !important;
  }
`;

const formatDeskId = (value: string | null | undefined) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(3, "0");
  }
  return trimmed;
};

const SchedulePage = () => {
  const t = useTranslations("SchedulePages");
  const currentLocale = useLocale();

  const utils = trpc.useUtils();
  const [day, setDay] = useState(new Date());
  const formattedDate = formatISO(day, { representation: "date" });
  const isSelectedDayToday =
    formattedDate === formatISO(new Date(), { representation: "date" });

  const userQuery = trpc.user.get.useQuery();
  const bookDeskMutation = trpc.schedule.bookDeskForDay.useMutation({});
  const cancelDeskForDayMutation = trpc.schedule.cancelDeskForDay.useMutation(
    {},
  );
  const checkInMutation = trpc.schedule.checkInDeskSchedule.useMutation({
    onSuccess: () => {
      toaster.create({
        title: t("checkInSuccessTitle"),
        description: t("checkInSuccessDescription"),
        type: "success",
        duration: 4000,
        closable: true,
      });
      utils.schedule.getDeskSchedulesForDay.invalidate({
        day: formattedDate,
      });
    },
    onError: () => {
      toaster.create({
        title: t("checkInErrorTitle"),
        description: t("checkInErrorDescription"),
        type: "error",
        duration: 5000,
        closable: true,
      });
    },
  });
  const getDeskSchedulesForDayQuery =
    trpc.schedule.getDeskSchedulesForDay.useQuery({
      day: formattedDate,
    });

  const getFloorsForCurrentOfficeQuery =
    trpc.schedule.getFloorsForCurrentOffice.useQuery({});

  const getOfficeSettingQuery =
    trpc.officeSetting.getForCurrentOffice.useQuery();

  const timeFormatter = useMemo(() => {
    const timeZone = getDeskSchedulesForDayQuery.data?.timeZone ?? "UTC";
    return new Intl.DateTimeFormat(currentLocale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  }, [currentLocale, getDeskSchedulesForDayQuery.data?.timeZone]);

  const isLoading =
    userQuery.isLoading ||
    getDeskSchedulesForDayQuery.isLoading ||
    getFloorsForCurrentOfficeQuery.isLoading ||
    getOfficeSettingQuery.isLoading;

  const { disabledDays } = useGetDisabledDays({
    getOfficeSettingQueryData: getOfficeSettingQuery.data,
    isLoading: getOfficeSettingQuery.isLoading,
  });

  const isAdmin = userQuery.data?.userRole === "ADMIN";
  const scheduleTimeZone = getDeskSchedulesForDayQuery.data?.timeZone || "UTC";

  if (!userQuery.data) {
    return <div>{t("notLoggedIn")}</div>;
  }

  if (userQuery.data.currentOfficeId === null) {
    return <ScheduleNoOfficeSelected />;
  }

  if (!getDeskSchedulesForDayQuery.data) {
    return <div>{t("noSchedules")}</div>;
  }

  return (
    <Container maxW={"container.2xl"} paddingX={{ base: 2, lg: 4 }}>
      <Heading
        fontSize={{
          base: "xl",
          lg: "3xl",
        }}
      >
        {t("headingSchedule")}
      </Heading>
      <Stack
        display={"flex"}
        gap={{ base: 4, lg: 12 }}
        direction={{ base: "column", lg: "row" }}
      >
        <style>{css}</style>
        <DayPicker
          mode="single"
          selected={day}
          defaultMonth={day}
          disabled={disabledDays}
          onSelect={(newDay) => {
            if (!newDay) return;
            setDay(newDay);
          }}
          style={{
            margin: "0 !important",
          }}
          locale={currentLocale === "de" ? de : undefined}
        />
        {isLoading ? (
          <Spinner />
        ) : (
          <VStack alignItems={"flex-start"} width={"100%"}>
            <Heading
              fontSize={{
                base: "xl",
                lg: "3xl",
              }}
            >
              {t("headingAllDesks")}
            </Heading>
            <Tabs.Root
              width={"100%"}
              colorPalette="orange"
              lazyMount
              unmountOnExit
              defaultValue={"list-of-desks"}
            >
              <Tabs.List>
                <Tabs.Trigger value="list-of-desks">
                  {t("listOfDesks")}
                </Tabs.Trigger>
                {isAdmin && (
                  <Tabs.Trigger value="admin-management">
                    {t("adminTabLabel")}
                  </Tabs.Trigger>
                )}
                {getFloorsForCurrentOfficeQuery.data?.map((floor) => {
                  return (
                    <Tabs.Trigger key={floor.id} value={floor.id}>
                      {floor.name}
                    </Tabs.Trigger>
                  );
                })}
              </Tabs.List>

              <Tabs.Content value="list-of-desks">
                <VStack gap={3} alignItems={"flex-start"}>
                  {Object.values(
                    getDeskSchedulesForDayQuery.data.deskSchdulesMapped,
                  )
                    .sort((a, b) => {
                      const formattedDeskA = formatDeskId(
                        a.desk.publicDeskId ?? a.desk.id,
                      );
                      const formattedDeskB = formatDeskId(
                        b.desk.publicDeskId ?? b.desk.id,
                      );
                      const floorComparison = a.desk.floor.name.localeCompare(
                        b.desk.floor.name,
                      );
                      if (floorComparison !== 0) return floorComparison;
                      return formattedDeskA.localeCompare(formattedDeskB);
                    })
                    .map((freeDeskSchedules) => {
                      const onBookClick = async () => {
                        try {
                          await bookDeskMutation.mutateAsync({
                            deskId: freeDeskSchedules.desk.id,
                            day: formattedDate,
                          });
                          utils.schedule.getDeskSchedulesForDay.invalidate({
                            day: formattedDate,
                          });
                        } catch (e) {
                          toaster.create({
                            title: t("errorTitleWhileBooking"),
                            description: t("errorDescriptionWhileBooking"),
                            type: "error",
                            duration: 5000,
                            closable: true,
                          });
                        }
                      };

                      const onCancelReservationClick = async () => {
                        const periodToCancel =
                          freeDeskSchedules.usedPeriods.find(
                            (e) => e.wholeDay === true,
                          );
                        const deskScheduleIdToCancel =
                          periodToCancel?.deskScheduleId;
                        if (!deskScheduleIdToCancel) return;
                        await cancelDeskForDayMutation.mutateAsync({
                          deskScheduleId: deskScheduleIdToCancel,
                          day: formattedDate,
                        });
                        utils.schedule.getDeskSchedulesForDay.invalidate({
                          day: formattedDate,
                        });
                      };

                      const canCancelReservation =
                        freeDeskSchedules.usedPeriods.some(
                          (period) => period.id === userQuery.data?.id,
                        );

                      const numberOfFloors =
                        getFloorsForCurrentOfficeQuery.data?.length || 0;

                      const formattedDeskId = formatDeskId(
                        freeDeskSchedules.desk.publicDeskId,
                      );

                      let floorDeskName = t("floorDeskNameSoloFloor", {
                        deskId: formattedDeskId,
                      });

                      if (numberOfFloors >= 2) {
                        floorDeskName = t("floorDeskName", {
                          floorName: freeDeskSchedules.desk.floor.name,
                          deskId: formattedDeskId,
                        });
                      }

                      const currentUserPeriod =
                        freeDeskSchedules.usedPeriods.find(
                          (period) => period.id === userQuery.data?.id,
                        );
                      const currentUserDeadline =
                        currentUserPeriod?.checkInDeadline
                          ? new Date(currentUserPeriod.checkInDeadline)
                          : null;
                      const currentUserCheckedInAt =
                        currentUserPeriod?.checkedInAt
                          ? new Date(currentUserPeriod.checkedInAt)
                          : null;
                      const canShowCheckInButton = Boolean(
                        currentUserPeriod &&
                          currentUserPeriod.status ===
                            DeskScheduleStatus.BOOKED &&
                          !currentUserPeriod.checkedInAt,
                      );
                      const onCheckInClick = async () => {
                        if (!currentUserPeriod) return;
                        try {
                          await checkInMutation.mutateAsync({
                            deskScheduleId: currentUserPeriod.deskScheduleId,
                          });
                        } catch {
                          // handled by onError
                        }
                      };

                      return (
                        <VStack
                          gap={1}
                          key={freeDeskSchedules.desk.id}
                          alignItems={"flex-start"}
                        >
                          <HStack alignItems={"flex-start"}>
                            <VStack
                              alignItems={"flex-start"}
                              justifyContent={"flex-start"}
                            >
                              <Heading
                                fontSize={"md"}
                                fontWeight={500}
                                color={"gray.700"}
                              >
                                {floorDeskName}
                              </Heading>
                              {freeDeskSchedules.usedPeriods.map(
                                (usedPeriod) => {
                                  const isOccupiedWholeDay =
                                    usedPeriod.wholeDay;
                                  const formattedStart = timeFormatter.format(
                                    usedPeriod.start,
                                  );
                                  const formattedEnd = timeFormatter.format(
                                    usedPeriod.end,
                                  );

                                  const wholeDayText = t("isOccupiedWholeday", {
                                    userCount: usedPeriod.name ? 1 : 0,
                                    userName: usedPeriod.name,
                                  });

                                  const specificTimeText = t(
                                    "isOccupiedSpecificTime",
                                    {
                                      userCount: usedPeriod.name ? 1 : 0,
                                      userName: usedPeriod.name,
                                      startTime: formattedStart,
                                      endTime: formattedEnd,
                                    },
                                  );
                                  const label = isOccupiedWholeDay
                                    ? wholeDayText
                                    : specificTimeText;

                                  const isCurrentUser =
                                    usedPeriod.id === userQuery.data?.id;
                                  const statusLabel = isCurrentUser
                                    ? null
                                    : usedPeriod.status ===
                                          DeskScheduleStatus.CHECKED_IN &&
                                        usedPeriod.checkedInAt
                                      ? t("checkInCompletedLabel", {
                                          time: timeFormatter.format(
                                            new Date(usedPeriod.checkedInAt),
                                          ),
                                        })
                                      : usedPeriod.checkInDeadline
                                        ? t("checkInReminder", {
                                            time: timeFormatter.format(
                                              new Date(
                                                usedPeriod.checkInDeadline,
                                              ),
                                            ),
                                          })
                                        : null;

                                  const key = `${isOccupiedWholeDay.toString()}-${usedPeriod.id}`;

                                  return (
                                    <Box key={key}>
                                      <Text fontSize="sm" color="gray.700">
                                        {label}
                                      </Text>
                                      {statusLabel && (
                                        <Text
                                          fontSize="xs"
                                          color={
                                            usedPeriod.status ===
                                            DeskScheduleStatus.CHECKED_IN
                                              ? "green.600"
                                              : "orange.600"
                                          }
                                        >
                                          {statusLabel}
                                        </Text>
                                      )}
                                    </Box>
                                  );
                                },
                              )}
                              {freeDeskSchedules.desk.name && (
                                <Tooltip content={t("customNameForThisDesk")}>
                                  <Tag.Root>
                                    <Tag.Label>
                                      {freeDeskSchedules.desk.name}
                                    </Tag.Label>
                                  </Tag.Root>
                                </Tooltip>
                              )}
                            </VStack>
                            <Box>
                              <Badge
                                colorPalette={
                                  freeDeskSchedules.wholeDayFree
                                    ? "green"
                                    : "red"
                                }
                              >
                                {freeDeskSchedules.wholeDayFree
                                  ? t("badgeLabelAvailable")
                                  : t("badgeLabelBooked")}
                              </Badge>
                            </Box>
                          </HStack>
                          {currentUserCheckedInAt && (
                            <Text fontSize="sm" color="green.600">
                              {t("checkInCompletedLabel", {
                                time: timeFormatter.format(
                                  currentUserCheckedInAt,
                                ),
                              })}
                            </Text>
                          )}
                          {canShowCheckInButton && (
                            <VStack gap={1} alignItems={"flex-start"}>
                              {currentUserDeadline && (
                                <Text fontSize="sm" color="gray.600">
                                  {t("checkInReminder", {
                                    time: timeFormatter.format(
                                      currentUserDeadline,
                                    ),
                                  })}
                                </Text>
                              )}
                              {!isSelectedDayToday && (
                                <Text fontSize="sm" color="gray.500">
                                  {t("checkInAvailableSameDay")}
                                </Text>
                              )}
                              <Button
                                colorPalette="green"
                                size={"sm"}
                                onClick={onCheckInClick}
                                disabled={
                                  !isSelectedDayToday ||
                                  checkInMutation.isLoading
                                }
                              >
                                {t("checkInButton")}
                              </Button>
                            </VStack>
                          )}
                          {canCancelReservation ? (
                            <Button
                              colorPalette="orange"
                              backgroundColor={"orange.400"}
                              _hover={{
                                backgroundColor: "orange.500",
                              }}
                              size={"sm"}
                              onClick={onCancelReservationClick}
                            >
                              {t("cancelReservation")}
                            </Button>
                          ) : (
                            <Button
                              colorPalette="orange"
                              backgroundColor={"orange.400"}
                              _hover={{
                                backgroundColor: "orange.500",
                              }}
                              size={"sm"}
                              onClick={onBookClick}
                              disabled={
                                freeDeskSchedules.freePeriods.length === 0
                              }
                            >
                              {t("bookDesk")}
                            </Button>
                          )}
                        </VStack>
                      );
                    })}
                </VStack>
              </Tabs.Content>

              {getFloorsForCurrentOfficeQuery.data?.map((floor) => {
                return (
                  <Tabs.Content key={floor.id} value={floor.id}>
                    {floor.floorPlan && userQuery.data?.id && (
                      <FloorDeskBooker
                        floor={floor}
                        deskSchedulesMapped={
                          getDeskSchedulesForDayQuery.data?.deskSchdulesMapped
                        }
                        userId={userQuery.data.id}
                        day={day}
                        dayStart={
                          getDeskSchedulesForDayQuery.data?.dayStart ??
                          new Date(day)
                        }
                        dayEnd={
                          getDeskSchedulesForDayQuery.data?.dayEnd ??
                          new Date(day)
                        }
                      />
                    )}
                  </Tabs.Content>
                );
              })}
              {isAdmin && (
                <Tabs.Content value="admin-management">
                  <AdminScheduleManager
                    formattedDay={formattedDate}
                    timeZone={scheduleTimeZone}
                    timeFormatter={timeFormatter}
                    deskSchedules={
                      getDeskSchedulesForDayQuery.data?.deskSchedules ?? []
                    }
                    desks={
                      getDeskSchedulesForDayQuery.data?.desksInCurrentOffice ??
                      []
                    }
                    onRefresh={async () => {
                      await utils.schedule.getDeskSchedulesForDay.invalidate({
                        day: formattedDate,
                      });
                    }}
                  />
                </Tabs.Content>
              )}
            </Tabs.Root>
          </VStack>
        )}
      </Stack>
    </Container>
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

export default SchedulePage;
