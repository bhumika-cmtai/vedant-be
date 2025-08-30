import express from 'express';
import { 
  createNotification, 
  getAllNotifications, 
  deleteNotification 
} from '../controllers/notification.controller.js';
// import { isAdmin } from '../middlewares/auth.middleware.js';

// You need to set up multer for file handling
// import multer from 'multer';
// const upload = multer({ dest: 'uploads/' }); // Configure storage as needed

const router = express.Router();

// // Update the POST route to handle multipart/form-data and a single file upload named 'image'
// router.route('/')
//   .post(/* isAdmin, */ upload.single('image'), createNotification)
//   .get(/* isAdmin, */ getAllNotifications);

// router.route('/:id')
//   .delete(/* isAdmin, */ deleteNotification);

export default router;
