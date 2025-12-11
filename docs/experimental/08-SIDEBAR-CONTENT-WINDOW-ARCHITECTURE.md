# Sidebar & Content Window Architecture

## Overview

The sidebar is the **single point of navigation** for all ZEUS features. When a sidebar button is clicked, the **Content Window** (where MapLibre normally displays) transforms to show the available tools for that lifecycle phase as large, clear buttons. Only when the user selects a specific tool does the actual feature interface appear.

**Key Principle:** Sidebar → Content Window Hub → Feature Interface

---

## Navigation Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NAVIGATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LEVEL 1              LEVEL 2                    LEVEL 3                │
│  Sidebar              Content Window Hub         Feature Interface      │
│  ────────             ──────────────────         ─────────────────      │
│                                                                         │
│  ┌────────┐           ┌─────────────────┐        ┌─────────────────┐   │
│  │PLANNING│──click───▶│ Route Optim.    │─click─▶│ PIRL AI Dialog  │   │
│  │        │           │ Hydraulics      │        │ or              │   │
│  │        │           │ Cost Estimation │        │ Map + Overlay   │   │
│  │        │           │ Compliance      │        │ or              │   │
│  │        │           │ Comparison      │        │ Dashboard       │   │
│  └────────┘           └─────────────────┘        └─────────────────┘   │
│                                                                         │
│  The Content Window becomes a "hub" showing available tools             │
│  for the selected lifecycle phase                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Content Window States

The Content Window has four possible states:

### State 1: Map View (Default)
```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │                    CONTENT WINDOW                          │
├─────────┼────────────────────────────────────────────────────────────┤
│         │                                                            │
│ [PROJ]  │                                                            │
│ [MAP]◀──│                    MapLibre Map                            │
│ [DATA]  │                    (routes, layers, etc.)                  │
│ [PLAN]  │                                                            │
│ [DSGN]  │                                                            │
│ [OPS]   │                                                            │
│ [RES]   │                                                            │
│ [SET]   │                                                            │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘
```

### State 2: Phase Hub (After Sidebar Click)
```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │                    CONTENT WINDOW                          │
├─────────┼────────────────────────────────────────────────────────────┤
│         │                                                            │
│ [PROJ]  │      PLANNING                                              │
│ [MAP]   │      ═══════════════════════════════════════════           │
│ [DATA]  │                                                            │
│ [PLAN]◀─│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│ [DSGN]  │   │   🔀        │  │   💧        │  │   💰        │       │
│ [OPS]   │   │   ROUTE     │  │   HYDRAULICS│  │   COST      │       │
│ [RES]   │   │   OPTIM.    │  │             │  │   ESTIMATE  │       │
│ [SET]   │   │             │  │             │  │             │       │
│         │   └─────────────┘  └─────────────┘  └─────────────┘       │
│         │                                                            │
│         │   ┌─────────────┐  ┌─────────────┐                        │
│         │   │   ✓         │  │   ⚖️        │                        │
│         │   │   COMPLIANCE│  │   ROUTE     │                        │
│         │   │   CHECK     │  │   COMPARE   │                        │
│         │   │             │  │             │                        │
│         │   └─────────────┘  └─────────────┘                        │
│         │                                                            │
│         │   ← Back to Map                                            │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘
```

### State 3: Feature Interface (After Tool Selection)
```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │                    CONTENT WINDOW                          │
├─────────┼────────────────────────────────────────────────────────────┤
│         │  ← Back to Planning                                        │
│ [PROJ]  │                                                            │
│ [MAP]   │  ┌────────────────────────────────────────────────────┐   │
│ [DATA]  │  │                                                    │   │
│ [PLAN]◀─│  │           Feature-Specific Interface               │   │
│ [DSGN]  │  │                                                    │   │
│ [OPS]   │  │   Could be:                                        │   │
│ [RES]   │  │   - Dialog (PIRL AI, Cost Estimation)              │   │
│ [SET]   │  │   - Map with overlays (Compliance, Hydraulics)     │   │
│         │  │   - 3D Viewer (Design, Digital Twin)               │   │
│         │  │   - Dashboard (SCADA, Leak Detection)              │   │
│         │  │   - Split view (Comparison)                        │   │
│         │  │                                                    │   │
│         │  └────────────────────────────────────────────────────┘   │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘
```

