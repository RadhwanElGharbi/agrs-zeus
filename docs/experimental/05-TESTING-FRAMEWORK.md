# Testing & Validation Framework

## Overview

A comprehensive testing strategy to ensure ZEUS features are production-ready and meet the rigorous requirements of the pipeline industry. Every feature must be validated before release to prevent "useless garbage" from reaching production.

**Philosophy:** Test-driven development with industry-specific validation criteria.

---

## Testing Pyramid

```
                    ┌───────────────┐
                    │   E2E Tests   │  (Cypress/Playwright)
                   ┌┴───────────────┴┐
                   │ Integration Tests│  (pytest + API)
                  ┌┴─────────────────┴┐
                  │    Unit Tests      │  (pytest/vitest)
                 ┌┴───────────────────┴┐
                 │  Static Analysis     │  (mypy/eslint)
                ┌┴─────────────────────┴┐
                │   Industry Validation  │  (Expert review)
                └───────────────────────┘
```

---

## 1. Unit Testing Standards

### 1.1 Backend Unit Tests (Python/pytest)

**Directory structure:**
```
backend/
├── hydraulics/
│   ├── steady_state.py
│   └── tests/
│       ├── __init__.py
│       ├── test_steady_state.py
│       ├── test_fluid_properties.py
│       └── fixtures/
│           └── test_networks.json
```

**Test file template:**
```python
"""
Unit tests for steady_state.py

Test categories:
- Equation correctness
- Edge cases
- Error handling
- Performance benchmarks
"""

import pytest
from hypothesis import given, strategies as st
from backend.hydraulics.steady_state import SteadyStateSolver

class TestDarcyWeisbach:
    """Tests for Darcy-Weisbach friction calculation."""

    def test_laminar_flow_analytical(self):
        """
        Verify Darcy-Weisbach for laminar flow against
        analytical solution: f = 64/Re
        """
        solver = SteadyStateSolver()
        reynolds = 1000  # Laminar
        expected_f = 64 / reynolds

        result = solver.friction_factor(
            reynolds=reynolds,
            roughness=0.0001,  # Smooth pipe
            diameter=0.1
        )

        assert abs(result - expected_f) < 0.001, \
            f"Expected f={expected_f}, got {result}"

    def test_turbulent_flow_benchmark(self):
        """
        Verify against Moody chart benchmarks.
        Reference: Engineering Fluid Mechanics, Crowe et al.
        """
        solver = SteadyStateSolver()
        # Benchmark case: Re=10^5, ε/D=0.001
        result = solver.friction_factor(
            reynolds=100000,
            roughness=0.0001,
            diameter=0.1
        )

        # Moody chart value: f ≈ 0.0223
        assert 0.021 < result < 0.024, \
            f"Turbulent friction factor {result} outside expected range"

    @given(st.floats(min_value=2300, max_value=1e7))
    def test_friction_factor_bounds(self, reynolds):
        """Property-based test: friction factor always positive."""
        solver = SteadyStateSolver()
        result = solver.friction_factor(
            reynolds=reynolds,
            roughness=0.0001,
            diameter=0.1
        )
        assert result > 0, "Friction factor must be positive"
        assert result < 0.1, "Friction factor unreasonably high"


class TestSolverConvergence:
    """Tests for Newton-Raphson solver convergence."""

    @pytest.fixture
    def simple_network(self):
        """Single pipe network for basic testing."""
        return {
            "nodes": [
                {"id": "inlet", "type": "pressure", "value": 1000000},
                {"id": "outlet", "type": "pressure", "value": 100000}
            ],
            "pipes": [
                {"from": "inlet", "to": "outlet", "length": 1000,
                 "diameter": 0.1, "roughness": 0.0001}
            ]
        }

    def test_single_pipe_convergence(self, simple_network):
        """Solver converges for single pipe network."""
        solver = SteadyStateSolver()
        result = solver.solve(simple_network, max_iterations=100)

        assert result.converged, "Solver failed to converge"
        assert result.iterations < 20, "Too many iterations"
        assert result.residual < 1e-6, "Residual too high"

    @pytest.mark.benchmark
    def test_large_network_performance(self, benchmark):
        """Performance test for 500-node network."""
        network = self._generate_network(nodes=500)
        solver = SteadyStateSolver()

        result = benchmark(solver.solve, network)

        assert result.converged
        assert benchmark.stats['mean'] < 5.0, "Solve time > 5 seconds"
```

### 1.2 Frontend Unit Tests (TypeScript/Vitest)

