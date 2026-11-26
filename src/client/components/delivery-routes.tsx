import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { calendarDate } from "../calendar";
import { useApp } from "../context";

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
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    setStops(null);
    setLoadError("");
    api<{ stops: Stop[] }>("GET", "/api/delivery/routes?day=" + encodeURIComponent(day))
      .then(data => { if (current) setStops(data.stops); })
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

  return <section class="page">
    <h1>Delivery routes</h1>
    <label>Route date <input required type="date" value={day} disabled={saving}
      onInput={e => setDay(e.currentTarget.value)} /></label>
    <h2>Import delivery orders</h2>
    {customerLookup.length === 0 && <button class="btn" onClick={() => navigate("/customers")}>Add a paying customer</button>}
    {technicianLookup.length === 0 && <button class="btn" onClick={() => navigate("/technicians")}>Add a driver</button>}
    <form class="manifest-form" onSubmit={importOrders}>
      <label>Paying customer<select required value={customer} onChange={e => setCustomer(e.currentTarget.value)}>
        <option value="">Choose customer</option>{customerLookup.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label>Driver<select required value={driver} onChange={e => setDriver(e.currentTarget.value)}>
        <option value="">Choose driver</option>{technicianLookup.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select></label>
      <label>Spreadsheet rows<textarea required rows={5} value={sheet} aria-describedby="manifest-help"
        onInput={e => setSheet(e.currentTarget.value)} /></label>
      <p id="manifest-help">Paste up to 500 rows without a header. Columns in order: order reference, recipient, address, optional invoice reference. Stops append in spreadsheet order.</p>
      <button class="btn btn-primary" disabled={saving || !day}>Import orders</button>
      <span role="status">{feedback}</span>
    </form>
    <h2>Assigned stops</h2>
    {loadError ? <p role="alert">{loadError}</p> : stops === null ? <p>Loading routes…</p> : !routes.size && <p>No stops assigned for this date.</p>}
    {Array.from(routes, ([id, rows]) => <article key={id}><h3>{rows[0].driver}</h3><ol>
      {rows.map(row => <li key={row.position}><strong>{row.recipient}</strong> · {row.address}
        <div>{row.payer} · {row.reference}{row.invoice_reference && " · Invoice " + row.invoice_reference}</div></li>)}
    </ol></article>)}
  </section>;
}
