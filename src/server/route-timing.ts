import { OpenAPIHono, createRoute, z } from "@clawnify/app";
import { get, query } from "./db.js";
import { defaultTiming, routeSchedule, type TimingSettings } from "../shared/route-schedule";

export const timingApi = new OpenAPIHono();
const params = z.object({ id: z.string().uuid() });
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const minutes = z.number().int().min(0).max(1440);
const changes = z.object({
  revision: z.string().uuid().nullable(),
  start: clock.optional(), defaultMinutes: minutes.optional(),
  stops: z.array(z.object({
    id: z.string().uuid(),
    serviceMinutes: minutes.nullable().optional(),
    earliest: clock.nullable().optional(),
  }).strict()).optional(),
}).strict();
const json = <T extends z.ZodTypeAny>(schema: T) => ({ "application/json": { schema } });
const route = "/api/delivery/routes/{id}/schedule";
const failure = { description: "Request could not be applied", content: json(z.object({ error: z.string() })) };
const revision = z.string().uuid().nullable();
const allowance = z.object({ serviceMinutes: minutes.optional(), earliest: clock.optional() });
const time = z.number().int().nonnegative();
const timingResponse = z.object({
  revision, settings: z.object({ start: clock, defaultMinutes: minutes, stops: z.record(allowance) }),
  stops: z.array(z.object({ id: z.string(), position: z.number(), recipient: z.string() })),
  schedule: z.object({ start: time, finish: time, total: time, returnDrive: time,
    stops: z.array(z.object({ id: z.string(), drive: time, arrival: time, wait: time, service: time, departure: time })) }).nullable(),
});

async function readSchedule(id: string) {
  const stops = await query<{id: string; position: number; recipient: string; address: string}>(`
    SELECT s.id, s.position, o.recipient, o.address FROM delivery_stops s
    JOIN delivery_orders o ON o.id=s.order_id WHERE s.route_id=? ORDER BY s.position`, [id]);
  if (!stops.length) return null;
  const row = await get<{settings: string | null; revision: string | null; addresses: string | null;
    legs: string | null; depot: string | null; returns: number | null}>(`
    SELECT t.settings, t.revision, json_extract(m.map_data,'$.addresses') AS addresses,
      json_extract(m.map_data,'$.legSeconds') AS legs, json_extract(m.map_data,'$.depot.id') AS depot,
      json_extract(m.map_data,'$.returnToDepot') AS returns FROM delivery_routes r
    LEFT JOIN delivery_route_timing t ON t.id=r.id LEFT JOIN delivery_route_maps m ON m.id=r.id WHERE r.id=?`, [id]);
  const settings: TimingSettings = row?.settings ? JSON.parse(row.settings) : defaultTiming;
  const current = row?.legs && row.addresses === JSON.stringify(stops.map(s => s.address));
  return { settings, revision: row?.revision ?? null, stops: stops.map(({id, position, recipient}) => ({id, position, recipient})),
    schedule: routeSchedule(stops.map(s => s.id), settings, current ? JSON.parse(row.legs!) : null, !!row?.depot, !!row?.returns) };
}

timingApi.openapi(createRoute({ method: "get", path: route, operationId: "getDeliverySchedule",
  summary: "Read a route's ordered stop IDs, allowances and planned arrivals. Clock values in the schedule are minutes from local midnight on the route date.",
  request: { params }, responses: { 200: { description: "Planned schedule", content: json(timingResponse) }, 404: failure } }), async c => {
  const timing = await readSchedule(c.req.valid("param").id);
  return timing ? c.json(timing, 200) : c.json({ error: "Route not found." }, 404);
});

timingApi.openapi(createRoute({ method: "patch", path: route, operationId: "editDeliverySchedule",
  summary: "Change departure, default on-site minutes, or specific stops. Use the latest schedule revision and stop IDs. Null clears a stop override.",
  request: { params, body: { required: true, content: json(changes) } },
  responses: { 200: { description: "Saved revision", content: json(z.object({ revision: z.string() })) }, 400: failure, 404: failure, 409: failure } }), async c => {
  const { id } = c.req.valid("param");
  const edit = c.req.valid("json");
  const current = await readSchedule(id);
  if (!current) return c.json({ error: "Route not found." }, 404);
  if (edit.revision !== current.revision) return c.json({ error: "Schedule changed. Read the latest schedule before editing." }, 409);
  const settings = structuredClone(current.settings);
  if (edit.start !== undefined) settings.start = edit.start;
  if (edit.defaultMinutes !== undefined) settings.defaultMinutes = edit.defaultMinutes;
  const ids = new Set(current.stops.map(s => s.id));
  for (const stop of edit.stops ?? []) {
    if (!ids.delete(stop.id)) return c.json({ error: "Each stop must belong to this route and appear once." }, 400);
    const allowance = settings.stops[stop.id] ?? {};
    for (const key of ["serviceMinutes", "earliest"] as const) {
      if (stop[key] === null) delete allowance[key];
    }
    if (typeof stop.serviceMinutes === "number") allowance.serviceMinutes = stop.serviceMinutes;
    if (stop.earliest) allowance.earliest = stop.earliest;
    if (Object.keys(allowance).length) settings.stops[stop.id] = allowance;
    else delete settings.stops[stop.id];
  }
  const saved = await get<{revision:string}>(`INSERT INTO delivery_route_timing(id,settings,revision)
    SELECT ?,?,? WHERE (SELECT revision FROM delivery_route_timing WHERE id=?) IS ?
    ON CONFLICT(id) DO UPDATE SET settings=excluded.settings, revision=excluded.revision RETURNING revision`,
    [id, JSON.stringify(settings), crypto.randomUUID(), id, edit.revision]);
  return saved ? c.json(saved, 200) : c.json({ error: "Schedule changed. Read the latest schedule before editing." }, 409);
});