### State 4: Full View (No Sidebar - Optional)
For immersive experiences like 3D Design or SCADA Dashboard:
```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰ │                      FULL CONTENT WINDOW                         │
├───┼──────────────────────────────────────────────────────────────────┤
│   │                                                                  │
│   │                                                                  │
│   │              Full-screen 3D Viewer / Dashboard                   │
│   │                                                                  │
│   │              Sidebar collapsed to hamburger menu                 │
│   │                                                                  │
│   │                                                                  │
│   │                                                                  │
│   │                                                                  │
│   │                                                                  │
└───┴──────────────────────────────────────────────────────────────────┘
```

---

## Phase Hub Designs

### PROJECT Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                          PROJECT                                     │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌────────────────────┐    ┌────────────────────┐                   │
│  │        📋         │    │        👥         │                   │
│  │                    │    │                    │                   │
│  │   PROFILE &        │    │   TEAM &           │                   │
│  │   SETTINGS         │    │   PERMISSIONS      │                   │
│  │                    │    │                    │                   │
│  │   Project metadata,│    │   Manage users,    │                   │
│  │   CRS, preferences │    │   roles, access    │                   │
│  └────────────────────┘    └────────────────────┘                   │
│                                                                      │
│  ┌────────────────────┐    ┌────────────────────┐                   │
│  │        📝         │    │        📊         │                   │
│  │                    │    │                    │                   │
│  │   REVIEW           │    │   AUDIT            │                   │
│  │   WORKFLOW         │    │   LOG              │                   │
│  │                    │    │                    │                   │
│  │   Submit, approve, │    │   Activity history,│                   │
│  │   track reviews    │    │   changes, exports │                   │
│  └────────────────────┘    └────────────────────┘                   │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### DATA Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                            DATA                                      │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌────────────────────┐    ┌────────────────────┐                   │
│  │        🛰️         │    │        📍         │                   │
│  │                    │    │                    │                   │
│  │   RASTER           │    │   VECTOR           │                   │
│  │   DATASETS         │    │   LAYERS           │                   │
│  │                    │    │                    │                   │
│  │   DEM, Landcover,  │    │   Boundaries,      │                   │
│  │   Imagery          │    │   Infrastructure   │                   │
│  └────────────────────┘    └────────────────────┘                   │
│                                                                      │
│  ┌────────────────────┐    ┌────────────────────┐                   │
│  │        📥         │    │        🔗         │                   │
│  │                    │    │                    │                   │
│  │   IMPORT /         │    │   EXTERNAL         │                   │
│  │   EXPORT           │    │   SOURCES          │                   │
│  │                    │    │                    │                   │
│  │   Upload files,    │    │   SCADA feeds,     │                   │
│  │   export data      │    │   GIS services     │                   │
│  └────────────────────┘    └────────────────────┘                   │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### PLANNING Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                          PLANNING                                    │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │     🔀     │  │     💧     │  │     💰     │                  │
│  │             │  │             │  │             │                  │
│  │   ROUTE     │  │ HYDRAULICS  │  │   COST      │                  │
│  │   OPTIM.    │  │             │  │ ESTIMATION  │                  │
│  │             │  │             │  │             │                  │
│  │  AI-powered │  │  Flow, pump │  │  AI-driven  │                  │
│  │  PIRL       │  │  stations   │  │  estimate   │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐                                   │
│  │     ✓      │  │     ⚖️     │                                   │
│  │             │  │             │                                   │
│  │ COMPLIANCE  │  │   ROUTE     │                                   │
│  │   CHECK     │  │  COMPARE    │                                   │
│  │             │  │             │                                   │
│  │  HCA, regs, │  │  Side-by-   │                                   │
│  │  permits    │  │  side       │                                   │
│  └─────────────┘  └─────────────┘                                   │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### DESIGN Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                           DESIGN                                     │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │     🎨     │  │     🔧     │  │     📄     │                  │
│  │             │  │             │  │             │                  │
│  │   3D        │  │ COMPONENTS  │  │DELIVERABLES │                  │
│  │   MODEL     │  │ & FITTINGS  │  │             │                  │
│  │             │  │             │  │             │                  │
│  │  Pipeline   │  │  Valves,    │  │  P&IDs,     │                  │
│  │  viewer     │  │  bends      │  │  ISOs, BOMs │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐                                   │
│  │     ✅     │  │     🛒     │                                   │
│  │             │  │             │                                   │
│  │ VALIDATION  │  │PROCUREMENT  │                                   │
│  │             │  │             │                                   │
│  │             │  │             │                                   │
│  │  Clash,     │  │  RFQs,      │                                   │
│  │  stress     │  │  vendors    │                                   │
│  └─────────────┘  └─────────────┘                                   │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### OPERATIONS Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                         OPERATIONS                                   │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │     🎮     │  │     📊     │  │     🔍     │                  │
│  │             │  │             │  │             │                  │
│  │  DIGITAL    │  │   SCADA     │  │ INTEGRITY   │                  │
│  │   TWIN      │  │ DASHBOARD   │  │             │                  │
│  │             │  │             │  │             │                  │
│  │  Live 3D    │  │  Real-time  │  │  ILI data,  │                  │
│  │  state      │  │  monitoring │  │  anomalies  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐                                   │
│  │     🚨     │  │     📈     │                                   │
│  │             │  │             │                                   │
│  │   LEAK      │  │  WHAT-IF    │                                   │
│  │ DETECTION   │  │ SCENARIOS   │                                   │
│  │             │  │             │                                   │
│  │  Alarms,    │  │  Simulate   │                                   │
│  │  response   │  │  scenarios  │                                   │
│  └─────────────┘  └─────────────┘                                   │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### RESOURCES Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                         RESOURCES                                    │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │     🏭     │  │     📅     │  │     💵     │                  │
│  │             │  │             │  │             │                  │
│  │ SUPPLIERS   │  │  SCHEDULE   │  │   BUDGET    │                  │
│  │             │  │             │  │             │                  │
│  │             │  │             │  │             │                  │
│  │  Search,    │  │  Milestones,│  │  Tracking,  │                  │
│  │  manage     │  │  Gantt      │  │  forecasts  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐                                   │
│  │     📊     │  │     🔌     │                                   │
│  │             │  │             │                                   │
│  │  REPORTS    │  │INTEGRATIONS │                                   │
│  │             │  │             │                                   │
│  │             │  │             │                                   │
│  │  Analytics, │  │  SAP,       │                                   │
│  │  KPIs       │  │  Oracle     │                                   │
│  └─────────────┘  └─────────────┘                                   │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### SETTINGS Hub
```
┌──────────────────────────────────────────────────────────────────────┐
│                          SETTINGS                                    │
│  ════════════════════════════════════════════════════════════════    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │     👤     │  │     🔗     │  │     🔑     │                  │
│  │             │  │             │  │             │                  │
│  │   USER      │  │   SCADA     │  │   API       │                  │
│  │PREFERENCES  │  │CONNECTIONS  │  │   KEYS      │                  │
│  │             │  │             │  │             │                  │
│  │  Theme,     │  │  OPC-UA,    │  │  External   │                  │
│  │  units      │  │  Modbus     │  │  access     │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌─────────────┐                                                    │
│  │     🏢     │                                                    │
│  │             │                                                    │
│  │   TENANT    │   (Admin only)                                     │
│  │   ADMIN     │                                                    │
│  │             │                                                    │
│  │  Users,     │                                                    │
│  │  billing    │                                                    │
│  └─────────────┘                                                    │
│                                                                      │
│  ← Back to Map                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Feature Interface Types

When a tool button is clicked in the Hub, it opens one of these interface types:

### Type 1: Dialog (Modal)
For complex workflows with multiple steps.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                     ┌─────────────────────────┐                      │
│                     │    PIRL AI DIALOG       │                      │
│                     │                         │                      │
│   (Map dimmed       │   Multi-step wizard     │                      │
│    behind)          │   for route optimization│                      │
│                     │                         │                      │
│                     │   [Step 1] [Step 2] ... │                      │
│                     │                         │                      │
│                     │   [Cancel]  [Continue]  │                      │
│                     └─────────────────────────┘                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

Use for: PIRL AI, Cost Estimation, Deliverables Generation, RFQ Creation
```

