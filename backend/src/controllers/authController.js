const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/token');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config/env');
const logger = require('../utils/logger');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

    const newUser = await userModel.createUser({ name, email, passwordHash, role });
    const token = generateToken(newUser);

    logger.info('User registered', { userId: newUser.id, email: newUser.email });

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        user: userModel.toSafeUser(newUser),
        token,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await userModel.findByEmail(email);

    const invalidCredentialsError = new AppError('Invalid email or password.', 401);

    if (!user) {
      logger.warn('Login attempt for non-existent email');
      throw invalidCredentialsError;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      logger.warn('Failed login attempt', { userId: user.id });
      throw invalidCredentialsError;
    }

    const token = generateToken(user);

    logger.info('User logged in', { userId: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: userModel.toSafeUser(user),
        token,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await userModel.findById(req.user.sub);
    if (!user) {
      throw new AppError('User no longer exists.', 404);
    }
    return res.status(200).json({
      success: true,
      data: { user: userModel.toSafeUser(user) },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, getProfile };
