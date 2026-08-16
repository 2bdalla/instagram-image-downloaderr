const express = require("express");

const app = express();


// ===============================
// CORS
// ===============================

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});


// ===============================
// Middleware
// ===============================

app.use(express.json());
app.use(express.static("public"));


// ===============================
// Home
// ===============================

app.get("/", (req, res) => {

    res.json({
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