### Type 2: Map with Overlay/Panel
For features that visualize data on the map.

```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │           MAP + PANEL                                      │
├─────────┼────────────────────────────────────────────────────────────┤
│         │  ← Back to Planning                                        │
│         │                                                            │
│ [PLAN]◀─│   ┌──────────────────────────────┬────────────────────┐   │
│         │   │                              │                    │   │
│         │   │      Map with HCA            │  COMPLIANCE        │   │
│         │   │      zones highlighted       │  PANEL             │   │
│         │   │                              │                    │   │
│         │   │      ████ Class 3            │  ✓ HCA Analysis    │   │
│         │   │      ░░░░ Wetlands           │  ✓ Setbacks        │   │
│         │   │                              │  ⚠ 2 Issues        │   │
│         │   │                              │                    │   │
│         │   └──────────────────────────────┴────────────────────┘   │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘

Use for: Compliance Check, Hydraulics Results, Route Comparison, Integrity Map
```

### Type 3: Full View (Replaces Map)
For immersive interfaces that need the full space.

```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │             3D VIEWER                                      │
├─────────┼────────────────────────────────────────────────────────────┤
│         │  ← Back to Design                                          │
│         │                                                            │
│ [DSGN]◀─│   ┌──────────────────────────────────────────────────┐    │
│         │   │                                                  │    │
│         │   │                                                  │    │
│         │   │           3D Pipeline Model                      │    │
│         │   │           (Three.js / OpenCASCADE view)          │    │
│         │   │                                                  │    │
│         │   │                                                  │    │
│         │   │                                                  │    │
│         │   └──────────────────────────────────────────────────┘    │
│         │   [Orbit] [Pan] [Zoom] [Reset] │ Component: Valve V-123   │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘

Use for: 3D Model, Digital Twin, SCADA Dashboard
```

