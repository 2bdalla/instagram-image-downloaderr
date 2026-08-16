const express = require("express");

const app = express();


// ==================================================
// CORS
// ==================================================

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(express.json());
app.use(express.static("public"));


// ==================================================
// HOME
// ==================================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        message: "Instagram Image Downloader API is running"
    });

});


// ==================================================
// EXTRACT INSTAGRAM IMAGES
// ==================================================

app.post("/api/extract", async (req, res) => {

    try {

        const { url } = req.body;


        // ------------------------------------------
        // Check URL
        // ------------------------------------------

        if (!url) {

            return res.status(400).json({
                error: "Instagram URL is required"
            });

        }


        const instagramRegex =
            /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[^\/\s]+/i;


        if (!instagramRegex.test(url)) {

            return res.status(400).json({
                error: "Invalid Instagram URL"
            });

        }


        // ------------------------------------------
        // Check Apify Token
        // ------------------------------------------

        if (!process.env.APIFY_TOKEN) {

            return res.status(500).json({
                error: "APIFY_TOKEN is not configured on server"
            });

        }


        console.log("====================================");
        console.log("Starting Instagram extraction");
        console.log("Instagram URL:", url);
        console.log("====================================");


        // ------------------------------------------
        // Run Apify
        // ------------------------------------------

        const apifyResponse = await fetch(
            "https://api.apify.com/v2/actors/apify~instagram-scraper/run-sync-get-dataset-items",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${process.env.APIFY_TOKEN}`
                },

                body: JSON.stringify({

                    directUrls: [url],

                    resultsType: "posts",

                    resultsLimit: 1

                })
            }
        );


        // ------------------------------------------
        // Read Apify response
        // ------------------------------------------

        const text =
            await apifyResponse.text();


        console.log(
            "Apify status:",
            apifyResponse.status
        );


        if (!apifyResponse.ok) {

            console.error(
                "Apify error:",
                text.substring(0, 2000)
            );

            return res.status(500).json({
                error: "Apify request failed",
                details: text.substring(0, 2000)
            });

        }


        let data;

        try {

            data = JSON.parse(text);

        } catch (error) {

            return res.status(500).json({
                error: "Apify returned invalid JSON"
            });

        }


        // ------------------------------------------
        // Normalize results
        // ------------------------------------------

        const items =
            Array.isArray(data)
                ? data
                : [];


        if (items.length === 0) {

            return res.json({

                success: true,

                count: 0,

                images: [],

                message:
                    "No Instagram post data was returned"

            });

        }


        console.log(
            "Items returned:",
            items.length
        );


        // ------------------------------------------
        // Extract image URLs
        // ------------------------------------------

        const images = [];


        for (const item of items) {


            // Main image
            if (item.displayUrl) {

                images.push(item.displayUrl);

            }


            // Alternative image
            if (item.imageUrl) {

                images.push(item.imageUrl);

            }


            // Images array
            if (Array.isArray(item.images)) {

                for (const image of item.images) {

                    if (typeof image === "string") {

                        images.push(image);

                    } else if (
                        image &&
                        typeof image.url === "string"
                    ) {

                        images.push(image.url);

                    }

                }

            }


            // Carousel / child posts
            if (Array.isArray(item.childPosts)) {

                for (const child of item.childPosts) {

                    if (child.displayUrl) {

                        images.push(child.displayUrl);

                    }

                    if (child.imageUrl) {

                        images.push(child.imageUrl);

                    }

                    if (
                        child.url &&
                        typeof child.url === "string"
                    ) {

                        images.push(child.url);

                    }

                }

            }

        }


        // ------------------------------------------
        // Remove duplicates
        // ------------------------------------------

        const uniqueImages =
            [...new Set(images)]
                .filter(
                    image =>
                        typeof image === "string" &&
                        image.startsWith("http")
                );


        console.log(
            "Images found:",
            uniqueImages.length
        );


        // ------------------------------------------
        // Return results
        // ------------------------------------------

        return res.json({

            success: true,

            count: uniqueImages.length,

            images: uniqueImages

        });


    } catch (error) {

        console.error(
            "Extraction error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Could not extract Instagram images"

        });

    }

});


// ==================================================
// DOWNLOAD IMAGE
// ==================================================

app.get("/api/download", async (req, res) => {

    try {

        const imageUrl = req.query.url;


        if (!imageUrl) {

            return res.status(400).json({
                error: "Image URL is required"
            });

        }


        // ------------------------------------------
        // Validate URL
        // ------------------------------------------

        let parsedUrl;

        try {

            parsedUrl = new URL(imageUrl);

        } catch {

            return res.status(400).json({
                error: "Invalid image URL"
            });

        }


        if (
            parsedUrl.protocol !== "https:" &&
            parsedUrl.protocol !== "http:"
        ) {

            return res.status(400).json({
                error: "Invalid image protocol"
            });

        }


        // ------------------------------------------
        // Fetch image
        // ------------------------------------------

        const imageResponse = await fetch(
            imageUrl,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

                    "Accept":
                        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                }
            }
        );


        if (!imageResponse.ok) {

            return res.status(502).json({
                error:
                    `Could not download image (${imageResponse.status})`
            });

        }


        // ------------------------------------------
        // Get image data
        // ------------------------------------------

        const buffer =
            Buffer.from(
                await imageResponse.arrayBuffer()
            );


        const contentType =
            imageResponse.headers.get("content-type")
            || "image/jpeg";


        // ------------------------------------------
        // Send as downloadable file
        // ------------------------------------------

        res.setHeader(
            "Content-Type",
            contentType
        );


        res.setHeader(
            "Content-Disposition",
            'attachment; filename="instagram-image.jpg"'
        );


        res.setHeader(
            "Content-Length",
            buffer.length
        );


        return res.send(buffer);


    } catch (error) {

        console.error(
            "Download error:",
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                "Could not download image"

        });

    }

});


// ==================================================
// START SERVER
// ==================================================

const PORT =
    process.env.PORT || 10000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);    res.json({
        status: "online",
        message: "Instagram Image Downloader API is running"
    });

});


// ===============================
// Extract Instagram Images
// ===============================

app.post("/api/extract", async (req, res) => {

    try {

        const { url } = req.body;


        // -------------------------------
        // Check URL
        // -------------------------------

        if (!url) {

            return res.status(400).json({
                error: "Instagram URL is required"
            });

        }


        const instagramRegex =
            /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[^\/\s]+/i;


        if (!instagramRegex.test(url)) {

            return res.status(400).json({
                error: "Invalid Instagram URL"
            });

        }


        // -------------------------------
        // Check Apify Token
        // -------------------------------

        if (!process.env.APIFY_TOKEN) {

            return res.status(500).json({
                error: "APIFY_TOKEN is not configured on server"
            });

        }


        console.log("Starting Apify...");
        console.log("Instagram URL:", url);


        // -------------------------------
        // Run Apify Instagram Scraper
        // -------------------------------

        const apifyResponse = await fetch(
            "https://api.apify.com/v2/actors/apify~instagram-scraper/run-sync-get-dataset-items",
            {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${process.env.APIFY_TOKEN}`
                },

                body: JSON.stringify({

                    directUrls: [url],

                    resultsType: "posts",

                    resultsLimit: 1

                })

            }
        );


        // -------------------------------
        // Read Apify response
        // -------------------------------

        const text =
            await apifyResponse.text();


        console.log(
            "Apify status:",
            apifyResponse.status
        );


        console.log(
            "Apify response:",
            text.substring(0, 2000)
        );


        if (!apifyResponse.ok) {

            throw new Error(
                `Apify returned ${apifyResponse.status}: ${text}`
            );

        }


        let data;

        try {

            data = JSON.parse(text);

        } catch {

            throw new Error(
                "Apify returned invalid JSON"
            );

        }


        // -------------------------------
        // Normalize results
        // -------------------------------

        const items =
            Array.isArray(data)
                ? data
                : [];


        if (items.length === 0) {

            return res.json({

                success: true,

                count: 0,

                images: [],

                message:
                    "No Instagram post data was returned"

            });

        }


        console.log(
            "Items returned:",
            items.length
        );


        // -------------------------------
        // Extract image URLs
        // -------------------------------

        const images = [];


        for (const item of items) {


            // Main display image
            if (item.displayUrl) {

                images.push(item.displayUrl);

            }


            // Alternative image field
            if (item.imageUrl) {

                images.push(item.imageUrl);

            }


            // Images array
            if (Array.isArray(item.images)) {

                for (const image of item.images) {

                    if (typeof image === "string") {

                        images.push(image);

                    }

                    else if (
                        image &&
                        typeof image.url === "string"
                    ) {

                        images.push(image.url);

                    }

                }

            }


            // Child posts / carousel
            if (Array.isArray(item.childPosts)) {

                for (const child of item.childPosts) {

                    if (child.displayUrl) {

                        images.push(child.displayUrl);

                    }

                    if (child.imageUrl) {

                        images.push(child.imageUrl);

                    }

                }

            }

        }


        // -------------------------------
        // Remove duplicates
        // -------------------------------

        const uniqueImages =
            [...new Set(images)]
                .filter(Boolean);


        console.log(
            "Images found:",
            uniqueImages.length
        );


        // -------------------------------
        // Send result
        // -------------------------------

        res.json({

            success: true,

            count: uniqueImages.length,

            images: uniqueImages

        });


    } catch (error) {

        console.error(
            "Extraction error:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Could not extract Instagram images"

        });

    }

});


