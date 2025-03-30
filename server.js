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
// Status History Schema
const StatusHistorySchema = new mongoose.Schema({
    status: String,
    date: String,
    time: String,
    updatedBy: String,
    applicationNumber: String,
    llrDate: String,
    maturityDate: String,
    expiryDate: String,
    notes: String
}, { _id: false });

// License Task Schema
const LicenseTaskSchema = new mongoose.Schema({
    applicantName: String,
    fatherName: String,
    dob: String,
    mobile: String,
    email: String,
    reference: String,
    vehicleClass: [String],
    licenseType: String,
    declaredPayment: Number,
    advancePayment: Number,
    createdBy: String,
    notes: String,
    status: { type: String, default: "New Application" },
    applicationNumber: String,
    llrDate: String,
    maturityDate: String,
    expiryDate: String,
    creationDate: { type: String, default: new Date().toLocaleDateString() },
    statusHistory: [StatusHistorySchema],
    createdAt: { type: Date, default: Date.now }
});

const LicenseTask = mongoose.model("LicenseTask", LicenseTaskSchema);

// Status Options Schema
const StatusOptionSchema = new mongoose.Schema({
    name: String
});
const StatusOption = mongoose.model("StatusOption", StatusOptionSchema);

// Vehicle Class Schema
const VehicleClassSchema = new mongoose.Schema({
    name: String
});
const VehicleClass = mongoose.model("VehicleClass", VehicleClassSchema);

// Initialize default data
async function initializeDefaultData() {
    const defaultStatuses = [
        "New Application", "Documents Verified", "Application Generated",
        "Test Scheduled", "Test Completed", "LLR Issued", "Returned"
    ];
    
    const defaultVehicleClasses = [
        "Motorcycle", "Car", "Truck", "Bus", "Heavy Vehicle"
    ];
    
    try {
        if (await StatusOption.countDocuments() === 0) {
            await StatusOption.insertMany(defaultStatuses.map(name => ({ name })));
        }
        
        if (await VehicleClass.countDocuments() === 0) {
            await VehicleClass.insertMany(defaultVehicleClasses.map(name => ({ name })));
        }
    } catch (error) {
        console.error("Error initializing default data:", error);
    }
}

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

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, username: user.username });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});
// ==================== API Endpoints ====================

// Create a new task
app.post("/api/tasks", async (req, res) => {
    try {
        const newTask = new LicenseTask(req.body);
        await newTask.save();
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ error: "Error creating task" });
    }
});

// Get all tasks (for update status page)
app.get("/api/tasks", async (req, res) => {
    try {
        const { search, status, vehicleClass } = req.query;
        let query = {};
        
        if (search) {
            query.$or = [
                { applicantName: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { applicationNumber: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) query.status = status;
        if (vehicleClass) query.vehicleClass = vehicleClass;
        if (!status) query.status = { $nin: ["LLR Issued", "Returned", "Test Application Generated"] };
        
        const tasks = await LicenseTask.find(query).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Get tasks for check status page (optimized query)
app.get("/api/check-tasks", async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};
        
        if (search) {
            query.$or = [
                { applicantName: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { fatherName: { $regex: search, $options: 'i' } },
                { applicationNumber: { $regex: search, $options: 'i' } }
            ];
        }
        
        const tasks = await LicenseTask.find(query)
            .sort({ createdAt: -1 })
            .select('_id applicantName fatherName mobile vehicleClass applicationNumber status statusHistory');
        
        const formattedTasks = tasks.map(task => {
            const latestStatus = task.statusHistory && task.statusHistory.length > 0 
                ? task.statusHistory[task.statusHistory.length - 1]
                : null;
            
            return {
                _id: task._id,
                applicantName: task.applicantName,
                fatherName: task.fatherName || '',
                mobile: task.mobile,
                vehicleClass: task.vehicleClass.join(', '),
                applicationNumber: task.applicationNumber || '',
                status: task.status,
                latestNotes: latestStatus?.notes || ''
            };
        });
        
        res.json(formattedTasks);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Get a single task
app.get("/api/tasks/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid task ID" });
        }
        
        const task = await LicenseTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Update task status
app.put("/api/tasks/:id/status", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid task ID" });
        }
        
        const task = await LicenseTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });
        
        const { status, applicationNumber, notes } = req.body;
        
        if (status === "LLR Issued" && !task.applicationNumber) {
            return res.status(400).json({ message: "Application number is required before issuing LLR" });
        }
        
        task.status = status;
        
        if (status === "Application Generated" && applicationNumber) {
            task.applicationNumber = applicationNumber;
        }
        
        if (status === "LLR Issued") {
            const today = new Date();
            task.llrDate = today.toISOString().split('T')[0];
            task.maturityDate = calculateMaturityDate(task.llrDate);
            task.expiryDate = calculateExpiryDate(task.llrDate);
        }
        
        const statusUpdate = {
            status,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            updatedBy: "System",
            applicationNumber: task.applicationNumber,
            llrDate: task.llrDate,
            maturityDate: task.maturityDate,
            expiryDate: task.expiryDate,
            notes: notes || "No notes"
        };
        
        if (!task.statusHistory) task.statusHistory = [];
        task.statusHistory.push(statusUpdate);
        
        await task.save();
        
        res.json({
            message: "Status updated successfully",
            task,
            dates: status === "LLR Issued" ? {
                llrDate: task.llrDate,
                maturityDate: task.maturityDate,
                expiryDate: task.expiryDate
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: "Error updating task status" });
    }
});

// Update task details
app.put("/api/tasks/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid task ID" });
        }
        
        const task = await LicenseTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });
        
        const { applicantName, mobile, vehicleClass, notes } = req.body;
        
        if (applicantName) task.applicantName = applicantName;
        if (mobile) task.mobile = mobile;
        if (vehicleClass) task.vehicleClass = vehicleClass;
        if (notes) task.notes = notes;
        
        const statusUpdate = {
            status: "Edited",
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            updatedBy: "System",
            notes: "Task details edited"
        };
        
        if (!task.statusHistory) task.statusHistory = [];
        task.statusHistory.push(statusUpdate);
        
        await task.save();
        res.json({ message: "Task updated successfully", task });
    } catch (error) {
        res.status(500).json({ error: "Error updating task" });
    }
});

