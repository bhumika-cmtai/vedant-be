import Testimonial from '../models/testimonial.model.js';

// @desc    Create a new testimonial
// @route   POST /api/testimonials
// @access  Private (Admin)
export const createTestimonial = async (req, res) => {
  try {
    const { name, productName, youtubeLink } = req.body;

    // Basic validation
    if (!name || !productName) {
      return res.status(400).json({ success: false, message: 'Name and product name are required.' });
    }

    const newTestimonial = await Testimonial.create({ name, productName, youtubeLink });

    res.status(201).json({ success: true, data: newTestimonial });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Fetch all testimonials
// @route   GET /api/testimonials
// @access  Public
export const getAllTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find().sort({ createdAt: -1 }); // Sort by newest
    res.status(200).json({ success: true, count: testimonials.length, data: testimonials });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Fetch a single testimonial by ID
// @route   GET /api/testimonials/:id
// @access  Public
export const getTestimonialById = async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }

    res.status(200).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Update a testimonial by ID
// @route   PUT /api/testimonials/:id
// @access  Private (Admin)
export const updateTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true, // Return the modified document
        runValidators: true, // Run schema validators on update
      }
    );

    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }

    res.status(200).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Delete a testimonial by ID
// @route   DELETE /api/testimonials/:id
// @access  Private (Admin)
export const deleteTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }

    await testimonial.deleteOne(); // Use deleteOne() to trigger any middleware if needed

    res.status(200).json({ success: true, message: 'Testimonial deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};