export type StopAllowance = { serviceMinutes?: number; earliest?: string };
export type TimingSettings = {
  start: string; defaultMinutes: number; stops: Record<string, StopAllowance>;
};
export const defaultTiming: TimingSettings = { start: "09:00", defaultMinutes: 5, stops: {} };

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function clockTime(minute: number) {
  const day = Math.floor(minute / 1440);
  const pad = (n: number) => String(n).padStart(2, "0");
  return pad(Math.floor(minute / 60) % 24) + ":" + pad(minute % 60) + (day ? " +" + day + "d" : "");
}

export function duration(minute: number) {
  if (minute < 60) return minute + " min";
  return Math.floor(minute / 60) + " h" + (minute % 60 ? " " + minute % 60 + " min" : "");
}

// Times use local minutes from midnight on the route date. Round each leg up
// once so displayed leg times add up to the planned finish.
export function routeSchedule(ids: string[], settings: TimingSettings, legs: number[] | null,
  fromDepot: boolean, returns: boolean) {
  if (!legs || legs.length !== ids.length - 1 + Number(fromDepot) + Number(returns)) return null;
  const start = minutes(settings.start);
  let finish = start;
  const stops = ids.map((id, i) => {
    const drive = i === 0 && !fromDepot ? 0 : Math.ceil(legs[i - (fromDepot ? 0 : 1)] / 60);
    const arrival = finish + drive;
    const allowance = settings.stops[id];
    const service = allowance?.serviceMinutes ?? settings.defaultMinutes;
    const wait = allowance?.earliest ? Math.max(0, minutes(allowance.earliest) - arrival) : 0;
    finish = arrival + wait + service;
    return { id, drive, arrival, wait, service, departure: finish };
  });
  const returnDrive = returns ? Math.ceil(legs[legs.length - 1] / 60) : 0;
  finish += returnDrive;
  return { start, finish, total: finish - start, returnDrive, stops };
}

export type RouteSchedule = NonNullable<ReturnType<typeof routeSchedule>>;
export type Timing = { settings: TimingSettings; revision: string | null; schedule: RouteSchedule | null };