**Test file template:**
```typescript
/**
 * Unit tests for hydraulic results visualization
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HydraulicResults } from '@/components/Project/HydraulicResults';

describe('HydraulicResults', () => {
  const mockResults = {
    converged: true,
    nodes: [
      { id: 'node1', pressure: 500000, elevation: 100 },
      { id: 'node2', pressure: 450000, elevation: 95 },
    ],
    pipes: [
      { id: 'pipe1', flow: 0.1, velocity: 1.2, headloss: 50000 },
    ],
  };

  it('displays pressure values in correct units', () => {
    render(<HydraulicResults results={mockResults} units="bar" />);

    expect(screen.getByText('5.00 bar')).toBeInTheDocument();
    expect(screen.getByText('4.50 bar')).toBeInTheDocument();
  });

  it('shows warning for high velocity', () => {
    const highVelocity = {
      ...mockResults,
      pipes: [{ ...mockResults.pipes[0], velocity: 5.5 }], // > 5 m/s
    };

    render(<HydraulicResults results={highVelocity} />);

    expect(screen.getByRole('alert')).toHaveTextContent('High velocity');
  });

  it('handles non-converged results gracefully', () => {
    const nonConverged = { ...mockResults, converged: false };

    render(<HydraulicResults results={nonConverged} />);

    expect(screen.getByText(/did not converge/i)).toBeInTheDocument();
  });
});
```

### 1.3 Coverage Requirements

| Module | Minimum Coverage | Critical Paths |
|--------|------------------|----------------|
| Hydraulics | 90% | All equations |
| Cost Estimation | 85% | Price calculations |
| Compliance | 95% | All rule checks |
| 3D Modeling | 80% | Geometry operations |
| SCADA Integration | 85% | Data handling |
| RBAC | 95% | Permission checks |

---

## 2. Integration Testing

### 2.1 API Integration Tests

**Test file structure:**
```python
"""
Integration tests for hydraulics API endpoints.
"""

import pytest
from httpx import AsyncClient
from backend.main import app

@pytest.mark.integration
class TestHydraulicsAPI:

    @pytest.fixture
    async def client(self):
        async with AsyncClient(app=app, base_url="http://test") as client:
            yield client

    @pytest.fixture
    def authenticated_headers(self, test_user_token):
        return {"Authorization": f"Bearer {test_user_token}"}

    async def test_run_hydraulics_full_workflow(
        self,
        client,
        authenticated_headers,
        sample_project_with_route
    ):
        """
        Full workflow test:
        1. Configure fluid properties
        2. Set operating conditions
        3. Run simulation
        4. Verify results
        """
        project_id = sample_project_with_route["id"]

        # Step 1: Configure fluid
        fluid_response = await client.post(
            f"/api/projects/{project_id}/hydraulics/fluid",
            headers=authenticated_headers,
            json={
                "fluid_type": "crude_oil",
                "api_gravity": 35,
                "temperature": 15
            }
        )
        assert fluid_response.status_code == 200

        # Step 2: Set operating conditions
        conditions_response = await client.post(
            f"/api/projects/{project_id}/hydraulics/conditions",
            headers=authenticated_headers,
            json={
                "inlet_pressure": 5000000,  # 50 bar
                "outlet_pressure": 500000,   # 5 bar
                "flow_rate": 0.5             # m³/s
            }
        )
        assert conditions_response.status_code == 200

        # Step 3: Run simulation
        run_response = await client.post(
            f"/api/projects/{project_id}/hydraulics/run",
            headers=authenticated_headers
        )
        assert run_response.status_code == 200
        result = run_response.json()

        # Step 4: Verify results
        assert result["converged"] is True
        assert "pressure_profile" in result
        assert "velocity_profile" in result
        assert len(result["pressure_profile"]) > 0

        # Verify physics: pressure decreases along pipe
        pressures = [p["value"] for p in result["pressure_profile"]]
        assert pressures == sorted(pressures, reverse=True), \
            "Pressure should decrease along flow direction"
```

### 2.2 Database Integration Tests

```python
"""
Database integration tests for tenant isolation.
"""

import pytest
from backend.enterprise.tenant_manager import TenantManager

@pytest.mark.integration
class TestTenantIsolation:

    async def test_cross_tenant_data_access_blocked(
        self,
        db_session,
        tenant_a,
        tenant_b
    ):
        """
        CRITICAL: Verify users cannot access other tenant's data.
        """
        # Create project in tenant A
        project = await create_project(
            db_session,
            tenant_id=tenant_a.id,
            name="Secret Project"
        )

        # Attempt to access from tenant B context
        with pytest.raises(PermissionError):
            await get_project(
                db_session,
                project_id=project.id,
                tenant_context=tenant_b
            )

    async def test_data_deletion_cascade(
        self,
        db_session,
        test_tenant
    ):
        """
        Verify tenant deletion removes all associated data.
        """
        # Create tenant with data
        project = await create_project(db_session, tenant_id=test_tenant.id)
        route = await create_route(db_session, project_id=project.id)

        # Delete tenant
        await TenantManager().delete_tenant(test_tenant.id)

        # Verify all data removed
        assert await get_project(db_session, project.id) is None
        assert await get_route(db_session, route.id) is None
```

