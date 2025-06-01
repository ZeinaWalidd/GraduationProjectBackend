const express = require('express');
const router = express.Router();
const StoreController = require('../controllers/storeController');
const auth = require('../middleware/auth');

// Product routes
router.get('/products/add', auth, StoreController.renderAddProductForm);
router.get('/products', StoreController.getAllProducts);
router.get('/products/search', StoreController.searchProducts);
router.get('/products/category/:category', StoreController.getProductsByCategory);
router.get('/products/filter', StoreController.filterProducts);
router.post('/products', auth, StoreController.createProduct);
router.post('/products/upload-image', auth, StoreController.uploadProductImage);

// Cart routes
router.post('/cart/add', auth, StoreController.addToCart);
router.get('/cart', auth, StoreController.getCart);
router.put('/cart/update/:productId', auth, StoreController.updateCartItem);
router.delete('/cart/remove/:productId', auth, StoreController.removeFromCart);

// Order routes
router.post('/orders', auth, StoreController.createOrder);
router.get('/orders', auth, StoreController.getUserOrders);
router.get('/orders/:orderId', auth, StoreController.getOrderDetails);
router.post('/orders/confirm', auth, StoreController.confirmOrder);

// Payment routes
router.post('/payment/credit-card', auth, StoreController.processCreditCardPayment);
router.post('/payment/cash-on-delivery', auth, StoreController.processCashOnDelivery);

module.exports = router; 