# SOC 2 Type 2 Investigation Report

**Organization/System:** AGRS ZEUS  
**Assessment Date:** 2026-02-11  
**Assessor:** AI investigation (repository and documentation evidence review)  
**Scope:** Source repository at `/home/radwan-el-gharbi/.cursor/worktrees/agrs/iwt` and deployment/configuration artifacts referenced by that repository.

---

## Executive Conclusion

Based on available evidence, **AGRS ZEUS is not currently SOC 2 Type 2 compliant**.

The codebase includes several useful security and audit foundations (password hashing for DB users, partial RBAC, project audit events, and backup automation), but there are critical technical and governance gaps that block SOC 2 Type 2 readiness.

Also, SOC 2 Type 2 requires a formal third-party attestation and operating-effectiveness evidence over a sustained review period, which is not present in the assessed materials.

---

## Assessment Approach

This investigation used a read-only review of:

- Application security implementation (`gui-v2/backend`, `gui-v2/frontend`, and core C++ auth/audit code)
- Deployment and infrastructure artifacts (`gui-v2/deploy`, control scripts, environment templates)
- Governance and process documentation (`docs/`, release instructions, policy-style files)

No source code or configuration changes were made during the investigation.

---

## Readiness Rating by SOC 2 Control Area

- **Control Environment / Governance:** Low
- **Risk Assessment / Vendor Governance:** Low
- **Logical Access (CC6):** Low
- **System Operations / Monitoring (CC7):** Low to Medium
- **Change Management:** Low
- **Availability / DR:** Low to Medium
- **Confidentiality / Privacy:** Low to Medium

**Overall readiness:** **Low**

---

## Critical Findings (Blocking)

1. **Inconsistent access control enforcement across APIs**
   - Multiple project/data endpoints are exposed without `require_auth`/membership checks.
   - Project membership model exists but is not consistently enforced for read access.

2. **Sensitive API surfaces appear unauthenticated**
   - Analytics dashboard endpoints and several supplier/agentic/project read routes do not consistently require authentication.

3. **Legacy/demo auth path weakens password security**
   - Demo credential path uses static-salt SHA256 and default fallback passwords.

4. **Session and token security weaknesses**
   - Frontend stores bearer token in `localStorage`.
   - Backend persists sessions to plain JSON on disk (`/opt/agrs/analytics/sessions.json`).

5. **Transport security not enforced in committed deployment configs**
   - HTTPS blocks and redirects are present but commented in nginx deployment files.

6. **Governance/process evidence gaps**
   - No formal incident response plan.
   - No documented business continuity/disaster recovery policy with RTO/RPO.
   - No formalized security awareness/training evidence.
   - No formal change approval workflow evidence.
   - No documented periodic access review process.

7. **Missing CI/security automation evidence**
   - No CI pipeline configs or dependency scanning automation were found in repository artifacts.

---

## Implemented Controls and Positive Evidence

### Authentication and Password Handling

- DB-backed user hashing via bcrypt:
  - `gui-v2/backend/api/security.py`
- Auth dependency and session validation path:
  - `gui-v2/backend/api/auth.py`
- Native C++ path uses libsodium password verify:
  - `src/core/Auth.cpp`
  - `src/core/Users.cpp`

### Authorization and Identity Data Model

- Role model and membership tables:
  - `gui-v2/backend/api/db_models.py`
- Superadmin-guarded user management endpoints:
  - `gui-v2/backend/api/users.py`

### Audit and Activity Trails

- Project audit event framework:
  - `gui-v2/backend/api/audit.py`
  - `gui-v2/backend/api/audit_routes.py`
  - `gui-v2/backend/api/db_models.py` (`audit_events`)
- Login/session event logging:
  - `gui-v2/backend/api/auth.py`
- Native login attempt and terminal input logging:
  - `src/core/Migrations.cpp`
  - `docs/COMMANDS.md`

### Backup and Operational Baseline

- Automated hourly/daily backup logic:
  - `src/main.cpp`
- Supervisor deployment baseline:
  - `gui-v2/deploy/supervisor-agrs.conf`

### Data Integrity Policy Strength

- Strong dataset integrity policy prohibiting placeholders:
  - `docs/NO_PLACEHOLDER_DATA_POLICY.md`
  - `docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md`

---

## Key Technical Evidence (Selected)

- Weak demo fallback hashing/defaults:
  - `gui-v2/backend/api/auth.py`
- Broad CORS with wildcard origin:
  - `gui-v2/backend/main.py`
- Token storage in browser local storage:
  - `gui-v2/frontend/src/lib/context/AuthContext.tsx`
- Unauthenticated project/data reads (selected examples):
  - `gui-v2/backend/api/projects.py`
  - `gui-v2/backend/api/data.py`
  - `gui-v2/backend/api/pirl.py`
  - `gui-v2/backend/api/suppliers.py`
  - `gui-v2/backend/api/analytics.py`
  - `gui-v2/backend/api/agentic.py`
- TLS sections commented in deployment templates:
  - `gui-v2/deploy/nginx-agrsglobal.conf`
  - `gui-v2/deploy/nginx-agrsglobal-wireguard-vps.conf`

---

## Governance and Documentation Gaps

The repository contains strong technical/product docs but lacks SOC 2 governance depth in several required areas:

- Incident response policy and breach handling runbook
- Business continuity and disaster recovery policy (including restore testing evidence)
- Formal access review policy/procedure and review records
- Formal change management policy with approval gates and evidence trail
- Vendor security due-diligence process documentation
- Security awareness/training policy and completion evidence
- Retention/deletion schedules tied to systems of record

---

## Compliance Determination

### Determination

**Not SOC 2 Type 2 compliant at this time.**

### Basis

- Critical control gaps in access control enforcement and secure session handling
- Missing operational assurance controls and automation expected for mature environments
- Incomplete governance/process documentation and absence of formal operating-effectiveness evidence
- No attestation package or audit artifacts demonstrating Type 2 coverage period

---

## Recommended Next Steps (Priority Order)

1. Enforce authentication and project membership authorization on all project/data endpoints.
2. Remove or strictly isolate demo auth path in production; eliminate default credentials.
3. Replace localStorage bearer token flow with a hardened session strategy (HttpOnly cookie pattern for web context).
4. Move session persistence to secured store with strict access controls; avoid plaintext token persistence.
5. Enforce HTTPS redirects and production TLS hardening in active deployment configs.
6. Stand up CI controls: automated tests, dependency scanning, and change-approval gates.
7. Establish SOC 2 policy set and evidence collection workflow (IR, DR/BCP, access reviews, change management, vendor risk, security awareness).

---

## Notes and Limitations

- This assessment is based on repository-visible evidence and static configuration artifacts.
- Live environment controls (actual TLS enforcement, secrets manager usage, monitoring stack, backup restore drills) require runtime validation and audit evidence not available in this review.
- SOC 2 Type 2 status can only be formally asserted by an accredited independent audit firm after review period testing.

