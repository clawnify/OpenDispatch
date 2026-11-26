import test from "node:test";
import assert from "node:assert/strict";
import { clockTime, defaultTiming, routeSchedule } from "../src/shared/route-schedule.ts";

test("waiting absorbs a longer handoff, then later stops and the depot finish move", () => {
  const settings = { ...defaultTiming, stops: { b: { earliest: "09:30" } } };
  const plan = () => routeSchedule(["a", "b"], settings, [60, 120, 180], true, true);
  assert.equal(plan().finish, 578);
  settings.stops.a = { serviceMinutes: 20 };
  assert.equal(plan().stops[1].wait, 7);
  assert.equal(plan().finish, 578);
  settings.stops.a.serviceMinutes = 30;
  assert.equal(plan().finish, 581);
  assert.equal(plan().returnDrive, 3);
});
test("a route starting with its first customer has no inbound drive; unknown legs have no ETA", () => {
  const late = { ...defaultTiming, start: "23:59" };
  const plan = routeSchedule(["a","b"], late, [61], false, false);
  assert.equal(plan.stops[0].drive, 0);
  assert.equal(plan.total, 12);
  assert.equal(clockTime(plan.finish), "00:11 +1d");
  assert.equal(routeSchedule(["a","b"], late, [], false, false), null);
});
