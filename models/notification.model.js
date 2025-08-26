import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Notification title is required.'],
    trim: true,
  },
  message: {
    type: String,
    required: [true, 'Notification message is required.'],
  },
  image: {
    type: String, // To store the URL of the uploaded image
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  sentTo: {
    type: Number, // Storing the count of users it was sent to
    required: true,
  }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;