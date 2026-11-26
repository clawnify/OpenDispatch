import { Hono } from "hono";
import { z } from "@clawnify/app";
import { get, query } from "./db.js";
import type { Depot, Point, RoadMap } from "../shared/route-plan";

export const routePlanning = new Hono<{ Bindings: { OSRM_BASE_URL?: string } }>();
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const text = z.string().trim().min(1).max(500);
const depotInput = z.object({ name: text, address: text, longitude: point.items[0], latitude: point.items[1] });
const planInput = z.object({
  depotId: z.string().uuid().nullable(), returnToDepot: z.boolean(), revision: z.string().uuid().nullable(),
  stops: z.array(z.object({ address: text, pin: point })).min(1),
}).refine(v => !v.returnToDepot || v.depotId !== null);

routePlanning.get("/depots", async c => c.json({ depots: await query<Depot>("SELECT * FROM delivery_depots ORDER BY name, address") }));
routePlanning.post("/depots", async c => {
  const result = depotInput.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return c.json({ error: "Enter a depot name, address and valid coordinates." }, 400);
  const {name,address,longitude,latitude} = result.data;
  const depot = await get<Depot>(`INSERT INTO delivery_depots(id,name,address,longitude,latitude)
    VALUES(?,?,?,?,?) ON CONFLICT(name,address,longitude,latitude) DO UPDATE SET name=excluded.name RETURNING *`,
    [crypto.randomUUID(),name,address,longitude,latitude]);
  return c.json(depot, 201);
});

const road = z.object({ code: z.literal("Ok"), routes: z.array(z.object({
  legs: z.array(z.object({ duration: z.number().finite().nonnegative() })),
  distance: z.number().nonnegative(), geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(point).min(2) })
})).min(1) });

async function drive(points: Point[], endpoint?: string) {
  if (points.length === 1) return { meters: 0, legSeconds: [], line: [points[0], points[0]] };
  if (!endpoint) throw new Error("Set OSRM_BASE_URL to a driving router to calculate road distances.");
  let meters = 0;
  const legSeconds: number[] = [];
  const line: Point[] = [];
  for (let i = 0; i < points.length - 1; i += 40) {
    const part = points.slice(i, i + 41);
    const response = await fetch(endpoint.replace(/\/$/, "") + "/route/v1/driving/" + part.map(p => p.join(",")).join(";") + "?overview=full&geometries=geojson", { headers: { "User-Agent": "OpenDispatch route planning" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("The driving router returned HTTP " + response.status + ". Check the pins or retry shortly.");
    const parsed = road.safeParse(await response.json());
    if (!parsed.success) throw new Error("No driving route was found between these pins.");
    const route = parsed.data.routes[0];
    if (route.legs.length !== part.length - 1) throw new Error("Driving times are missing for part of this route.");
    legSeconds.push(...route.legs.map(leg => leg.duration));
    meters += route.distance;
    for (const p of route.geometry.coordinates.slice(i ? 1 : 0)) line.push(p);
  }
  return { meters, line, legSeconds };
}

routePlanning.put("/routes/:id/plan", async c => {
  const id = c.req.param("id");
  const result = planInput.safeParse(await c.req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !result.success) return c.json({ error: "Check the depot, return option and stop coordinates." }, 400);
  const { depotId, stops, returnToDepot, revision } = result.data;
  const depot = depotId ? await get<Depot>("SELECT * FROM delivery_depots WHERE id=?", [depotId]) : null;
  if (depotId && !depot) return c.json({ error: "Depot not found." }, 404);
  const stopQuery = `SELECT o.address FROM delivery_stops s JOIN delivery_orders o ON o.id=s.order_id
    WHERE s.route_id=? ORDER BY s.position`;
  const current = await query<{address:string}>(stopQuery, [id]);
  if (!current.length) return c.json({ error: "Route not found." }, 404);
  const addresses = stops.map(s => s.address);
  if (stops.length !== current.length || current.some((s,i) => s.address !== addresses[i])) return c.json({ error: "Stops changed. Reopen the route before saving." }, 409);
  const pins = stops.map(s => s.pin);
  const start: Point | null = depot ? [depot.longitude, depot.latitude] : null;
  let path;
  try {
    path = await drive(start ? [start, ...pins, ...(returnToDepot ? [start] : [])] : pins, c.env.OSRM_BASE_URL);
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Road routing failed." }, 502); }
  const map: RoadMap = { ...path, addresses, pins, depot, returnToDepot, revision: crypto.randomUUID() };
  const saved = await get<{id: string}>(`INSERT INTO delivery_route_maps(id,map_data) SELECT ?,?
    WHERE (SELECT json_group_array(address) FROM (${stopQuery}))=?
    AND (SELECT json_extract(map_data,'$.revision') FROM delivery_route_maps WHERE id=?) IS ?
    ON CONFLICT(id) DO UPDATE SET map_data=excluded.map_data RETURNING id`,
    [id,JSON.stringify(map),id,JSON.stringify(addresses),id,revision]);
  if (!saved) return c.json({ error: "This route changed while calculating. Reopen it before saving." }, 409);
  return c.json({ map });
});
