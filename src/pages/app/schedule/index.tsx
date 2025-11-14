import {
  Container,
  Heading,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { formatISO } from "date-fns";
import { GetServerSideProps } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { de } from "react-day-picker/locale";

import { AdminScheduleManager } from "../../../components/AdminScheduleManager";
import { FloorDeskBooker } from "../../../components/FloorDeskBooker";
import { ScheduleNoOfficeSelected } from "../../../components/ScheduleNoOfficeSelected";
import { useGetDisabledDays } from "../../../hooks/useGetDisabledDays";
import { getMessages } from "../../../messages/getMessages";
import { appAuthRedirect } from "../../../server/nextMiddleware/appAuthRedirect";
import { trpc } from "../../../utils/trpc";

const css = `
  .rdp {
    margin: 0 !important;
  }
`;

const SchedulePage = () => {
  const t = useTranslations("SchedulePages");
  const currentLocale = useLocale();

  const utils = trpc.useUtils();
  const [day, setDay] = useState(new Date());
  const formattedDate = formatISO(day, { representation: "date" });
  const userQuery = trpc.user.get.useQuery();
  const getDeskSchedulesForDayQuery =
    trpc.schedule.getDeskSchedulesForDay.useQuery({
      day: formattedDate,
    });

  const getFloorsForCurrentOfficeQuery =
    trpc.schedule.getFloorsForCurrentOffice.useQuery({});
  const floors = useMemo(
    () => getFloorsForCurrentOfficeQuery.data ?? [],
    [getFloorsForCurrentOfficeQuery.data],
  );

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
  const defaultFloorTab = floors[0]?.id;
  const defaultTabValue =
    defaultFloorTab ?? (isAdmin ? "admin-management" : undefined);

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
        ) : floors.length === 0 && !isAdmin ? (
          <Text color="gray.600">{t("noSchedules")}</Text>
        ) : (
          <VStack alignItems={"flex-start"} width={"100%"}>
            <Tabs.Root
              key={defaultTabValue ?? "no-tabs"}
              width={"100%"}
              colorPalette="orange"
              lazyMount
              unmountOnExit
              defaultValue={defaultTabValue}
            >
              <Tabs.List>
                {floors.map((floor) => (
                  <Tabs.Trigger key={floor.id} value={floor.id}>
                    {floor.name}
                  </Tabs.Trigger>
                ))}
                {isAdmin && (
                  <Tabs.Trigger value="admin-management">
                    {t("adminTabLabel")}
                  </Tabs.Trigger>
                )}
              </Tabs.List>

              {floors.map((floor) => (
                <Tabs.Content key={floor.id} value={floor.id}>
                  {floor.floorPlan && userQuery.data?.id ? (
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
                  ) : null}
                </Tabs.Content>
              ))}
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
