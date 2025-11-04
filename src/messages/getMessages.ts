import deepmerge from "deepmerge";
import { GetStaticPropsContext, PreviewData } from "next";
import { ParsedUrlQuery } from "querystring";

const AVAILABLE_LOCALES = ["en", "de"] as const;

const normalizeLocale = (rawLocale?: string | null) => {
  if (!rawLocale) return "en";
  const shortLocale = rawLocale.split("-")[0]?.toLowerCase() ?? "en";
  if ((AVAILABLE_LOCALES as readonly string[]).includes(shortLocale)) {
    return shortLocale;
  }
  return "en";
};

export const getMessages = async (
  context: GetStaticPropsContext<ParsedUrlQuery, PreviewData>,
) => {
  const locale = normalizeLocale(context.locale);
  const userMessages = (await import(`./${locale}.json`)).default;
  const defaultMessages = (await import(`./en.json`)).default;
  const messages = deepmerge(defaultMessages, userMessages);
  return messages;
};
