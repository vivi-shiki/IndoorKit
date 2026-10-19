# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

可以，先按照这部分内容写测试，先写测试，后实现具体需求

验收条件：
1、测试通过
2、各个页面正确显示

(The content is the presentation outline「IndoorKit 展示大纲：效能定位 × 人员定位」第 2 版: department data, the two-layer alarm rule (department range first, then custom fences), the efficiency pages E1–E4 and the people pages P1–P4.)

# UPDATES

# TEST [CONFIRMED]

Functional tests only; frame-rate and timing thresholds are out of scope.

Unit tests (Vitest, FakeMap, no WebGL):

- `packages/imdf`: the optional `department` file is validated (unknown unit, a unit in two departments) and exposed as `VenueModel.departments`; unit features carry `department_id`.
- `tools/venue-gen`: every named room belongs to exactly one department, corridors and service units belong to none, departments have several units and some span floors.
- `packages/plugins/venue-index`: a coordinate resolves to its unit and department, public areas resolve to no department.
- `tools/rtls-simulator`: the roster is deterministic and gives every person and asset a department; asset status follows its schedule and is reported in positions; people stay mostly in their own department; fixed assets never move.
- `packages/plugins/alarm`: department layer before fence layer; outside-own with grace, enter-other, forbid with exempt departments, dwell, leave, status transitions; no repeats.
- `packages/plugins`: unit-cluster groups by unit with the worst status, department ranges and highlight, trail playback and stop detection, position-stream decoration and filter, heatmap groups.

End-to-end tests (Playwright, `window.__vivi`):

- The gallery shows two groups (efficiency, people) with five pages.
- Asset overview: unit clusters on the current floor, department list, unit drawer, asset detail, search.
- People tracking: roles, department list, search and follow, person card.
- Trail replay: history, timeline, playback switches floors, stop list.
- Zone alerts: department and fence alarms, handling states, preset fences.
- Occupancy: role filter and the busiest areas.
- Every page renders its map content in light and dark themes and in three languages; leak-bench passes with the new pages.

# PROPOSALS

## 1. Data layer: departments and a shared roster [CONFIRMED]

- IMDF gets an optional `department` file (code, name, unit_ids); validation rejects unknown units and units in two departments. `VenueModel.departments` and `department_id` on units.
- venue-gen assigns every named room to one of 11 departments; corridors and service units stay public.
- rtls-simulator `createRoster`: each person and asset depends only on its index (same id, same entity, any population size). Assets carry a 24-hour status schedule, reported with every position; people carry a role and a department and spend most of their time there.
- Outcome: unit tests pass.

## 2. Plugins [CONFIRMED]

- `createVenueIndex`: coordinate → unit and department.
- `alarmPlugin` / `createAlarmEngine`: department layer first (outside-own with grace, enter-other), then fences (forbid, dwell, leave, selectors, exempt departments), plus status alarms (asset offline, person SOS) on transitions only.
- `unitClusterPlugin`, `departmentPlugin`, `trailPlugin` (+ `detectStops`), position-stream `decorate` / `circleColor` / `setFilter` / `latest`, heatmap `groupOf` / `setGroups`.
- Outcome: unit tests pass; every layer starts with `indoor-`; leak-bench passes.

## 3. Playground pages [CONFIRMED]

- Gallery: two groups, 效能定位系统 (asset overview) and 人员定位系统 (tracking, trail, alerts, occupancy).
- Asset overview: unit clusters coloured by the worst status, department list with units, unit drawer, asset detail with today's status timeline and moves, search, status and type filters, department range toggle.
- Tracking: role colours and filter, people by department, search and follow, person card linking to the trail.
- Trail: 200 people, the first simulated 60 minutes computed in the page in chunks; range, speed, seek, stops and alarms on the way.
- Alerts: one feed for department, fence and status alarms; acknowledge / resolve; layer filter; locate the subject.
- Occupancy: heat by role and the three busiest units on the floor.
- Outcome: `pnpm verify` 215 tests pass; e2e and leak-bench 61 tests pass.

## 4. Fixes found by looking at the pages [CONFIRMED]

- The left panel covered the west building: map pages with a panel fit the venue into the space beside it.
- Same-named rooms in buildings A, B and C read identically: names repeated across the buildings on a floor get the building prefix (A栋 急诊).
- Trail stops were placed on the corridor step before entering a room: a stop now uses its middle sample (test added first).
- The alerts feed missed alarms raised inside the throttle window: it now redraws after each position report.
