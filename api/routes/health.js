const express = require('express');
const router  = express.Router();

// GET /api/health
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'jaya-wenter-api',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
