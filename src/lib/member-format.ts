// Birth and death dates are calendar dates stored as UTC midnight, so they must
// be read back in UTC: local-time formatting shows 1 Jan 1980 as 1979 in the US.

type MemberName = { firstName: string; lastName: string };

export function memberFullName({ firstName, lastName }: MemberName): string {
  return `${firstName} ${lastName}`.trim();
}

export function memberInitials({ firstName, lastName }: MemberName): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/** "1952–2021", "b. 1980", "d. 2021", or "" when neither date is known. */
export function formatLifeYears(birthDate: Date | null, deathDate: Date | null): string {
  const birth = birthDate?.getUTCFullYear();
  const death = deathDate?.getUTCFullYear();
  if (birth !== undefined && death !== undefined) return `${birth}–${death}`;
  if (birth !== undefined) return `b. ${birth}`;
  if (death !== undefined) return `d. ${death}`;
  return "";
}

/** Date to the "YYYY-MM-DD" a date input expects; "" when there is no date. */
export function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** "YYYY-MM-DD" from a date input to the ISO datetime the API expects. */
export function fromDateInputValue(value: string): string {
  return `${value}T00:00:00.000Z`;
}
