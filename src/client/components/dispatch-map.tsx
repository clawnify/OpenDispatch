import { useEffect, useRef, useState } from "preact/hooks";
import type { Map as GLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { Depot, Point, RoadMap } from "../../shared/route-plan";
export type { RoadMap } from "../../shared/route-plan";

export type FleetRoute = { id: string; driver: string; stop_count: number; schedule?: {start: number; finish: number; total: number} | null; line: Point[] | null; meters: number | null; depot: Depot | null };
const palette = ["--accent", "--info", "--success", "--warning", "--danger"];
export function routeColor(index: number) { return palette[index % palette.length]; }

type MapProps = { data: RoadMap; driver: string; routes?: undefined } | { routes: FleetRoute[]; data?: undefined; driver?: undefined };

export function DispatchMap({ data, driver, routes }: MapProps) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let map: GLMap | undefined;
    setError("");
    async function draw() {
      const gl = await import("maplibre-gl");
      if (disposed || !element.current) return;
      const bounds = new gl.LngLatBounds();
      const style = getComputedStyle(element.current);
      const paths = data ? [{ id: "", driver, line: data.line }] : routes;
      const features = paths.flatMap((route, index) => {
        if (!route.line?.length) return [];
        route.line.forEach(point => bounds.extend(point));
        return [{ type: "Feature" as const,
          properties: { id: route.id, driver: route.driver, color: style.getPropertyValue(routeColor(index)).trim() },
          geometry: { type: "LineString" as const, coordinates: route.line } }];
      });
      data?.pins.forEach(point => bounds.extend(point));
      map = new gl.Map({ container: element.current, style: "https://tiles.openfreemap.org/styles/positron",
        bounds, fitBoundsOptions: { padding: { top: 36, right: 48, bottom: 76, left: 36 }, maxZoom: 16 }, scrollZoom: false, attributionControl: { compact: true } });
      map.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
      const canvas = map;
      canvas.once("load", () => {
        canvas.addSource("road", { type: "geojson", data: { type: "FeatureCollection", features } });
        canvas.addLayer({ id: "route-casing", type: "line", source: "road",
          paint: { "line-color": style.getPropertyValue("--card-bg").trim(), "line-width": 8 } });
        canvas.addLayer({ id: "route-path", type: "line", source: "road",
          layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4.5 } });
        if (routes) {
          canvas.on("mouseenter", "route-path", () => { canvas.getCanvas().style.cursor = "pointer"; });
          canvas.on("mouseleave", "route-path", () => { canvas.getCanvas().style.cursor = ""; });
          canvas.on("click", "route-path", event => {
            const route = event.features?.[0]?.properties;
            if (!route) return;
            const link = document.createElement("a");
            link.href = "/routes/" + encodeURIComponent(route.id);
            link.textContent = route.driver;
            new gl.Popup().setLngLat(event.lngLat).setDOMContent(link).addTo(canvas);
          });
        }
        const depots = new Map<string, Depot>();
        for (const depot of routes ? routes.map(r => r.depot) : [data?.depot]) {
          if (depot) depots.set(depot.id, depot);
        }
        for (const depot of depots.values()) {
          const marker = document.createElement("button");
          marker.type = "button";
          marker.className = "dispatch-depot";
          marker.textContent = "⌂";
          marker.setAttribute("aria-label", "Depot: " + depot.name);
          new gl.Marker({ element: marker }).setLngLat([depot.longitude, depot.latitude])
            .setPopup(new gl.Popup({ offset: 18 }).setText(depot.name + " · " + depot.address)).addTo(canvas);
        }
        data?.pins.forEach((point,i) => {
          const pin = document.createElement("button");
          pin.type = "button";
          pin.className = "dispatch-pin";
          pin.textContent = String(i + 1);
          pin.setAttribute("aria-label", "Stop " + (i + 1) + ", " + data.addresses[i]);
          new gl.Marker({element: pin}).setLngLat(point)
            .setPopup(new gl.Popup({offset: 16}).setText(data.addresses[i])).addTo(canvas);
        });
      });
    }
    draw().catch(() => { if (!disposed) setError("The interactive map could not load."); });
    return () => { disposed = true; map?.remove(); };
  }, [data, routes]);
  return <div class="dispatch-map-wrap">
    <div ref={element} class="dispatch-map" role="region" aria-label={routes ? "Map of assigned routes" : driver + " route map"} />
    {error && <p role="status">{error}</p>}
  </div>;
}
