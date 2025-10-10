import Reel from '../models/reel.model.js';

// @desc    Create a new reel
// @route   POST /api/reels
// @access  Private (Admin)
export const createReel = async (req, res) => {
  try {
    const { title, productName, youtubeLink } = req.body;

    const newReel = await Reel.create({ title, productName, youtubeLink });
    res.status(201).json({ success: true, data: newReel });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
// @desc    Fetch all reels
// @route   GET /api/reels
// @access  Public
export const getAllReels = async (req, res) => {
  try {
    const reels = await Reel.find().sort({ createdAt: -1 }); // Sort by newest
    res.status(200).json({ success: true, count: reels.length, data: reels });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Fetch a single reel by ID
// @route   GET /api/reels/:id
// @access  Public
export const getReelById = async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ success: false, message: 'Reel not found' });
    }
    res.status(200).json({ success: true, data: reel });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Update a reel by ID
// @route   PUT /api/reels/:id
// @access  Private (Admin)
export const updateReel = async (req, res) => {
  try {
    const reel = await Reel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!reel) {
      return res.status(404).json({ success: false, message: 'Reel not found' });
    }
    res.status(200).json({ success: true, data: reel });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Delete a reel by ID
// @route   DELETE /api/reels/:id
// @access  Private (Admin)
export const deleteReel = async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ success: false, message: 'Reel not found' });
    }
    await reel.deleteOne();
    res.status(200).json({ success: true, message: 'Reel deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};