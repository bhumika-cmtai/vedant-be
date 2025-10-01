import { Router } from 'express';
import {
    createSubcategory,
    getAllsubategories,
    getsubcategoryById,
    updatesubCategory,
    deletesubcategory
} from '../controllers/subcategory.controller.js';
import { adminMiddleware } from '../middlewares/admin.middleware.js';
const router = Router();

// router.use(adminMiddleware)

router.route('/')
    .get(getAllsubategories) 
    .post(createSubcategory); 

router.route('/:id')
    .get(getsubcategoryById) 
    .patch(updatesubCategory) 
    .delete(deletesubcategory);

export default router;