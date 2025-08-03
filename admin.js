// createAdmin.js - Run this script to create admin user
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User'); // Adjust path as needed

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    await connectDB();
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Username: admin');
      console.log('Try logging in with password: admin123');
      process.exit(0);
    }
    
    // Create new admin
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('admin123', saltRounds);
    
    const admin = new User({
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      email: 'admin@mariafashion.com'
    });
    
    await admin.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('Email: admin@mariafashion.com');
    
    // Test the password
    const testMatch = await bcrypt.compare('admin123', admin.password);
    console.log('Password verification:', testMatch ? '✅ SUCCESS' : '❌ FAILED');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

createAdmin();