### Type 4: Dashboard
For monitoring and analytics with multiple widgets.

```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │             SCADA DASHBOARD                                │
├─────────┼────────────────────────────────────────────────────────────┤
│         │  ← Back to Operations                                      │
│         │                                                            │
│ [OPS]◀──│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│         │  │ PRESSURE     │  │ FLOW RATE    │  │ TEMPERATURE  │     │
│         │  │ 52.3 bar     │  │ 1,234 m³/h   │  │ 23.5°C       │     │
│         │  │ ▁▂▃▄▅▆▇█    │  │ ▁▂▃▄▅▆▇█    │  │ ▁▂▃▄▅▆▇█    │     │
│         │  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                                                            │
│         │  ┌────────────────────────────────────────────────────┐   │
│         │  │ ACTIVE ALARMS                                      │   │
│         │  │ ⚠ High pressure at KP 45.3 (14:32)                │   │
│         │  │ ⚠ Valve V-23 position mismatch (14:28)            │   │
│         │  └────────────────────────────────────────────────────┘   │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘

Use for: SCADA Dashboard, Leak Detection, Reports & Analytics
```

### Type 5: Split View
For side-by-side comparison.

```
┌──────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │             ROUTE COMPARISON                               │
├─────────┼────────────────────────────────────────────────────────────┤
│         │  ← Back to Planning                                        │
│         │                                                            │
│ [PLAN]◀─│  ┌─────────────────────┬─────────────────────┐            │
│         │  │     ROUTE A         │     ROUTE B         │            │
│         │  ├─────────────────────┼─────────────────────┤            │
│         │  │                     │                     │            │
│         │  │   [Map View]        │   [Map View]        │            │
│         │  │                     │                     │            │
│         │  ├─────────────────────┼─────────────────────┤            │
│         │  │ Length: 145 km      │ Length: 152 km      │            │
│         │  │ Cost: $42M          │ Cost: $38M          │            │
│         │  │ HCAs: 3             │ HCAs: 5             │            │
│         │  └─────────────────────┴─────────────────────┘            │
│         │                                                            │
│         │  [Select Route A]  [Select Route B]  [Add Route C]        │
│         │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘

Use for: Route Comparison
```

---

## Implementation Component Structure

### PhaseHub Component
```typescript
// components/PhaseHub/PhaseHub.tsx

interface PhaseHubProps {
  phase: 'project' | 'data' | 'planning' | 'design' | 'operations' | 'resources' | 'settings';
  onToolSelect: (tool: string) => void;
  onBack: () => void;
}

export function PhaseHub({ phase, onToolSelect, onBack }: PhaseHubProps) {
  const tools = getToolsForPhase(phase);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b">
        <button onClick={onBack} className="text-muted-foreground hover:text-white">
          ← Back to Map
        </button>
        <h1 className="text-2xl font-bold mt-4 uppercase tracking-wider">
          {phase}
        </h1>
        <div className="h-0.5 w-full bg-primary/50 mt-2" />
      </div>

      {/* Tool Grid */}
      <div className="flex-1 p-8">
        <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto">
          {tools.map((tool) => (
            <ToolButton
              key={tool.id}
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
              onClick={() => onToolSelect(tool.id)}
              disabled={tool.disabled}
              comingSoon={tool.comingSoon}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### ToolButton Component
```typescript
// components/PhaseHub/ToolButton.tsx