// ===============================
// Download / Proxy Image
// ===============================

app.get("/api/download", async (req, res) => {

    try {

        const imageUrl = req.query.url;


        // -------------------------------
        // Check URL
        // -------------------------------

        if (!imageUrl) {

            return res.status(400).json({
                error: "Image URL is required"
            });

        }


        // -------------------------------
        // Only allow HTTPS
        // -------------------------------

        if (!imageUrl.startsWith("https://")) {

            return res.status(400).json({
                error: "Invalid image URL"
            });

        }


        console.log(
            "Downloading image:",
            imageUrl.substring(0, 150)
        );


        // -------------------------------
        // Fetch image
        // -------------------------------

        const response = await fetch(imageUrl, {

            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
            }

        });


        if (!response.ok) {

            return res.status(response.status).json({

                error:
                    `Could not download image (${response.status})`

            });

        }


        // -------------------------------
        // Get content type
        // -------------------------------

        const contentType =
            response.headers.get("content-type") ||
            "image/jpeg";


        // -------------------------------
        // Set download headers
        // -------------------------------

        res.setHeader(
            "Content-Type",
            contentType
        );

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="instagram-image.jpg"'
        );


        // -------------------------------
        // Send image
        // -------------------------------

        const buffer =
            Buffer.from(
                await response.arrayBuffer()
            );


        res.send(buffer);


    } catch (error) {

        console.error(
            "Download error:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Could not download image"

        });

    }

});


