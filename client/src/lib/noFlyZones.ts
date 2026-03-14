export interface NoFlyPoint {
  lat: number;
  lng: number;
}

export interface NoFlyZone {
  id: string;
  name: string;
  type: "circle" | "polygon" | "custom";
  enabled: boolean;
  action: "rtl" | "land" | "hover" | "warn";
  center?: NoFlyPoint;
  radius?: number;
  points?: NoFlyPoint[];
}

interface CircleObstacle {
  center: NoFlyPoint;
  radius: number;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

export function haversineDistanceMeters(a: NoFlyPoint, b: NoFlyPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function toLocalMeters(origin: NoFlyPoint, p: NoFlyPoint) {
  const x = toRad(p.lng - origin.lng) * EARTH_RADIUS_M * Math.cos(toRad(origin.lat));
  const y = toRad(p.lat - origin.lat) * EARTH_RADIUS_M;
  return { x, y };
}

function toLatLng(origin: NoFlyPoint, x: number, y: number): NoFlyPoint {
  return {
    lat: origin.lat + toDeg(y / EARTH_RADIUS_M),
    lng: origin.lng + toDeg(x / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)))),
  };
}

function pointInPolygon(point: NoFlyPoint, polygon: NoFlyPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function orientation(a: NoFlyPoint, b: NoFlyPoint, c: NoFlyPoint) {
  const v = (b.lng - a.lng) * (c.lat - b.lat) - (b.lat - a.lat) * (c.lng - b.lng);
  if (Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : 2;
}

function onSegment(a: NoFlyPoint, b: NoFlyPoint, c: NoFlyPoint) {
  return (
    Math.min(a.lng, c.lng) <= b.lng &&
    b.lng <= Math.max(a.lng, c.lng) &&
    Math.min(a.lat, c.lat) <= b.lat &&
    b.lat <= Math.max(a.lat, c.lat)
  );
}

function segmentsIntersect(p1: NoFlyPoint, q1: NoFlyPoint, p2: NoFlyPoint, q2: NoFlyPoint) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function zoneToCircleObstacle(zone: NoFlyZone, extraBufferMeters = 0): CircleObstacle | null {
  if (zone.type === "circle" && zone.center && typeof zone.radius === "number") {
    return { center: zone.center, radius: Math.max(1, zone.radius + extraBufferMeters) };
  }

  if ((zone.type === "polygon" || zone.type === "custom") && zone.points && zone.points.length >= 3) {
    const center = {
      lat: zone.points.reduce((s, p) => s + p.lat, 0) / zone.points.length,
      lng: zone.points.reduce((s, p) => s + p.lng, 0) / zone.points.length,
    };
    let radius = 0;
    for (const p of zone.points) {
      radius = Math.max(radius, haversineDistanceMeters(center, p));
    }
    return { center, radius: Math.max(1, radius + extraBufferMeters) };
  }

  return null;
}

function pointInsideCircle(p: NoFlyPoint, c: CircleObstacle) {
  return haversineDistanceMeters(p, c.center) <= c.radius;
}

function segmentIntersectsCircle(a: NoFlyPoint, b: NoFlyPoint, c: CircleObstacle) {
  const origin = c.center;
  const ap = toLocalMeters(origin, a);
  const bp = toLocalMeters(origin, b);
  const cx = 0;
  const cy = 0;
  const abx = bp.x - ap.x;
  const aby = bp.y - ap.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return pointInsideCircle(a, c);
  const t = Math.max(0, Math.min(1, ((cx - ap.x) * abx + (cy - ap.y) * aby) / ab2));
  const closestX = ap.x + t * abx;
  const closestY = ap.y + t * aby;
  const d2 = closestX * closestX + closestY * closestY;
  return d2 <= c.radius * c.radius;
}

function segmentIntersectsPolygon(a: NoFlyPoint, b: NoFlyPoint, polygon: NoFlyPoint[]) {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(a, b, p1, p2)) return true;
  }
  return false;
}

