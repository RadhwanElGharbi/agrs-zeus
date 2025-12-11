# Phase 4: Enterprise Features Implementation

## Overview

Enable multi-project, multi-user enterprise deployment that meets the requirements of major EPCs and operators.

**AVEVA Equivalent:** AVEVA Enterprise Resource Management, AVEVA Information Management
**Target:** Production deployment for organizations with multiple simultaneous projects

---

## Module 4.1: Multi-Tenancy Architecture

### 4.1.1 Purpose
Support isolated project environments for different clients, business units, or projects within the same deployment.

### 4.1.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Enterprise Platform                       │
├─────────────────────────────────────────────────────────────┤
│                   Tenant Management Layer                    │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   Tenant A   │   Tenant B   │   Tenant C   │    Shared      │
│   (SAIPEM)   │   (Bechtel)  │   (Internal) │    Services    │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Shared Infrastructure                     │
│            (Database, Storage, Compute, Network)            │
└─────────────────────────────────────────────────────────────┘
```

### 4.1.3 Implementation Steps

#### Step 1: Tenant Isolation
**Files to create:**
- `backend/enterprise/tenant_manager.py`
- `backend/enterprise/data_isolation.py`
- `backend/enterprise/tenant_middleware.py`

**Implementation:**
```python
class TenantManager:
    """
    Manage tenant lifecycle and isolation.

    Isolation model:
    - Separate database schemas per tenant
    - Tenant-specific storage buckets
    - Isolated compute resources (optional)
    """

    async def create_tenant(
        self,
        name: str,
        config: TenantConfig
    ) -> Tenant:
        """
        Provision new tenant:
        1. Create database schema
        2. Initialize storage bucket
        3. Set resource quotas
        4. Configure networking
        """

    async def get_tenant_context(
        self,
        request: Request
    ) -> TenantContext:
        """Extract tenant context from request"""

    def apply_tenant_filter(
        self,
        query: Query,
        tenant_id: str
    ) -> Query:
        """Apply tenant filter to database query"""
```

**Middleware implementation:**
```python
class TenantMiddleware:
    """
    FastAPI middleware for tenant context injection.
    """

    async def __call__(self, request: Request, call_next):
        # Extract tenant from subdomain/header/token
        tenant_id = self.extract_tenant(request)

        # Validate tenant access
        if not await self.validate_access(tenant_id, request.user):
            raise HTTPException(403, "Access denied")

        # Inject tenant context
        request.state.tenant = await self.get_tenant(tenant_id)

        response = await call_next(request)
        return response
```

**Validation approach:**
- Cross-tenant data access tests (must fail)
- Tenant creation/deletion workflow
- Resource quota enforcement

#### Step 2: Organization Hierarchy
**Files to create:**
- `backend/enterprise/organization.py`
- `backend/enterprise/hierarchy.py`

**Implementation:**
```python
class OrganizationManager:
    """
    Manage organizational hierarchy within tenant.

    Hierarchy levels:
    - Organization (top)
    - Business Unit
    - Department
    - Project Team
    - Individual
    """

    async def create_org_unit(
        self,
        parent_id: Optional[str],
        name: str,
        unit_type: str
    ) -> OrgUnit:
        """Create organizational unit"""

    async def assign_user(
        self,
        user_id: str,
        org_unit_id: str,
        role: str
    ):
        """Assign user to organizational unit with role"""

    async def get_user_permissions(
        self,
        user_id: str,
        resource_type: str
    ) -> List[Permission]:
        """Get effective permissions for user"""
