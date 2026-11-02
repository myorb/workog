export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function formatLocations(locations: string[], remote: boolean, max = 3): string {
  const shown = locations.slice(0, max);
  const extra = locations.length - shown.length;
  const text = shown.join(" · ") + (extra > 0 ? ` +${extra} more` : "");
  return text || (remote ? "Remote" : "Location not listed");
}

export function plural(n: number, word: string): string {
  const plural = /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${n.toLocaleString("en-US")} ${n === 1 ? word : plural}`;
}
