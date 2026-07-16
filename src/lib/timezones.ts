/** Curated timezones labeled by country / city for the header clock. */
export type TimezoneOption = {
  value: string;
  country: string;
  city: string;
  label: string;
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Asia/Kolkata", country: "India", city: "Kolkata", label: "India — Kolkata (IST)" },
  { value: "Asia/Dubai", country: "United Arab Emirates", city: "Dubai", label: "UAE — Dubai (GST)" },
  { value: "Asia/Singapore", country: "Singapore", city: "Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", country: "Japan", city: "Tokyo", label: "Japan — Tokyo (JST)" },
  { value: "Asia/Shanghai", country: "China", city: "Shanghai", label: "China — Shanghai (CST)" },
  { value: "Asia/Hong_Kong", country: "Hong Kong", city: "Hong Kong", label: "Hong Kong (HKT)" },
  { value: "Asia/Seoul", country: "South Korea", city: "Seoul", label: "South Korea — Seoul (KST)" },
  { value: "Asia/Bangkok", country: "Thailand", city: "Bangkok", label: "Thailand — Bangkok (ICT)" },
  { value: "Asia/Jakarta", country: "Indonesia", city: "Jakarta", label: "Indonesia — Jakarta (WIB)" },
  { value: "Asia/Karachi", country: "Pakistan", city: "Karachi", label: "Pakistan — Karachi (PKT)" },
  { value: "Asia/Dhaka", country: "Bangladesh", city: "Dhaka", label: "Bangladesh — Dhaka (BST)" },
  { value: "Asia/Colombo", country: "Sri Lanka", city: "Colombo", label: "Sri Lanka — Colombo (IST)" },
  { value: "Europe/Dublin", country: "Ireland", city: "Dublin", label: "Ireland — Dublin (IST/GMT)" },
  { value: "Europe/London", country: "United Kingdom", city: "London", label: "United Kingdom — London (GMT/BST)" },
  { value: "Europe/Paris", country: "France", city: "Paris", label: "France — Paris (CET)" },
  { value: "Europe/Berlin", country: "Germany", city: "Berlin", label: "Germany — Berlin (CET)" },
  { value: "Europe/Amsterdam", country: "Netherlands", city: "Amsterdam", label: "Netherlands — Amsterdam (CET)" },
  { value: "Europe/Madrid", country: "Spain", city: "Madrid", label: "Spain — Madrid (CET)" },
  { value: "Europe/Rome", country: "Italy", city: "Rome", label: "Italy — Rome (CET)" },
  { value: "Europe/Zurich", country: "Switzerland", city: "Zurich", label: "Switzerland — Zurich (CET)" },
  { value: "Europe/Moscow", country: "Russia", city: "Moscow", label: "Russia — Moscow (MSK)" },
  { value: "Africa/Cairo", country: "Egypt", city: "Cairo", label: "Egypt — Cairo (EET)" },
  { value: "Africa/Johannesburg", country: "South Africa", city: "Johannesburg", label: "South Africa — Johannesburg (SAST)" },
  { value: "Africa/Lagos", country: "Nigeria", city: "Lagos", label: "Nigeria — Lagos (WAT)" },
  { value: "America/New_York", country: "United States", city: "New York", label: "United States — New York (EST)" },
  { value: "America/Chicago", country: "United States", city: "Chicago", label: "United States — Chicago (CST)" },
  { value: "America/Denver", country: "United States", city: "Denver", label: "United States — Denver (MST)" },
  { value: "America/Los_Angeles", country: "United States", city: "Los Angeles", label: "United States — Los Angeles (PST)" },
  { value: "America/Toronto", country: "Canada", city: "Toronto", label: "Canada — Toronto (EST)" },
  { value: "America/Vancouver", country: "Canada", city: "Vancouver", label: "Canada — Vancouver (PST)" },
  { value: "America/Sao_Paulo", country: "Brazil", city: "São Paulo", label: "Brazil — São Paulo (BRT)" },
  { value: "America/Mexico_City", country: "Mexico", city: "Mexico City", label: "Mexico — Mexico City (CST)" },
  { value: "Australia/Sydney", country: "Australia", city: "Sydney", label: "Australia — Sydney (AEST)" },
  { value: "Australia/Melbourne", country: "Australia", city: "Melbourne", label: "Australia — Melbourne (AEST)" },
  { value: "Pacific/Auckland", country: "New Zealand", city: "Auckland", label: "New Zealand — Auckland (NZST)" },
  { value: "UTC", country: "UTC", city: "Coordinated Universal Time", label: "UTC — Coordinated Universal Time" },
];

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function resolveTimezone(value?: string | null): string {
  if (value && TIMEZONE_OPTIONS.some((z) => z.value === value)) return value;
  return DEFAULT_TIMEZONE;
}

export function timezoneLabel(value?: string | null): string {
  const tz = resolveTimezone(value);
  return TIMEZONE_OPTIONS.find((z) => z.value === tz)?.label ?? tz;
}

export function formatClockTime(date: Date, timeZone: string): string {
  const formatted = date.toLocaleTimeString("en-IE", {
    timeZone: resolveTimezone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return formatted.replace(/\s*a\.?m\.?/i, " AM").replace(/\s*p\.?m\.?/i, " PM").trim();
}
