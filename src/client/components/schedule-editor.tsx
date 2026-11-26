import { useState } from "preact/hooks";
import { api } from "../api";
import { type Timing } from "../../shared/route-schedule";

export function ScheduleEditor({ id, timing, stops, busy, setBusy, onSaved }: {
  id: string; timing: Timing; stops: {stop_id: string; position: number; recipient: string}[];
  busy: boolean; setBusy: (busy: boolean) => void; onSaved: () => void;
}) {
  const [initial] = useState(timing);
  const [error, setError] = useState("");
  const [defaultMinutes, setDefaultMinutes] = useState(String(initial.settings.defaultMinutes));
  async function save(event: Event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = (name: string) => String(form.get(name) ?? "");
    setBusy(true);
    setError("");
    try {
      await api("PATCH", "/api/delivery/routes/" + id + "/schedule", {
        revision: initial.revision, start: value("start"), defaultMinutes: Number(defaultMinutes),
        stops: stops.map(({stop_id}) => ({id: stop_id,
          serviceMinutes: value(stop_id) === "" ? null : Number(value(stop_id)), earliest: value("earliest-" + stop_id) || null})),
      });
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form id="route-timing-form" class="schedule-editor manifest-form plan-form" onSubmit={save}>
    <fieldset disabled={busy}><legend>Route defaults</legend>
      <label>Departure<input required type="time" name="start" defaultValue={initial.settings.start} /></label>
      <label>Default minutes on site<input required type="number" min="0" max="1440" value={defaultMinutes}
        onInput={e => setDefaultMinutes(e.currentTarget.value)} /></label>
    </fieldset>
    {stops.map(stop => <fieldset key={stop.stop_id} disabled={busy}><legend>{stop.position}. {stop.recipient}</legend>
      <label>Minutes on site<input type="number" min="0" max="1440" name={stop.stop_id} placeholder={defaultMinutes}
        defaultValue={initial.settings.stops[stop.stop_id]?.serviceMinutes} /></label>
      <label>Earliest service<input type="time" name={"earliest-" + stop.stop_id} defaultValue={initial.settings.stops[stop.stop_id]?.earliest} /></label>
    </fieldset>)}
    {error && <p role="alert">{error}</p>}
  </form>;
}
