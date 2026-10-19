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
