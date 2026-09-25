import { Router } from 'express';
import { VendorOsAdminController as C } from '../../controllers/vendor-os/admin.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/authorization.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  adminAssignOwnerSchema,
  adminPlanSchema,
  adminRejectSchema,
  adminSuspendSchema,
  adminVerificationSchema,
  createCategoryConfigSchema,
  updateCategoryConfigSchema,
} from '../../validators/vendor-os.validator';

/**
 * @swagger
 * tags:
 *   - name: Vendor OS Admin
 *     description: ApnaUtsav's internal console — review, approve and manage Vendor OS vendors. Family-app JWT of a User with role 'admin'.
 * /vendor-os/admin/vendors:
 *   get:
 *     summary: List Vendor OS vendors (with statusCounts in meta)
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, example: "pending_review" }, description: "Comma-separated: draft, pending_review, active, inactive, suspended, rejected" }
 *       - { in: query, name: osCategory, schema: { type: string, example: "venue" } }
 *       - { in: query, name: search, schema: { type: string }, description: Business name, phone, slug or city }
 *       - { in: query, name: osEnabled, schema: { type: string, enum: [all] }, description: "'all' also includes non-Vendor-OS marketplace listings" }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Vendors }
 *       401: { description: Not logged in }
 *       403: { description: Not an admin }
 * /vendor-os/admin/vendors/{vendorId}:
 *   get:
 *     summary: Vendor detail for review (profile, completeness, owner login)
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string }, description: "WeddingVendor id (not the VendorUser id)" }
 *     responses:
 *       200: { description: Vendor }
 *       404: { description: Vendor not found }
 * /vendor-os/admin/vendors/{vendorId}/approve:
 *   post:
 *     summary: Approve a vendor — status → active, sets firstPublishedAt, notifies the vendor. Unlocks the panel dashboard.
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string, example: "6ab4f3f4f64ae5253df81ad4" }, description: "WeddingVendor id (not the VendorUser id)" }
 *     responses:
 *       200: { description: Approved vendor }
 *       404: { description: Vendor not found }
 * /vendor-os/admin/vendors/{vendorId}/reject:
 *   post:
 *     summary: Request changes — status → rejected with a note shown to the vendor
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string, maxLength: 1000, example: "Please add at least 5 portfolio photos" } } }
 *     responses:
 *       200: { description: Rejected vendor }
 * /vendor-os/admin/vendors/{vendorId}/suspend:
 *   post:
 *     summary: Suspend (panel becomes read-only) or lift a suspension
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [suspended], properties: { suspended: { type: boolean }, reason: { type: string, maxLength: 1000 } } }
 *     responses:
 *       200: { description: Updated vendor }
 * /vendor-os/admin/vendors/{vendorId}/verification:
 *   patch:
 *     summary: Set verification badges
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { phone: { type: boolean }, gst: { type: boolean }, identity: { type: boolean }, visited: { type: boolean } } }
 *     responses:
 *       200: { description: Updated vendor }
 * /vendor-os/admin/vendors/{vendorId}/plan:
 *   patch:
 *     summary: Change the vendor's Vendor OS plan
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [plan], properties: { plan: { type: string, enum: [free, pro, business] } } }
 *     responses:
 *       200: { description: Updated vendor }
 * /vendor-os/admin/vendors/{vendorId}/assign-owner:
 *   post:
 *     summary: Hand an existing marketplace listing to a Vendor OS owner login (by phone)
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: vendorId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [phone, osCategory], properties: { phone: { type: string, example: "9876543210" }, name: { type: string }, osCategory: { type: string, example: "photography" } } }
 *     responses:
 *       200: { description: Owner assigned }
 * /vendor-os/admin/categories:
 *   get:
 *     summary: List category configs (profile schema, pricing basis, quote defaults)
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Categories }
 *   post:
 *     summary: Create a category config
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [key, name], properties: { key: { type: string, example: "florist" }, name: { type: string, example: "Florist" }, icon: { type: string } } }
 *     responses:
 *       201: { description: Created }
 * /vendor-os/admin/categories/{key}:
 *   patch:
 *     summary: Update a category config
 *     tags: [Vendor OS Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: key, required: true, schema: { type: string, example: "photography" } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Updated }
 */

// /vendor-os/admin — ApnaUtsav's internal console for Vendor OS. Uses the
// existing family-app admin role (a User with role 'admin').
const router: Router = Router();
router.use(authMiddleware, requireAdmin);

router.get('/vendors', C.listVendors);
router.get('/vendors/:vendorId', C.getVendor);
router.post('/vendors/:vendorId/approve', C.approve);
router.post('/vendors/:vendorId/reject', validate(adminRejectSchema), C.reject);
router.post('/vendors/:vendorId/suspend', validate(adminSuspendSchema), C.suspend);
router.patch('/vendors/:vendorId/verification', validate(adminVerificationSchema), C.verification);
router.patch('/vendors/:vendorId/plan', validate(adminPlanSchema), C.plan);
router.post('/vendors/:vendorId/assign-owner', validate(adminAssignOwnerSchema), C.assignOwner);

router.get('/categories', C.listCategories);
router.post('/categories', validate(createCategoryConfigSchema), C.createCategory);
router.patch('/categories/:key', validate(updateCategoryConfigSchema), C.updateCategory);

export default router;
