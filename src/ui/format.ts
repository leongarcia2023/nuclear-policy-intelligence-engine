/** Shared presentation helpers — restrained, deterministic mapping to palette. */

export function bandClass(band: string): string {
  switch (band) {
    case "high":
      return "text-signal-high border-signal-high";
    case "medium":
      return "text-desk-text border-desk-line";
    case "low":
      return "text-desk-muted border-desk-line";
    default:
      return "text-desk-muted border-desk-line";
  }
}

export function directionClass(direction: string): string {
  switch (direction) {
    case "helps":
      return "text-signal-help";
    case "hurts":
      return "text-signal-hurt";
    default:
      return "text-desk-muted";
  }
}

export function positionLabel(position: string): string {
  return position.toUpperCase();
}
