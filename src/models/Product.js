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
    image: {
      type: String,
      required: true,
      default: 'default-product.png'
    },
    category: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  });

  module.exports = mongoose.model('Product', productSchema);
