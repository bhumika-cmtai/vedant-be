import express from 'express';
import {
  createTestimonial,
  getAllTestimonials,
  getTestimonialById,
  updateTestimonial,
  deleteTestimonial,
} from '../controllers/testimonial.controller.js';

const router = express.Router();

router.route('/')
  .post(createTestimonial)
  .get(getAllTestimonials);

router.route('/:id')
  .get(getTestimonialById)
  .put(updateTestimonial)
  .delete(deleteTestimonial);

export default router;