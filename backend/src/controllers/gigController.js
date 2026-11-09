const Gig = require('../models/Gig');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

async function listGigs(req, res, next) {
  try {
    const gigs = await Gig.find({ isActive: true })
      .populate('freelancer', 'name email')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { gigs } });
  } catch (err) {
    return next(err);
  }
}

async function getGig(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id).populate('freelancer', 'name email');
    if (!gig) throw new AppError('Gig not found.', 404);
    return res.status(200).json({ success: true, data: { gig } });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('Gig not found.', 404));
    return next(err);
  }
}

async function listMyGigs(req, res, next) {
  try {
    const gigs = await Gig.find({ freelancer: req.user.sub }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { gigs } });
  } catch (err) {
    return next(err);
  }
}

async function createGig(req, res, next) {
  try {
    const { title, description, category, price } = req.body;
    const gig = await Gig.create({
      title,
      description,
      category,
      price,
      freelancer: req.user.sub,
    });
    logger.info('Gig created', { gigId: gig.id, freelancerId: req.user.sub });
    return res.status(201).json({ success: true, data: { gig } });
  } catch (err) {
    return next(err);
  }
}

async function updateGig(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) throw new AppError('Gig not found.', 404);

    if (String(gig.freelancer) !== String(req.user.sub)) {
      throw new AppError('Gig not found.', 404);
    }

    const { title, description, category, price, isActive } = req.body;
    if (title !== undefined) gig.title = title;
    if (description !== undefined) gig.description = description;
    if (category !== undefined) gig.category = category;
    if (price !== undefined) gig.price = price;
    if (isActive !== undefined) gig.isActive = isActive;

    await gig.save();
    logger.info('Gig updated', { gigId: gig.id, freelancerId: req.user.sub });
    return res.status(200).json({ success: true, data: { gig } });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('Gig not found.', 404));
    return next(err);
  }
}

async function deleteGig(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) throw new AppError('Gig not found.', 404);

    if (String(gig.freelancer) !== String(req.user.sub)) {
      throw new AppError('Gig not found.', 404);
    }

    await gig.deleteOne();
    logger.info('Gig deleted', { gigId: req.params.id, freelancerId: req.user.sub });
    return res.status(200).json({ success: true, message: 'Gig deleted.' });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('Gig not found.', 404));
    return next(err);
  }
}

module.exports = { listGigs, getGig, listMyGigs, createGig, updateGig, deleteGig };