interface ToolButtonProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}

export function ToolButton({
  icon,
  title,
  description,
  onClick,
  disabled,
  comingSoon
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative p-6 rounded-lg border transition-all duration-300",
        "flex flex-col items-center text-center",
        "hover:border-primary/50 hover:bg-primary/5",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
      )}
    >
      {/* Icon */}
      <div className="text-4xl mb-4 text-primary">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold mb-2">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {description}
      </p>

      {/* Coming Soon Badge */}
      {comingSoon && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs text-yellow-500">
          Coming Soon
        </div>
      )}
    </button>
  );
}
```

### Navigation State Management
```typescript
// lib/stores/navigationStore.ts

interface NavigationState {
  // Current sidebar selection
  activePhase: 'map' | 'project' | 'data' | 'planning' | 'design' | 'operations' | 'resources' | 'settings' | null;

  // Current tool within phase (null = showing hub)
  activeTool: string | null;

  // Content window state
  contentState: 'map' | 'hub' | 'feature';

  // Actions
  selectPhase: (phase: string) => void;
  selectTool: (tool: string) => void;
  backToHub: () => void;
  backToMap: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activePhase: 'map',
  activeTool: null,
  contentState: 'map',

  selectPhase: (phase) => set({
    activePhase: phase,
    activeTool: null,
    contentState: phase === 'map' ? 'map' : 'hub'
  }),

  selectTool: (tool) => set({
    activeTool: tool,
    contentState: 'feature'
  }),

  backToHub: () => set({
    activeTool: null,
    contentState: 'hub'
  }),

  backToMap: () => set({
    activePhase: 'map',
    activeTool: null,
    contentState: 'map'
  })
}));
```

---

## Tool Configuration by Phase

```typescript
// config/phaseTools.ts