---

## 3. End-to-End Testing

### 3.1 Cypress/Playwright Tests

**Test file structure:**
```typescript
/**
 * E2E test: Complete route optimization workflow
 */

describe('Route Optimization Workflow', () => {
  beforeEach(() => {
    cy.login('engineer@test.com', 'password');
    cy.visit('/projects');
  });

  it('creates project and runs PIRL optimization', () => {
    // Create new project
    cy.findByRole('button', { name: /new project/i }).click();
    cy.findByLabelText('Project Name').type('Test Pipeline');
    cy.findByLabelText('Project Type').select('Natural Gas');
    cy.findByRole('button', { name: /create/i }).click();

    // Wait for map to load
    cy.findByTestId('map-container').should('be.visible');

    // Set start point
    cy.findByRole('button', { name: /set start/i }).click();
    cy.findByTestId('map-container').click(200, 200);

    // Set end point
    cy.findByRole('button', { name: /set end/i }).click();
    cy.findByTestId('map-container').click(600, 400);

    // Run optimization
    cy.findByRole('button', { name: /optimize route/i }).click();

    // Wait for results (may take time)
    cy.findByText(/optimization complete/i, { timeout: 60000 })
      .should('be.visible');

    // Verify route displayed
    cy.findByTestId('route-layer').should('be.visible');
    cy.findByText(/route length/i).should('contain', 'km');
  });

  it('compares multiple route alternatives', () => {
    cy.visit('/projects/test-project');

    // Generate alternatives
    cy.findByRole('button', { name: /generate alternatives/i }).click();
    cy.findByLabelText('Number of alternatives').clear().type('3');
    cy.findByRole('button', { name: /generate/i }).click();

    // Wait for generation
    cy.findByText(/3 alternatives generated/i, { timeout: 120000 });

    // Open comparison view
    cy.findByRole('button', { name: /compare routes/i }).click();

    // Verify comparison table
    cy.findByRole('table').within(() => {
      cy.findAllByRole('row').should('have.length', 4); // Header + 3 routes
      cy.findByText('Total Cost').should('be.visible');
      cy.findByText('Environmental Score').should('be.visible');
    });
  });
});
```

### 3.2 Visual Regression Testing

```typescript
/**
 * Visual regression tests for map rendering
 */

describe('Map Visual Regression', () => {
  it('renders route correctly on satellite basemap', () => {
    cy.visit('/projects/test-project');
    cy.findByRole('button', { name: /satellite/i }).click();

    // Wait for tiles to load
    cy.wait(2000);

    // Take snapshot
    cy.matchImageSnapshot('route-satellite-view', {
      failureThreshold: 0.01, // 1% difference allowed
      failureThresholdType: 'percent'
    });
  });

  it('renders hydraulic overlay correctly', () => {
    cy.visit('/projects/test-project');
    cy.findByRole('button', { name: /hydraulics/i }).click();

    cy.wait(1000);

    cy.matchImageSnapshot('hydraulic-pressure-overlay');
  });
});
```

---

## 4. Industry-Specific Validation

### 4.1 Hydraulic Validation Protocol

**Benchmark test cases:**

| Test Case | Source | Expected Accuracy |
|-----------|--------|-------------------|
| Single horizontal pipe | Analytical | Exact (< 0.1%) |
| Pipe with elevation | Crane Technical Paper 410 | < 1% |
| Complex network | PIPEPHASE model | < 2% |
| Transient waterhammer | Published experiments | < 5% |

