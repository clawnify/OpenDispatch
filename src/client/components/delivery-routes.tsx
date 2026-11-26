import { useEffect, useState } from "preact/hooks";
import { useChatContext, useChatCommands, useHostChanges } from "@clawnify/app/client";
import { clockTime, duration, type Timing } from "../../shared/route-schedule";
import { ScheduleEditor } from "./schedule-editor";
import { Route, ClipboardList, ArrowRight, MapPin } from "lucide-preact";
import { api } from "../api";
import { calendarDate } from "../calendar";
import { useApp } from "../context";

import { EquipmentDialog } from "./equipment-forms";
import { DispatchMap, routeColor, type FleetRoute, type RoadMap } from "./dispatch-map";
import { RoutePlanForm } from "./route-plan-form";
import { useRouteDirections, navigationUrl } from "./route-map";

interface Stop {
  stop_id: string; delivery_date: string; route_id: string; driver_id: string; driver: string; position: number; reference: string;
  payer: string; recipient: string; address: string; invoice_reference: string;
}

type Detail = { stops: Stop[]; map?: RoadMap; mapsEmbedBrowserKey?: string };

export function DeliveryRoutes({ id }: { id: string | null }) {
  const { customerLookup, technicianLookup, navigate } = useApp();
  const listDay = new URLSearchParams(location.search).get("day") || calendarDate(new Date());
  const [customer, setCustomer] = useState("");
  const [driver, setDriver] = useState("");
  const [showMobileMap, setShowMobileMap] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState("");
  const [routes, setRoutes] = useState<FleetRoute[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const rows = id && detail?.stops[0]?.route_id === id ? detail.stops : null;
  const day = rows?.[0].delivery_date ?? listDay;
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const [timing, setTiming] = useState<Timing | null>(null);
  const [timingBusy, setTimingBusy] = useState(false);
  const [timingError, setTimingError] = useState("");
  const [editingTiming, setEditingTiming] = useState(false);
  const [scheduleVersion, refreshTiming] = useState(0);
  const [routeVersion, refreshRoutes] = useState(0);
  useChatContext(id && rows ? { label: "Delivery route", record: {type: "route", id, label: rows[0].driver} } : null);
  useChatCommands(id ? [
    {id: "stop-time", label: "Change time at a stop", prompt: "Update the on-site allowance on delivery route " + id + " using the stop and minutes I specify."},
    {id: "departure", label: "Change departure", prompt: "Set the planned departure for delivery route " + id + " to the time I specify."},
    {id: "finish", label: "Check finish time", prompt: "Read the schedule for delivery route " + id + " and tell me when the driver finishes, including the return leg if planned."},
  ] : []);
  useHostChanges(paths => {
    if (!paths.some(path => path.startsWith("/api/delivery/"))) return;
    if (!id || paths.some(path => path !== "/api/delivery/routes/" + id + "/schedule")) refreshRoutes(v => v + 1);
    refreshTiming(v => v + 1);
  });
  useEffect(() => {
    if (!id) return;
    let active = true;
    setTimingError("");
    api<Timing>("GET", "/api/delivery/routes/" + id + "/schedule")
      .then(value => { if (active) setTiming(value); })
      .catch(e => { if (active) { setTiming(null); setTimingError(e.message); } });
    return () => { active = false; };
  }, [id, scheduleVersion]);

  useEffect(() => {
    let current = true;
    setRoutes(null);
    setDetail(null);
    setLoadError("");
    const request = id
      ? api<Detail>("GET", "/api/delivery/routes/" + encodeURIComponent(id))
          .then(data => { if (current) setDetail(data); })
      : api<{ routes: FleetRoute[] }>("GET", "/api/delivery/routes?view=summary&day=" + encodeURIComponent(listDay))
          .then(data => { if (current) setRoutes(data.routes); });
    request.catch(error => { if (current) setLoadError(error.message); });
    return () => { current = false; };
  }, [id, listDay, routeVersion]);

  async function importOrders(event: Event) {
    event.preventDefault();
    setFeedback("");
    const orders = [];
    for (const [index, line] of sheet.trimEnd().split(/\r?\n/).entries()) {
      const parts = line.split("\t").map(value => value.trim());
      const [reference, recipient, address, invoice = ""] = parts;
      if (!reference || !recipient || !address || parts.length > 4) {
        setFeedback("Check row " + (index + 1) + ": supply three or four tab-separated columns.");
        return;
      }
      orders.push({ reference, recipient, address, invoice });
    }
    setSaving(true);
    try {
      const result = await api<{ imported: number; route_id: string }>("POST", "/api/delivery/manifest", { customer, driver, day, orders });
      setSheet("");
      setImportOpen(false);
      navigate("/routes/" + result.route_id);
      setNotice("Imported " + result.imported + " orders.");
    } catch (error) { setFeedback((error as Error).message); }
    finally { setSaving(false); }
  }

  const prerequisites = customerLookup.length > 0 && technicianLookup.length > 0;
  const map = detail?.map;
  const hasRoadMap = map && map.addresses.length === rows?.length && rows.every((row, i) => row.address === map.addresses[i]);

  const directions = useRouteDirections({
    routeId: id, addresses: rows?.map(row => row.address) ?? [], driver: rows?.[0].driver ?? "",
    depot: map?.depot, returnToDepot: map?.returnToDepot, browserKey: hasRoadMap ? undefined : detail?.mapsEmbedBrowserKey,
  });

  return <section class={id ? "page dispatch-page route-detail-page" : "page dispatch-page"}>
    <header class="page-header">
      {id ? <div class="route-page-title">
        <a href={"/routes?day=" + encodeURIComponent(day)}>All routes</a>
        <div class="route-heading"><h1>{rows?.[0].driver ?? "Delivery route"}</h1>
          {rows && <span>{rows.length} {rows.length === 1 ? "stop" : "stops"}</span>}
        </div>
      </div> : <h1>Delivery routes</h1>}
      <div class="page-header-right">
        <label class="dispatch-date"><span>Route date</span>
          <input required aria-label="Route date" type="date" value={day} disabled={saving}
            onInput={e => { if (e.currentTarget.value) { navigate("/routes?day=" + e.currentTarget.value); setNotice(""); } }} />
        </label>
        {id && rows && <button type="button" class="btn" aria-haspopup="dialog" onClick={() => setPlanOpen(true)}>Plan route</button>}
        {directions.action}
        {!id && <button type="button" class="btn btn-primary" aria-haspopup="dialog"
          onClick={() => { setDriver(""); setFeedback(""); setImportOpen(true); }}>
          <ClipboardList size={16} aria-hidden="true" />Import orders
        </button>}
      </div>
    </header>
    {notice && <p class="route-placeholder" role="status">{notice}</p>}
    <section class={id ? "route-detail-body" : "dispatch-list-pane"} aria-label={id ? "Route itinerary and map" : "Assigned routes"}>
      {loadError ? <p class="route-placeholder" role="alert">{loadError}</p>
        : (id ? !rows : routes === null) ? <p class="route-placeholder" role="status">Loading routes…</p>
        : routes?.length === 0 && <div class="route-empty">
            <Route size={36} strokeWidth={1.5} aria-hidden="true" />
            <h3>No routes for this day</h3>
            <p>Import orders to build a driver’s route, or choose a different date.</p>
          </div>}
      {!id && routes && routes.length > 0 && <div class="fleet-overview">
        <ul class="delivery-route-list">
          {routes.map((route, i) => <li key={route.id}><a href={"/routes/" + route.id}>
            <i aria-hidden="true" class="fleet-swatch" style={{ backgroundColor: route.line?.length ? "var(" + routeColor(i) + ")" : "transparent" }} />
            <div class="fleet-route-name"><strong>{route.driver}</strong>
              <small>{route.schedule ? clockTime(route.schedule.start) + "–" + clockTime(route.schedule.finish) + " · " + duration(route.schedule.total) : "Timing pending"}</small></div><span>{route.stop_count} {route.stop_count === 1 ? "stop" : "stops"}</span>
            <small class="fleet-distance">{route.meters == null ? "Distance pending" : (route.meters / 1000).toFixed(1) + " km"}</small>
            <ArrowRight size={16} aria-hidden="true" />
          </a></li>)}
        </ul>
        {routes.some(route => route.line?.length) && <>
          <button type="button" class="btn fleet-map-toggle" aria-controls="fleet-map" aria-expanded={showMobileMap}
            onClick={() => setShowMobileMap(!showMobileMap)}>{showMobileMap ? "Hide map" : "Show map"}</button>
          <div id="fleet-map" class={showMobileMap ? "fleet-map expanded" : "fleet-map"}>
            <DispatchMap routes={routes} />
            {routes.some(route => !route.line?.length) && <small>{routes.filter(route => route.line?.length).length} of {routes.length} routes mapped</small>}
          </div>
        </>}
      </div>}
      {rows && <article class="driver-route" key={rows[0].route_id}>
        {directions.embeddedMap}
        {hasRoadMap && <DispatchMap data={map} driver={rows[0].driver} />}
        <section class="route-itinerary" aria-label="Ordered stops">
          <div class={"itinerary-timing" + (editingTiming ? " editing" : "")}>
            <div><strong>{editingTiming ? "Edit timing" : timing?.schedule ? clockTime(timing.schedule.start) + "–" + clockTime(timing.schedule.finish) : "Route timing"}</strong>
              <small>{timingError || (timing?.schedule ? duration(timing.schedule.total) + " planned" + (hasRoadMap ? " · " + (map.meters / 1000).toFixed(1) + " km" : "") : "Calculate the route to estimate arrival times.")}</small></div>
            {editingTiming && <div class="timing-actions">
              <button type="button" class="btn" disabled={timingBusy} onClick={() => setEditingTiming(false)}>Cancel</button>
              <button type="submit" form="route-timing-form" class="btn btn-primary" disabled={timingBusy}>{timingBusy ? "Saving…" : "Save"}</button>
            </div>}
            {timing && !editingTiming && <button class="btn" type="button" onClick={() => setEditingTiming(true)}>Edit timing</button>}
          </div>
          {editingTiming && timing && id && <ScheduleEditor id={id} timing={timing} stops={rows}
            busy={timingBusy} setBusy={setTimingBusy} onSaved={() => { setEditingTiming(false); refreshTiming(v => v + 1); }} />}
          {map?.depot && <p class="route-depot-label">Start · {map.depot.name} · {map.depot.address}</p>}
          <ol>{rows.map((row, index) => {
            const stop = timing?.schedule?.stops[index];
            return <li key={row.stop_id}>
            <span class="route-position" aria-label={'Stop ' + row.position}>{row.position}</span>
            <div><strong>{row.recipient}</strong>
              <p class="stop-address"><MapPin size={14} aria-hidden="true" /><a target="_blank" rel="noopener noreferrer" href={navigationUrl(row.address)} aria-label={"Directions to " + row.recipient}>{row.address}</a></p>
              {stop?.id === row.stop_id && <p class="stop-times"><strong>{clockTime(stop.arrival)}–{clockTime(stop.departure)}</strong>
                {" · " + stop.drive + " min drive · " + stop.service + " min on site"}{stop.wait > 0 && " · " + stop.wait + " min wait"}</p>}
              <p class="stop-refs">{row.payer} · Order {row.reference}{row.invoice_reference && " · Invoice " + row.invoice_reference}</p>
            </div>
          </li>; })}</ol>
          {map?.depot && map.returnToDepot && <p class="route-depot-label">Return · {map.depot.name}{timing?.schedule && " · " + timing.schedule.returnDrive + " min drive · " + clockTime(timing.schedule.finish)}</p>}
        </section>
      </article>}
    </section>
    {id && rows && planOpen && <RoutePlanForm key={id} id={id} addresses={rows.map(row => row.address)} map={map}
      onClose={() => setPlanOpen(false)} onSaved={updated => { setDetail(prev => prev && ({ ...prev, map: updated })); setPlanOpen(false); refreshTiming(v => v + 1); }} />}
    {!id && importOpen && <EquipmentDialog title="Import orders" busy={saving} onClose={() => setImportOpen(false)}>
      <form onSubmit={importOrders} class="manifest-form">
        <label>Paying customer
          {customerLookup.length ? <select required value={customer} disabled={saving} onChange={e => setCustomer(e.currentTarget.value)}>
            <option value="">Choose customer</option>{customerLookup.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select> : <button type="button" class="btn setup-link" onClick={() => navigate("/customers")}>Add a paying customer <ArrowRight size={15} /></button>}
        </label>
        <label>Driver
          {technicianLookup.length ? <select required disabled={saving} value={driver} onChange={e => setDriver(e.currentTarget.value)}>
            <option value="">Choose driver</option>{technicianLookup.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select> : <button type="button" class="btn setup-link" onClick={() => navigate("/technicians")}>Add a driver <ArrowRight size={15} /></button>}
        </label>
        <label>Spreadsheet rows<textarea required rows={4} value={sheet} disabled={saving} placeholder="Paste rows from your spreadsheet" aria-describedby="manifest-help"
          onInput={e => setSheet(e.currentTarget.value)} /></label>
        <p id="manifest-help">Paste up to 500 rows without a header. Use the following column order.</p>
        <ol class="manifest-columns"><li>Order reference</li><li>Recipient</li><li>Address</li><li>Invoice reference (optional)</li></ol>
        <button class="btn btn-primary" disabled={saving || !day || !prerequisites}>{saving ? "Importing…" : "Import orders"}</button>
        {feedback && <span role="status">{feedback}</span>}
      </form>
    </EquipmentDialog>}
  </section>;
}
