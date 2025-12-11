# UI/UX Integration Guidelines

## Overview

Guidelines for integrating new features into the ZEUS GUI while maintaining the core principles of **minimalism** and **simplicity in operation**. Every new feature must enhance—not complicate—the user experience.

**Core Philosophy:** Pipeline engineers are experts in their domain, not in software. The UI should disappear, leaving only the work.

**Navigation Model:** See `08-SIDEBAR-CONTENT-WINDOW-ARCHITECTURE.md` for the complete sidebar and content window navigation architecture.

---

## Core Navigation Architecture

The UI follows a three-level navigation pattern:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR (Level 1)  →  CONTENT WINDOW HUB (Level 2)  →  FEATURE (Level 3)│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks         Content window shows      User clicks tool        │
│  phase button   →    large tool buttons   →    to access feature       │
│  (e.g., PLANNING)    for that phase            (e.g., PIRL Dialog)     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Rules:**
1. Sidebar buttons represent **pipeline lifecycle phases** (Project, Data, Planning, Design, Operations, Resources, Settings)
2. Clicking a sidebar button shows the **Phase Hub** in the Content Window with available tools as large buttons
3. Clicking a tool button opens the **Feature Interface** (dialog, map overlay, viewer, dashboard, etc.)
4. Map View is always accessible via the MAP sidebar button
5. Back navigation returns to previous level (Feature → Hub → Map)

---

## Design Principles

### 1. Progressive Disclosure

**Rule:** Show only what's needed at each moment. Hide complexity until the user asks for it.

```
┌────────────────────────────────────────────────────────────┐
│  Level 1: Summary (Always Visible)                         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Hydraulics: Pass  │  Cost: $45.2M  │  HCA: 2 found │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ↓ Click                           │
│  Level 2: Details (On Demand)                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Pressure Profile Chart                                │ │
│  │ Velocity Warnings                                     │ │
│  │ Station Recommendations                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ↓ Click                           │
│  Level 3: Expert (Deep Dive)                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Full solver output                                    │ │
│  │ Equation parameters                                   │ │
│  │ Sensitivity analysis                                  │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
// BAD: Everything visible at once
<div>
  <PressureChart data={pressureData} />
  <VelocityChart data={velocityData} />
  <FlowChart data={flowData} />
  <SolverDetails solver={solverOutput} />
  <EquationParameters params={equationParams} />
  ...
</div>

// GOOD: Progressive disclosure
<div>
  <SummaryCard>
    <StatusBadge status={hydraulics.status} />
    <KeyMetric label="Max Pressure" value={hydraulics.maxPressure} />
  </SummaryCard>

  <Collapsible title="Hydraulic Details">
    <PressureChart data={pressureData} />
    <VelocityWarnings warnings={velocityWarnings} />
  </Collapsible>

  <AdvancedSection requiredRole="lead_engineer">
    <SolverDetails solver={solverOutput} />
  </AdvancedSection>
</div>
```

### 2. Context Preservation

**Rule:** Never take the user away from their context. New features appear alongside existing work.

```
┌─────────────────────────────────────────────────────────────┐
│ Map View (Primary Context)                                  │
│ ┌─────────────────────────────────────────┬───────────────┐ │
│ │                                         │               │ │
│ │                                         │  Slide-Out    │ │
│ │           Route on Map                  │    Panel      │ │
│ │                                         │               │ │
│ │                                         │  Hydraulics   │ │
│ │                                         │  Results      │ │
│ │                                         │               │ │
│ └─────────────────────────────────────────┴───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              NOT
┌─────────────────────────────────────────────────────────────┐
│ Separate Hydraulics Page (Lost Context)                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │                  Full-screen charts                     │ │
│ │                  No map visible                         │ │
│ │                  Can't see route                        │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Implementation patterns:**
```typescript
// Slide-out panels for detail views
<MapContainer>
  <Route geometry={route.geometry} />

  <SlideOutPanel
    isOpen={showHydraulics}
    position="right"
    width="400px"
  >
    <HydraulicResults results={hydraulicData} />
  </SlideOutPanel>
