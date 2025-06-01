const db = require('../config');

async function fixImagePaths() {
    try {
        // Get all products with image paths
        const [products] = await db.query('SELECT id, image FROM products WHERE image IS NOT NULL');

        console.log(`Found ${products.length} products to update`);

        // Update each product's image path
        for (const product of products) {
            if (product.image) {
                // Convert backslashes to forward slashes
                let fixedPath = product.image.replace(/\\/g, '/');
                
                // Remove all leading /uploads/ or /images/ prefixes
                while (fixedPath.startsWith('/uploads/') || fixedPath.startsWith('uploads/') || fixedPath.startsWith('/images/') || fixedPath.startsWith('images/')) {
                    fixedPath = fixedPath.replace(/^\/?(uploads|images)\//, '');
                }
                fixedPath = '/images/' + fixedPath;
                
                // Update the database
                await db.query(
                    'UPDATE products SET image = ? WHERE id = ?',
                    [fixedPath, product.id]
                );

                console.log(`Updated product ${product.id}: ${fixedPath}`);
            }
        }

        console.log('Finished updating all image paths');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run the script
fixImagePaths(); 