export function segmentIntersectsNoFlyZones(a: NoFlyPoint, b: NoFlyPoint, zones: NoFlyZone[]) {
  for (const zone of zones.filter((z) => z.enabled)) {
    if (zone.type === "circle") {
      const obstacle = zoneToCircleObstacle(zone);
      if (obstacle && segmentIntersectsCircle(a, b, obstacle)) return true;
      continue;
    }

    if ((zone.type === "polygon" || zone.type === "custom") && zone.points && zone.points.length >= 3) {
      if (segmentIntersectsPolygon(a, b, zone.points)) return true;
      continue;
    }

    const fallback = zoneToCircleObstacle(zone);
    if (fallback && segmentIntersectsCircle(a, b, fallback)) return true;
  }
  return false;
}

function shortestPath(nodes: NoFlyPoint[], graph: number[][]) {
  const n = nodes.length;
  const dist = Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = Array<number>(n).fill(-1);
  const visited = Array(n).fill(false);
  dist[0] = 0;

  for (let i = 0; i < n; i++) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[j] < best) {
        best = dist[j];
        u = j;
      }
    }
    if (u === -1) break;
    visited[u] = true;
    if (u === 1) break;

    for (let v = 0; v < n; v++) {
      const w = graph[u][v];
      if (w < Number.POSITIVE_INFINITY) {
        const alt = dist[u] + w;
        if (alt < dist[v]) {
          dist[v] = alt;
          prev[v] = u;
        }
      }
    }
  }

  if (!Number.isFinite(dist[1])) return null;

  const pathIdx: number[] = [];
  let cur = 1;
  while (cur !== -1) {
    pathIdx.push(cur);
    cur = prev[cur];
  }
  pathIdx.reverse();
  return pathIdx.map((i) => nodes[i]);
}

export function planRouteAvoidingNoFlyZones(
  start: NoFlyPoint,
  destination: NoFlyPoint,
  zones: NoFlyZone[],
  options?: { clearanceMeters?: number; angularSamples?: number },
) {
  const enabled = zones.filter((z) => z.enabled);
  if (enabled.length === 0) return [start, destination];

  const clearance = options?.clearanceMeters ?? 35;
  const samples = options?.angularSamples ?? 12;

  if (!segmentIntersectsNoFlyZones(start, destination, enabled)) {
    return [start, destination];
  }

  const obstacles = enabled
    .map((z) => zoneToCircleObstacle(z, clearance))
    .filter((o): o is CircleObstacle => o !== null);

  const pointInsideAnyObstacle = (p: NoFlyPoint) => obstacles.some((o) => pointInsideCircle(p, o));
  if (pointInsideAnyObstacle(start) || pointInsideAnyObstacle(destination)) {
    return null;
  }

  const nodes: NoFlyPoint[] = [start, destination];
  for (const obstacle of obstacles) {
    const center = obstacle.center;
    for (let i = 0; i < samples; i++) {
      const angle = (Math.PI * 2 * i) / samples;
      const local = toLocalMeters(center, center);
      const x = local.x + Math.cos(angle) * obstacle.radius;
      const y = local.y + Math.sin(angle) * obstacle.radius;
      const candidate = toLatLng(center, x, y);
      if (!pointInsideAnyObstacle(candidate)) {
        nodes.push(candidate);
      }
    }
  }

  const n = nodes.length;
  const graph = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));

  const segmentIsClear = (a: NoFlyPoint, b: NoFlyPoint) =>
    !obstacles.some((o) => segmentIntersectsCircle(a, b, o));

  for (let i = 0; i < n; i++) {
    graph[i][i] = 0;
    for (let j = i + 1; j < n; j++) {
      if (segmentIsClear(nodes[i], nodes[j])) {
        const d = haversineDistanceMeters(nodes[i], nodes[j]);
        graph[i][j] = d;
        graph[j][i] = d;
      }
    }
  }

  return shortestPath(nodes, graph);
}
