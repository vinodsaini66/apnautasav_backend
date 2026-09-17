import { Request, Response } from 'express';
import { WeddingVendorService } from '../services/wedding-vendor.service';
import { ApiResponse } from '../utils/apiResponse';
import logger from '../utils/logger';

// Fields only shown to a logged-in family — the whole point of requiring an
// account before contacting a vendor. Everything else on the listing
// (name, description, photos, location, pricing, ratings, ...) stays public
// so families can still discover/evaluate vendors without an account.
// `website` is intentionally NOT included — it's a public marketing link,
// not a direct-contact channel, so it stays visible either way.
const CONTACT_FIELDS = ['phone', 'alternatePhone', 'whatsappNumber', 'email'] as const;
// Per-branch contact fields (on each entry of `locations[]`) — same rule,
// applied per-location instead of at the top level.
const BRANCH_CONTACT_FIELDS = ['phone', 'whatsappNumber'] as const;

/**
 * Strips direct-contact fields from a lean WeddingVendor object unless the
 * request carries a valid auth token. Adds `contactVisible` so the frontend
 * can distinguish "not logged in" from "vendor just has no phone on file".
 * Also masks per-branch phone/whatsapp on each `locations[]` entry — a
 * multi-location vendor's other branches shouldn't leak contact info that
 * the primary location's fields are already gated on.
 */
const applyContactVisibility = (vendor: any, isAuthenticated: boolean) => {
    if (isAuthenticated) {
        return { ...vendor, contactVisible: true };
    }

    const masked = { ...vendor, contactVisible: false };
    for (const field of CONTACT_FIELDS) {
        delete masked[field];
    }
    if (Array.isArray(masked.locations)) {
        masked.locations = masked.locations.map((branch: any) => {
            const maskedBranch = { ...branch };
            for (const field of BRANCH_CONTACT_FIELDS) {
                delete maskedBranch[field];
            }
            return maskedBranch;
        });
    }
    return masked;
};

export class WeddingVendorController {

