const DocumentSubmission = require("../models/documentSubmission");
const Document = require("../models/document");
const logger = require("../utils/logger");
const sendEmail = require("../utils/emailService");
const Agent = require("../models/agent");
const User = require("../models/user");
const Notification = require("../models/notification");

// ================= CREATE DOCUMENT SUBMISSION =================
exports.createSubmission = async (req, res, next) => {
  try {

    logger.info("POST /submission API called");

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.role !== "AGENT") {
      return res.status(403).json({
        message: "Only agents can create submissions"
      });
    }

    const agent = await Agent.findOne({ userId: user._id });

    if (!agent) {
      return res.status(404).json({
        message: "Agent not found"
      });
    }

    // 🔥 CHECK EXISTING SUBMISSION
    const existingSubmission = await DocumentSubmission.findOne({
      agentId: agent._id
    });

    if (existingSubmission) {

      // ✅ CASE 1: DRAFT → reuse
      if (existingSubmission.status === "DRAFT") {
        return res.status(200).json({
          submission: existingSubmission,
          message: "Using existing draft submission"
        });
      }

      // ✅ CASE 2: REJECTED → reset + reuse
      if (existingSubmission.status === "REJECTED") {

        // 🧹 Delete old documents
        await Document.deleteMany({
          submissionId: existingSubmission._id
        });

        // 🔄 Reset status to DRAFT
        existingSubmission.status = "DRAFT";
        await existingSubmission.save();

        return res.status(200).json({
          submission: existingSubmission,
          message: "Resubmission allowed. Upload again."
        });
      }

      // ❌ CASE 3: SUBMITTED / APPROVED → block
      if (["SUBMITTED", "APPROVED"].includes(existingSubmission.status)) {
        return res.status(400).json({
          message: "Submission already submitted"
        });
      }
    }

    // ✅ CASE 4: NO SUBMISSION → create new
    const submission = await DocumentSubmission.create({
      agentId: agent._id,
      status: "DRAFT"
    });

    return res.status(201).json({
      submission,
      message: "Document submission created"
    });

  } catch (error) {

    logger.error("Error in createSubmission API", error);
    next(error);
  }
};

// ================= UPLOAD DOCUMENT  =================
exports.uploadDocument = async (req, res, next) => {
  try {
    console.log("========== DEBUG START ==========");
    console.log("USER:", req.user);
    console.log("PARAM ID:", req.params.id);
    console.log("FILES:", req.files);
    console.log("========== DEBUG END ==========");

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "AGENT") {
      return res.status(403).json({
        message: "Only agents can upload documents"
      });
    }

    const { id } = req.params;

    const agent = await Agent.findOne({ userId: user._id });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const submission = await DocumentSubmission.findById(id);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.agentId.toString() !== agent._id.toString()) {
      return res.status(403).json({
        message: "Unauthorized submission access"
      });
    }

    if (submission.status === "SUBMITTED") {
      return res.status(400).json({
        message: "Already submitted"
      });
    }

    const files = req.files;

    const documentsToSave = [];

    // 🔥 PAN
    if (files.pan) {
      const file = files.pan[0];

      documentsToSave.push({
        submissionId: submission._id,
        docType: "PAN",
        fileName: file.filename,
        fileUrl: file.path,
        originalFileName: file.originalname,
        contentType: file.mimetype,
        fileSizeBytes: file.size
      });
    }

    // 🔥 AADHAAR
    if (files.aadhaar) {
      const file = files.aadhaar[0];

      documentsToSave.push({
        submissionId: submission._id,
        docType: "AADHAAR",
        fileName: file.filename,
        fileUrl: file.path,
        originalFileName: file.originalname,
        contentType: file.mimetype,
        fileSizeBytes: file.size
      });
    }

    // 🔥 PHOTO
    if (files.photo) {
      const file = files.photo[0];

      documentsToSave.push({
        submissionId: submission._id,
        docType: "PHOTO",
        fileName: file.filename,
        fileUrl: file.path,
        originalFileName: file.originalname,
        contentType: file.mimetype,
        fileSizeBytes: file.size
      });
    }

    console.log("📦 DOCUMENTS TO SAVE:", documentsToSave);

    if (documentsToSave.length === 0) {
      return res.status(400).json({
        message: "No valid documents found"
      });
    }

    await Document.insertMany(documentsToSave);

    res.status(201).json({
      message: "Documents uploaded successfully",
      uploadedCount: documentsToSave.length
    });

  } catch (error) {
    console.error("❌ ERROR:", error);
    next(error);
  }
};
// ================= SUBMIT DOCUMENTS  =================

