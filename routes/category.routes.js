import { Router } from 'express';
import {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
} from '../controllers/category.controller.js';
import { adminMiddleware } from '../middlewares/admin.middleware.js';
const router = Router();

// router.use(adminMiddleware)

router.route('/')
    .get(getAllCategories) 
    .post(createCategory); 

router.route('/:id')
    .get(getCategoryById) 
    .patch(updateCategory) 
    .delete(deleteCategory);

export default router;