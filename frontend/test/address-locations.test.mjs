import { test } from "node:test";
import assert from "node:assert/strict";
import { coordinates, LOCATIONS } from "../src/address-locations.mjs";
test("map accepts paired decimal coordinates and compass directions with geographic bounds", () => {
  assert.deepEqual(coordinates("19.9975, 73.7898"), {
    latitude: 19.9975,
    longitude: 73.7898,
  });
  assert.deepEqual(coordinates("19.99S, 73.78W"), {
    latitude: -19.99,
    longitude: -73.78,
  });
  for (const invalid of ["91,0", "0,181", "19.9", "Nashik", "NaN,20"])
    assert.equal(coordinates(invalid), null);
});
test("practice address suggestions always contain searchable city, state, PIN and valid coordinates", () => {
  for (const p of LOCATIONS) {
    assert.match(p.pincode, /^\d{6}$/);
    assert.ok(p.state && p.city && p.district);
    assert.ok(coordinates(`${p.latitude},${p.longitude}`));
  }
});