exports.submitDocuments = async (req, res, next) => {
  try {
    logger.info("POST /submitDocuments API called");

    // Fetch logged-in user
    const user = await User.findById(req.user.id);

    if (!user) {
      logger.warn(`User not found: ${req.user.id}`);
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Ensure only AGENT can submit documents
    if (user.role !== "AGENT") {
      logger.warn(`Unauthorized submission attempt by user ${user._id}`);
      return res.status(403).json({
        message: "Only agents can submit documents"
      });
    }

    const { id } = req.params;

    logger.info(`Submission request received for submissionId: ${id}`);

    // Fetch agent linked to user
    const agent = await Agent.findOne({ userId: user._id });

    if (!agent) {
      logger.warn(`Agent not found for userId: ${user._id}`);
      return res.status(404).json({
        message: "Agent not found"
      });
    }

    // Fetch submission
    const submission = await DocumentSubmission.findById(id);

    if (!submission) {
      logger.warn(`Submission not found: ${id}`);
      return res.status(404).json({
        message: "Submission not found"
      });
    }

    // Ensure agent owns the submission
    if (submission.agentId.toString() !== agent._id.toString()) {
      logger.warn(`Agent ${agent._id} tried to submit unauthorized submission ${id}`);
      return res.status(403).json({
        message: "You cannot submit this submission"
      });
    }

    // Allow submission only if status is DRAFT
    if (submission.status !== "DRAFT") {
      logger.warn(`Submission already submitted or not editable: ${submission._id}`);
      return res.status(400).json({
        message: "Submission already submitted"
      });
    }

    // Ensure all required documents are uploaded (exactly 3)
    const documentCount = await Document.countDocuments({
      submissionId: submission._id
    });

    if (documentCount <3) {
      logger.warn(`Submission blocked. Only ${documentCount} documents uploaded`);
      return res.status(400).json({
        message: "Please upload all 3 required documents before submitting"
      });
    }

    logger.info(`Submitting documents for submission ${submission._id}`);

    // Mark submission as submitted
    submission.status = "SUBMITTED";
    submission.submittedAt = new Date();

    await submission.save();

    
    logger.info(`Submission successful: ${submission._id}`);
    //  Create notification for agent
await Notification.create({
  agentId: agent._id,
  type: "SUBMITTED",
  message: "Your documents have been submitted successfully. It is  under review. We will notify you soon.",
  sentAt: new Date(),
  status: "SENT"
});
try {
  await sendEmail(
    user.email,
    "Documents Submitted",
    `Hello ${agent.displayName},

Your documents have been submitted successfully.

It is under review. We will notify you once the review is completed.

Thank you.`
  );
} catch (err) {
  console.error("Submission email failed:", err.message);
}

    // Send success response
    res.status(200).json({
      submissionId: submission._id,
      status: submission.status,
      message: "Documents submitted for review."
    });

  } catch (error) {
    logger.error("Error in submitDocuments API", error);
    next(error);
  }
};

// ================= REVIEW DOCUMENTS  =================
exports.reviewDocuments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reviewComments } = req.body;
    const adminId = req.user.id;

    logger.info(`Admin ${adminId} reviewing submission ${id}`);

    // 🔐 Only ADMIN allowed
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        message: "User is not allowed to perform this operation"
      });
    }

    // 🔍 Find submission
    const submission = await DocumentSubmission.findById(id);

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found"
      });
    }

    // =====================================================
    // 🔥 FIX 1: HANDLE ALREADY REVIEWED (RESEND EMAIL)
    // =====================================================
    if (["APPROVED", "REJECTED"].includes(submission.status)) {

      const agent = await Agent.findById(submission.agentId);

      if (!agent) {
        return res.status(404).json({
          message: "Agent not found"
        });
      }

      let message;

      if (submission.status === "APPROVED") {
        message = `Your documents have been approved.
Comments: ${submission.reviewComments || "No comments"}`;
      } else {
        message = `Your documents have been rejected.
Comments: ${submission.reviewComments || "No comments"}
Please upload again.`;
      }

      console.log("🔁 Resending email to:", agent.email);

      try {
        await sendEmail(
          agent.email,
          "Document Review Status (Retry)",
          `Hello Agent,

${message}
`
        );
      } catch (err) {
        console.error("Email resend failed:", err.message);
      }

      return res.status(200).json({
        message: "Submission already reviewed (email resent)"
      });
    }

    // =====================================================
    // 🔍 VALIDATIONS
    // =====================================================
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        message: "Invalid review status"
      });
    }

    if (submission.status === "DRAFT") {
      return res.status(400).json({
        message: "Submission not submitted yet"
      });
    }

    if (submission.status !== "SUBMITTED") {
      return res.status(400).json({
        message: "Submission not ready for review"
      });
    }

    // =====================================================
    // ✅ UPDATE SUBMISSION
    // =====================================================
    submission.status = status;
    submission.reviewedAt = new Date();
    submission.reviewedBy = adminId;
    submission.reviewComments = reviewComments;

    await submission.save();

    logger.info(`Submission ${id} marked as ${status}`);

    // =====================================================
    // 🔔 CREATE NOTIFICATION
    // =====================================================
    await Notification.create({
      agentId: submission.agentId,
      type: status,
      message:
        status === "APPROVED"
          ? "Your documents have been approved."
          : "Your documents have been rejected.",
      sentAt: new Date(),
      status: "SENT"
    });

    // =====================================================
    // 👤 GET AGENT
    // =====================================================
    const agent = await Agent.findById(submission.agentId);

    if (!agent) {
      return res.status(404).json({
        message: "Agent not found"
      });
    }

    // =====================================================
    // 🧠 MESSAGE LOGIC
    // =====================================================
    let message;

    if (status === "APPROVED") {
      message = `Your documents have been approved.`
    } else {
      message = `Your documents have been rejected.
Comments: ${reviewComments || "No comments"}
Please upload again.`;
    }

    console.log("📧 Sending email to:", agent.email);

    // =====================================================
    // 📧 SEND EMAIL (SAFE)
    // =====================================================
    try {
      await sendEmail(
        agent.email,
        "Document Review Status",
        `Hello Agent,

${message}
`
      );
    } catch (err) {
      console.error("Email failed:", err.message);
    }

    // =====================================================
    // ✅ RESPONSE
    // =====================================================
    return res.status(200).json({
      submissionId: submission._id,
      status: submission.status,
      reviewedAt: submission.reviewedAt,
      message: "Review completed successfully"
    });

  } catch (error) {
    logger.error(`Document review error: ${error.message}`);
    next(error);
  }
};

