// ETag and Last-Modified middleware for offline sync support
import crypto from 'crypto';

/**
 * Generate ETag from data
 * @param {any} data - Data to generate ETag from
 * @returns {string} - ETag value
 */
export const generateETag = (data) => {
  const dataString = JSON.stringify(data);
  const hash = crypto.createHash('md5').update(dataString).digest('hex');
  return `"${hash}"`;
};

/**
 * Check if request has If-None-Match header and compare with ETag
 * @param {object} req - Express request object
 * @param {string} etag - Current ETag value
 * @returns {boolean} - True if client has matching ETag (304 should be sent)
 */
export const checkIfNoneMatch = (req, etag) => {
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === etag) {
    return true;
  }
  return false;
};

/**
 * Check if request has If-Modified-Since header
 * @param {object} req - Express request object
 * @param {Date} lastModified - Last modified date
 * @returns {boolean} - True if client has up-to-date data (304 should be sent)
 */
export const checkIfModifiedSince = (req, lastModified) => {
  const ifModifiedSince = req.headers['if-modified-since'];
  if (ifModifiedSince) {
    const clientDate = new Date(ifModifiedSince);
    const serverDate = new Date(lastModified);
    
    // If server data is older or equal, return 304
    if (serverDate <= clientDate) {
      return true;
    }
  }
  return false;
};

/**
 * Set caching headers on response
 * @param {object} res - Express response object
 * @param {string} etag - ETag value
 * @param {Date|string} lastModified - Last modified date
 */
export const setCacheHeaders = (res, etag, lastModified) => {
  if (etag) {
    res.setHeader('ETag', etag);
  }
  
  if (lastModified) {
    const lastModifiedDate = lastModified instanceof Date 
      ? lastModified.toUTCString() 
      : new Date(lastModified).toUTCString();
    res.setHeader('Last-Modified', lastModifiedDate);
  }
  
  // Set cache control
  res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
};

/**
 * Middleware to handle conditional requests (304 Not Modified)
 * @param {Function} getETag - Function to get current ETag
 * @param {Function} getLastModified - Function to get last modified date
 * @returns {Function} - Express middleware
 */
export const conditionalRequest = (getETag, getLastModified) => {
  return async (req, res, next) => {
    try {
      const etag = getETag ? await getETag(req) : null;
      const lastModified = getLastModified ? await getLastModified(req) : null;

      // Check If-None-Match (ETag)
      if (etag && checkIfNoneMatch(req, etag)) {
        setCacheHeaders(res, etag, lastModified);
        return res.status(304).end();
      }

      // Check If-Modified-Since
      if (lastModified && checkIfModifiedSince(req, lastModified)) {
        setCacheHeaders(res, etag, lastModified);
        return res.status(304).end();
      }

      // Store ETag and LastModified for later use in response
      res.locals.etag = etag;
      res.locals.lastModified = lastModified;
      
      next();
    } catch (error) {
      console.error('Error in conditionalRequest middleware:', error);
      next();
    }
  };
};