export const phaseTools = {
  project: [
    { id: 'profile', title: 'Profile & Settings', description: 'Project metadata, CRS, preferences', icon: '📋', type: 'dialog' },
    { id: 'team', title: 'Team & Permissions', description: 'Manage users, roles, access', icon: '👥', type: 'dialog', comingSoon: true },
    { id: 'review', title: 'Review Workflow', description: 'Submit, approve, track reviews', icon: '📝', type: 'panel', comingSoon: true },
    { id: 'audit', title: 'Audit Log', description: 'Activity history, changes, exports', icon: '📊', type: 'dialog', comingSoon: true },
  ],

  data: [
    { id: 'rasters', title: 'Raster Datasets', description: 'DEM, Landcover, Imagery', icon: '🛰️', type: 'dialog' },
    { id: 'vectors', title: 'Vector Layers', description: 'Boundaries, Infrastructure', icon: '📍', type: 'dialog' },
    { id: 'import-export', title: 'Import / Export', description: 'Upload files, export data', icon: '📥', type: 'dialog' },
    { id: 'external', title: 'External Sources', description: 'SCADA feeds, GIS services', icon: '🔗', type: 'dialog', comingSoon: true },
  ],

  planning: [
    { id: 'route-optim', title: 'Route Optimization', description: 'AI-powered PIRL routing', icon: '🔀', type: 'dialog' },
    { id: 'hydraulics', title: 'Hydraulics', description: 'Flow, pressure, pump stations', icon: '💧', type: 'map-panel', comingSoon: true },
    { id: 'cost', title: 'Cost Estimation', description: 'AI-driven cost estimate', icon: '💰', type: 'dialog', comingSoon: true },
    { id: 'compliance', title: 'Compliance Check', description: 'HCA, regulations, permits', icon: '✓', type: 'map-overlay', comingSoon: true },
    { id: 'comparison', title: 'Route Comparison', description: 'Side-by-side analysis', icon: '⚖️', type: 'split-view', comingSoon: true },
  ],

  design: [
    { id: '3d-model', title: '3D Model', description: 'Pipeline 3D viewer', icon: '🎨', type: 'full-view', comingSoon: true },
    { id: 'components', title: 'Components & Fittings', description: 'Valves, bends, equipment', icon: '🔧', type: 'panel', comingSoon: true },
    { id: 'deliverables', title: 'Deliverables', description: 'P&IDs, ISOs, BOMs', icon: '📄', type: 'dialog', comingSoon: true },
    { id: 'validation', title: 'Validation', description: 'Clash, stress, compliance', icon: '✅', type: 'panel', comingSoon: true },
    { id: 'procurement', title: 'Procurement', description: 'RFQs, vendors, orders', icon: '🛒', type: 'dialog', comingSoon: true },
  ],

  operations: [
    { id: 'digital-twin', title: 'Digital Twin', description: 'Live 3D state visualization', icon: '🎮', type: 'full-view' },
    { id: 'scada', title: 'SCADA Dashboard', description: 'Real-time monitoring', icon: '📊', type: 'dashboard', comingSoon: true },
    { id: 'integrity', title: 'Integrity', description: 'ILI data, anomalies, risk', icon: '🔍', type: 'map-panel', comingSoon: true },
    { id: 'leak-detection', title: 'Leak Detection', description: 'Alarms, events, response', icon: '🚨', type: 'dashboard', comingSoon: true },
    { id: 'scenarios', title: 'What-If Scenarios', description: 'Simulate operations', icon: '📈', type: 'full-view', comingSoon: true },
  ],

  resources: [
    { id: 'suppliers', title: 'Suppliers', description: 'Search, manage suppliers', icon: '🏭', type: 'full-view' },
    { id: 'schedule', title: 'Schedule', description: 'Milestones, Gantt chart', icon: '📅', type: 'full-view', comingSoon: true },
    { id: 'budget', title: 'Budget', description: 'Cost tracking, forecasts', icon: '💵', type: 'dashboard', comingSoon: true },
    { id: 'reports', title: 'Reports', description: 'Analytics, KPIs, exports', icon: '📊', type: 'dashboard', comingSoon: true },
    { id: 'integrations', title: 'Integrations', description: 'SAP, Oracle, SharePoint', icon: '🔌', type: 'dialog', comingSoon: true },
  ],

  settings: [
    { id: 'preferences', title: 'User Preferences', description: 'Theme, units, defaults', icon: '👤', type: 'dialog' },
    { id: 'scada-config', title: 'SCADA Connections', description: 'OPC-UA, Modbus config', icon: '🔗', type: 'dialog', comingSoon: true },
    { id: 'api-keys', title: 'API Keys', description: 'External access tokens', icon: '🔑', type: 'dialog', comingSoon: true },
    { id: 'tenant-admin', title: 'Tenant Admin', description: 'Users, billing (admin only)', icon: '🏢', type: 'dialog', comingSoon: true },
  ],
};
```

---

## MainLayout Integration

```typescript
// components/layout/MainLayout.tsx

export function MainLayout({ children }: MainLayoutProps) {
  const { activePhase, activeTool, contentState, selectPhase, selectTool, backToHub, backToMap } = useNavigationStore();

  const renderContent = () => {
    switch (contentState) {
      case 'map':
        return children; // MapViewer

      case 'hub':
        return (
          <PhaseHub
            phase={activePhase}
            onToolSelect={selectTool}
            onBack={backToMap}
          />
        );

      case 'feature':
        return (
          <FeatureRenderer
            phase={activePhase}
            tool={activeTool}
            onBack={backToHub}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar
        activePhase={activePhase}
        onPhaseSelect={selectPhase}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 relative overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
```

---

## Migration Path from Current State

### Current Sidebar Items → New Phase Mapping

| Current Item | New Phase | Notes |
|--------------|-----------|-------|
| Project Profile | PROJECT → Profile & Settings | Move to Project hub |
| Map View | MAP | Sidebar button returns to map |
| Project Management | RESOURCES → Suppliers | Rename phase |
| Digital Twin | OPERATIONS → Digital Twin | Move to Operations hub |
| Datasets | DATA → Raster Datasets | Move to Data hub |
| PIRL AI | PLANNING → Route Optimization | Move to Planning hub |
| Settings | SETTINGS → User Preferences | Move to Settings hub |

### Implementation Order

1. **Phase 1A**: Refactor sidebar to use new navigation store
2. **Phase 1B**: Implement PhaseHub component
3. **Phase 1C**: Move existing features into hubs
4. **Phase 1D**: Add "Coming Soon" placeholders for future features
5. **Phase 2+**: Implement new features as they're developed

---

*Document Version: 1.0*
*Last Updated: December 2024*