exports.getAllSubmissions = async (req, res) => {
  try {
    const { status, email, page = 1, limit = 6 } = req.query;

    let filter = {};

    // STATUS FILTER
    if (status && status !== "ALL") {
      filter.status = status;
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // TOTAL COUNT
    const totalItems = await DocumentSubmission.countDocuments(filter);

    // MAIN QUERY
    const submissions = await DocumentSubmission.find(filter)
      .populate({
        path: "agentId",
        select: "email displayName",
        match: email
          ? { email: { $regex: email, $options: "i" } }
          : {}
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // REMOVE NULL AGENTS
    const filtered = submissions.filter(s => s.agentId !== null);

    // 🔥🔥 ADD DOCUMENTS TO EACH SUBMISSION
    const finalData = await Promise.all(
      filtered.map(async (sub) => {

        const docs = await Document.find({
          submissionId: sub._id
        }).select("fileUrl originalFileName"); // only needed fields

        return {
          ...sub.toObject(),
          documents: docs
        };
      })
    );

    const totalPages = Math.ceil(totalItems / limitNumber);

    res.status(200).json({
      data: finalData, // ✅ IMPORTANT CHANGE
      currentPage: pageNumber,
      totalPages: totalPages,
      totalItems: totalItems
    });

  } catch (error) {
    res.status(500).json({
      message: "Error fetching submissions"
    });
  }
};
// controllers/submissionController.js

exports.getMySubmissions = async (req, res) => {
  try {

    logger.info("GET /my-submissions API called");

    // 1️⃣ Get logged-in user
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // 2️⃣ Check role
    if (user.role !== "AGENT") {
      return res.status(403).json({
        message: "Only agents can view submissions"
      });
    }

    // 3️⃣ Get agent linked to user
    const agent = await Agent.findOne({ userId: user._id });

    if (!agent) {
      return res.status(404).json({
        message: "Agent not found"
      });
    }

    // 4️⃣ Get submissions using agentId (IMPORTANT FIX)
    const submissions = await DocumentSubmission.find({
      agentId: agent._id
    }).sort({ createdAt: -1 });

    // 5️⃣ Attach documents (optional but recommended)
    const finalData = await Promise.all(
      submissions.map(async (sub) => {
        const docs = await Document.find({
          submissionId: sub._id
        }).select("fileUrl originalFileName");

        return {
          ...sub.toObject(),
          documents: docs
        };
      })
    );

    res.status(200).json({
      submissions: finalData
    });

  } catch (err) {
    logger.error("Error in getMySubmissions", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};
exports.getNotifications = async (req, res) => {
  try {
    console.log("USER:", req.user); // debug

    // ✅ Correct mapping
    const agent = await Agent.findOne({ userId: req.user.id });

    if (!agent) {
      return res.status(404).json({
        message: "Agent not found"
      });
    }

    const notifications = await Notification.find({
      agentId: agent._id
    }).sort({ createdAt: -1 });

    res.status(200).json({
      notifications
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error fetching notifications"
    });
  }
};