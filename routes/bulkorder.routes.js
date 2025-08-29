import { Router } from 'express';
import {
    createBulkOrder,
    getAllBulkOrders,
    getBulkOrderById,
    updateBulkOrderStatus,
    deleteBulkOrder
} from '../controllers/bulkorder.controller.js';
// import { verifyJWT } from '../middlewares/auth.middleware.js';
// import { isAdmin } from '../middlewares/admin.middleware.js'; // Assuming you have an isAdmin middleware

const router = Router();

router.route('/').post(createBulkOrder);

router.route('/').get(getAllBulkOrders);

router.route('/:id')
    .get(getBulkOrderById)
    .patch(updateBulkOrderStatus)
    .delete(deleteBulkOrder);


export default router;