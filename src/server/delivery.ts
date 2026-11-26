import { z } from "@clawnify/app";
import { Hono } from "hono";
import { query, run } from "./db.js";

export const delivery = new Hono<{ Bindings: { GOOGLE_MAPS_EMBED_BROWSER_KEY?: string } }>();
const day = z.string().date();
const field = z.string().trim().min(1).max(500);
const manifest = z.object({
  customer: z.string().uuid(), driver: z.string().uuid(), day,
  orders: z.array(z.object({
    reference: field, recipient: field, address: field,
    invoice: z.string().trim().max(500).default(""),
  })).min(1).max(500),
});

delivery.get("/routes", async c => {
  const date = day.safeParse(c.req.query("day"));
  if (!date.success) return c.json({ error: "Choose a valid route date." }, 400);
  const stops = await query(`SELECT r.id AS route_id, t.name AS driver, s.position,
    o.reference, o.recipient, o.address, o.invoice_reference, p.name AS payer
    FROM delivery_routes r JOIN technicians t ON t.id=r.technician_id
    JOIN delivery_stops s ON s.route_id=r.id JOIN delivery_orders o ON o.id=s.order_id
    JOIN customers p ON p.id=o.customer_id WHERE r.delivery_date=?
    ORDER BY t.name, r.id, s.position`, [date.data]);
  return c.json({ stops, mapsEmbedBrowserKey: c.env.GOOGLE_MAPS_EMBED_BROWSER_KEY });
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
  return c.json({ imported: orders.length }, 201);
});
