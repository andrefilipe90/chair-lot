import deepmerge from "deepmerge";
import { GetStaticPropsContext, PreviewData } from "next";
import { ParsedUrlQuery } from "querystring";

const AVAILABLE_LOCALES = ["en", "de", "pt-BR"] as const;
const DEFAULT_LOCALE = "pt-BR";

const normalizeLocale = (rawLocale?: string | null) => {
  if (!rawLocale) return DEFAULT_LOCALE;
  const normalizedRaw = rawLocale.toLowerCase();
  const exactMatch = (AVAILABLE_LOCALES as readonly string[]).find(
    (locale) => locale.toLowerCase() === normalizedRaw,
  );
  if (exactMatch) {
    return exactMatch;
  }
  const shortLocale = rawLocale.split("-")[0]?.toLowerCase();
  const shortMatch = (AVAILABLE_LOCALES as readonly string[]).find(
    (locale) => locale.split("-")[0]?.toLowerCase() === shortLocale,
  );
  return shortMatch ?? DEFAULT_LOCALE;
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
