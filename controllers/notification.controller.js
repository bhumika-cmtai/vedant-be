import { User } from '../models/user.model.js';
import { sendBulkEmail } from '../services/emailService.js';
import Notification from '../models/notification.model.js';
// Import the Cloudinary upload utility
import { uploadOnCloudinary } from '../config/cloudinary.js'; // Adjust the path if necessary

/**
 * @desc    Create and send notification to all users
 * @route   POST /api/v1/notifications
 * @access  Private/Admin
 */
export const createNotification = async (req, res) => {
  const { title, message } = req.body;

  if (!title || !message) {
    return res.status(400).json({ 
      success: false,
      message: 'Title and message are required.' 
    });
  }

  try {
    let imageUrl = null;
    
    // Check if an image file was uploaded by multer
    if (req.file && req.file.path) {
      // Upload the file from the local path to Cloudinary
      const cloudinaryResponse = await uploadOnCloudinary(req.file.path);

      // Check if the upload was successful and we have a URL
      if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
        return res.status(500).json({
          success: false,
          message: "Error uploading image to Cloudinary. Please try again."
        });
      }
      
      // Assign the secure URL from Cloudinary
      imageUrl = cloudinaryResponse.secure_url;
    }

    // Fetch all users to send them the notification
    const users = await User.find({}, 'email');
    
    if (!users || users.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No users found to send notification to.' 
      });
    }

    const emailList = users.map(user => user.email).filter(email => email);

    // Send the bulk email, now with the potential Cloudinary image URL
    const emailResult = await sendBulkEmail(emailList, title, message, imageUrl);
    
    // If sending emails fails, stop and return an error
    if (!emailResult.success) {
      return res.status(500).json({ 
        success: false,
        message: 'Failed to send notification emails.',
        error: emailResult.error
      });
    }

    // If emails are sent, create the notification record in the database
    const newNotification = new Notification({
      title,
      message,
      image: imageUrl, // Save the Cloudinary URL to the database
      sentTo: emailList.length,
    });

    await newNotification.save();

    // Send the final success response
    res.status(201).json({
      success: true,
      message: `Notification successfully created and sent to ${emailList.length} users.`,
      data: newNotification,
    });

  } catch (error) {
    console.error('Error in createNotification controller:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while creating notification.',
      error: error.message
    });
  }
};

/**
 * @desc    Get all notifications with pagination
 * @route   GET /api/v1/notifications
 * @access  Private/Admin
 */
export const getAllNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalNotifications = await Notification.countDocuments();
    const totalPages = Math.ceil(totalNotifications / limit);

    res.status(200).json({
      success: true,
      message: 'Notifications fetched successfully.',
      data: notifications,
      currentPage: page,
      totalPages,
      totalNotifications,
    });

  } catch (error) {
    console.error('Error in getAllNotifications controller:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while fetching notifications.',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a notification by ID
 * @route   DELETE /api/v1/notifications/:id
 * @access  Private/Admin
 */
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ 
        success: false,
        message: 'Notification not found.' 
      });
    }
    
    // Optional: Delete image from Cloudinary when deleting notification
    // if (notification.image) {
    //   const publicId = getPublicIdFromUrl(notification.image); // You would need this utility in your cloudinary.js
    //   if (publicId) {
    //     await deleteFromCloudinary(publicId);
    //   }
    // }

    await Notification.findByIdAndDelete(req.params.id);

    res.status(200).json({ 
      success: true,
      message: 'Notification deleted successfully.' 
    });

  } catch (error) {
    console.error('Error in deleteNotification controller:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while deleting notification.',
      error: error.message
    });
  }
};