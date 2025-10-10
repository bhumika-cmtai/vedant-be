import mongoose from 'mongoose';

const reelSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
  },
  productName: {
    type: String,
    trim: true,
  },
  youtubeLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(v);
      },
      message: props => `${props.value} is not a valid YouTube link!`
    },
  }
}, {
  // Automatically add createdAt and updatedAt timestamps
  timestamps: true,
});

const Reel = mongoose.model('Reel', reelSchema);

export default Reel;