    /**
     * Create Wedding Vendor
     */
    static async createVendor(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const vendor =
                await WeddingVendorService.createVendor(
                    req.body
                );

            ApiResponse.success(
                res,
                201,
                {
                    message: 'Wedding vendor created successfully',
                    data: vendor
                }
            );

        } catch (error: any) {
            logger.error(
                'Create wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to create wedding vendor'
            );
        }
    }


    /**
     * Get Wedding Vendors
     */
    static async getVendors(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const {
                page = 1,
                limit = 20,
                search,
                city,
                state,
                area,
                status,
                isVerified,
                isFeatured,
                isPremium,
                categoryId,
                minPrice,
                maxPrice,
                minRating,
                minReviews,
                hasAwards,
                sortBy,
            } = req.query;

            const result =
                await WeddingVendorService.getVendors(
                    Number(page),
                    Number(limit),
                    {
                        search: search as string,
                        city: city as string,
                        state: state as string,
                        area: area as string,
                        status: status as string,
                        isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
                        isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
                        isPremium: isPremium !== undefined ? isPremium === 'true' : undefined,
                        categoryId: categoryId as string,
                        minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
                        maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
                        minRating: minRating !== undefined ? Number(minRating) : undefined,
                        minReviews: minReviews !== undefined ? Number(minReviews) : undefined,
                        hasAwards: hasAwards !== undefined ? hasAwards === 'true' : undefined,
                        sortBy: sortBy as 'recommended' | 'rating' | 'reviews' | 'price_low' | 'price_high' | 'newest' | undefined,
                    }
                );

            const isAuthenticated = !!req.user;
            const vendors = result.vendors.map((vendor) =>
                applyContactVisibility(vendor, isAuthenticated)
            );

            ApiResponse.paginated(
                res,
                vendors,
                result.page,
                result.limit,
                result.total
            );

        } catch (error: any) {
            logger.error(
                'Get wedding vendors error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch wedding vendors'
            );
        }
    }


    /**
     * Get Wedding Vendor By ID
     */
    static async getVendorById(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } =
                req.params;

            const vendor =
                await WeddingVendorService
                    .getVendorById(vendorId);

            if (!vendor) {
                ApiResponse.error(
                    res,
                    404,
                    'Wedding vendor not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    data: applyContactVisibility(vendor, !!req.user),
                    message: 'Wedding vendor fetched successfully'
                }
            );


        } catch (error: any) {
            logger.error(
                'Get wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to fetch wedding vendor'
            );
        }
    }


    /**
     * Update Wedding Vendor
     */
    static async updateVendor(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } =
                req.params;

            const vendor =
                await WeddingVendorService
                    .updateVendor(
                        vendorId,
                        req.body
                    );

            if (!vendor) {
                ApiResponse.error(
                    res,
                    404,
                    'Wedding vendor not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Wedding vendor updated successfully',
                    data: vendor
                }
            );

        } catch (error: any) {
            logger.error(
                'Update wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to update wedding vendor'
            );
        }
    }


    /**
     * Delete Wedding Vendor
     */
    static async deleteVendor(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } =
                req.params;

            const vendor =
                await WeddingVendorService
                    .deleteVendor(vendorId);

            if (!vendor) {
                ApiResponse.error(
                    res,
                    404,
                    'Wedding vendor not found'
                );

                return;
            }

            ApiResponse.success(
                res,
                200,
                {
                    message: 'Wedding vendor deleted successfully',
                    data: vendor
                }
            );

        } catch (error: any) {
            logger.error(
                'Delete wedding vendor error:',
                error
            );

            ApiResponse.error(
                res,
                500,
                error.message ||
                'Failed to delete wedding vendor'
            );
        }
    }


    /**
     * Create Vendor Inquiry
     * The public profile page's "Send Message" CTA. Requires auth (see
     * route) — kept consistent with contact info itself being login-gated,
     * so this can't be used to reach a vendor while bypassing that gate.
     */
    static async createInquiry(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;
            const userId = req.user?.userId;
            const { fullName, phone, email, whatsappNumber, functionDate, guestCount, functionType, message } = req.body;

            if (!fullName || !phone) {
                ApiResponse.error(res, 400, 'Full name and phone are required');
                return;
            }

            const inquiry = await WeddingVendorService.createInquiry(vendorId, userId, {
                fullName,
                phone,
                email,
                whatsappNumber,
                functionDate,
                guestCount: guestCount !== undefined ? Number(guestCount) : undefined,
                functionType,
                message,
            });

            ApiResponse.success(res, 201, {
                message: 'Your message has been sent to the vendor',
                data: inquiry,
            });
        } catch (error: any) {
            logger.error('Create wedding vendor inquiry error:', error);
            ApiResponse.error(
                res,
                error.message === 'Wedding vendor not found' ? 404 : 500,
                error.message || 'Failed to send message'
            );
        }
    }


    /**
     * Get Vendor Reviews (public)
     */
    static async getVendorReviews(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;
            const { page = 1, limit = 10 } = req.query;

            const result = await WeddingVendorService.getVendorReviews(vendorId, Number(page), Number(limit));

            ApiResponse.success(res, 200, {
                message: 'Vendor reviews fetched successfully',
                data: {
                    reviews: result.reviews,
                    ratingDistribution: result.ratingDistribution,
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                    totalPages: result.totalPages,
                },
            });
        } catch (error: any) {
            logger.error('Get wedding vendor reviews error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to fetch reviews');
        }
    }


    /**
     * Get My Tracker Link
     * Backs the "Write a Review" button — see service method's comment.
     */
    static async getMyTrackerLink(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { vendorId } = req.params;
            const userId = req.user!.userId;

            const link = await WeddingVendorService.getMyTrackerLink(vendorId, userId);

            ApiResponse.success(res, 200, {
                message: link ? 'Tracker link found' : 'Not added to any wedding yet',
                data: link,
            });
        } catch (error: any) {
            logger.error('Get wedding vendor tracker link error:', error);
            ApiResponse.error(res, 500, error.message || 'Failed to resolve tracker link');
        }
    }
}