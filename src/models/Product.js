const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  images: [{
    url: { type: String, required: true },
    isMain: { type: Boolean, default: false }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  validate: {
    validator: function(images) {
      return images.length >= 1 && images.length <= 4;
    },
    message: 'Product must have between 1-4 images'
  }
});


  module.exports = mongoose.model('Product', productSchema);
