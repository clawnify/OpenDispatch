import { z } from "@clawnify/app";
import { defaultTiming, routeSchedule } from "../shared/route-schedule";
import { routePlanning } from "./route-plan.js";
import { Hono } from "hono";
import { get, query, run } from "./db.js";

export const delivery = new Hono<{ Bindings: { GOOGLE_MAPS_EMBED_BROWSER_KEY?: string } }>();
delivery.route("/", routePlanning);
const day = z.string().date();
const field = z.string().trim().min(1).max(500);
const manifest = z.object({
  customer: z.string().uuid(), driver: z.string().uuid(), day,
  orders: z.array(z.object({
    reference: field, recipient: field, address: field,
    invoice: z.string().trim().max(500).default(""),
  })).min(1).max(500),
});

const stopSelect = `SELECT r.id AS route_id, t.id AS driver_id, t.name AS driver, r.delivery_date, s.position, s.id AS stop_id,
    o.reference, o.recipient, o.address, o.invoice_reference, p.name AS payer
    FROM delivery_routes r JOIN technicians t ON t.id=r.technician_id
    JOIN delivery_stops s ON s.route_id=r.id JOIN delivery_orders o ON o.id=s.order_id
    JOIN customers p ON p.id=o.customer_id`;

delivery.get("/routes", async c => {
  const date = day.safeParse(c.req.query("day"));
  if (!date.success) return c.json({ error: "Choose a valid route date." }, 400);
  if (c.req.query("view") === "summary") {
    const rows = await query<{ id: string; driver: string; stop_count: number; geometry: string | null; meters: number | null; depot: string | null; legs: string | null; ids: string; settings: string | null; returns: number | null }>(`
      SELECT r.id, t.name AS driver, count(s.id) AS stop_count,
        json_extract(m.map_data,'$.meters') AS meters,
        json_extract(m.map_data,'$.depot') AS depot, json_extract(m.map_data,'$.legSeconds') AS legs,
        json_extract(m.map_data,'$.returnToDepot') AS returns, timing.settings,
        json_group_array(s.id ORDER BY s.position) AS ids,
        CASE WHEN count(s.id) = json_array_length(m.map_data, '$.addresses')
          AND min(o.address = json_extract(m.map_data, '$.addresses[' || (s.position - 1) || ']')) = 1
          THEN json_extract(m.map_data, '$.line') END AS geometry
      FROM delivery_routes r JOIN technicians t ON t.id=r.technician_id
      JOIN delivery_stops s ON s.route_id=r.id JOIN delivery_orders o ON o.id=s.order_id
      LEFT JOIN delivery_route_timing timing ON timing.id=r.id
      LEFT JOIN delivery_route_maps m ON m.id=r.id WHERE r.delivery_date=?
      GROUP BY r.id ORDER BY t.name, r.id`, [date.data]);
    return c.json({ routes: rows.map(({ geometry, meters, depot, legs, returns, settings, ids, ...route }) => {
      const plan = routeSchedule(JSON.parse(ids), settings ? JSON.parse(settings) : defaultTiming,
        legs && geometry ? JSON.parse(legs) : null, !!depot, !!returns);
      return { ...route, meters: geometry ? meters : null, depot: depot ? JSON.parse(depot) : null,
        line: geometry ? JSON.parse(geometry) : null, schedule: plan && { start: plan.start, finish: plan.finish, total: plan.total } };
    }) });
  }
  const stops = await query(stopSelect + " WHERE r.delivery_date=? ORDER BY t.name, r.id, s.position", [date.data]);
  const maps = await query<{ id: string; map_data: string }>(
    "SELECT m.id, m.map_data FROM delivery_route_maps m JOIN delivery_routes r ON r.id=m.id WHERE r.delivery_date=?", [date.data]);
  const roadMaps = Object.fromEntries(maps.map(row => [row.id, JSON.parse(row.map_data)]));
  return c.json({ stops, roadMaps, mapsEmbedBrowserKey: c.env.GOOGLE_MAPS_EMBED_BROWSER_KEY });
});

delivery.get("/routes/:id", async c => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid route ID." }, 400);
  const stops = await query(stopSelect + " WHERE r.id=? ORDER BY s.position", [id.data]);
  if (!stops.length) return c.json({ error: "Route not found." }, 404);
  const map = await get<{ map_data: string }>("SELECT map_data FROM delivery_route_maps WHERE id=?", [id.data]);
  return c.json({ stops, map: map ? JSON.parse(map.map_data) : null, mapsEmbedBrowserKey: c.env.GOOGLE_MAPS_EMBED_BROWSER_KEY });
});

delivery.post("/manifest", async c => {
  const input = manifest.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: "Choose a customer, driver and date, and include 1–500 complete order rows." }, 400);
  const { customer, driver, day, orders } = input.data;
  const rows = orders.map(order => ({ ...order, id: crypto.randomUUID(), stop: crypto.randomUUID() }));
  try {
    await run(`INSERT INTO delivery_manifest(id, customer_id, reference, recipient, address,
      invoice_reference, technician_id, delivery_date, route_id, stop_id)
      SELECT value->>'id', ?, value->>'reference', value->>'recipient', value->>'address',
        value->>'invoice', ?, ?, ?, value->>'stop' FROM json_each(?) ORDER BY key`,
      [customer, driver, day, crypto.randomUUID(), JSON.stringify(rows)]);
  } catch (error) {
    const message = String(error);
    if (message.includes("UNIQUE constraint failed: delivery_orders")) return c.json({ error: "An order reference already exists for this customer. No rows were imported." }, 409);
    if (message.includes("FOREIGN KEY constraint")) return c.json({ error: "The customer or driver no longer exists." }, 409);
    throw error;
  }
  const route = await get<{ id: string }>("SELECT id FROM delivery_routes WHERE technician_id=? AND delivery_date=?", [driver, day]);
  return c.json({ imported: orders.length, route_id: route!.id }, 201);
});
