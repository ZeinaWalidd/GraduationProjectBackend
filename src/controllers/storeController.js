const db = require('../config');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/images/products');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Create unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept only image files
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
}).single('image');

const StoreController = {
    // Product Controllers
    getAllProducts: async (req, res) => {
        try {
            const [products] = await db.query('SELECT * FROM products');
            res.json(products);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    searchProducts: async (req, res) => {
        try {
            const { query } = req.query;
            const searchTerm = `%${query}%`;
            const [products] = await db.query(
                'SELECT * FROM products WHERE name LIKE ? OR description LIKE ?',
                [searchTerm, searchTerm]
            );
            res.json(products);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    getProductsByCategory: async (req, res) => {
        try {
            const { category } = req.params;
            const [products] = await db.query(
                'SELECT * FROM products WHERE category = ?',
                [category]
            );
            res.json(products);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    filterProducts: async (req, res) => {
        try {
            const { sort, minPrice, maxPrice, category, section, concern } = req.query;
            let query = 'SELECT * FROM products WHERE 1=1';
            const params = [];

            if (minPrice) {
                query += ' AND price >= ?';
                params.push(minPrice);
            }
            if (maxPrice) {
                query += ' AND price <= ?';
                params.push(maxPrice);
            }
            if (category) {
                query += ' AND category = ?';
                params.push(category);
            }
            if (section) {
                query += ' AND section = ?';
                params.push(section);
            }
            if (concern) {
                query += ' AND concern = ?';
                params.push(concern);
            }

            if (sort === 'price-asc') {
                query += ' ORDER BY price ASC';
            } else if (sort === 'price-desc') {
                query += ' ORDER BY price DESC';
            }

            const [products] = await db.query(query, params);
            res.json(products);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Cart Controllers
    addToCart: async (req, res) => {
        try {
            console.log('req.user:', req.user);
            const { productId, quantity } = req.body;
            
            // Check if user is authenticated
            if (!req.user || !req.user.id) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            
            const userId = req.user.id;
            console.log('Adding to cart:', { userId, productId, quantity });

            // Verify product exists
            const [products] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
            if (products.length === 0) {
                return res.status(404).json({ message: 'Product not found' });
            }

            // Get or create cart
            let [carts] = await db.query('SELECT * FROM carts WHERE user_id = ?', [userId]);
            let cartId;

            if (carts.length === 0) {
                console.log('Creating new cart for user:', userId);
                const [result] = await db.query('INSERT INTO carts (user_id, total_amount) VALUES (?, 0)', [userId]);
                cartId = result.insertId;
            } else {
                cartId = carts[0].id;
            }

            // Check if product exists in cart
            const [existingItems] = await db.query(
                'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
                [cartId, productId]
            );

            if (existingItems.length > 0) {
                console.log('Updating existing cart item quantity');
                await db.query(
                    'UPDATE cart_items SET quantity = quantity + ? WHERE cart_id = ? AND product_id = ?',
                    [quantity, cartId, productId]
                );
            } else {
                console.log('Adding new item to cart');
                await db.query(
                    'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
                    [cartId, productId, quantity]
                );
            }

            // Update cart total
            console.log('Updating cart total');
            await db.query(
                `UPDATE carts c 
                SET total_amount = (
                    SELECT COALESCE(SUM(ci.quantity * p.price), 0)
                    FROM cart_items ci
                    JOIN products p ON ci.product_id = p.id
                    WHERE ci.cart_id = c.id
                )
                WHERE c.id = ?`,
                [cartId]
            );

            // Get updated cart with items
            const [updatedCart] = await db.query(
                `SELECT 
                    c.id as cart_id,
                    c.user_id,
                    c.total_amount,
                    ci.id as cart_item_id,
                    ci.quantity,
                    p.id as product_id,
                    p.name,
                    p.price,
                    p.image
                FROM carts c
                JOIN cart_items ci ON c.id = ci.cart_id
                JOIN products p ON ci.product_id = p.id
                WHERE c.id = ?`,
                [cartId]
            );

            console.log('Cart updated successfully:', updatedCart);
            res.json({
                success: true,
                items: updatedCart,
                cartCount: updatedCart.length
            });
        } catch (error) {
            console.error('Error in addToCart:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to add item to cart',
                error: error.message 
            });
        }
    },

    getCart: async (req, res) => {
        try {
            console.log('req.user:', req.user);
            if (!req.user || !req.user.id) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const userId = req.user.id;
            const [cart] = await db.query(
                `SELECT 
                    c.id as cart_id,
                    c.user_id,
                    c.total_amount,
                    ci.id as cart_item_id,
                    ci.quantity,
                    p.id as product_id,
                    p.name,
                    p.price,
                    p.image,
                    p.description
                FROM carts c
                JOIN cart_items ci ON c.id = ci.cart_id
                JOIN products p ON ci.product_id = p.id
                WHERE c.user_id = ?`,
                [userId]
            );

            // Transform image paths to full URLs
            const cartWithImages = cart.map(item => ({
                ...item,
                image: item.image ? `/images/products/${item.image.split('/').pop()}` : null
            }));

            res.json({
                success: true,
                items: cartWithImages,
                cartCount: cart.length
            });
        } catch (error) {
            console.error('Error in getCart:', error);
            res.status(500).json({ 
                success: false,
                message: error.message 
            });
        }
    },

    updateCartItem: async (req, res) => {
        try {
            const { productId } = req.params;
            const { quantity } = req.body;
            const userId = req.user.id;

            // Update cart item quantity
            await db.query(
                'UPDATE cart_items SET quantity = ? WHERE cart_id = (SELECT id FROM carts WHERE user_id = ?) AND product_id = ?',
                [quantity, userId, productId]
            );

            // Update cart total
            await db.query(
                `UPDATE carts c 
                SET total_amount = (
                    SELECT COALESCE(SUM(ci.quantity * p.price), 0)
                    FROM cart_items ci
                    JOIN products p ON ci.product_id = p.id
                    WHERE ci.cart_id = c.id
                )
                WHERE c.user_id = ?`,
                [userId]
            );

            // Get updated cart with items
            const [updatedCart] = await db.query(
                `SELECT 
                    c.id as cart_id,
                    c.user_id,
                    c.total_amount,
                    ci.id as cart_item_id,
                    ci.quantity,
                    p.id as product_id,
                    p.name,
                    p.price,
                    p.image,
                    p.description
                FROM carts c
                JOIN cart_items ci ON c.id = ci.cart_id
                JOIN products p ON ci.product_id = p.id
                WHERE c.user_id = ?`,
                [userId]
            );

            // Transform image paths to full URLs
            const cartWithImages = updatedCart.map(item => ({
                ...item,
                image: item.image ? `/images/products/${item.image.split('/').pop()}` : null
            }));

            res.json({
                success: true,
                items: cartWithImages,
                cartCount: updatedCart.length
            });
        } catch (error) {
            console.error('Error updating cart item:', error);
            res.status(500).json({ 
                success: false,
                message: error.message 
            });
        }
    },

    removeFromCart: async (req, res) => {
        try {
            const { productId } = req.params;
            const userId = req.user.id;

            // Remove item from cart
            await db.query(
                'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = ?) AND product_id = ?',
                [userId, productId]
            );

            // Update cart total
            await db.query(
                `UPDATE carts c 
                SET total_amount = (
                    SELECT COALESCE(SUM(ci.quantity * p.price), 0)
                    FROM cart_items ci
                    JOIN products p ON ci.product_id = p.id
                    WHERE ci.cart_id = c.id
                )
                WHERE c.user_id = ?`,
                [userId]
            );

            // Get updated cart with items
            const [updatedCart] = await db.query(
                `SELECT 
                    c.id as cart_id,
                    c.user_id,
                    c.total_amount,
                    ci.id as cart_item_id,
                    ci.quantity,
                    p.id as product_id,
                    p.name,
                    p.price,
                    p.image,
                    p.description
                FROM carts c
                JOIN cart_items ci ON c.id = ci.cart_id
                JOIN products p ON ci.product_id = p.id
                WHERE c.user_id = ?`,
                [userId]
            );

            // Transform image paths to full URLs
            const cartWithImages = updatedCart.map(item => ({
                ...item,
                image: item.image ? `/images/products/${item.image.split('/').pop()}` : null
            }));

            res.json({
                success: true,
                items: cartWithImages,
                cartCount: updatedCart.length
            });
        } catch (error) {
            console.error('Error removing from cart:', error);
            res.status(500).json({ 
                success: false,
                message: error.message 
            });
        }
    },

    // Order Controllers
    createOrder: async (req, res) => {
        try {
            const { items, shippingAddress, paymentMethod } = req.body;
            const userId = req.user.id;

            // Get a connection from the pool
            const connection = await db.getConnection();
            
            try {
                // Start transaction
                await connection.beginTransaction();

                // Create order
                const [orderResult] = await connection.query(
                    `INSERT INTO orders (
                        user_id, total_amount, shipping_address_street, shipping_address_city,
                        shipping_address_state, shipping_address_zipcode, shipping_address_country,
                        payment_method
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId,
                        items.reduce((total, item) => total + (item.price * item.quantity), 0),
                        shippingAddress.street,
                        shippingAddress.city,
                        shippingAddress.state,
                        shippingAddress.zipCode,
                        shippingAddress.country,
                        paymentMethod
                    ]
                );

                const orderId = orderResult.insertId;

                // Add order items
                for (const item of items) {
                    await connection.query(
                        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                        [orderId, item.productId, item.quantity, item.price]
                    );

                    // Update product stock
                    await connection.query(
                        'UPDATE products SET stock = stock - ? WHERE id = ?',
                        [item.quantity, item.productId]
                    );
                }

                // Clear cart
                await connection.query(
                    'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = ?)',
                    [userId]
                );

                await connection.commit();

                const [order] = await connection.query(
                    `SELECT 
                        o.id as order_id,
                        o.user_id,
                        o.total_amount,
                        o.shipping_address_street,
                        o.shipping_address_city,
                        o.shipping_address_state,
                        o.shipping_address_zipcode,
                        o.shipping_address_country,
                        o.payment_method,
                        o.payment_status,
                        o.created_at,
                        oi.id as order_item_id,
                        oi.quantity,
                        oi.price as item_price,
                        p.id as product_id,
                        p.name,
                        p.image
                    FROM orders o
                    JOIN order_items oi ON o.id = oi.order_id
                    JOIN products p ON oi.product_id = p.id
                    WHERE o.id = ?`,
                    [orderId]
                );

                res.status(201).json(order);
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    getUserOrders: async (req, res) => {
        try {
            const [orders] = await db.query(
                `SELECT 
                    o.id as order_id,
                    o.user_id,
                    o.total_amount,
                    o.shipping_address_street,
                    o.shipping_address_city,
                    o.shipping_address_state,
                    o.shipping_address_zipcode,
                    o.shipping_address_country,
                    o.payment_method,
                    o.payment_status,
                    o.created_at,
                    oi.id as order_item_id,
                    oi.quantity,
                    oi.price as item_price,
                    p.id as product_id,
                    p.name,
                    p.image
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.user_id = ?`,
                [req.user.id]
            );
            res.json(orders);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    getOrderDetails: async (req, res) => {
        try {
            const [order] = await db.query(
                `SELECT o.*, oi.*, p.* 
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.id = ?`,
                [req.params.orderId]
            );

            if (!order.length) {
                return res.status(404).json({ message: 'Order not found' });
            }

            res.json(order);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Payment Controllers
    processCreditCardPayment: async (req, res) => {
        try {
            const { cardNumber, expiryDate, cvv, amount } = req.body;
            // Mock credit card processing
            // In a real application, you would integrate with a payment gateway
            res.json({ success: true, message: 'Payment processed successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    processCashOnDelivery: async (req, res) => {
        try {
            const { orderId } = req.body;
            await db.query(
                'UPDATE orders SET payment_status = ? WHERE id = ?',
                ['pending', orderId]
            );
            res.json({ success: true, message: 'Order placed successfully with cash on delivery' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Add new method for image upload
    uploadProductImage: async (req, res) => {
        upload(req, res, function (err) {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ message: err.message });
            } else if (err) {
                return res.status(500).json({ message: err.message });
            }

            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            // Return the path relative to the public directory
            const imagePath = `/images/products/${req.file.filename}`;
            res.json({ 
                message: 'File uploaded successfully',
                imagePath: imagePath
            });
        });
    },

    // Update the createProduct method to handle image
    createProduct: async (req, res) => {
        try {
            const { name, description, price, category, section, stock } = req.body;
            const image = req.body.image; // The image path is now passed directly from the frontend

            const [result] = await db.query(
                `INSERT INTO products (name, description, price, category, section, image, stock) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, description, price, category, section, image, stock]
            );

            const [newProduct] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
            res.status(201).json(newProduct[0]);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Add method to render add product form
    renderAddProductForm: (req, res) => {
        res.render('add-product');
    },

    confirmOrder: async (req, res) => {
        try {
            const { 
                items, 
                shippingAddress, 
                paymentMethod 
            } = req.body;

            // Validate required fields
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Order must contain at least one item' 
                });
            }

            if (!shippingAddress) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Shipping address is required' 
                });
            }

            if (!paymentMethod) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Payment method is required' 
                });
            }

            // Validate shipping address fields
            const requiredAddressFields = ['street', 'city', 'state', 'zipCode', 'country'];
            for (const field of requiredAddressFields) {
                if (!shippingAddress[field]) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `Shipping address ${field} is required` 
                    });
                }
            }

            // Validate payment method
            const validPaymentMethods = ['cash', 'card'];
            if (!validPaymentMethods.includes(paymentMethod)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid payment method' 
                });
            }

            // Calculate total amount
            const totalAmount = items.reduce((total, item) => {
                return total + (parseFloat(item.price) * item.quantity);
            }, 0);

            // Create order object
            const order = {
                user_id: req.user.id,
                total_amount: totalAmount,
                shipping_address_street: shippingAddress.street,
                shipping_address_city: shippingAddress.city,
                shipping_address_state: shippingAddress.state,
                shipping_address_zipcode: shippingAddress.zipCode,
                shipping_address_country: shippingAddress.country,
                payment_method: paymentMethod,
                payment_status: paymentMethod === 'cash' ? 'pending' : 'processing',
                items: items
            };

            // Return order confirmation
            res.json({
                success: true,
                message: 'Order confirmed successfully',
                order: order
            });

        } catch (error) {
            console.error('Error in confirmOrder:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to confirm order',
                error: error.message 
            });
        }
    },
};

module.exports = StoreController; 