```

#### Step 3: Resource Quotas and Billing
**Files to create:**
- `backend/enterprise/quotas.py`
- `backend/enterprise/usage_tracking.py`
- `backend/enterprise/billing.py`

**Implementation:**
```python
class QuotaManager:
    """
    Manage resource quotas per tenant.

    Quotas:
    - Storage (GB)
    - Compute hours
    - API calls
    - Users
    - Projects
    """

    async def check_quota(
        self,
        tenant_id: str,
        resource_type: str,
        requested_amount: float
    ) -> QuotaCheckResult:
        """Check if quota allows requested resource"""

    async def track_usage(
        self,
        tenant_id: str,
        resource_type: str,
        amount: float
    ):
        """Track resource usage"""

    async def get_billing_summary(
        self,
        tenant_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> BillingSummary:
        """Generate billing summary for period"""
```

### 4.1.4 GUI Integration

**New UI Components:**

1. **Tenant Switcher**
   - Dropdown for users with multi-tenant access
   - Visual indicator of current tenant
   - Quick search for tenants

2. **Admin Dashboard**
   - Tenant overview (for super admins)
   - Usage metrics
   - Billing status

**Minimalism principles:**
- Tenant context always visible but unobtrusive
- Admin features in separate section
- No tenant management for regular users

---

## Module 4.2: Role-Based Access Control (RBAC)

### 4.2.1 Purpose
Implement fine-grained permissions that map to EPC organizational structures.

### 4.2.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        RBAC System                           │
├──────────────┬──────────────┬──────────────┬────────────────┤
│    Users     │    Roles     │  Permissions │   Resources    │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Policy Engine                             │
├─────────────────────────────────────────────────────────────┤
│                    Audit System                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2.3 Implementation Steps

#### Step 1: Permission Model
**Files to create:**
- `backend/rbac/permissions.py`
- `backend/rbac/roles.py`
- `backend/rbac/policies.py`

**Permission structure:**
```python
# Permission taxonomy
PERMISSIONS = {
    "projects": {
        "create": "Create new projects",
        "read": "View project data",
        "update": "Modify project settings",
        "delete": "Delete projects",
        "export": "Export project data"
    },
    "routes": {
        "create": "Create route alternatives",
        "read": "View routes",
        "update": "Modify routes",
        "delete": "Delete routes",
        "optimize": "Run PIRL optimization",
        "approve": "Approve routes for design"
    },
    "design": {
        "view": "View 3D design",
        "edit": "Edit design model",
        "validate": "Run validation",
        "release": "Release for construction"
    },
    "operations": {
        "view": "View live data",
        "control": "Issue control commands",
        "acknowledge": "Acknowledge alarms",
        "configure": "Configure SCADA tags"
    },
    "admin": {
        "users": "Manage users",
        "roles": "Manage roles",
        "audit": "View audit logs",
        "billing": "View billing"
    }
}
```

**Role implementation:**
```python
class RoleManager:
    """
    Manage roles and role assignments.

    Built-in roles:
    - Viewer: Read-only access
    - Engineer: Create/edit within projects
    - Lead Engineer: Approve within projects
    - Project Manager: Full project control
    - Admin: Tenant administration
    - Super Admin: Platform administration
    """

    async def create_role(
        self,
        name: str,
        permissions: List[str],
        scope: str  # 'tenant', 'org_unit', 'project'
    ) -> Role:
        """Create custom role"""

    async def assign_role(
        self,
        user_id: str,
        role_id: str,
        scope_id: Optional[str]  # Project ID, Org Unit ID, etc.
    ):
        """Assign role to user at specific scope"""

    async def check_permission(
        self,
        user_id: str,
        permission: str,
        resource_id: Optional[str] = None
    ) -> bool:
        """Check if user has permission on resource"""
```

#### Step 2: Policy Engine
**Files to create:**
- `backend/rbac/policy_engine.py`
- `backend/rbac/policy_dsl.py`

**Implementation:**
```python
class PolicyEngine:
    """
    Evaluate complex access policies.

    Supports:
    - Attribute-based conditions
    - Time-based access
    - Resource ownership
    - Delegation rules
    """

    def evaluate_policy(
        self,
        user: User,
        action: str,
        resource: Resource,
        context: Dict[str, Any]
    ) -> PolicyDecision:
        """
        Evaluate access policy.

        Example policies:
        - "Engineers can edit routes they created"
        - "Lead Engineers can approve during business hours"
        - "Operations can acknowledge alarms for assigned assets"
        """
```

#### Step 3: Audit Logging
**Files to create:**
- `backend/rbac/audit.py`
- `backend/rbac/audit_storage.py`

**Implementation:**
```python
class AuditLogger:
    """
    Comprehensive audit logging for compliance.

    Logged events:
    - Authentication (login, logout, failed)
    - Authorization (access granted/denied)
    - Data changes (create, update, delete)
    - Exports and downloads
    - Configuration changes
    """

    async def log_event(
        self,
        event_type: str,
        user_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
        details: Dict[str, Any],
        outcome: str
    ):
        """Log audit event"""

    async def query_logs(
        self,
        filters: AuditFilters,
        pagination: Pagination
    ) -> AuditLogPage:
        """Query audit logs with filtering"""

    async def export_logs(
        self,
        filters: AuditFilters,
        format: str  # 'csv', 'json', 'pdf'
    ) -> bytes:
        """Export audit logs for compliance"""
```

### 4.2.4 GUI Integration

**New UI Components:**

1. **User Management**
   - User list with role badges
   - Role assignment modal
   - Bulk user operations

2. **Role Editor**
   - Permission checklist
   - Scope selector
   - Template roles

3. **Audit Log Viewer**
   - Filterable log table
   - Export functionality
   - User activity timeline

---

## Module 4.3: Collaboration Features

### 4.3.1 Purpose
Enable real-time collaboration on pipeline projects across distributed teams.

### 4.3.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Collaboration Platform                     │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Real-Time   │   Review     │   Comments   │  Notifications │
│    Sync      │  Workflow    │  & Markup    │    Service     │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                   WebSocket Infrastructure                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3.3 Implementation Steps

#### Step 1: Real-Time Presence
**Files to create:**
- `backend/collaboration/presence.py`
- `backend/collaboration/websocket_manager.py`

**Implementation:**
```python
class PresenceManager:
    """
    Track user presence in real-time.

    Features:
    - Who's viewing this project
    - Cursor positions (for map view)
    - Active selections
    """

    async def user_joined(
        self,
        user_id: str,
        project_id: str,
        view: str
    ):
        """User joined project view"""

    async def broadcast_presence(
        self,
        project_id: str
    ):
        """Broadcast presence to all project users"""

    async def track_cursor(
        self,
        user_id: str,
        coordinates: Dict[str, float]
    ):
        """Track cursor position for collaborative editing"""
```

#### Step 2: Review Workflow
**Files to create:**
- `backend/collaboration/review.py`
- `backend/collaboration/approval.py`

**Implementation:**
```python
class ReviewWorkflow:
    """
    Design review and approval workflow.

    States:
    - Draft
    - Submitted for Review
    - In Review
    - Changes Requested
    - Approved
    - Released
    """

    async def submit_for_review(
        self,
        design_id: str,
        reviewers: List[str],
        due_date: datetime
    ) -> ReviewSubmission:
        """Submit design for review"""

    async def add_review_comment(
        self,
        submission_id: str,
        reviewer_id: str,
        comment: str,
        location: Optional[Dict] = None  # Coordinates if on map
    ):
        """Add review comment"""

    async def approve_design(
        self,
        submission_id: str,
        approver_id: str,
        conditions: Optional[List[str]] = None
    ):
        """Approve design (with optional conditions)"""
```

#### Step 3: Comments and Markup
**Files to create:**
- `backend/collaboration/comments.py`
- `frontend/src/components/Collaboration/MarkupTools.tsx`

**Implementation:**
```python
class CommentManager:
    """
    Manage comments and markup on designs.

    Comment types:
    - General comments
    - Location-pinned comments
    - Drawing markup
    - Issue tracking links
    """

    async def create_comment(
        self,
        project_id: str,
        user_id: str,
        content: str,
        location: Optional[GeoLocation] = None,
        parent_id: Optional[str] = None  # For replies
    ) -> Comment:
        """Create comment"""

    async def create_markup(
        self,
        project_id: str,
        user_id: str,
        markup_type: str,  # 'highlight', 'arrow', 'text', 'shape'
        geometry: Dict,
        note: Optional[str] = None
    ) -> Markup:
        """Create visual markup"""
```

### 4.3.4 GUI Integration

**New UI Components:**

1. **Presence Indicators**
   - Avatar bubbles for active users
   - Cursor visualization on map
   - Activity feed

2. **Review Panel**
   - Submission status
   - Reviewer assignments
   - Comment thread

3. **Markup Toolbar**
   - Drawing tools
   - Pin placement
   - Color selection

**Minimalism principles:**
- Presence indicators subtle but visible
- Review panel as slide-out
- Markup toolbar contextual (only when editing)

---

## Module 4.4: Integration Hub

### 4.4.1 Purpose
Connect ZEUS with enterprise systems (ERP, document management, GIS) for data flow automation.

### 4.4.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Integration Hub                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     SAP      │    Oracle    │   SharePoint │     ESRI       │
│  Connector   │  Connector   │  Connector   │   Connector    │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                 Integration Engine (Apache Camel)           │
├─────────────────────────────────────────────────────────────┤
│                    Message Queue (RabbitMQ)                 │
└─────────────────────────────────────────────────────────────┘
```

### 4.4.3 Implementation Steps

#### Step 1: ERP Connectors
**Files to create:**
- `backend/integrations/sap_connector.py`
- `backend/integrations/oracle_connector.py`

**SAP Integration:**
```python
class SAPConnector:
    """
    SAP S/4HANA integration for:
    - Material master sync
    - Purchase order creation
    - Cost center allocation
    - Project system integration
    """

    async def sync_materials(
        self,
        bom: BillOfMaterials
    ) -> List[SAPMaterial]:
        """Sync BOM items with SAP materials"""

    async def create_purchase_requisition(
        self,
        items: List[ProcurementItem],
        project_code: str
    ) -> SAPPurchaseRequisition:
        """Create PR in SAP"""

    async def get_project_costs(
        self,
        sap_project_id: str
    ) -> ProjectCosts:
        """Retrieve costs from SAP project system"""
```

#### Step 2: Document Management Integration
**Files to create:**
- `backend/integrations/sharepoint_connector.py`
- `backend/integrations/document_sync.py`

**Implementation:**
```python
class SharePointConnector:
    """
    SharePoint/OneDrive integration for document management.

    Sync capabilities:
    - Upload deliverables to SharePoint
    - Link project documents
    - Version control sync
    """

    async def upload_deliverable(
        self,
        deliverable: Deliverable,
        folder_path: str
    ) -> SharePointDocument:
        """Upload deliverable to SharePoint"""

    async def link_document(
        self,
        sharepoint_url: str,
        project_id: str,
        document_type: str
    ):
        """Link external document to project"""
```

#### Step 3: GIS Integration
**Files to create:**
- `backend/integrations/esri_connector.py`
- `backend/integrations/gis_sync.py`

**Implementation:**
```python
class ESRIConnector:
    """
    ArcGIS integration for GIS data exchange.

    Capabilities:
    - Import GIS layers
    - Export routes to GIS
    - Sync with enterprise geodatabase
    """

    async def import_layer(
        self,
        service_url: str,
        layer_id: int,
        project_id: str
    ) -> ImportedLayer:
        """Import ArcGIS layer into project"""

    async def publish_route(
        self,
        route: Route,
        target_service: str
    ) -> PublishedFeature:
        """Publish route to ArcGIS service"""
```

#### Step 4: API Gateway
**Files to create:**
- `backend/integrations/api_gateway.py`
- `backend/integrations/webhook_manager.py`

**Implementation:**
```python
class APIGateway:
    """
    External API access for third-party integrations.

    Features:
    - API key management
    - Rate limiting
    - Request logging
    - Webhook subscriptions
    """

    async def create_api_key(
        self,
        tenant_id: str,
        name: str,
        permissions: List[str]
    ) -> APIKey:
        """Create API key for external access"""

    async def register_webhook(
        self,
        event_type: str,
        callback_url: str,
        secret: str
    ) -> Webhook:
        """Register webhook for event notifications"""
```

### 4.4.4 GUI Integration

**New UI Components:**

1. **Integrations Dashboard**
   - Connected systems status
   - Sync history
   - Error queue

2. **Connection Wizard**
   - Step-by-step setup
   - Credential management
   - Test connection

3. **API Key Management**
   - Key list with permissions
   - Usage statistics
   - Revocation

---

## Module 4.5: Reporting and Analytics

### 4.5.1 Purpose
Provide executive dashboards and automated reporting for project oversight.

### 4.5.2 Implementation Steps

#### Step 1: Dashboard Framework
**Files to create:**
- `backend/reporting/dashboard.py`
- `frontend/src/components/Reporting/DashboardBuilder.tsx`

**Implementation:**
```python
class DashboardManager:
    """
    Configurable dashboard system.

    Widget types:
    - KPI cards
    - Charts (line, bar, pie)
    - Tables
    - Maps
    - Status indicators
    """

    async def create_dashboard(
        self,
        name: str,
        widgets: List[WidgetConfig]
    ) -> Dashboard:
        """Create custom dashboard"""

    async def get_widget_data(
        self,
        widget_id: str,
        parameters: Dict
    ) -> WidgetData:
        """Fetch data for widget"""
```

#### Step 2: Report Generation
**Files to create:**
- `backend/reporting/report_generator.py`
- `backend/reporting/templates.py`

**Implementation:**
```python
class ReportGenerator:
    """
    Generate formatted reports.

    Report types:
    - Project status report
    - Cost summary report
    - Compliance report
    - Inspection report
    - Executive summary
    """

    async def generate_report(
        self,
        template: str,
        project_id: str,
        parameters: Dict
    ) -> Report:
        """Generate report from template"""

    async def schedule_report(
        self,
        template: str,
        schedule: str,  # cron expression
        recipients: List[str]
    ) -> ScheduledReport:
        """Schedule recurring report"""
```

#### Step 3: KPI Tracking
**Files to create:**
- `backend/reporting/kpi.py`
- `backend/reporting/metrics.py`

**Key Performance Indicators:**
```python
KPI_DEFINITIONS = {
    "schedule": {
        "spi": "Schedule Performance Index",
        "milestone_variance": "Milestone Variance (days)",
        "critical_path_status": "Critical Path Status"
    },
    "cost": {
        "cpi": "Cost Performance Index",
        "eac": "Estimate at Completion",
        "variance": "Cost Variance (%)"
    },
    "quality": {
        "defect_rate": "Design Defect Rate",
        "rework_hours": "Rework Hours",
        "validation_pass_rate": "Validation Pass Rate"
    },
    "safety": {
        "hca_compliance": "HCA Compliance (%)",
        "permit_status": "Permit Status",
        "regulatory_findings": "Open Regulatory Findings"
    }
}
```

### 4.5.3 GUI Integration

**New UI Components:**

1. **Executive Dashboard**
   - Portfolio overview
   - KPI summary cards
   - Alert highlights

2. **Report Viewer**
   - In-browser rendering
   - Export options (PDF, Excel)
   - Sharing controls

3. **Analytics Explorer**
   - Data filtering
   - Custom visualizations
   - Export raw data

---

## Database Schema for Enterprise Features

```sql
-- Tenant management
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    config JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active'
);

-- Organization hierarchy
CREATE TABLE org_units (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    parent_id UUID REFERENCES org_units(id),
    name VARCHAR(255) NOT NULL,
    unit_type VARCHAR(50),
    metadata JSONB
);

-- Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    permissions JSONB,
    scope VARCHAR(50),
    is_system BOOLEAN DEFAULT FALSE
);

-- User role assignments
CREATE TABLE user_role_assignments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    role_id UUID REFERENCES roles(id),
    scope_type VARCHAR(50),
    scope_id UUID,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by UUID
);

-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    timestamp TIMESTAMP DEFAULT NOW(),
    user_id UUID,
    event_type VARCHAR(100),
    resource_type VARCHAR(100),
    resource_id UUID,
    action VARCHAR(50),
    details JSONB,
    outcome VARCHAR(20),
    ip_address INET,
    user_agent TEXT
);

-- Review submissions
CREATE TABLE review_submissions (
    id UUID PRIMARY KEY,
    project_id UUID,
    design_id UUID,
    submitted_by UUID,
    submitted_at TIMESTAMP DEFAULT NOW(),
    due_date TIMESTAMP,
    status VARCHAR(50),
    reviewers JSONB
);

-- Comments
CREATE TABLE comments (
    id UUID PRIMARY KEY,
    project_id UUID,
    user_id UUID,
    parent_id UUID REFERENCES comments(id),
    content TEXT,
    location GEOGRAPHY(POINT),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Integration connections
CREATE TABLE integration_connections (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    integration_type VARCHAR(100),
    name VARCHAR(255),
    config JSONB,  -- encrypted
    status VARCHAR(20),
    last_sync TIMESTAMP
);
```

---

## Phase 4 Exit Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| Multi-tenancy | Tenant isolation test | 100% pass |
| RBAC coverage | Permission model | All EPC roles |
| Collaboration | Concurrent users | 50+ per project |
| Integration | ERP connector | SAP demo working |
| Audit compliance | Log completeness | 100% events |
| Performance | Dashboard load | < 2 seconds |

---

*Document Version: 1.0*
*Last Updated: December 2024*
