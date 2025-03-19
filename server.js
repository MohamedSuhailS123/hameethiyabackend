const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// User Model
const User = mongoose.model("User", new mongoose.Schema({
    username: String,
    email: String,
    password: String
}));

// User Registration
app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.json({ message: "Registration successful!" });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// User Login
app.post("/login", async (req, res) => {
    try {
        const { loginId, password } = req.body;
        const user = await User.findOne({ email: loginId });

        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.json({ token, username: user.username });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Vercel requires this export
module.exports = app;
