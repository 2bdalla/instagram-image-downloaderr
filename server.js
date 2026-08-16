const express = require("express");

const app = express();

// السماح للواجهة بالتواصل مع السيرفر
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.use(express.json());
app.use(express.static("public"));
// الصفحة الرئيسية
app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Instagram Image Downloader API is running"
    });
});


// استخراج الصور
app.post("/api/extract", async (req, res) => {

    try {

        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                error: "Instagram URL is required"
            });
        }


        // التأكد أن الرابط Instagram
        const instagramRegex =
            /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[^\/\s]+/i;

        if (!instagramRegex.test(url)) {
            return res.status(400).json({
                error: "Invalid Instagram URL"
            });
        }


        // تحميل صفحة Instagram
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
            }
        });


        if (!response.ok) {
            throw new Error(
                `Instagram returned ${response.status}`
            );
        }


        const html = await response.text();


        // استخراج روابط الصور الموجودة في الصفحة
        const images = [];

        const regex =
            /https?:\\?\/\\?\/[^"'<>\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'<>\s]*)?/gi;

        const matches = html.match(regex) || [];


        for (let image of matches) {

            image = image
                .replace(/\\u0026/g, "&")
                .replace(/\\\//g, "/")
                .replace(/&amp;/g, "&");


            if (!images.includes(image)) {
                images.push(image);
            }
        }


        // إزالة الصور المكررة
        const uniqueImages = [...new Set(images)];


        res.json({
            success: true,
            count: uniqueImages.length,
            images: uniqueImages
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: "Could not extract Instagram images",
            details: error.message
        });

    }

});


const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Server running on port ${PORT}`
    );

});
