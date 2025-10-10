import express from 'express';
import {
  createReel,
  getAllReels,
  getReelById,
  updateReel,
  deleteReel,
} from '../controllers/reel.controller.js';

const router = express.Router();

// You would typically protect admin routes with authentication middleware
// import { protect, admin } from '../middleware/authMiddleware.js';

// router.route('/').post(protect, admin, createReel).get(getAllReels);
// router.route('/:id').get(getReelById).put(protect, admin, updateReel).delete(protect, admin, deleteReel);

// Unprotected version for development:
router.route('/').post(createReel).get(getAllReels);
router.route('/:id').get(getReelById).put(updateReel).delete(deleteReel);


export default router;