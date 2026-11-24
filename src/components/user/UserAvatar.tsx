const SIZES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-20 w-20 text-xl",
} as const;

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : source.slice(0, 2);
  return letters.toUpperCase();
}

/** The account picture, or the user's initials when there is none. */
export function UserAvatar({
  name,
  email,
  src,
  size = "sm",
}: {
  name: string | null;
  email: string;
  src: string | null;
  size?: keyof typeof SIZES;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar hosts (R2, GitHub, Google) vary
      <img src={src} alt="" referrerPolicy="no-referrer" className={`${SIZES[size]} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200`}
    >
      {initials(name, email)}
    </span>
  );
}