</MapContainer>

// Overlays for visualization modes
<MapContainer>
  <Route geometry={route.geometry} />

  {showPressureOverlay && (
    <RouteOverlay
      data={pressureProfile}
      colorScale="viridis"
      legend="Pressure (bar)"
    />
  )}
</MapContainer>

// Modals only for focused tasks
<Modal
  isOpen={showExportDialog}
  title="Export Deliverables"
  onClose={() => setShowExportDialog(false)}
>
  <ExportOptions />
</Modal>
```

### 3. Single Source of Truth

**Rule:** Each piece of information appears in exactly one place. No duplication.

```
┌─────────────────────────────────────────────────────────────┐
│                     Project Header                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │  Project: Alpha Pipeline  │  Status: In Design  │ 45km │ │
│ └─────────────────────────────────────────────────────────┘ │
│                        ↓                                    │
│              All views reference this                       │
│         Never duplicate project name or status              │
└─────────────────────────────────────────────────────────────┘
```

### 4. Intelligent Defaults

**Rule:** The system should work without configuration. Sane defaults for everything.

```typescript
// BAD: Require configuration before use
const runHydraulics = async () => {
  // Throws error if fluid not configured
  if (!project.fluidConfig) {
    throw new Error("Configure fluid properties first");
  }
};

// GOOD: Intelligent defaults
const runHydraulics = async () => {
  const fluidConfig = project.fluidConfig ?? inferFluidFromProjectType(project.type);
  // Proceeds with sensible default (crude oil for liquid, natural gas for gas)
};
```

**Default values:**

| Setting | Default | Rationale |
|---------|---------|-----------|
| Fluid type | Based on project type | Most common case |
| Operating temperature | 15°C (59°F) | Standard conditions |
| Units | SI (metric) | International standard |
| Map basemap | Satellite | Best for route planning |
| Export format | PDF | Universal compatibility |

---

## Component Patterns

### Status Indicators

```typescript
/**
 * Consistent status representation across all features.
 */
type Status = 'pending' | 'running' | 'success' | 'warning' | 'error';

const StatusBadge: React.FC<{ status: Status; label: string }> = ({ status, label }) => {
  const colors = {
    pending: 'gray',
    running: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red'
  };

  const icons = {
    pending: <ClockIcon />,
    running: <SpinnerIcon />,
    success: <CheckIcon />,
    warning: <WarningIcon />,
    error: <ErrorIcon />
  };

  return (
    <Badge color={colors[status]}>
      {icons[status]} {label}
    </Badge>
  );
};
```

**Usage:**
```typescript
// Hydraulics status
<StatusBadge status={hydraulics.converged ? 'success' : 'error'} label="Hydraulics" />

// Compliance status
<StatusBadge status={compliance.hasViolations ? 'warning' : 'success'} label="Compliance" />

// Cost estimate status
<StatusBadge status={cost.confidence > 0.7 ? 'success' : 'warning'} label="Cost" />
```

### Results Cards

```typescript
/**
 * Standard card for displaying analysis results.
 */
const ResultCard: React.FC<ResultCardProps> = ({
  title,
  status,
  summary,
  details,
  actions
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader onClick={() => setExpanded(!expanded)}>
        <Title>{title}</Title>
        <StatusBadge status={status} />
        <ChevronIcon direction={expanded ? 'up' : 'down'} />
      </CardHeader>

      <CardSummary>
        {summary}
      </CardSummary>

      {expanded && (
        <CardDetails>
          {details}
        </CardDetails>
      )}

      {actions && (
        <CardActions>
          {actions}
        </CardActions>
      )}
    </Card>
  );
};
```

**Usage:**
```typescript
<ResultCard
  title="Hydraulic Analysis"
  status={hydraulics.status}
  summary={
    <MetricRow>
      <Metric label="Max Pressure" value="52.3 bar" />
      <Metric label="Max Velocity" value="1.8 m/s" />
    </MetricRow>
  }
  details={<PressureProfileChart data={hydraulics.profile} />}
  actions={
    <ButtonGroup>
      <Button onClick={rerunAnalysis}>Re-run</Button>
      <Button onClick={exportResults}>Export</Button>
    </ButtonGroup>
  }