// ===============================
// Health Check
// ===============================

app.get("/health", (req, res) => {

    res.json({
        status: "ok"
    });

});


// ===============================
// Start Server
// ===============================

const PORT =
    process.env.PORT || 10000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);    res.json({
        status: "online",
        message: "Instagram Image Downloader API is running"
    });

});


// ===============================
// Extract Instagram Images
// ===============================

app.post("/api/extract", async (req, res) => {

    try {

        const { url } = req.body;


        // -------------------------------
        // Check URL
        // -------------------------------

        if (!url) {

            return res.status(400).json({
                error: "Instagram URL is required"
            });

        }


        const instagramRegex =
            /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[^\/\s]+/i;


        if (!instagramRegex.test(url)) {

            return res.status(400).json({
                error: "Invalid Instagram URL"
            });

        }


        // -------------------------------
        // Check Apify Token
        // -------------------------------

        if (!process.env.APIFY_TOKEN) {

            return res.status(500).json({
                error: "APIFY_TOKEN is not configured on server"
            });

        }


        console.log("Starting Apify...");
        console.log("Instagram URL:", url);


        // -------------------------------
        // Run Apify Instagram Scraper
        // -------------------------------

        const apifyResponse = await fetch(
            "https://api.apify.com/v2/actors/apify~instagram-scraper/run-sync-get-dataset-items",
            {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${process.env.APIFY_TOKEN}`
                },

                body: JSON.stringify({

                    directUrls: [url],

                    resultsType: "posts",

                    resultsLimit: 1

                })

            }
        );


        // -------------------------------
        // Read Apify response
        // -------------------------------

        const text =
            await apifyResponse.text();


        console.log(
            "Apify status:",
            apifyResponse.status
        );


        console.log(
            "Apify response:",
            text.substring(0, 2000)
        );


        if (!apifyResponse.ok) {

            throw new Error(
                `Apify returned ${apifyResponse.status}: ${text}`
            );

        }


        let data;

        try {

            data = JSON.parse(text);

        } catch {

            throw new Error(
                "Apify returned invalid JSON"
            );

        }


        // -------------------------------
        // Normalize results
        // -------------------------------

        const items =
            Array.isArray(data)
                ? data
                : [];


        if (items.length === 0) {

            return res.json({

                success: true,

                count: 0,

                images: [],

                message:
                    "No Instagram post data was returned"

            });

        }


        console.log(
            "Items returned:",
            items.length
        );


        // -------------------------------
        // Extract image URLs
        // -------------------------------

        const images = [];


        for (const item of items) {


            // Main display image
            if (item.displayUrl) {

                images.push(item.displayUrl);

            }


            // Alternative image field
            if (item.imageUrl) {

                images.push(item.imageUrl);

            }


            // Images array
            if (Array.isArray(item.images)) {

                for (const image of item.images) {

                    if (typeof image === "string") {

                        images.push(image);

                    }

                    else if (
                        image &&
                        typeof image.url === "string"
                    ) {

                        images.push(image.url);

                    }

                }

            }


            // Child posts / carousel
            if (Array.isArray(item.childPosts)) {

                for (const child of item.childPosts) {

                    if (child.displayUrl) {

                        images.push(child.displayUrl);

                    }

                    if (child.imageUrl) {

                        images.push(child.imageUrl);

                    }

                }

            }

        }


        // -------------------------------
        // Remove duplicates
        // -------------------------------

        const uniqueImages =
            [...new Set(images)]
                .filter(Boolean);


        console.log(
            "Images found:",
            uniqueImages.length
        );


        // -------------------------------
        // Send result
        // -------------------------------

        res.json({

            success: true,

            count: uniqueImages.length,

            images: uniqueImages,

            raw: items

        });


    } catch (error) {

        console.error(
            "Extraction error:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Could not extract Instagram images"

        });

    }

});


// ===============================
// Start Server
// ===============================

const PORT =
    process.env.PORT || 10000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);     

