# Roles API – Documentation & Testing

**Route folder:** `src/routes/roles`  
**Base path:** `/api/roles`  
**Service:** `src/services/role.service.ts`

All endpoints require **authentication**. Business context is resolved via `getBusinessIdByUserId` (owner or active member).  
Base URL: `http://localhost:8000` (or your server).

---

## Module files

| File | Purpose |
|------|--------|
| `role.routes.ts` | OpenAPI routes and schemas: CreateRoleBodySchema, UpdateRoleBodySchema, RoleParamsSchema, PermissionMatrixSchema, PermissionActionsSchema |
| `role.handler.ts` | Handlers: getBusinessIdByUserId, call role.service; maps RoleNotFoundError, RoleInUseError, InvalidPermissionError to appropriate status |
| `index.ts` | Registers role routes with the router |

---

## Endpoints

| Method | Path | Summary |
|--------|------|---------|
| GET | `/` | List all roles for the business |
| GET | `/permissions/matrix` | All resources and actions (for permission builder UI) |
| GET | `/permissions/actions` | All unique actions only (no resources) |
| GET | `/{roleId}` | Get role by ID with permissions |
| POST | `/` | Create custom role with permissions |
| PATCH | `/{roleId}` | Update custom role (system roles cannot be modified) |
| DELETE | `/{roleId}` | Delete custom role (fails if members assigned or system role) |

---

## 1. List roles

**Endpoint:** `GET /api/roles`

**Purpose:** Returns all roles for the current user’s business (including system roles: Admin, Technician).

**What to check:**

- `data` array: each role has `id`, `name`, `displayName`, `description`, `isSystem`, `createdAt`, `updatedAt`, `permissions` (array of `{ permission: { id, resource, action } }`), `_count.members`
- 401 if not authenticated; 404 if business not found

---

## 2. Get permission matrix

**Endpoint:** `GET /api/roles/permissions/matrix`

**Purpose:** All available resources and their actions for the permission builder UI (e.g. checkboxes per resource/action).

**What to check:**

- `data` array of `{ resource: string, actions: string[] }`, e.g. `{ resource: "workorders", actions: ["create", "read", "update", "delete"] }`, `{ resource: "quotes", actions: ["create", "read", "update"] }`
- Use this to build the UI for selecting permissions when creating/editing a role

---

## 3. Get permission actions only

**Endpoint:** `GET /api/roles/permissions/actions`

**Purpose:** All unique actions across all resources (no resource names). Useful for dropdowns or “all actions” lists.

**What to check:**

- `data` array of strings, e.g. `["create", "read", "update", "delete", ...]` (sorted, unique)

---

## 4. Get role by ID

**Endpoint:** `GET /api/roles/{roleId}`

**What to check:**

- `data.id`, `data.name`, `data.displayName`, `data.description`, `data.isSystem`, `data.permissions`, `data._count.members`
- 404 if role not found; 401 if not authenticated

---

## 5. Create role

**Endpoint:** `POST /api/roles`

**Purpose:** Create a custom role with a set of permissions. Permissions must be valid resource:action pairs (see permission matrix).

**Request body (JSON):**

```json
{
  "name": "custom-role",
  "displayName": "Custom Role",
  "description": "Can manage work orders and clients only",
  "permissions": [
    { "resource": "workorders", "action": "create" },
    { "resource": "workorders", "action": "read" },
    { "resource": "workorders", "action": "update" },
    { "resource": "clients", "action": "read" }
  ]
}
```

- **Required:** `name` (1–50 chars), `permissions` (array of at least one `{ resource, action }`)
- **Optional:** `displayName`, `description`

**What to check (201 Created):**

- `data.id`, `data.name`, `data.displayName`, `data.description`, `data.isSystem` = false, `data.permissions` matching request
- 400 if permissions invalid (unknown resource or action); 404 if business not found; 401 if not authenticated

**Note:** Send **one object per permission** in `permissions[]` (e.g. one for create, one for delete), not a single object with multiple actions.

---

## 6. Update role

**Endpoint:** `PATCH /api/roles/{roleId}`

**Purpose:** Update name, displayName, description, and/or permissions. System roles cannot be modified.

**Request body (JSON, all optional):**

```json
{
  "name": "updated-role-name",
  "displayName": "Updated Display Name",
  "description": "New description",
  "permissions": [
    { "resource": "workorders", "action": "read" },
    { "resource": "quotes", "action": "read" }
  ]
}
```

- If `permissions` is provided, it replaces the role’s permissions (same validation as create).

**What to check (200 OK):**

- Updated role in response
- 400 if invalid permissions or system role; 404 if role not found; 401 if not authenticated

---

## 7. Delete role

**Endpoint:** `DELETE /api/roles/{roleId}`

**Purpose:** Delete a custom role. Fails if the role has members assigned or if it is a system role.

**No body.**

**What to check:**

- Success response with `deleted: true` or similar
- 400 if role is in use or system role; 404 if role not found; 401 if not authenticated

---

## Quick checklist

| Step | Endpoint | Check |
|------|----------|--------|
| 1 | `GET /api/roles` | List returns roles with permissions and _count.members |
| 2 | `GET /api/roles/permissions/matrix` | Resources and actions for UI |
| 3 | `GET /api/roles/permissions/actions` | Unique actions list |
| 4 | `POST /api/roles` | 201, custom role with correct permissions |
| 5 | `GET /api/roles/{roleId}` | Role detail matches |
| 6 | `PATCH /api/roles/{roleId}` | Updated name/permissions |
| 7 | `DELETE /api/roles/{roleId}` | Success when no members; 400 when in use or system |

---

## Permission format

- **Create/update role:** Send multiple permission objects, one per resource+action combination.
- **Valid resources** (from `src/lib/permission.ts`): workorders, tasks, expenses, priceList, invoices, quotes, clients, users, roles, settings, reminders, auditLogs, business, etc.
- **Valid actions** per resource: typically `create`, `read`, `update`, `delete` (check matrix for each resource).

---

## Related

- **Service:** `role.service.ts` – listRoles, getPermissionMatrix, getAllActions, getRoleById, createRole, updateRole, deleteRole; validatePermissions; seedSystemRoles (Admin, Technician).
- **Errors:** `RoleNotFoundError` → 404, `RoleInUseError` → 400, `InvalidPermissionError` → 400 (in handler).
- **Permission definitions:** `src/lib/permission.ts` – statement and default role permissions.