/>
```

### Map Overlays

```typescript
/**
 * Consistent overlay toggle pattern.
 */
const MapOverlayControls: React.FC = () => {
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());

  const overlays = [
    { id: 'pressure', label: 'Pressure', icon: <PressureIcon /> },
    { id: 'velocity', label: 'Velocity', icon: <VelocityIcon /> },
    { id: 'elevation', label: 'Elevation', icon: <ElevationIcon /> },
    { id: 'hca', label: 'HCA Zones', icon: <HCAIcon /> },
  ];

  return (
    <OverlayPanel>
      <PanelTitle>Layers</PanelTitle>
      {overlays.map(overlay => (
        <ToggleButton
          key={overlay.id}
          active={activeOverlays.has(overlay.id)}
          onClick={() => toggleOverlay(overlay.id)}
        >
          {overlay.icon}
          <span>{overlay.label}</span>
        </ToggleButton>
      ))}
    </OverlayPanel>
  );
};
```

### Data Tables

```typescript
/**
 * Standard table for data display with sorting/filtering.
 */
const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available"
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');

  // ... sorting and filtering logic

  return (
    <TableContainer>
      <SearchInput
        placeholder="Filter..."
        value={filter}
        onChange={setFilter}
      />

      <Table>
        <TableHeader>
          {columns.map(col => (
            <HeaderCell
              key={col.id}
              onClick={() => handleSort(col.id)}
              sortable={col.sortable}
              sorted={sortColumn === col.id}
              direction={sortDirection}
            >
              {col.label}
            </HeaderCell>
          ))}
        </TableHeader>

        <TableBody>
          {filteredData.length === 0 ? (
            <EmptyRow>{emptyMessage}</EmptyRow>
          ) : (
            filteredData.map(row => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row)}
                clickable={!!onRowClick}
              >
                {columns.map(col => (
                  <TableCell key={col.id}>
                    {col.render ? col.render(row[col.id], row) : row[col.id]}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
```

---

## Feature Integration Patterns

### Adding a New Analysis Type

When adding a new analysis feature (like hydraulics, cost estimation, etc.):

**Step 1: Add to project sidebar**
```typescript
// In ProjectSidebar.tsx
const analysisSections = [
  { id: 'route', label: 'Route', icon: <RouteIcon /> },
  { id: 'hydraulics', label: 'Hydraulics', icon: <WaterIcon /> },
  { id: 'cost', label: 'Cost', icon: <DollarIcon /> },
  { id: 'compliance', label: 'Compliance', icon: <ShieldIcon /> },
  // New analysis type
  { id: 'stress', label: 'Stress', icon: <StressIcon /> },
];
```

**Step 2: Create result card component**
```typescript
// In components/Project/StressAnalysis.tsx
export const StressAnalysisCard: React.FC<Props> = ({ projectId }) => {
  const { data, isLoading, run } = useStressAnalysis(projectId);

  return (
    <ResultCard
      title="Stress Analysis"
      status={data?.status ?? 'pending'}
      summary={<StressSummary data={data} />}
      details={<StressDetails data={data} />}
      actions={
        <Button onClick={run} loading={isLoading}>
          Run Analysis
        </Button>
      }
    />
  );
};
```

**Step 3: Add map overlay if applicable**
```typescript
// In MapContainer.tsx overlays array
{ id: 'stress', label: 'Stress', render: (data) => <StressOverlay data={data} /> }
```

**Step 4: Add to export options**
```typescript
// In ExportDialog.tsx
const exportTypes = [
  { id: 'route_kml', label: 'Route (KML)' },
  { id: 'hydraulics_pdf', label: 'Hydraulics Report' },
  // New export
  { id: 'stress_pdf', label: 'Stress Analysis Report' },
];
```

### Adding a New Workflow

When adding a multi-step workflow (like design review):

**Step 1: Define workflow states**
```typescript
// In types/workflow.ts
type ReviewState = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected';

interface ReviewWorkflow {
  state: ReviewState;
  transitions: {
    [key in ReviewState]: ReviewState[];
  };
}
```

**Step 2: Create workflow tracker component**
```typescript
// In components/Workflow/WorkflowTracker.tsx
export const WorkflowTracker: React.FC<Props> = ({ workflow }) => {
  const steps = [
    { state: 'draft', label: 'Draft' },
    { state: 'submitted', label: 'Submitted' },
    { state: 'in_review', label: 'In Review' },
    { state: 'approved', label: 'Approved' },
  ];

  return (
    <StepIndicator
      steps={steps}
      currentStep={workflow.state}
    />
  );
};
```

**Step 3: Add workflow panel to project view**
```typescript
// In ProjectView.tsx
{project.hasActiveReview && (
  <SlideOutPanel position="bottom" height="auto">
    <ReviewPanel reviewId={project.activeReviewId} />
  </SlideOutPanel>
)}
```

---

## Responsive Design

### Breakpoints

```typescript
const breakpoints = {
  mobile: '640px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1280px',
};
```

### Layout Adaptations

**Desktop (default):**
```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                      │
├──────────┬──────────────────────────────┬───────────────────┤
│ Sidebar  │          Map View            │   Details Panel   │
│          │                              │                   │
│          │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
```

**Tablet:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                      │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │               Map View                           │
│ (icons)  │                                                  │
│          │  ┌─────────────────────────────────────────────┐ │
│          │  │         Bottom Sheet (Details)              │ │
│          │  └─────────────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────────────┘
```

**Mobile:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header + Hamburger                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                        Map View                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Bottom Sheet                             │
│                    (swipe up for details)                   │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// Responsive sidebar
const Sidebar: React.FC = () => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return null; // Use bottom sheet instead
  }

  return (
    <SidebarContainer collapsed={isTablet}>
      {isTablet ? (
        // Icons only
        <IconOnlySidebar />
      ) : (
        // Full sidebar
        <FullSidebar />
      )}
    </SidebarContainer>
  );
};

// Responsive details panel
const DetailsPanel: React.FC = () => {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <BottomSheet>
        <DetailsContent />
      </BottomSheet>
    );
  }

  return (
    <SidePanel position="right">
      <DetailsContent />
    </SidePanel>
  );
};
```

---

## Accessibility

### Requirements

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Keyboard navigation | WCAG 2.1 AA | All interactive elements focusable |
| Screen reader | WCAG 2.1 AA | ARIA labels on all elements |
| Color contrast | WCAG 2.1 AA | 4.5:1 minimum ratio |
| Focus indicators | WCAG 2.1 AA | Visible focus rings |
| Error messages | WCAG 2.1 AA | Associated with inputs |

### Implementation

```typescript
// Accessible button with loading state
const Button: React.FC<ButtonProps> = ({ loading, children, ...props }) => (
  <button
    aria-busy={loading}
    aria-disabled={loading}
    {...props}
  >
    {loading ? (
      <span aria-hidden="true"><Spinner /></span>
    ) : null}
    <span className={loading ? 'sr-only' : ''}>{children}</span>
    {loading && <span className="sr-only">Loading...</span>}
  </button>
);

// Accessible status badge
const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => (
  <span
    role="status"
    aria-live="polite"
    aria-label={`${label}: ${status}`}
  >
    <StatusIcon status={status} aria-hidden="true" />
    {label}
  </span>
);

// Accessible map
const AccessibleMap: React.FC = () => (
  <div
    role="application"
    aria-label="Pipeline route map"
    tabIndex={0}
  >
    <MapGL>
      {/* Map content */}
    </MapGL>
    <div className="sr-only">
      Pipeline route from {startPoint} to {endPoint}, {routeLength} kilometers.
    </div>
  </div>
);
```

---

## Performance Guidelines

### Loading States

```typescript
// Skeleton loading for data
const ProjectSkeleton: React.FC = () => (
  <div className="animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
    <div className="h-4 bg-gray-200 rounded w-full mb-2" />
    <div className="h-4 bg-gray-200 rounded w-2/3" />
  </div>
);

// Usage with Suspense
<Suspense fallback={<ProjectSkeleton />}>
  <ProjectDetails projectId={id} />
</Suspense>
```

### Lazy Loading

```typescript
// Lazy load heavy components
const ThreeDViewer = lazy(() => import('./ThreeDViewer'));
const ReportGenerator = lazy(() => import('./ReportGenerator'));

// Lazy load routes
const routes = [
  { path: '/projects', component: lazy(() => import('./pages/Projects')) },
  { path: '/analytics', component: lazy(() => import('./pages/Analytics')) },
];
```

### Memoization

```typescript
// Memoize expensive calculations
const pressureProfile = useMemo(
  () => calculatePressureProfile(route, hydraulicParams),
  [route, hydraulicParams]
);

// Memoize callbacks
const handleOptimize = useCallback(
  () => runOptimization(projectId, params),
  [projectId, params]
);

// Memoize components
const RouteOverlay = memo(({ data }) => (
  <GeoJSONLayer data={data} />
));
```

---

## Error Handling

### Error Boundaries

```typescript
const FeatureErrorBoundary: React.FC<Props> = ({ feature, children }) => (
  <ErrorBoundary
    fallback={({ error, resetError }) => (
      <ErrorCard>
        <ErrorTitle>{feature} encountered an error</ErrorTitle>
        <ErrorMessage>{error.message}</ErrorMessage>
        <Button onClick={resetError}>Retry</Button>
      </ErrorCard>
    )}
  >
    {children}
  </ErrorBoundary>
);

// Usage
<FeatureErrorBoundary feature="Hydraulic Analysis">
  <HydraulicsPanel />
</FeatureErrorBoundary>
```

### User-Friendly Error Messages

```typescript
const errorMessages: Record<string, string> = {
  'HYDRAULICS_NO_CONVERGE': 'The hydraulic simulation could not find a solution. Try adjusting the operating conditions.',
  'ROUTE_TOO_SHORT': 'The route must be at least 100 meters long.',
  'NETWORK_ERROR': 'Unable to connect to the server. Check your internet connection.',
  'PERMISSION_DENIED': 'You do not have permission to perform this action.',
};

const getErrorMessage = (error: Error): string => {
  return errorMessages[error.code] ?? 'An unexpected error occurred.';
};
```

---

## Feature Flag Integration

```typescript
// Feature flag hook
const useFeatureFlag = (flag: string): boolean => {
  const flags = useFeatureFlags();
  return flags[flag] ?? false;
};

// Usage in components
const ProjectSidebar: React.FC = () => {
  const show3DViewer = useFeatureFlag('3d_viewer');
  const showStressAnalysis = useFeatureFlag('stress_analysis');

  return (
    <Sidebar>
      <SidebarItem id="route" />
      <SidebarItem id="hydraulics" />
      {show3DViewer && <SidebarItem id="3d" />}
      {showStressAnalysis && <SidebarItem id="stress" />}
    </Sidebar>
  );
};
```

---

## Checklist for New Features

Before submitting a new feature for review:

- [ ] Follows progressive disclosure pattern
- [ ] Preserves user context (no page navigation)
- [ ] Has intelligent defaults
- [ ] Uses standard component patterns
- [ ] Includes loading states
- [ ] Includes error handling
- [ ] Keyboard accessible
- [ ] Screen reader tested
- [ ] Responsive on tablet/mobile
- [ ] Performance tested (no jank)
- [ ] Feature flagged for rollout

---

*Document Version: 1.0*
*Last Updated: December 2024*
