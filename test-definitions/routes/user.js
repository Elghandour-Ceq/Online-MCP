const express = require('express');
const { makeAuthenticatedRequest, makeAuthenticatedBlobRequest } = require('../utils');

const router = express.Router();

router.get('/profile', async (req, res) => {
    try {
        const credentials = JSON.parse(Buffer.from(req.headers['x-confluence-credentials'], 'base64').toString());
        
        // Fetch current user info
        const response = await makeAuthenticatedRequest(
            credentials,
            '/rest/api/user/current',
            {
                expand: 'personalSpace'
            }
        );

        // Transform the response to match our UserProfile interface
        const userProfile = {
            email: credentials.email,
            displayName: response.data.displayName,
            profilePicture: response.data.profilePicture,
            accountId: response.data.accountId
        };

        res.json(userProfile);
    } catch (error) {
        console.error('Failed to fetch user profile:', error);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to fetch user profile';
        res.status(statusCode).json({ error: errorMessage });
    }
});

router.get('/avatar', async (req, res) => {
    try {
        const credentials = JSON.parse(Buffer.from(req.headers['x-confluence-credentials'], 'base64').toString());
        const { accountId, size } = req.query;

        const response = await makeAuthenticatedBlobRequest(
            credentials,
            '/rest/api/user/avatar/view',
            {
                accountId,
                size: size || 48
            }
        );

        // Set the content type from the response
        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType);
        
        // Send the image data
        res.send(response.data);
    } catch (error) {
        console.error('Failed to fetch avatar:', error);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to fetch avatar';
        res.status(statusCode).json({ error: errorMessage });
    }
});

module.exports = router;
