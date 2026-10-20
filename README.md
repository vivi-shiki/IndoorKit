# IndoorKit — Indoor Hospital Map

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

A demo of indoor positioning (RTLS) for a hospital, running entirely in the browser. It is built on an indoor map SDK written from scratch in TypeScript on top of MapLibre GL JS.

**Live demo: <https://vivi-shiki.github.io/IndoorKit/?lang=en>**

All people, equipment and buildings are fictional. The venue is "Sakura General Hospital": 3 buildings with 5 floors each, connected by bridges on every floor.

## Departments

Every room belongs to a department, such as Emergency, Internal Medicine, Surgery or Intensive Care, and a department can span several rooms, buildings and floors. Every device and every person also belongs to a department. Corridors, elevators and restrooms are public areas that belong to no department.

Alerts check the department area first, and geofences second:

1. **Department area**: for example a patient outside their own department for more than 30 s, a visitor entering a department they are not visiting, or a device taken out of its department.
2. **Geofences**: a restricted ICU that only ICU staff may enter, anti-theft at the 1F exits for devices, and a visiting-time limit in a ward.
3. **Reported status**: a device going offline, or a person pressing the SOS button.

## Equipment View

### Equipment Map

Which devices are in which room, what state they are in and how long they have worked today. Devices report their running status (running, idle, offline, maintenance), simulated here from a schedule for each device.

- Devices are grouped by room. Each room shows one cluster point coloured by its most severe status.
- The department list shows each department's device count and how many are offline or under maintenance. Select a department to highlight its rooms and list them.
- Click a room to see its devices. Click a device to see its status, how long it has been in that status, its running time today, its battery and a timeline of today's status.
- Search by device code or type, and filter by status or type.

![Equipment Map](docs/images/assets.png)

## People View

### Live Map

Where everyone is now. Tags walk along corridors, enter rooms through doors and change floors only by elevator or stairs.

- People are coloured by role (doctor, nurse, patient, visitor, caregiver, security) and can be filtered by role.
- People are listed by department, with how many are outside their assigned department.
- Search a name or ID to jump to the person's floor and follow them. The person card shows their department, their location and whether they are inside their assigned department, with a link to their trail.
- Choose 500, 2,000 or 5,000 tags; positions are reported once per second and glide smoothly between reports. A performance panel shows frame rate, frame interval and tags online.

![Live Map](docs/images/tracking.png)

### Route History

Where someone has been. Pick a person and a range of 15, 30 or 60 minutes, and play the trail back at 1×, 4× or 16×.

- The map follows the person from floor to floor while the trail plays.
- Stops are listed with their time, room and duration, and marked when they are outside the person's assigned department. Click a stop to jump to that moment.
- Alerts along the route are listed below the stops.

![Route History](docs/images/trail.png)

### Zone Alerts

One list for department, geofence and status alerts, with who, where, which layer and how severe.

- Acknowledge or resolve each alert, and filter the feed by layer.
- Click the person or device in an alert to jump to its floor and position.

![Zone Alerts](docs/images/alerts.png)

### Location Report Heatmap

Location reports on each floor over the last 1, 5 or 15 minutes, filtered by role, with the three rooms on the floor that have the most reports. Report counts show where tags were, not how many people were there.

![Location Report Heatmap](docs/images/occupancy.png)

### On every page

- Floor switching (1F–5F) across all buildings at once.
- Chinese, English and Japanese, including the room names drawn inside the map.
- Light and dark themes; text meets WCAG AA contrast in both.
- Language and theme are remembered in the browser for the next visit.

## Technical highlights

- **Indoor map SDK with a plugin system.** `definePlugin` declares a plugin and its dependencies; plugins load in dependency order and their APIs are fully typed (`map.plugins.alarm.alarms()`).
- **No leaks by design.** Every source, layer, listener, timer and Worker a plugin creates is registered with a `ResourceTracker` and released in reverse order by `destroy()`. A memory regression test switches through all pages repeatedly and checks the JS heap, Workers and registered resources.
- **Open data format.** Maps use IMDF (OGC Community Standard), validated with zod, including references between features and unique ids. Departments are an extra IMDF file that lists the rooms of each department; validation rejects unknown rooms and rooms claimed by two departments. The fictional hospital is generated by a script, so the data is reproducible.
- **Styles generated from data.** Room colors and 2.5D heights come from the room category and a theme; walls and rooms are extruded with `fill-extrusion`, no 3D models needed. Language and theme switch at runtime without recreating the map.
- **Real-time data off the main thread.** A deterministic, seeded simulator runs in a Web Worker and talks to the page through Comlink. The same ID is always the same person or device, with the same role, department and status schedule.
- **Two-layer alert engine.** Each report is checked against department rules first (outside the assigned department with a grace period, entering another department) and geofences second (forbidden, dwell too long, left the area), with exemptions by department. An alert fires once and resets when the person or device returns.
- **Spatial algorithms.** A Flatbush index plus point-in-polygon checks finds the room and department of every report; interpolated movement with trail history and stop detection; per-room clustering by status; a heatmap that aggregates samples into per-minute grid buckets so memory stays bounded.
- **Tested end to end.** Unit tests run the SDK against an in-memory fake map without WebGL. Playwright tests drive the real pages through test hooks, check contrast in both themes, and measure heap growth through the Chrome DevTools Protocol. GitHub Actions runs everything and deploys to GitHub Pages.

## Tech stack

TypeScript (strict) · MapLibre GL JS · IMDF · zod · Web Worker + Comlink · KDBush · Flatbush · Turf · Vite · pnpm workspaces · Vitest · Playwright · Biome · GitHub Actions + GitHub Pages

## Project structure

| Path | Contents |
| --- | --- |
| `packages/core` | Map creation, plugin system, resource tracking, events, style and theme generation |
| `packages/imdf` | IMDF loading, validation and conversion, including departments |
| `packages/plugins` | Floor, department, position stream, room cluster, trail, alert, cluster, geofence, heatmap, polygon, line, popup and marker plugins |
| `tools/venue-gen` | Generator for the fictional hospital and its departments |
| `tools/rtls-simulator` | Roster of people and devices, movement simulator and its Worker data provider |
| `apps/playground` | The five pages of the live demo |

## Run locally

Requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm build
pnpm --filter playground preview
```

Then open <http://localhost:4173/IndoorKit/>.
