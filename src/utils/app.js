require('dotenv').config();
const express = require('express');
const path = require('path');
const connectDB = require(path.join(__dirname, '../config/db'));
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const Product = require('../models/Product');
const User = require('../models/User');
const { isAdmin } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' });
const expressLayouts = require('express-ejs-layouts');
const flash = require('express-flash');
const methodOverride = require('method-override');
const fs = require('fs');


// Database connection (immediately after dotenv)
connectDB();

// Initialize app
const app = express();

// ======================
// Middleware Setup
// ======================
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public'), { maxAge: '1y' }));

// PARSE DATA FOR ALL FORMS
app.use(express.urlencoded({ extended: true })); // Parse form data

// ==============
// SESSION CONFIG
// ==============
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: true, // Changed from false
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  },
  name: 'mariaFashion.sid' // Unique session name
}));

// FOR PUT/DELETE =======================
app.use(methodOverride('_method'));

// FLASH MESSAGING =============
app.use(flash());

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport local strategy
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) return done(null, false, { message: 'Incorrect username.' });
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return done(null, false, { message: 'Incorrect password.' });
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Replace existing serialize/deserialize with:
passport.serializeUser((user, done) => {
  done(null, { 
    id: user.id, 
    username: user.username,
    role: user.role 
  });
});

passport.deserializeUser(async (obj, done) => {
  try {
    const user = await User.findById(obj.id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// EJS Configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../views'));

app.use(expressLayouts);
app.set('layout', 'admin/layout'); //  Default layout

// Template variables
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };
  next();
});

// ======================
// Routes
// ======================

// ROOT ROUTE ======================
app.get('/', async (req, res) => {
  try {
    // Get 3 featured products from database
    const products = await Product.find().limit(3).lean(); 
    
    res.render('pages/index', {
      title: 'Maria Fashion Design - Home',
      products: products || [] // Pass empty array if no products
    });
  } catch (err) {
    console.error('Error loading index:', err);
    // Render index even if products fail to load
    res.render('pages/index', {
      title: 'Maria Fashion Design - Home',
      products: []
    });
  }
});
// END ROOT ROUTE =================================


// PRODUCT ROUTES ==========================

// ===============================
// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ==================================

//==========================
// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================

// ================================
// Create product route
app.post('/api/products', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const product = new Product({
      name: req.body.name,
      price: parseFloat(req.body.price),
      description: req.body.description,
      category: req.body.category,
      stock: parseInt(req.body.stock) || 0,
      image: req.file ? `/uploads/${req.file.filename}` : '/images/default-product.png'
    });


    const savedProduct = await product.save();
    console.log('Saved Product:', savedProduct); // Debug after saving

    req.flash('success', 'Product created successfully!');
    res.redirect('/admin/products/list');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/products/new');
  }
});
// ===========================

// =================================
// Update product
app.put('/api/products/:id', isAdmin, upload.single('image'), async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name || !req.body.description || !req.body.category) {
      req.flash('error', 'Name, description and category are required');
      return res.redirect(`/admin/products/edit/${req.params.id}`);
    }

    const updateData = {
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
    };

    // Handle image update
    if (req.file) {
    updateData.image = `/uploads/${req.file.filename}`;
    
    // Delete old image if exists
    const oldProduct = await Product.findById(req.params.id);
    if (oldProduct.image && !oldProduct.image.includes('default-product')) {
      const oldImagePath = path.join(__dirname, '../public', oldProduct.image);
      fs.unlink(oldImagePath, err => {
        if (err) console.error('Error deleting old image:', err);
      });
    }
  }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.redirect('/admin/products/list');
    }
    res.redirect('/admin/products/list');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/products/edit/${req.params.id}`);
  }
});
// ==================================

// =================================
// Delete product
app.delete('/api/products/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/admin/products/list');
    }

    // Optional: Delete associated image file
    if (product.image && !product.image.includes('default-product')) {
      const imagePath = path.join(__dirname, '../public', product.image);
      fs.unlink(imagePath, err => {
        if (err) console.error('Error deleting image:', err);
      });
    }

    req.flash('success', 'Product deleted successfully');
    res.redirect('/admin/products/list');
  } catch (err) {
    console.error('Delete error:', err);
    req.flash('error', 'Failed to delete product');
    res.redirect('/admin/products/list');
  }
});
// ==================================
// END PRODUCT ROUTES =================



// ======================
// ADMIN ROUTES
// ======================

// Admin login routes ==========================
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login' });
});

// Replace your current login route with this:
app.post('/admin/login', 
  express.urlencoded({ extended: true }), // Ensure form data is parsed
  (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        console.log('Auth failed:', info); // Debug
        req.flash('error', info.message);
        return res.redirect('/admin/login');
      }
      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.redirect('/admin/dashboard');
      });
    })(req, res, next);
  }
);
// =========================================

// Admin dashboard (protected) ======================
app.get('/admin/dashboard', isAdmin, (req, res) => {
  res.render('admin/dashboard', { 
    title: 'Admin Dashboard',
    user: req.user 
  });
});
// ====================================

// Admin product management ============================
app.get('/admin/products/list', isAdmin, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.render('admin/products/list', {
      title: 'Manage Products',
      products
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});
// ====================================================

// Add new product form ===============================
app.get('/admin/products/new', isAdmin, (req, res) => {
  res.render('admin/products/new', {
    title: 'Add New Product'
  });
});
// ==============================================

// Edit product form =================================
app.get('/admin/products/edit/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.redirect('/admin/products');
    }
    res.render('admin/products/edit', {
      title: 'Edit Product',
      product
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/products');
  }
});
// =====================
// =============================

// Logout
app.get('/admin/logout', (req, res) => {
  req.logout();
  res.redirect('/admin/login');
});
// END ADMIN ROUTES ====================


// ======================
// Error Handling
// ======================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('pages/error', {
    title: 'Server Error',
    error: 'Something went wrong!'
  });
});

// ======================
// SERVER INITIALIZATION
// ======================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});