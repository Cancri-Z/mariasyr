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
const expressLayouts = require('express-ejs-layouts');
const flash = require('express-flash');
const methodOverride = require('method-override');
const fs = require('fs');

// Storage Configuration
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Separate upload middlewares
const uploadSingle = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single('image'); // For single image upload

const uploadArray = multer({
  storage: storage,
  limits: {
    files: 4, // Max 4 files
    fileSize: 5 * 1024 * 1024, // 5MB per file
    fileFilter: (req, file, cb) => {
      // Only accept files with content
      if (file.originalname === 'blob') {
        return cb(new Error('Empty file detected'), false);
      }
      cb(null, true);
    }
  }
}).array('newImages');

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
app.post('/api/products', isAdmin, (req, res) => {
  uploadArray(req, res, async (err) => {
    // Handle upload errors
    if (err) {
      let errorMessage = err.message;
      if (err.code === 'LIMIT_UNEXPECTED_FILE') errorMessage = 'Maximum 4 images allowed';
      if (err.code === 'LIMIT_FILE_SIZE') errorMessage = 'Each image must be <5MB';

      // Cleanup any uploaded files
      if (req.files?.length > 0) {
        cleanupFiles(req.files);
      }

      req.flash('error', errorMessage);
      return res.redirect('/admin/products/new');
    }

    // Filter out any empty files that might have come through
    const validFiles = req.files?.filter(file => 
      file.size > 0 && file.originalname !== 'blob'
    ) || [];

    try {
      // Validate at least one image
      if (validFiles.length === 0) {
        req.flash('error', 'At least one valid image is required');
        return res.redirect('/admin/products/new');
      }

      // Process images
      const images = req.files.map((file, index) => ({
        url: `/uploads/${file.filename}`,
        isMain: index === 0
      }));

      // Validate required fields
      const requiredFields = {
        name: req.body.name?.trim(),
        description: req.body.description?.trim(),
        category: req.body.category?.trim()
      };

      // Check for missing required fields
      for (const [field, value] of Object.entries(requiredFields)) {
        if (!value && value !== 0) { // 0 is valid for price
          throw new Error(`${field} is required`);
        }
      }

      // Create and save product
      const product = new Product({
        ...requiredFields,
        images: images,
        stock: parseInt(req.body.stock) || 0
      });

      // Additional validation
      await product.validate();

      const savedProduct = await product.save();
      console.log('Successfully saved product:', {
        _id: savedProduct._id,
        category: savedProduct.category
      });

      req.flash('success', 'Product created successfully!');
      res.redirect('/admin/products/list');
    } catch (error) {
      // Cleanup uploaded files on error
      if (req.files) {
        cleanupFiles(req.files);
      }

      // Enhanced error reporting
      const errorMessage = error.errors 
        ? Object.values(error.errors).map(e => e.message).join(', ')
        : error.message;

      console.error('Product creation failed:', {
        error: errorMessage,
        receivedData: {
          name: req.body.name,
          category: req.body.category,
        },
        stack: error.stack
      });

      req.flash('error', errorMessage);
      res.redirect('/admin/products/new');
    }
  });
});

// Helper function
function cleanupFiles(files) {
  files.forEach(file => {
    try {
      fs.unlinkSync(path.join(__dirname, '../../public/uploads', file.filename));
    } catch (err) {
      console.error('Error cleaning up file:', file.filename, err);
    }
  });
}
// ===========================

// =================================
// Update product
app.put('/api/products/:id', isAdmin, (req, res) => {
  uploadArray(req, res, async (err) => {
    try {
      // 1. Get current product
      const product = await Product.findById(req.params.id);
      if (!product) {
        req.flash('error', 'Product not found');
        return res.redirect('/admin/products');
      }

      // 2. Process image updates
      const currentImages = product.images || [];
      const imagesToKeep = req.body.keepImages || [];
      const newMainImageId = req.body.mainImage;

      // Calculate available slots
      const availableSlots = Math.max(0, 4 - currentImages.length);
      const newImagesCount = req.files?.length || 0;

      if (newImagesCount > availableSlots) {
        throw new Error(`You can only add ${availableSlots} more image(s)`);
      }

      // 3. Filter and update images
      let updatedImages = currentImages.filter(img => 
        imagesToKeep.includes(img._id.toString())
      );

      // 4. Add new images
      if (req.files?.length > 0) {
        const newImages = req.files.map(file => ({
          url: `/uploads/${file.filename}`,
          isMain: false
        }));
        updatedImages = [...updatedImages, ...newImages];
      }

      // 5. Set main image
      updatedImages.forEach(img => {
        img.isMain = img._id?.toString() === newMainImageId;
      });

      // Ensure at least one main image
      if (!updatedImages.some(img => img.isMain)) {
        updatedImages[0].isMain = true;
      }

      // 6. Update product
      await Product.findByIdAndUpdate(
        req.params.id,
        {
          name: req.body.name,
          description: req.body.description,
          category: req.body.category,
          images: updatedImages
        },
        { new: true, runValidators: true }
      );

      // 7. Cleanup deleted images
      const deletedImages = currentImages.filter(img => 
        !imagesToKeep.includes(img._id.toString())
      );
      cleanupImages(deletedImages);

      req.flash('success', 'Product updated successfully');
      res.redirect('/admin/products/list');

    } catch (err) {
      // Cleanup any uploaded files if error occurred
      if (req.files) {
        cleanupFiles(req.files);
      }
      
      req.flash('error', err.message);
      res.redirect(`/admin/products/edit/${req.params.id}`);
    }
  });
});

function cleanupImages(images) {
  images.forEach(img => {
    if (!img.url.includes('default-product')) {
      const imagePath = path.join(__dirname, '../../public', img.url);
      fs.unlink(imagePath, err => {
        if (err) console.error('Error deleting image:', err);
      });
    }
  });
}

function cleanupFiles(files) {
  files.forEach(file => {
    fs.unlinkSync(path.join(__dirname, '../../public/uploads', file.filename));
  });
}
// ==================================

// =================================
// Delete product
app.delete('/api/products/:id', isAdmin, async (req, res) => {
  try {
    // First find the product to get image references
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/admin/products/list');
    }
    await Product.findByIdAndDelete(req.params.id);

    // Handle image deletion (synchronously for simplicity)
    if (product.images && product.images.length > 0) {
      for (const image of product.images) {
        if (image.url && !image.url.includes('default-product')) {
          const imagePath = path.join(__dirname, '../../public', image.url);
          try {
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
              console.log('Deleted image:', imagePath);
            }
          } catch (err) {
            console.error('Error deleting image:', imagePath, err);
          }
        }
      }
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
      req.flash('error', 'Product not found');
      return res.redirect('/admin/products/list');
    }
    
    res.render('admin/products/edit', {
      title: 'Edit Product',
      product,
      remainingImageSlots: 4 - (product.images?.length || 0) // Add this line
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load product');
    res.redirect('/admin/products/list');
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