**Validation procedure:**
```python
class HydraulicValidation:
    """
    Industry-standard hydraulic validation tests.
    """

    def test_crane_410_example_1(self):
        """
        Validate against Crane Technical Paper 410, Example 1.

        Scenario: Water flow through steel pipe
        Given: D=4", L=100ft, Q=100gpm, ε=0.0018"
        Expected: ΔP = 2.73 psi
        """
        solver = SteadyStateSolver()
        result = solver.solve({
            "fluid": "water",
            "temperature": 60,  # °F
            "pipes": [{
                "diameter": 0.1016,  # 4 inches in meters
                "length": 30.48,     # 100 ft in meters
                "roughness": 0.0000457,  # 0.0018" in meters
                "flow": 0.006309     # 100 gpm in m³/s
            }]
        })

        expected_dp = 18823  # 2.73 psi in Pa
        actual_dp = result.pipes[0].pressure_drop

        assert abs(actual_dp - expected_dp) / expected_dp < 0.01, \
            f"Crane 410 validation failed: expected {expected_dp}, got {actual_dp}"

    def test_pipephase_comparison(self, pipephase_model_file):
        """
        Compare results against existing PIPEPHASE model.
        """
        # Load PIPEPHASE reference results
        reference = PIPEPHASEParser.load(pipephase_model_file)

        # Run same scenario in ZEUS
        zeus_result = SteadyStateSolver().solve(
            reference.network_topology,
            reference.boundary_conditions
        )

        # Compare node pressures
        for node_id, ref_pressure in reference.node_pressures.items():
            zeus_pressure = zeus_result.get_node_pressure(node_id)
            error = abs(zeus_pressure - ref_pressure) / ref_pressure

            assert error < 0.02, \
                f"Node {node_id}: ZEUS={zeus_pressure}, PIPEPHASE={ref_pressure}, error={error:.2%}"
```

### 4.2 Cost Estimation Validation

**Validation against historical projects:**
```python
class CostValidation:
    """
    Validate cost estimation against completed projects.
    """

    @pytest.fixture
    def historical_projects(self):
        """Load historical project cost data."""
        return [
            {
                "name": "Project Alpha",
                "length_km": 150,
                "diameter_in": 24,
                "terrain": "mixed",
                "actual_cost": 180_000_000,
                "year": 2022
            },
            # ... more projects
        ]

    def test_historical_accuracy(self, historical_projects):
        """
        MAPE (Mean Absolute Percentage Error) must be < 15%.
        """
        estimator = CostEstimator()
        errors = []

        for project in historical_projects:
            estimated = estimator.estimate(
                length=project["length_km"],
                diameter=project["diameter_in"],
                terrain=project["terrain"],
                year=project["year"]
            )

            error = abs(estimated - project["actual_cost"]) / project["actual_cost"]
            errors.append(error)

        mape = sum(errors) / len(errors)
        assert mape < 0.15, f"MAPE {mape:.2%} exceeds 15% threshold"
```

### 4.3 Compliance Rule Validation

**Regulatory validation checklist:**
```python
class ComplianceValidation:
    """
    Validate compliance engine against regulatory requirements.
    """

    def test_hca_identification_accuracy(self, known_hca_routes):
        """
        Validate HCA identification against expert assessments.
        """
        analyzer = HCAAnalyzer()

        for route in known_hca_routes:
            result = analyzer.identify_hcas(route.geometry)

            # Compare with expert-identified HCAs
            for expert_hca in route.expert_hcas:
                matching = self._find_matching_hca(result, expert_hca)
                assert matching is not None, \
                    f"Missed HCA at station {expert_hca.station}"
                assert matching.hca_type == expert_hca.hca_type, \
                    f"Wrong HCA type: expected {expert_hca.hca_type}"

    def test_phmsa_regulation_coverage(self):
        """
        Verify all PHMSA regulations are mapped.
        """
        checker = CodeChecker()

        phmsa_sections = [
            "195.1",    # Applicability
            "195.106", # Wall thickness
            "195.260", # Valve spacing
            "195.402", # Procedures manual
            "195.450", # HCA definitions
            # ... complete list
        ]

        for section in phmsa_sections:
            assert checker.has_rule(section), \
                f"Missing rule for 49 CFR {section}"
```

---

## 5. Performance Testing

### 5.1 Load Testing

**Locust configuration:**
```python
"""
Load testing with Locust.
"""

from locust import HttpUser, task, between

class ZEUSUser(HttpUser):
    wait_time = between(1, 5)

    def on_start(self):
        self.client.post("/api/auth/login", json={
            "email": "loadtest@test.com",
            "password": "testpassword"
        })

    @task(3)
    def view_project(self):
        self.client.get("/api/projects/test-project")

    @task(2)
    def view_route(self):
        self.client.get("/api/projects/test-project/routes/main")

    @task(1)
    def run_optimization(self):
        self.client.post("/api/projects/test-project/optimize", json={
            "algorithm": "pirl",
            "iterations": 100
        })
```

**Performance targets:**

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| GET /projects | < 100ms | < 300ms | < 500ms |
| GET /routes | < 200ms | < 500ms | < 1s |
| POST /optimize | < 30s | < 60s | < 120s |
| WebSocket connect | < 100ms | < 200ms | < 500ms |

### 5.2 Stress Testing

