import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Btn, Input, Spinner, usePortal } from "./lib";
import { LOCATIONS, coordinates } from "./address-locations.mjs";

export function AddressMap({ values, state, business, onConfirm }) {
  const portal = usePortal(),
    apiRef = useRef(portal?.api);
  apiRef.current = portal?.api;
  const [remoteResults, setRemoteResults] = useState([]),
    [searching, setSearching] = useState(false);
  const center =
    LOCATIONS.find((p) => p.state === (values.state || state)) || LOCATIONS[0];
  const initial = coordinates(`${values.latitude},${values.longitude}`);
  const [pin, setPin] = useState(initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [tileError, setTileError] = useState(false);
  const [basemapLoaded, setBasemapLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const host = useRef(null),
    map = useRef(null),
    marker = useRef(null),
    leaflet = useRef(null);
  const [ready, setReady] = useState(false);
  const confirmRef = useRef(null);
  const confirm = () => {
    if (!pin) return;
    onConfirm({
      ...(selected || {}),
      latitude: Number(pin.latitude).toFixed(6),
      longitude: Number(pin.longitude).toFixed(6),
      ...(business ? { state } : {}),
    });
    setMessage("Location confirmed. Review the address fields below.");
  };
  confirmRef.current = confirm;
  useEffect(() => {
    let disposed = false;
    import("leaflet")
      .then((module) => {
        if (disposed) return;
        const L = module.default;
        leaflet.current = L;
        const instance = L.map(host.current, {
          scrollWheelZoom: false,
          minZoom: 1,
          maxBounds: [
            [-85, -180],
            [85, 180],
          ],
          maxBoundsViscosity: 1,
        }).setView(
          initial
            ? [initial.latitude, initial.longitude]
            : [center.latitude, center.longitude],
          initial ? 16 : 12,
        );
        // Load the vector basemap separately: marker/address entry also works if WebGL or tiles fail.
        Promise.all([
          import("@maplibre/maplibre-gl-leaflet"),
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
        ])
          .then(([bridge, gl, worker]) => {
            if (disposed) return;
            gl.setWorkerUrl(worker.default);
            const basemap = bridge.maplibreGL({
              style: "https://tiles.openfreemap.org/styles/liberty",
              interactive: false,
            });
            basemap.addTo(instance);
            basemap.getMaplibreMap().on("error", () => setTileError(true));
            basemap.getMaplibreMap().on("idle", () => {
              setTileError(false);
              setBasemapLoaded(true);
            });
          })
          .catch(() => setTileError(true));
        instance.on("click", (e) => {
          setPin({ latitude: e.latlng.lat, longitude: e.latlng.lng });
          setMessage(
            "Pin updated. Review the selected postal address before confirming.",
          );
        });
        map.current = instance;
        setReady(true);
        instance.invalidateSize();
      })
      .catch(() =>
        setMessage(
          "Map could not load. Enter latitude and longitude in the address fields below.",
        ),
      );
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = leaflet.current;
    marker.current?.remove();
    marker.current = null;
    if (!pin) return;
    const m = L.marker([pin.latitude, pin.longitude], {
      draggable: true,
      keyboard: true,
      title: "Address location — drag to adjust",
      icon: L.divIcon({
        className: "address-pin",
        html: '<span aria-hidden="true">●</span>',
        iconSize: [28, 36],
        iconAnchor: [14, 32],
      }),
    }).addTo(map.current);
    m.on("dragend", () => {
      const p = m.getLatLng();
      setPin({ latitude: p.lat, longitude: p.lng });
      setMessage(
        "Pin updated. Review the selected postal address before confirming.",
      );
    });
    const content = document.createElement("div");
    const label = document.createElement("p");
    label.textContent = `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = "CONFIRM";
    button.onclick = () => confirmRef.current();
    content.append(label, button);
    m.bindPopup(content).openPopup();
    marker.current = m;
  }, [pin, ready]);
  useEffect(() => {
    if (query.trim().length < 2 || coordinates(query) || !apiRef.current) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await apiRef.current(
          "/workspace/registration/address-search",
          { query, state: business ? state : undefined },
          undefined,
          { background: true },
        );
        if (!cancelled) setRemoteResults(response.results);
      } catch {
        if (!cancelled) setRemoteResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, state, business]);
  const localResults =
    query.trim().length >= 2
      ? LOCATIONS.filter(
          (p) =>
            (!business || p.state === state) &&
            `${p.city} ${p.district} ${p.state} ${p.pincode}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        ).slice(0, 6)
      : [];
  const results =
    query.trim().length >= 2
      ? remoteResults.length
        ? remoteResults
        : localResults
      : [];

  const pick = (location) => {
    setSelected(location.city ? location : null);
    setQuery("");
    if (location.latitude === null || location.longitude === null) {
      setPin(null);
      setMessage(
        "Postal address selected. Place a pin on the map to confirm its coordinates.",
      );
      return;
    }
    setPin({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    });
    setMessage(
      location.approximate
        ? "Postal-area location is approximate. Adjust the pin and review the address before confirming."
        : "",
    );
    map.current?.setView(
      [location.latitude, location.longitude],
      location.approximate ? 14 : 16,
    );
  };
  return (
    <section className="address-map-section" aria-label="Locate your address">
      <h3>Locate your address</h3>
      <form
        className="address-map-search"
        onSubmit={(e) => {
          e.preventDefault();
          const found = coordinates(query);
          if (found) pick(found);
          else if (results.length === 1) pick(results[0]);
          else
            setMessage(
              "Choose a suggested location, enter latitude, longitude, or place a pin on the map.",
            );
        }}
      >
        <Input
          label="Enter Address or Latitude, Longitude"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City / PIN or e.g. 19.9975, 73.7898"
        />
        <Btn type="submit" tone="secondary">
          SEARCH
        </Btn>
      </form>
      {searching && <Spinner label="Searching postal directory" />}
      {results.length > 0 && (
        <ul className="address-suggestions">
          {results.map((p) => (
            <li key={`${p.pincode}:${p.district}:${p.city}`}>
              <button type="button" onClick={() => pick(p)}>
                {p.city}, {p.district}, {p.state} — {p.pincode}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="address-map-frame">
        <div
          ref={host}
          className="address-map-canvas"
          role="region"
          aria-label="Address map"
        />
        {!basemapLoaded && !tileError && (
          <div className="address-map-loader">
            <Spinner label="Loading map" />
          </div>
        )}
      </div>
      {tileError && (
        <small role="status">
          Map tiles are unavailable. You can still place a pin or enter
          coordinates.
        </small>
      )}
      <p className="muted">
        Search city, postal locality, PIN code or coordinates. Drag the pin to
        adjust the location, then confirm. Address fields remain editable.
      </p>
      <div className="actions">
        <Btn disabled={!pin} onClick={confirm}>
          CONFIRM LOCATION
        </Btn>
        <Btn
          tone="secondary"
          onClick={() => {
            setPin(null);
            setSelected(null);
            setQuery("");
            setMessage("");
            onConfirm({
              latitude: "",
              longitude: "",
              address: "",
              building: "",
              flat: "",
              floor: "",
              street: "",
              locality: "",
              landmark: "",
              city: "",
              district: "",
              pincode: "",
            });
            map.current?.setView([center.latitude, center.longitude], 12);
          }}
        >
          RESET ADDRESS
        </Btn>
      </div>
      {message && <p role="status">{message}</p>}
      <small>
        Postal directory: Department of Posts via data.gov.in. Estimated
        postal-area coordinates:{" "}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>{" "}
        (CC BY 4.0).
      </small>
    </section>
  );
}
