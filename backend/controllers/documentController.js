const Document = require('../models/Document');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Get all documents
 * GET /api/documents
 */
const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find()
      .sort({ createdAt: -1 })
      .select('title slug isPublic createdAt updatedAt');

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    logger.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
    });
  }
};

/**
 * Get single document
 * GET /api/documents/:slug
 */
const getDocument = async (req, res) => {
  try {
    const { slug } = req.params;
    const document = await Document.findOne({ slug });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    logger.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document',
    });
  }
};

/**
 * Create document
 * POST /api/documents
 */
const createDocument = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required',
      });
    }

    const document = await Document.create({
      title,
      content,
      createdBy: req.user.id,
    });

    logger.info(`Document created: ${document._id}`);
    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    logger.error('Error creating document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create document',
    });
  }
};

/**
 * Update document
 * PUT /api/documents/:slug
 */
const updateDocument = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content, isPublic } = req.body;

    const document = await Document.findOne({ slug });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    if (title) {
      document.title = title;
    }
    if (content !== undefined) {
      document.content = content;
    }
    if (isPublic !== undefined) {
      document.isPublic = isPublic;
    }

    await document.save();

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    logger.error('Error updating document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document',
    });
  }
};

/**
 * Delete document
 * DELETE /api/documents/:slug
 */
const deleteDocument = async (req, res) => {
  try {
    const { slug } = req.params;
    const document = await Document.findOneAndDelete({ slug });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    logger.info(`Document deleted: ${document._id}`);
    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
    });
  }
};

/**
 * Generate secure share token
 * POST /api/documents/:slug/share
 */
const generateShareToken = async (req, res) => {
  try {
    const { slug } = req.params;
    const document = await Document.findOne({ slug });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    document.shareTokens.push({ token, expiresAt });
    await document.save();

    res.json({
      success: true,
      token,
      url: `/docs/secure/${token}`,
      expiresAt,
    });
  } catch (error) {
    logger.error('Error generating share token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate share token',
    });
  }
};

/**
 * Access document via secure token
 * GET /api/documents/share/:token
 */
const getDocumentByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const document = await Document.findOne({
      'shareTokens.token': token,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired link',
      });
    }

    const tokenData = document.shareTokens.id(token);
    if (new Date() > tokenData.expiresAt) {
      document.shareTokens.pull({ token });
      await document.save();
      return res.status(403).json({
        success: false,
        message: 'Link has expired',
      });
    }

    res.json({
      success: true,
      data: {
        title: document.title,
        content: document.content,
      },
    });
  } catch (error) {
    logger.error('Error accessing document by token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to access document',
    });
  }
};

module.exports = {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  generateShareToken,
  getDocumentByToken,
};
