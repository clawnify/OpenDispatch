import { ExternalLink } from "lucide-preact";
import type { Depot } from "../../shared/route-plan";
import { EquipmentDialog } from "./equipment-forms";
import { useEffect, useState } from "preact/hooks";

export function navigationUrl(address: string) {
  return "https://www.google.com/maps/dir/?" + new URLSearchParams({
    api: "1", destination: address, travelmode: "driving", dir_action: "navigate",
  });
}

export function useRouteDirections({ routeId, addresses: deliveries, depot, returnToDepot, browserKey, driver }: {
  routeId: string | null; addresses: string[]; depot?: Depot | null; returnToDepot?: boolean; browserKey?: string; driver: string;
}) {
  const entrance = depot ? depot.latitude + "," + depot.longitude : "";
  const addresses = depot ? [entrance, ...deliveries, ...(returnToDepot ? [entrance] : [])] : deliveries;
  const [selected, setSelected] = useState(0);
  const [chooseDirections, setChooseDirections] = useState(false);
  useEffect(() => { setSelected(0); setChooseDirections(false); }, [routeId]);
  if (!deliveries.length) return { action: null, embeddedMap: null };
  // Use the mobile browser limit on touch devices. Each new link starts
  // at the previous destination so the directions cover every leg.
  const maxWaypoints = navigator.maxTouchPoints > 0 || /Mobile|Android/i.test(navigator.userAgent) ? 3 : 9;
  const sections: { start: number; end: number }[] = [];
  let start = 0;
  while (start < addresses.length) {
    let end = Math.min(start + maxWaypoints + 1, addresses.length - 1);
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
  function sectionLabel(start: number, end: number) {
    const returning = depot && returnToDepot && end === addresses.length - 1;
    const first = start === 0 ? 1 : start + (depot ? 1 : 2);
    const last = Math.min(deliveries.length, end + (depot ? 0 : 1));
    if (first > last && returning) return "Return to " + depot.name;
    const range = first === last ? "Deliver stop " + first : "Deliver stops " + first + "–" + last;
    return returning ? range + " and return to " + depot.name : range;
  }
  const label = "Open " + driver + "’s route in Google Maps";
  const icons = <><img src="/google-maps.svg" width="22" height="22" alt="" /><ExternalLink size={13} aria-hidden="true" /></>;
  const action = <>
      {sections.length === 1
        ? <a class="route-maps-action" href={directionsUrl(stops)} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>{icons}</a>
        : <button class="route-maps-action" type="button" aria-haspopup="dialog" aria-label={label} title={label}
            onClick={() => setChooseDirections(true)}>{icons}</button>}
    {chooseDirections && <EquipmentDialog title="Google Maps directions" onClose={() => setChooseDirections(false)}>
      <nav class="directions-links" aria-label="Route directions">
        {sections.map(({start,end}, i) => <a key={start} href={directionsUrl(addresses.slice(start,end + 1))}
          target="_blank" rel="noopener noreferrer" onClick={() => { setSelected(i); setChooseDirections(false); }}>
          {sectionLabel(start,end)} <ExternalLink size={14} aria-hidden="true" />
        </a>)}
      </nav>
    </EquipmentDialog>}
  </>;
  const embeddedMap = browserKey ? <div class="route-embed">
      {sections.length > 1 && <nav class="route-sections" aria-label="Displayed map section">
        <button class="btn" disabled={part === sections[0]} onClick={() => setSelected(sections.indexOf(part) - 1)}>Previous</button>
        <span>{sectionLabel(part.start, part.end)}</span>
        <button class="btn" disabled={part === sections[sections.length - 1]} onClick={() => setSelected(sections.indexOf(part) + 1)}>Next</button>
      </nav>}
      <iframe title={driver + " delivery route"} loading="lazy" allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      src={"https://www.google.com/maps/embed/v1/" + (single ? "place" : "directions") + "?" + embed} /></div> : null;
  return { action, embeddedMap };
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
