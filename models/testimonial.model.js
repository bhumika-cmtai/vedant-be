import mongoose from 'mongoose';

const testimonialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'The name of the person giving the testimonial is required.'],
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
  timestamps: true,
});

const Testimonial = mongoose.model('Testimonial', testimonialSchema);

export default Testimonial;