```python
"""
Stress testing for concurrent operations.
"""

import asyncio
import pytest

@pytest.mark.stress
class TestConcurrentOperations:

    async def test_50_concurrent_users_same_project(self):
        """
        50 users viewing same project simultaneously.
        """
        async def user_session():
            async with aiohttp.ClientSession() as session:
                for _ in range(10):
                    async with session.get(
                        f"{BASE_URL}/api/projects/test-project"
                    ) as response:
                        assert response.status == 200
                    await asyncio.sleep(0.5)

        tasks = [user_session() for _ in range(50)]
        await asyncio.gather(*tasks)

    async def test_scada_data_throughput(self):
        """
        10,000 data points per second ingestion.
        """
        data_points = [
            {"tag": f"TAG_{i}", "value": random.random(), "timestamp": time.time()}
            for i in range(10000)
        ]

        start = time.time()
        await scada_ingestor.ingest_batch(data_points)
        elapsed = time.time() - start

        assert elapsed < 1.0, f"Ingestion took {elapsed}s, expected < 1s"
```

---

## 6. Security Testing

### 6.1 OWASP Testing

```python
"""
Security tests based on OWASP Top 10.
"""

class TestSecurityOWASP:

    def test_sql_injection_prevention(self, client):
        """A03:2021 – Injection"""
        payloads = [
            "'; DROP TABLE users; --",
            "1 OR 1=1",
            "admin'--",
        ]

        for payload in payloads:
            response = client.get(f"/api/projects?search={payload}")
            assert response.status_code in [200, 400]
            assert "error" not in response.text.lower() or "sql" not in response.text.lower()

    def test_broken_access_control(self, client, user_a_token, user_b_project):
        """A01:2021 – Broken Access Control"""
        response = client.get(
            f"/api/projects/{user_b_project.id}",
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert response.status_code == 403

    def test_sensitive_data_exposure(self, client):
        """A02:2021 – Cryptographic Failures"""
        # Verify passwords not returned
        response = client.get("/api/users/me")
        assert "password" not in response.json()
        assert "password_hash" not in response.json()

    def test_xss_prevention(self, client):
        """A03:2021 – Injection (XSS)"""
        payload = "<script>alert('xss')</script>"
        response = client.post("/api/comments", json={"content": payload})

        # Content should be escaped
        comment = response.json()
        assert "<script>" not in comment["content"]
```

### 6.2 Penetration Testing Checklist

| Category | Test | Status |
|----------|------|--------|
| Authentication | Brute force protection | |
| Authentication | Session timeout | |
| Authorization | Horizontal privilege escalation | |
| Authorization | Vertical privilege escalation | |
| Input validation | SQL injection | |
| Input validation | XSS | |
| Input validation | Command injection | |
| Data protection | Encryption at rest | |
| Data protection | Encryption in transit | |
| Audit | Sensitive action logging | |

---

## 7. Continuous Integration Pipeline

### 7.1 GitHub Actions Workflow

```yaml
name: ZEUS CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint Python
        run: |
          pip install ruff mypy
          ruff check backend/
          mypy backend/ --strict
      - name: Lint TypeScript
        run: |
          cd frontend && npm ci
          npm run lint
          npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backend tests
        run: |
          cd backend
          pip install -r requirements-test.txt
          pytest tests/unit --cov=backend --cov-report=xml
      - name: Frontend tests
        run: |
          cd frontend
          npm ci
          npm run test:coverage

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - name: Run integration tests
        run: |
          cd backend
          pytest tests/integration --tb=short

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start services
        run: docker-compose up -d
      - name: Run E2E tests
        run: |
          cd frontend
          npm ci
          npx playwright test

  industry-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run validation tests
        run: |
          cd backend
          pytest tests/validation --tb=short -v

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run security scan
        run: |
          pip install bandit safety
          bandit -r backend/
          safety check
      - name: SAST scan
        uses: github/codeql-action/analyze@v2
```

---

## 8. Pre-Release Checklist

### 8.1 Feature Release Checklist

- [ ] All unit tests passing (> 80% coverage)
- [ ] All integration tests passing
- [ ] E2E tests passing
- [ ] Industry validation tests passing
- [ ] Performance benchmarks met
- [ ] Security scan clean
- [ ] Documentation updated
- [ ] Changelog entry added
- [ ] Expert review completed (for engineering features)
- [ ] UI/UX review completed (for frontend changes)

### 8.2 Production Release Checklist

- [ ] All feature checklists completed
- [ ] Load testing completed
- [ ] Staging environment tested
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] On-call rotation scheduled

---

*Document Version: 1.0*
*Last Updated: December 2024*
