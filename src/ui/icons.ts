/** Line icons for seats and views. Stroke uses currentColor so the console can light them. */
const PATHS: Record<string, string> = {
  commander:
    '<circle cx="12" cy="9" r="4.2"/><path d="M8.2 8.2h7.6M7 13.2c1.2 1.6 2.8 2.4 5 2.4s3.8-.8 5-2.4"/><path d="M8 18.5h8"/>',
  pilot:
    '<circle cx="12" cy="8" r="2.2"/><path d="M12 10.2v6.2M8.5 13.2h7M9 20.2l3-3.2 3 3.2"/>',
  specialist:
    '<circle cx="12" cy="12" r="7"/><path d="M12 12l3.2-3.6"/><path d="M12 6.2v1.6M12 16.2v1.6M6.2 12h1.6M16.2 12h1.6"/>',
  flight:
    '<path d="M12 4.2l1.6 3.4 3.7.4-2.8 2.5.8 3.6L12 12.4 8.7 14.1l.8-3.6L6.7 8l3.7-.4z"/>',
  capcom:
    '<rect x="9" y="4" width="6" height="9" rx="3"/><path d="M8 10.5a4 4 0 0 0 8 0M12 14.5v3.2M9.2 19.5h5.6"/>',
  guidance:
    '<path d="M4 16c2.2-6 5-8 8.2-8 2.4 0 4.2 1.2 6.2 4"/><path d="M15.2 8.2l3.4 1.2.2-3.4"/><circle cx="6.2" cy="16.2" r="1.2"/>',
  propulsion:
    '<path d="M9 4h6l1.2 4.2H7.8z"/><path d="M8.2 8.2h7.6l1.4 9.2H6.8z"/><path d="M10 20.2h4"/>',
  fido:
    '<path d="M3.5 14.5h17l-2 3.2H5.5z"/><path d="M7 14.5l2.2-4h5.6l2.2 4"/><path d="M6 18.2h3M15 18.2h3"/>',
  weather:
    '<path d="M4 8.5h11M6 12h12M5 15.5h9"/>',
  pad:
    '<path d="M8 20V6M8 8h6M8 12h5M8 16h6"/><path d="M5 20h14"/>',
  track:
    '<circle cx="12" cy="12" r="3"/><path d="M4 12h3M17 12h3M12 4v3M12 17v3"/>',
  cabin:
    '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 12h3M13 12h3"/>',
  booster:
    '<path d="M10 4h4l1 4H9z"/><path d="M9 8h6v8H9z"/><path d="M8 16l-2 3h12l-2-3"/>',
  room:
    '<rect x="3.5" y="5" width="17" height="10" rx="1.2"/><path d="M8 19h8M12 15v4"/>',
};

export function icon(name: string): string {
  const body = PATHS[name] ?? PATHS.flight;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round">${body}</svg>`;
}
