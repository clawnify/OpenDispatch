import { useState } from "preact/hooks";

export function navigationUrl(address: string) {
  return "https://www.google.com/maps/dir/?" + new URLSearchParams({
    api: "1", destination: address, travelmode: "driving", dir_action: "navigate",
  });
}

export function RouteMap({ addresses, browserKey, driver }: {
  addresses: string[]; browserKey?: string; driver: string;
}) {
  const [selected, setSelected] = useState(0);
  // Maps URLs support three intermediate waypoints on mobile. Overlap each
  // section by one stop so that the connecting leg is always visible.
  const sections: { start: number; end: number }[] = [];
  let start = 0;
  while (start < addresses.length) {
    let end = Math.min(start + 4, addresses.length - 1);
    const sectionUrl = () => directionsUrl(addresses.slice(start, end + 1));
    while (end > start + 1 && sectionUrl().length > 2048) end--;
    sections.push({ start, end });
    if (end === addresses.length - 1) break;
    start = end;
  }
  const part = sections[Math.min(selected, sections.length - 1)];
  const stops = addresses.slice(part.start, part.end + 1);
  const params = routeParams(stops);
  const single = stops.length === 1;
  const embed = single ? new URLSearchParams({ q: stops[0] }) : params;
  if (browserKey) embed.set("key", browserKey);
  return <div class="route-map">
    {sections.length > 1 && <label>Route section <select value={sections.indexOf(part)} onChange={e => setSelected(Number(e.currentTarget.value))}>
      {sections.map((s,i) => <option key={s.start} value={i}>Stops {s.start + 1}–{s.end + 1}</option>)}
    </select></label>}
    {browserKey && <iframe title={driver + " delivery route"} loading="lazy" allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      src={"https://www.google.com/maps/embed/v1/" + (single ? "place" : "directions") + "?" + embed} />}
    <a href={directionsUrl(stops)} target="_blank" rel="noopener noreferrer">Open route in Google Maps ↗</a>
  </div>;
}

function routeParams(stops: string[]) {
  const params = new URLSearchParams({ destination: stops[stops.length - 1] });
  if (stops.length > 1) params.set("origin", stops[0]);
  if (stops.length > 2) params.set("waypoints", stops.slice(1, -1).join("|"));
  return params;
}

function directionsUrl(stops: string[]) {
  const params = routeParams(stops);
  params.set("api", "1");
  params.set("travelmode", "driving");
  return "https://www.google.com/maps/dir/?" + params;
}