// Delete a task
app.delete("/api/tasks/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid task ID" });
        }
        
        const result = await LicenseTask.findByIdAndDelete(req.params.id);
        
        if (!result) {
            return res.status(404).json({ message: "Task not found" });
        }
        
        res.json({ message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Error deleting task" });
    }
});

// Get all status options
app.get("/api/statuses", async (req, res) => {
    try {
        const statuses = await StatusOption.find().sort({ name: 1 });
        res.json(statuses.map(s => s.name));
    } catch (error) {
        res.status(500).json({ error: "Error fetching status options" });
    }
});

// Get all vehicle classes
app.get("/api/vehicle-classes", async (req, res) => {
    try {
        const vehicleClasses = await VehicleClass.find().sort({ name: 1 });
        res.json(vehicleClasses.map(v => v.name));
    } catch (error) {
        res.status(500).json({ error: "Error fetching vehicle classes" });
    }
});
// Get detailed task report (complete version)
app.get("/api/tasks/:id/report", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid task ID" });
        }
        
        const task = await LicenseTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        // Helper function to format dates consistently
        const formatDate = (dateString) => {
            if (!dateString) return null;
            try {
                const date = new Date(dateString);
                return date.toISOString().split('T')[0]; // YYYY-MM-DD format
            } catch (e) {
                return dateString; // Return raw string if invalid date
            }
        };

        // Prepare complete response
        const reportData = {
            taskDetails: {
                // Applicant Information
                applicantName: task.applicantName || 'Not provided',
                fatherName: task.fatherName || 'Not provided',
                dob: formatDate(task.dob) || 'Not provided',
                mobile: task.mobile || 'Not provided',
                email: task.email || 'Not provided',
                reference: task.reference || 'Not provided',
                
                // License Information
                vehicleClass: task.vehicleClass || [],
                licenseType: task.licenseType || 'Not specified',
                applicationNumber: task.applicationNumber || 'Not assigned',
                status: task.status || 'Status unknown',
                
                // Dates
                llrDate: formatDate(task.llrDate),
                maturityDate: formatDate(task.maturityDate),
                expiryDate: formatDate(task.expiryDate),
                creationDate: task.creationDate || formatDate(task.createdAt),
                
                // Payment Information
                declaredPayment: task.declaredPayment || 0,
                advancePayment: task.advancePayment || 0,
                
                // Metadata
                createdBy: task.createdBy || 'System',
                notes: task.notes || 'No notes',
                createdAt: task.createdAt,
                updatedAt: task.updatedAt
            },
            statusHistory: (task.statusHistory || []).map(history => ({
                status: history.status || 'Status update',
                date: history.date || 'Unknown date',
                time: history.time || 'Unknown time',
                updatedBy: history.updatedBy || 'System',
                applicationNumber: history.applicationNumber,
                llrDate: formatDate(history.llrDate),
                maturityDate: formatDate(history.maturityDate),
                expiryDate: formatDate(history.expiryDate),
                notes: history.notes || 'No notes'
            })),
            // Initialize empty arrays for related data that might be added later
            payments: [],
            intimations: []
        };

        res.json(reportData);
    } catch (error) {
        console.error("Error generating detailed report:", error);
        res.status(500).json({ 
            error: "Error generating detailed report",
            details: error.message 
        });
    }
});
// Helper functions
function calculateMaturityDate(llrDate) {
    if (!llrDate) return null;
    const date = new Date(llrDate);
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
}

function calculateExpiryDate(llrDate) {
    if (!llrDate) return null;
    const date = new Date(llrDate);
    date.setMonth(date.getMonth() + 6);
    return date.toISOString().split('T')[0];
}


// Enhanced Detailed Task Report Endpoint
// In your server.js, enhance the report endpoint to include all needed fields:
app.get("/api/tasks/:id/report", async (req, res) => {
    try {
        const task = await LicenseTask.findById(req.params.id);
        console.log(task);
        
        const reportData = {
            taskDetails: {
                // Add all these fields from your schema
                applicantName: task.applicantName,
                fatherName: task.fatherName || 'Not provided',
                dob: task.dob || 'Not provided',
                mobile: task.mobile,
                email: task.email || 'Not provided',
                reference: task.reference || 'Not provided',
                vehicleClass: task.vehicleClass,
                licenseType: task.licenseType || 'Not specified',
                declaredPayment: task.declaredPayment || 0,
                advancePayment: task.advancePayment || 0,
                applicationNumber: task.applicationNumber || 'Not assigned',
                status: task.status,
                llrDate: task.llrDate || 'Not issued',
                maturityDate: task.maturityDate || 'N/A',
                expiryDate: task.expiryDate || 'N/A',
                creationDate: task.creationDate,
                createdAt: task.createdAt,
                createdBy: task.createdBy || 'System',
                notes: task.notes || 'No notes'
            },
            statusHistory: task.statusHistory || [],
            payments: [], // Initialize empty arrays for these
            intimations: [] // They can be populated later
        };
        
        res.json(reportData);
    } catch (error) {
        res.status(500).json({ error: "Error generating report" });
    }
});

// Vercel requires this export
module.exports = app;