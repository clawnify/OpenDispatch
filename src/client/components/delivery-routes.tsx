import { useEffect, useState } from "preact/hooks";
import { Route, Truck, ClipboardList, ArrowRight, MapPin } from "lucide-preact";
import { api } from "../api";
import { calendarDate } from "../calendar";
import { useApp } from "../context";

import { RouteMap, navigationUrl } from "./route-map";

interface Stop {
  route_id: string; driver: string; position: number; reference: string;
  payer: string; recipient: string; address: string; invoice_reference: string;
}

export function DeliveryRoutes() {
  const { customerLookup, technicianLookup, navigate } = useApp();
  const [day, setDay] = useState(calendarDate(new Date()));
  const [customer, setCustomer] = useState("");
  const [driver, setDriver] = useState("");
  const [sheet, setSheet] = useState("");
  const [revision, refresh] = useState(0);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [browserKey, setBrowserKey] = useState<string>();
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    setStops(null);
    setLoadError("");
    api<{ stops: Stop[]; mapsEmbedBrowserKey?: string }>("GET", "/api/delivery/routes?day=" + encodeURIComponent(day))
      .then(data => { if (current) { setStops(data.stops); setBrowserKey(data.mapsEmbedBrowserKey); } })
      .catch(error => { if (current) setLoadError(error.message); });
    return () => { current = false; };
  }, [day, revision]);

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
      const result = await api<{ imported: number }>("POST", "/api/delivery/manifest", { customer, driver, day, orders });
      setSheet("");
      setFeedback("Imported " + result.imported + " orders.");
      refresh(value => value + 1);
    } catch (error) { setFeedback((error as Error).message); }
    finally { setSaving(false); }
  }

  const routes = new Map<string, Stop[]>();
  for (const stop of stops ?? []) {
    if (!routes.has(stop.route_id)) routes.set(stop.route_id, []);
    routes.get(stop.route_id)!.push(stop);
  }

  const prerequisites = customerLookup.length > 0 && technicianLookup.length > 0;
  const stopCount = stops?.length ?? 0;

  return <section class="page dispatch-page">
    <header class="page-header">
      <h1>Delivery routes</h1>
      <label class="dispatch-date">Route date
        <input required type="date" value={day} disabled={saving}
          onInput={e => { if (e.currentTarget.value) setDay(e.currentTarget.value); }} />
      </label>
    </header>
    <div class="dispatch-workspace">
      <section class="dispatch-board" aria-labelledby="assigned-title">
        <header class="dispatch-section-head">
          <h2 id="assigned-title">Assigned routes</h2>
          {stops && <span>{routes.size} {routes.size === 1 ? "driver" : "drivers"} · {stopCount} {stopCount === 1 ? "stop" : "stops"}</span>}
        </header>
        {loadError ? <p class="route-placeholder" role="alert">{loadError}</p>
          : stops === null ? <p class="route-placeholder" role="status">Loading routes…</p>
          : !routes.size && <div class="route-empty">
              <Route size={36} strokeWidth={1.5} aria-hidden="true" />
              <h3>No routes for this day</h3>
              <p>Import orders to build a driver’s route, or choose a different date.</p>
            </div>}
        {Array.from(routes, ([id, rows]) => <article class="driver-route" key={id}>
          <header><Truck size={18} aria-hidden="true" /><h3>{rows[0].driver}</h3><span>{rows.length} {rows.length === 1 ? "stop" : "stops"}</span></header>
          <RouteMap addresses={rows.map(row => row.address)} driver={rows[0].driver} browserKey={browserKey} />
          <ol>{rows.map(row => <li key={row.position}>
            <span class="route-position" aria-label={'Stop ' + row.position}>{row.position}</span>
            <div><strong>{row.recipient}</strong>
              <p class="stop-address"><MapPin size={14} aria-hidden="true" /><a target="_blank" rel="noopener noreferrer" href={navigationUrl(row.address)} aria-label={"Directions to " + row.recipient}>{row.address}</a></p>
              <p class="stop-refs">{row.payer} · Order {row.reference}{row.invoice_reference && " · Invoice " + row.invoice_reference}</p>
            </div>
          </li>)}</ol>
        </article>)}
      </section>
      <aside class="dispatch-import" aria-labelledby="import-title">
        <header class="dispatch-section-head"><ClipboardList size={18} aria-hidden="true" /><h2 id="import-title">Import orders</h2></header>
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
      </aside>
    </div>
  </section>;
}
