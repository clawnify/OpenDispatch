import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { EquipmentDialog } from "./equipment-forms";
import type { Depot, Point, RoadMap } from "../../shared/route-plan";

function parsePin(value: string): Point | null {
  const parts = value.trim().split(/\s*,\s*/);
  if (parts.length !== 2 || parts.some(part => !part || !Number.isFinite(Number(part)))) return null;
  const [latitude, longitude] = parts.map(Number);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}

export function RoutePlanForm({ id, addresses, map, onClose, onSaved }: {
  id: string; addresses: string[]; map?: RoadMap; onClose: () => void; onSaved: (map: RoadMap) => void;
}) {
  const [depots, setDepots] = useState<Depot[] | null>(null);
  const [choice, setChoice] = useState(map?.depot?.id ?? "");
  const [returns, setReturns] = useState(map?.returnToDepot ?? false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const known = new Map(map?.addresses.map((address,i) => [address,map.pins[i]]));
  useEffect(() => {
    let current = true;
    api<{depots: Depot[]}>("GET", "/api/delivery/depots").then(r => { if (current) setDepots(r.depots); })
      .catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);

  async function save(event: Event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    const value = (name: string) => String(fields.get(name) ?? "");
    setError("");
    setBusy(true);
    try {
      const stops = addresses.map((address,i) => {
        const pin = known.get(address) ?? parsePin(value("pin-" + i));
        if (!pin) throw new Error("Check the latitude and longitude for stop " + (i+1) + ".");
        return { address, pin };
      });
      let depotId = choice || null;
      if (choice === "new") {
        const pin = parsePin(value("depot-pin"));
        if (!pin) throw new Error("Enter the depot entrance as latitude, longitude.");
        const depot = await api<Depot>("POST", "/api/delivery/depots", {
          name: value("name"), address: value("address"), longitude: pin[0], latitude: pin[1],
        });
        depotId = depot.id;
        setDepots(prev => [...(prev ?? []).filter(d => d.id !== depot.id), depot]);
        setChoice(depot.id);
      }
      const result = await api<{map: RoadMap}>("PUT", "/api/delivery/routes/" + id + "/plan", {
        depotId, returnToDepot: !!depotId && returns, stops, revision: map?.revision ?? null,
      });
      onSaved(result.map);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <EquipmentDialog title="Plan route" onClose={onClose} busy={busy}>
    <form onSubmit={save} class="manifest-form plan-form">
      <fieldset disabled={busy}><legend>Start location</legend>
        {[{id:"",name:"First delivery stop"}, ...(depots ?? []), {id:"new",name:"Add depot"}].map(option =>
          <label class="plan-choice" key={option.id}><input type="radio" name="depot" checked={choice === option.id}
            onChange={() => setChoice(option.id)} />{option.name}</label>)}
      </fieldset>
      {choice === "new" && <>
        <label>Depot name<input required name="name" maxLength={500} disabled={busy} /></label>
        <label>Street address<input required name="address" maxLength={500} disabled={busy} /></label>
        <label>Entrance coordinates<input required name="depot-pin" placeholder="Latitude, longitude" disabled={busy} /></label>
      </>}
      {choice && <label class="plan-choice"><input type="checkbox" checked={returns} disabled={busy}
        onChange={e => setReturns(e.currentTarget.checked)} />Return to depot after the last delivery</label>}
      {addresses.map((address,i) => !known.get(address) && <label key={i}>Stop {i+1} · {address}
        <input required name={"pin-" + i} placeholder="Latitude, longitude" disabled={busy} /></label>)}
      {error && <p role="alert">{error}</p>}
      <button class="btn btn-primary" disabled={busy || !depots}>{busy ? "Calculating…" : "Calculate route"}</button>
    </form>
  </EquipmentDialog>;
}
